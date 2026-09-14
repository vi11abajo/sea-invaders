import { describe, expect, it } from 'vitest';
import { OCTOPI, PRACTICE_RUN, TIDE_REVIVE_LIVES, createGame, hashState, loseLife, revive } from '../src';

describe('revive', () => {
  it('does nothing while the run is still going (precondition not met)', () => {
    const s = createGame('t', PRACTICE_RUN);
    revive(s);
    expect(s.over).toBe(false);
    expect(s.octopi.lives).toBe(OCTOPI.lives);
    expect(s.events).toEqual([]);
  });

  it('does nothing when the run is over with lives still left (precondition not met)', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.over = true; // hypothetical: over without having reached 0 lives
    revive(s);
    expect(s.over).toBe(true);
    expect(s.octopi.lives).toBe(OCTOPI.lives);
    expect(s.events).toEqual([]);
  });

  it('does nothing when lives are 0 but the run was never marked over (precondition not met)', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.octopi.lives = 0; // hypothetical: 0 lives without over being set
    revive(s);
    expect(s.over).toBe(false);
    expect(s.octopi.lives).toBe(0);
    expect(s.events).toEqual([]);
  });

  it('revives Octopi after the last life is lost: over clears, TIDE_REVIVE_LIVES lives, invulnerability, enemy shots cleared, a revived event', () => {
    const s = createGame('t', PRACTICE_RUN);
    for (let i = 0; i < OCTOPI.lives; i++) loseLife(s);
    expect(s.over).toBe(true);
    expect(s.octopi.lives).toBe(0);
    s.tick = 42;
    s.octopi.invuln = 0; // prove revive is what sets it back, not a leftover from the last loseLife
    s.enemyShots = [{ x: 1000, y: 1000, vx: 0, vy: 110, kind: 'crab', data: 0 }];

    revive(s);

    expect(s.over).toBe(false);
    expect(s.octopi.lives).toBe(TIDE_REVIVE_LIVES);
    expect(TIDE_REVIVE_LIVES).toBe(3);
    expect(s.octopi.invuln).toBe(OCTOPI.invulnTicks);
    expect(s.enemyShots).toEqual([]);
    expect(s.events).toContainEqual({ tick: 42, type: 'revived' });
  });

  it('is deterministic: two identical pre-revive states hash the same after reviving, and reviving changes the hash', () => {
    const makeOver = () => {
      const s = createGame('h', PRACTICE_RUN);
      for (let i = 0; i < OCTOPI.lives; i++) loseLife(s);
      return s;
    };
    const beforeHash = hashState(makeOver());
    const a = makeOver();
    const b = makeOver();
    revive(a);
    revive(b);
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).not.toBe(beforeHash);
  });
});
