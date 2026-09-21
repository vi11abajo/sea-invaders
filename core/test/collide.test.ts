import { describe, expect, it } from 'vitest';
import { INITIAL_INPUT, OCTOPI, PRACTICE_RUN, createGame, hitCrabs, hitOctopi, loseLife, step } from '../src';

describe('hitCrabs', () => {
  it('removes the first overlapping crab and the shot, scoring 10 × wave', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.wave = 2;
    s.crabs = [
      { x: 1000, y: 1000, kind: 0, type: 'normal', hp: 1, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0 },
      { x: 1000, y: 1100, kind: 1, type: 'normal', hp: 1, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0 },
    ];
    s.shots = [
      { x: 1000, y: 1000, vx: 0, vy: -240, kind: 'straight', data: 0 },
      { x: 4000, y: 1000, vx: 0, vy: -240, kind: 'straight', data: 0 },
    ];
    hitCrabs(s);
    expect(s.crabs).toEqual([{ x: 1000, y: 1100, kind: 1, type: 'normal', hp: 1, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0 }]);
    expect(s.shots).toEqual([{ x: 4000, y: 1000, vx: 0, vy: -240, kind: 'straight', data: 0 }]);
    expect(s).toMatchObject({ score: 20, kills: 1 });
  });

  it('uses box overlap: 324 off-centre hits, 325 misses', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.crabs = [{ x: 1000, y: 1000, kind: 0, type: 'normal', hp: 1, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0 }];
    s.shots = [{ x: 1325, y: 1000, vx: 0, vy: 0, kind: 'straight', data: 0 }];
    hitCrabs(s);
    expect(s.crabs).toHaveLength(1);
    s.shots = [{ x: 1324, y: 1000, vx: 0, vy: 0, kind: 'straight', data: 0 }];
    hitCrabs(s);
    expect(s.crabs).toHaveLength(0);
  });

  it('a piercing shot deals exactly one hit to an armored crab in a pass, then keeps flying', () => {
    // Spec §5.2: "one hit per crab per shot". Calling hitCrabs again with no shot movement in
    // between stands in for the shot lingering in the crab's overlap box across consecutive ticks
    // (SHOT.speed is slower than the overlap window is wide) — the case the fix in `hitCrabs`
    // guards against by pushing a surviving piercing shot clear of the box it just hit.
    const s = createGame('t', PRACTICE_RUN);
    s.crabs = [{ x: 1000, y: 1000, kind: 0, type: 'armored', hp: 2, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0 }];
    s.shots = [{ x: 1000, y: 1000, vx: 0, vy: -240, kind: 'straight', data: 1 }]; // PIERCING_BULLETS bit
    hitCrabs(s);
    expect(s.crabs[0]!.hp).toBe(1);
    expect(s.shots).toHaveLength(1); // piercing: never consumed by a crab hit
    hitCrabs(s);
    expect(s.crabs[0]!.hp).toBe(1); // no second hit on the same crab
    hitCrabs(s);
    expect(s.crabs[0]!.hp).toBe(1);
    expect(s.crabs).toHaveLength(1);
  });

  it('a piercing shot passing through two stacked armored crabs damages each exactly once', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.crabs = [
      { x: 1000, y: 1000, kind: 0, type: 'armored', hp: 2, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0 },
      { x: 1000, y: 400, kind: 0, type: 'armored', hp: 2, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0 }, // further up the shot's path
    ];
    s.shots = [{ x: 1000, y: 1000, vx: 0, vy: -240, kind: 'straight', data: 1 }];
    hitCrabs(s); // hits crab 0 only
    expect(s.crabs[0]!.hp).toBe(1);
    expect(s.crabs[1]!.hp).toBe(2);
    hitCrabs(s); // crab 0 no longer overlapped (pushed clear); the shot now overlaps crab 1
    expect(s.crabs[0]!.hp).toBe(1);
    expect(s.crabs[1]!.hp).toBe(1);
    hitCrabs(s); // neither crab overlapped any more
    expect(s.crabs[0]!.hp).toBe(1);
    expect(s.crabs[1]!.hp).toBe(1);
    expect(s.shots).toHaveLength(1);
  });
});

describe('hitOctopi', () => {
  it('loses a life on an enemy shot, grants invulnerability and clears shots', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.enemyShots = [
      { x: s.octopi.x, y: s.octopi.y + 255, vx: 0, vy: 0, kind: 'crab', data: 0 },
      { x: 100, y: 100, vx: 0, vy: 0, kind: 'crab', data: 0 },
    ];
    hitOctopi(s);
    expect(s.octopi).toMatchObject({ lives: 2, invuln: 120 });
    expect(s.enemyShots).toEqual([]);
  });

  it('misses a shot just outside the hitbox', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y + 256, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    hitOctopi(s);
    expect(s.octopi.lives).toBe(3);
  });

  it('ignores hits while invulnerable', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.octopi.invuln = 5;
    s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    hitOctopi(s);
    expect(s.octopi.lives).toBe(3);
  });

  it('destroys a crab that touches Octopi and costs a life', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.crabs = [{ x: s.octopi.x + 400, y: s.octopi.y, kind: 0, type: 'normal', hp: 1, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0 }];
    hitOctopi(s);
    expect(s.octopi.lives).toBe(2);
    expect(s.crabs).toHaveLength(0);
    expect(s.score).toBe(0);
  });

  it('ends the run on the last life', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.octopi.lives = 1;
    s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    hitOctopi(s);
    expect(s.over).toBe(true);
  });

  it('a heavy shot costs two lives on one hit, with a single player_hit event', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y, vx: 0, vy: 0, kind: 'heavy', data: 0 }];
    hitOctopi(s);
    expect(s.octopi).toMatchObject({ lives: 1, invuln: OCTOPI.invulnTicks });
    expect(s.events.filter((e) => e.type === 'player_hit')).toHaveLength(1);
    expect(s.enemyShots).toEqual([]);
    expect(s.over).toBe(false);
  });

  it('never drops lives below zero on a heavy hit, and ends the run there', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.octopi.lives = 1;
    s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y, vx: 0, vy: 0, kind: 'heavy', data: 0 }];
    hitOctopi(s);
    expect(s.octopi.lives).toBe(0);
    expect(s.over).toBe(true);
  });

  it('lets SHIELD_BARRIER absorb a whole heavy hit for one charge', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.boosts.shield = 2;
    s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y, vx: 0, vy: 0, kind: 'heavy', data: 0 }];
    hitOctopi(s);
    expect(s.octopi.lives).toBe(3);
    expect(s.boosts.shield).toBe(1);
    expect(s.events.filter((e) => e.type === 'player_hit')).toHaveLength(1);
  });

  it('loses exactly `damage` lives through loseLife, floored at zero', () => {
    const s = createGame('t', PRACTICE_RUN);
    loseLife(s); // defaults to one life
    expect(s.octopi.lives).toBe(2);
    s.octopi.invuln = 0;
    loseLife(s, 2);
    expect(s.octopi.lives).toBe(0);
    expect(s.over).toBe(true);
  });

  it('a heavy shot reaches further than a crab shot: radius 154 against 96', () => {
    const near = createGame('t', PRACTICE_RUN);
    near.enemyShots = [{ x: near.octopi.x, y: near.octopi.y + 300, vx: 0, vy: 0, kind: 'heavy', data: 0 }];
    hitOctopi(near);
    expect(near.octopi.lives).toBe(1); // 160 + 154 = 314 > 300

    const far = createGame('t', PRACTICE_RUN);
    far.enemyShots = [{ x: far.octopi.x, y: far.octopi.y + 300, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    hitOctopi(far);
    expect(far.octopi.lives).toBe(3); // 160 + 96 = 256 < 300
  });
});

describe('step with collisions', () => {
  it('spawns the next wave when the last crab dies', () => {
    const s = createGame('t', PRACTICE_RUN);
    const y = s.octopi.y - 1500;
    s.crabs = [{ x: s.octopi.x, y, kind: 0, type: 'normal', hp: 1, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0 }];
    s.waveTotal = 1;
    s.shots = [{ x: s.octopi.x, y: y + 240, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    step(s, INITIAL_INPUT);
    expect(s).toMatchObject({ wave: 2, score: 10, kills: 1 });
    expect(s.crabs).toHaveLength(24);
  });

  it('an idle Octopi is eventually destroyed and the run ends', () => {
    const s = createGame('idle', PRACTICE_RUN);
    for (let t = 0; t < 60 * 60 * 10 && !s.over; t++) step(s, INITIAL_INPUT);
    expect(s.over).toBe(true);
    expect(s.octopi.lives).toBe(0);
  });
});
