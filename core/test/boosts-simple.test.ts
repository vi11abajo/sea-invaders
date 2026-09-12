import { describe, expect, it } from 'vitest';
import {
  CRAB_TYPES,
  PRACTICE_RUN,
  activateBoost,
  crabSpeed,
  createGame,
  hitCrabs,
  hitShip,
  updateShots,
} from '../src';

describe('RAPID_FIRE', () => {
  it('resets the cooldown to 4 ticks (instead of 8) after firing while active', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'RAPID_FIRE');
    s.ship.cooldown = 1;
    updateShots(s);
    expect(s.shots).toHaveLength(1);
    expect(s.ship.cooldown).toBe(4);
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
      s.ship.invuln = 0;
      s.enemyShots = [{ x: s.ship.x, y: s.ship.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
      hitShip(s);
      expect(s.ship.lives).toBe(3);
    }
    expect(s.boosts.shield).toBe(0);
    expect(s.boosts.active.some((a) => a.type === 'SHIELD_BARRIER')).toBe(false);
    expect(s.events.at(-1)).toMatchObject({ type: 'boost_expire', boost: 'SHIELD_BARRIER' });

    s.ship.invuln = 0;
    s.enemyShots = [{ x: s.ship.x, y: s.ship.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    hitShip(s);
    expect(s.ship.lives).toBe(2);
  });

  it('sets invuln 30 and pushes a player_hit event on an absorbed hit', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'SHIELD_BARRIER');
    s.enemyShots = [{ x: s.ship.x, y: s.ship.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    hitShip(s);
    expect(s.ship.invuln).toBe(30);
    expect(s.boosts.shield).toBe(2);
    expect(s.events.at(-1)).toMatchObject({ type: 'player_hit' });
  });

  it('still removes a crab that touches the shielded ship', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'SHIELD_BARRIER');
    s.crabs = [{ x: s.ship.x + 100, y: s.ship.y, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 0, homeY: 0 }];
    hitShip(s);
    expect(s.crabs).toHaveLength(0);
    expect(s.ship.lives).toBe(3);
    expect(s.boosts.shield).toBe(2);
  });
});

describe('INVINCIBILITY', () => {
  it('keeps lives and enemy shots on an otherwise-lethal hit', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'INVINCIBILITY');
    s.enemyShots = [{ x: s.ship.x, y: s.ship.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    hitShip(s);
    expect(s.ship.lives).toBe(3);
    expect(s.enemyShots).toHaveLength(1);
  });

  it('ignores a crab-body hit too, without removing the crab', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'INVINCIBILITY');
    s.crabs = [{ x: s.ship.x, y: s.ship.y, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 0, homeY: 0 }];
    hitShip(s);
    expect(s.ship.lives).toBe(3);
    expect(s.crabs).toHaveLength(1);
  });
});

describe('HEALTH_BOOST', () => {
  it('adds one life', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'HEALTH_BOOST');
    expect(s.ship.lives).toBe(4);
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
});
