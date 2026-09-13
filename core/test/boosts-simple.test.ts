import { describe, expect, it } from 'vitest';
import {
  CRAB_TYPES,
  FIELD_W,
  MAX_LIVES,
  PRACTICE_RUN,
  SHOT,
  activateBoost,
  crabSpeed,
  createGame,
  hitCrabs,
  hitOctopi,
  idiv,
  isin,
  tamed,
  updateShots,
} from '../src';

describe('RAPID_FIRE', () => {
  it('resets the cooldown to 4 ticks (instead of 8) after firing while active', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'RAPID_FIRE');
    s.octopi.cooldown = 1;
    updateShots(s);
    expect(s.shots).toHaveLength(1);
    expect(s.octopi.cooldown).toBe(4);
  });
});

describe('MULTI_SHOT', () => {
  it('fires three shots at -15, 0 and +15 degrees', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'MULTI_SHOT');
    for (let t = 1; t <= 8; t++) updateShots(s);
    expect(s.shots).toHaveLength(3);
    const vxs = s.shots.map((b) => b.vx).sort((a, b) => a - b);
    expect(vxs).toEqual([-62, 0, 62]);
    for (const b of s.shots) {
      expect(b.vy).toBe(b.vx === 0 ? -240 : -231);
      expect(b.kind).toBe('straight');
    }
  });

  it("moves a side shot's x by idiv(SHOT.speed*isin(15deg), 1000) per tick (fix round 1: player shots now move on both axes)", () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'MULTI_SHOT');
    for (let t = 1; t <= 8; t++) updateShots(s); // fires on the 8th call, unmoved this same tick
    const side = s.shots.find((b) => b.vx > 0)!; // the +15 degree shot
    const expectedVx = idiv(SHOT.speed * isin(15), 1000);
    expect(side.vx).toBe(expectedVx);
    const startX = side.x;
    updateShots(s);
    const moved = s.shots.find((b) => b.vx === expectedVx)!;
    expect(moved.x).toBe(startX + expectedVx);
  });
});

describe('player shot horizontal bounds (fix round 1)', () => {
  it('drops a shot once its x leaves [0, FIELD_W]', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.octopi.cooldown = 999; // keep Octopi from firing a fresh shot this same tick
    s.shots = [{ x: 30, y: 5000, vx: -60, vy: -10, kind: 'straight', data: 0 }];
    updateShots(s);
    expect(s.shots).toHaveLength(0); // x = 30 - 60 = -30: gone, not clamped or bounced
  });

  it('keeps a shot that stays inside [0, FIELD_W]', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.octopi.cooldown = 999;
    s.shots = [{ x: FIELD_W - 30, y: 5000, vx: 20, vy: -10, kind: 'straight', data: 0 }];
    updateShots(s);
    expect(s.shots).toEqual([{ x: FIELD_W - 30 + 20, y: 5000 - 10, vx: 20, vy: -10, kind: 'straight', data: 0 }]);
  });
});

describe('PIERCING_BULLETS', () => {
  it('tags new shots with data|=1 and a piercing shot survives a crab kill', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'PIERCING_BULLETS');
    for (let t = 1; t <= 8; t++) updateShots(s);
    expect(s.shots).toHaveLength(1);
    expect(s.shots[0]!.data & 1).toBe(1);
    s.crabs = [{ x: s.shots[0]!.x, y: s.shots[0]!.y, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 0, homeY: 0 }];
    hitCrabs(s);
    expect(s.crabs).toHaveLength(0);
    expect(s.shots).toHaveLength(1); // the shot kept flying
    expect(s.kills).toBe(1);
  });

  it('a non-piercing shot is consumed by the kill', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.shots = [{ x: 1000, y: 1000, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    s.crabs = [{ x: 1000, y: 1000, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 1000, homeY: 1000 }];
    hitCrabs(s);
    expect(s.shots).toHaveLength(0);
  });
});

describe('SHIELD_BARRIER', () => {
  it('absorbs 3 hits then a 4th costs a life', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'SHIELD_BARRIER');
    expect(s.boosts.shield).toBe(3);
    for (let i = 0; i < 3; i++) {
      s.octopi.invuln = 0;
      s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
      hitOctopi(s);
      expect(s.octopi.lives).toBe(3);
    }
    expect(s.boosts.shield).toBe(0);
    expect(s.boosts.active.some((a) => a.type === 'SHIELD_BARRIER')).toBe(false);
    expect(s.events.at(-1)).toMatchObject({ type: 'boost_expire', boost: 'SHIELD_BARRIER' });

    s.octopi.invuln = 0;
    s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    hitOctopi(s);
    expect(s.octopi.lives).toBe(2);
  });

  it('sets invuln 30 and pushes a player_hit event on an absorbed hit', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'SHIELD_BARRIER');
    s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    hitOctopi(s);
    expect(s.octopi.invuln).toBe(30);
    expect(s.boosts.shield).toBe(2);
    expect(s.events.at(-1)).toMatchObject({ type: 'player_hit' });
  });

  it('still removes a crab that touches the shielded Octopi', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'SHIELD_BARRIER');
    s.crabs = [{ x: s.octopi.x + 100, y: s.octopi.y, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 0, homeY: 0 }];
    hitOctopi(s);
    expect(s.crabs).toHaveLength(0);
    expect(s.octopi.lives).toBe(3);
    expect(s.boosts.shield).toBe(2);
  });

  it('a re-pickup while a shield is already active is a no-op (spec C6): consumed, not refilled', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'SHIELD_BARRIER');
    s.boosts.shield = 2; // simulate one hit already absorbed
    const result = activateBoost(s, 'SHIELD_BARRIER');
    expect(result).toEqual({ type: 'SHIELD_BARRIER', consumed: true });
    expect(s.boosts.shield).toBe(2); // not refilled to 3
  });
});

describe('INVINCIBILITY', () => {
  it('keeps lives and enemy shots on an otherwise-lethal hit', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'INVINCIBILITY');
    s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    hitOctopi(s);
    expect(s.octopi.lives).toBe(3);
    expect(s.enemyShots).toHaveLength(1);
  });

  it('ignores a crab-body hit too, without removing the crab', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'INVINCIBILITY');
    s.crabs = [{ x: s.octopi.x, y: s.octopi.y, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 0, homeY: 0 }];
    hitOctopi(s);
    expect(s.octopi.lives).toBe(3);
    expect(s.crabs).toHaveLength(1);
  });
});

describe('HEALTH_BOOST', () => {
  it('adds one life', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'HEALTH_BOOST');
    expect(s.octopi.lives).toBe(4);
  });

  it('caps lives at MAX_LIVES (spec C9)', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.octopi.lives = MAX_LIVES;
    activateBoost(s, 'HEALTH_BOOST');
    expect(s.octopi.lives).toBe(MAX_LIVES);
  });
});

describe('SCORE_MULTIPLIER', () => {
  it('doubles points on a crab kill while active', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'SCORE_MULTIPLIER');
    s.crabs = [{ x: 1000, y: 1000, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 1000, homeY: 1000 }];
    s.shots = [{ x: 1000, y: 1000, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    hitCrabs(s);
    expect(s.score).toBe(CRAB_TYPES.normal.points * 2 * s.wave);
  });
});

describe('COIN_SHOWER', () => {
  it('adds 25% of the current score', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.score = 100;
    activateBoost(s, 'COIN_SHOWER');
    expect(s.score).toBe(125);
  });
});

describe('SPEED_TAMER', () => {
  it('slows the full formation from 6 to 5 to 4 as stacks build', () => {
    const s = createGame('t', PRACTICE_RUN);
    expect(s.wave).toBe(1);
    expect(crabSpeed(s)).toBe(6);
    activateBoost(s, 'SPEED_TAMER');
    expect(s.boosts.tamerStacks).toBe(1);
    expect(crabSpeed(s)).toBe(5);
    activateBoost(s, 'SPEED_TAMER');
    expect(s.boosts.tamerStacks).toBe(2);
    expect(crabSpeed(s)).toBe(4);
  });

  it('is linear, not the old compounding ×0.9-per-stack (spec C5): 5 stacks -> 0.5x, 10 stacks -> 0.1x', () => {
    const s = createGame('t', PRACTICE_RUN);
    const v = 1000; // chosen so the linear and (now-removed) compounding formulas give different integers
    s.boosts.tamerStacks = 5;
    expect(tamed(s, v)).toBe(idiv(v * 5, 10)); // 500, not compounding's 590
    s.boosts.tamerStacks = 10;
    expect(tamed(s, v)).toBe(idiv(v, 10)); // 100 (the floor), not compounding's 347
  });
});
