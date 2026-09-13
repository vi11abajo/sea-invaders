import { describe, expect, it } from 'vitest';
import {
  FIELD_H,
  FIELD_W,
  PRACTICE_RUN,
  WELL,
  activateBoost,
  createGame,
  hashState,
  snapshot,
  step,
  updateBoosts,
} from '../src';
import type { Rng } from '../src';

/** Overrides `rng.nextInt` to return `sequence` in order, one value per call. */
function stubNextInt(rng: Rng, sequence: number[]): void {
  let i = 0;
  rng.nextInt = ((_n: number) => sequence[i++]!) as Rng['nextInt'];
}

describe('GRAVITY_WELL', () => {
  it('rolls a seeded random centre inset from the field edges when activated directly', () => {
    const s = createGame('t', PRACTICE_RUN);
    stubNextInt(s.rngBoosts, [100, 200]); // first roll is already far enough from the ship, no re-roll
    activateBoost(s, 'GRAVITY_WELL');
    expect(s.boosts.well).toEqual({ x: WELL.margin + 100, y: WELL.margin + 200 });
  });

  it('re-rolls while the point is too close to the ship, keeping the last roll after WELL.maxAttempts', () => {
    const s = createGame('t', PRACTICE_RUN);
    // Every attempt returns a point at (or basically on) the ship, i.e. always "too close", except
    // the last, which is distinguishable but still within minDist — the roll keeps it regardless.
    const closeX = s.ship.x - WELL.margin;
    const closeY = s.ship.y - WELL.margin;
    const sequence: number[] = [];
    for (let i = 0; i < WELL.maxAttempts - 1; i++) sequence.push(closeX, closeY);
    sequence.push(closeX + 3, closeY); // still only 3 units from the ship, well under minDist
    stubNextInt(s.rngBoosts, sequence);
    activateBoost(s, 'GRAVITY_WELL');
    expect(s.boosts.well).toEqual({ x: WELL.margin + closeX + 3, y: WELL.margin + closeY });
  });

  it('stays within the field margins and at least WELL.minDist from the ship over many seeds', () => {
    for (let i = 0; i < 200; i++) {
      const s = createGame(`well-${i}`, PRACTICE_RUN);
      activateBoost(s, 'GRAVITY_WELL');
      const well = s.boosts.well!;
      expect(well.x).toBeGreaterThanOrEqual(WELL.margin);
      expect(well.x).toBeLessThanOrEqual(FIELD_W - WELL.margin);
      expect(well.y).toBeGreaterThanOrEqual(WELL.margin);
      expect(well.y).toBeLessThanOrEqual(FIELD_H - WELL.margin);
    }
  });

  it('never pulls a crab (spec C1: the legacy well only ever touched bullets)', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.boosts.well = { x: 5000, y: 5000 };
    s.crabs = [{ x: 2000, y: 2000, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 2000, homeY: 2000 }];
    updateBoosts(s);
    expect(s.crabs[0]).toMatchObject({ x: 2000, y: 2000 });
  });

  it("redirects an enemy shot's velocity to point at the well at 147 units/tick", () => {
    const s = createGame('t', PRACTICE_RUN);
    s.boosts.well = { x: 5000, y: 5000 };
    s.enemyShots = [{ x: 2000, y: 1000, vx: 0, vy: 0, kind: 'crab', data: 0 }]; // offset (3000, 4000), len 5000
    updateBoosts(s);
    expect(s.enemyShots).toHaveLength(1);
    expect(s.enemyShots[0]!.vx).toBe(88); // idiv(3000*147, 5000)
    expect(s.enemyShots[0]!.vy).toBe(117); // idiv(4000*147, 5000)
    // The well only ever overwrites velocity, never nudges position directly.
    expect(s.enemyShots[0]!.x).toBe(2000);
    expect(s.enemyShots[0]!.y).toBe(1000);
  });

  it('absorbs a shot within 550 units of the well, but not one just outside', () => {
    const s = createGame('t', PRACTICE_RUN);
    s.boosts.well = { x: 5000, y: 5000 };
    s.enemyShots = [
      { x: 5000 - WELL.absorb, y: 5000, vx: 0, vy: 0, kind: 'crab', data: 0 }, // len 550: absorbed
      { x: 5000 - (WELL.absorb + 1), y: 5000, vx: 0, vy: 0, kind: 'crab', data: 0 }, // len 551: survives
    ];
    updateBoosts(s);
    expect(s.enemyShots).toHaveLength(1);
    expect(s.enemyShots[0]!.x).toBe(5000 - (WELL.absorb + 1));
  });

  it('clears the well on expiry, and the snapshot frame reflects both states', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'GRAVITY_WELL');
    expect(snapshot(s).well).toEqual(s.boosts.well);
    const active = s.boosts.active.find((a) => a.type === 'GRAVITY_WELL')!;
    active.ticksLeft = 1;
    updateBoosts(s);
    expect(s.boosts.well).toBeNull();
    expect(snapshot(s).well).toBeNull();
  });

  it('keeps hashState equal across two same-seed runs over 300 steps with the well active', () => {
    const s1 = createGame('seed-x', PRACTICE_RUN);
    const s2 = createGame('seed-x', PRACTICE_RUN);
    activateBoost(s1, 'GRAVITY_WELL');
    activateBoost(s2, 'GRAVITY_WELL');
    const input = { x: s1.ship.x, y: s1.ship.y };
    for (let i = 0; i < 300; i++) {
      step(s1, input);
      step(s2, input);
      expect(hashState(s2)).toBe(hashState(s1));
    }
  });
});
