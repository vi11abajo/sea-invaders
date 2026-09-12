import { describe, expect, it } from 'vitest';
import {
  CRAB_TYPES,
  DIVER,
  PRACTICE_RUN,
  createGame,
  crabSpeed,
  hitCrabs,
  hitShip,
  marchCrabs,
  spawnFormation,
  updateEnemyShots,
} from '../src';

function game(kind: 'normal' | 'armored' | 'swift' | 'fanner' | 'diver') {
  const s = createGame('t', PRACTICE_RUN);
  spawnFormation(s, { formation: 'grid', rows: 1, cols: 1, kinds: [kind] });
  return s;
}

describe('crab types', () => {
  it('armored takes two hits and scores 25', () => {
    const s = game('armored');
    const c = s.crabs[0]!;
    s.shots.push({ x: c.x, y: c.y, vx: 0, vy: 0, kind: 'straight', data: 0 });
    hitCrabs(s);
    expect(s.crabs).toHaveLength(1);
    expect(c.hp).toBe(1);
    s.shots.push({ x: c.x, y: c.y, vx: 0, vy: 0, kind: 'straight', data: 0 });
    hitCrabs(s);
    expect(s.crabs).toHaveLength(0);
    expect(s.score).toBe(CRAB_TYPES.armored.points * s.wave);
  });
  it('swift moves 1.5x the formation step', () => {
    const s = game('swift');
    const x0 = s.crabs[0]!.x;
    s.dir = 1;
    marchCrabs(s);
    expect(s.crabs[0]!.x - x0).toBe(9);
  });
  it('fanner fires three shots', () => {
    const s = game('fanner');
    s.rngFire = { nextInt: (n: number) => 0 } as never; // always fires, picks crab 0
    updateEnemyShots(s);
    expect(s.enemyShots).toHaveLength(3);
    expect(new Set(s.enemyShots.map((b) => b.vx)).size).toBe(3);
  });
  it('diver leaves the formation and returns to its slot', () => {
    const s = game('diver');
    const c = s.crabs[0]!;
    s.rngWaves = { nextInt: () => 0 } as never;
    // Driven by marchCrabs directly (like the other tests in this file), not the full step():
    // this lone crab sits exactly on the ship's fixed x, so step()'s own systems destroy it
    // long before the interval trigger — the ship's automatic fire kills it by tick ~38, and
    // even with that fire disabled, the crab's own random enemy fire (aimed at a ship that
    // never moves) can end the run before the dive completes. marchCrabs alone isolates the
    // tick-driven trigger/return mechanic under test from both.
    for (let i = 0; i < 360; i++) {
      s.tick += 1;
      marchCrabs(s);
    }
    expect(c.dive).toBe(90);
    for (let i = 0; i < 90; i++) {
      s.tick += 1;
      marchCrabs(s);
    }
    expect(c.dive).toBe(0);
    expect(c.y).toBe(c.homeY);
  });
  it('a lone diver returns exactly to its moved slot, with no jump and no extra step', () => {
    const s = game('diver');
    const c = s.crabs[0]!;
    s.dir = 1;
    const startHomeX = c.homeX;
    const startHomeY = c.homeY;
    c.dive = DIVER.ticks; // start the dive now; the interval trigger itself is covered above
    const v = crabSpeed(s); // constant: wave/waveTotal/kills never change across this span
    // Travel needed to reach a wall from here vastly exceeds DIVER.ticks * v, so the lone
    // formation slot never bounces during the dive: the expected drift is exactly ticks * v.
    for (let i = 0; i < DIVER.ticks; i++) {
      s.tick += 1;
      marchCrabs(s);
    }
    expect(c.dive).toBe(0);
    expect(c.x).toBe(c.homeX);
    expect(c.y).toBe(c.homeY);
    expect(c.homeX).toBe(startHomeX + DIVER.ticks * v);
    expect(c.homeY).toBe(startHomeY);
  });
  it('spawnFormation draws exactly `rows` colours plus one direction draw, independent of the formation shape', () => {
    const s = createGame('t', PRACTICE_RUN);
    let calls = 0;
    const real = s.rngWaves.nextInt.bind(s.rngWaves);
    s.rngWaves.nextInt = ((n: number) => {
      calls += 1;
      return real(n);
    }) as never;
    spawnFormation(s, { formation: 'ring', rows: 3, cols: 6, kinds: ['normal'] });
    expect(calls).toBe(4); // 3 row colours + 1 direction draw, not one per distinct y
  });
  it('diver contact costs a life through hitShip, like a shot', () => {
    const s = game('diver');
    const c = s.crabs[0]!;
    c.dive = 45; // mid-dive
    c.x = s.ship.x;
    c.y = s.ship.y;
    hitShip(s);
    expect(s.ship.lives).toBe(2);
    expect(s.crabs).toHaveLength(0);
  });
});
