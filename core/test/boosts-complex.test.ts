import { describe, expect, it } from 'vitest';
import {
  CRAB,
  FIELD_W,
  INVASION_Y,
  PRACTICE_RUN,
  activateBoost,
  createGame,
  hashState,
  snapshot,
  step,
  updateBoosts,
  updateShots,
} from '../src';

describe('RICOCHET', () => {
  it('gives a newly created shot a horizontal component and the bounce credit', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'RICOCHET');
    for (let t = 1; t <= 8; t++) updateShots(s);
    expect(s.shots).toHaveLength(1);
    expect(s.shots[0]!.vx).toBe(60);
    expect(s.shots[0]!.data & 2).toBe(2);
  });

  it('leaves vx at 0 for a shot created without RICOCHET active', () => {
    const s = createGame('t', PRACTICE_RUN);
    for (let t = 1; t <= 8; t++) updateShots(s);
    expect(s.shots[0]!.vx).toBe(0);
    expect(s.shots[0]!.data & 2).toBe(0);
  });

  it('reflects a shot off the right wall once, clears the credit, then flies on unreflected', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'RICOCHET');
    s.shots = [{ x: FIELD_W - 30, y: 5000, vx: 60, vy: -240, kind: 'straight', data: 2 }];
    updateShots(s);
    const bounced = s.shots[0]!;
    expect(bounced.x).toBe(FIELD_W - 30);
    expect(bounced.vx).toBe(-60);
    expect(bounced.data & 2).toBe(0);
    const xAfterBounce = bounced.x;
    updateShots(s);
    // No credit left: x is no longer touched by vx (today's behaviour for a non-ricochet shot),
    // so a second wall contact never happens and the shot is not reflected again.
    expect(s.shots[0]!.x).toBe(xAfterBounce);
    expect(s.shots[0]!.vx).toBe(-60);
  });

  it('reflects a shot off the left wall using x = -x', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'RICOCHET');
    s.shots = [{ x: 30, y: 5000, vx: -60, vy: -240, kind: 'straight', data: 2 }];
    updateShots(s);
    const bounced = s.shots[0]!;
    expect(bounced.x).toBe(30);
    expect(bounced.vx).toBe(60);
    expect(bounced.data & 2).toBe(0);
  });

  it('composes with the piercing bit without disturbing it', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'RICOCHET');
    activateBoost(s, 'PIERCING_BULLETS');
    for (let t = 1; t <= 8; t++) updateShots(s);
    expect(s.shots[0]!.data).toBe(3);
  });
});

describe('GRAVITY_WELL', () => {
  it('captures the ship position as the well when activated directly (no drop)', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'GRAVITY_WELL');
    expect(s.boosts.well).toEqual({ x: s.ship.x, y: s.ship.y });
  });

  it('pulls a formation crab 6 units towards the well per tick, leaving its home slot untouched', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'GRAVITY_WELL');
    const well = s.boosts.well!;
    s.crabs = [
      { x: well.x - 600, y: well.y, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: well.x - 600, homeY: well.y },
    ];
    updateBoosts(s);
    expect(s.crabs[0]!.x).toBe(well.x - 600 + 6);
    expect(s.crabs[0]!.y).toBe(well.y);
    expect(s.crabs[0]!.homeX).toBe(well.x - 600);
    expect(s.crabs[0]!.homeY).toBe(well.y);
  });

  it('never lets the pull carry a crab across the invasion line', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'GRAVITY_WELL');
    const startY = INVASION_Y - Math.trunc(CRAB.size / 2) - 3;
    s.crabs = [
      { x: 1000, y: startY, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 1000, homeY: startY },
    ];
    // Well placed far below the crab (same x) so the unclamped pull would push it past the line.
    s.boosts.well = { x: 1000, y: INVASION_Y + 5000 };
    updateBoosts(s);
    expect(s.crabs[0]!.y).toBe(INVASION_Y - Math.trunc(CRAB.size / 2) - 1);
    expect(s.over).toBe(false);
  });

  it('does not pull a diving crab', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'GRAVITY_WELL');
    const well = s.boosts.well!;
    s.crabs = [
      { x: well.x - 600, y: well.y, kind: 0, type: 'diver', hp: 1, dive: 30, homeX: well.x - 600, homeY: well.y },
    ];
    updateBoosts(s);
    expect(s.crabs[0]!.x).toBe(well.x - 600);
  });

  it('pulls an enemy shot 12 units towards the well per tick', () => {
    const s = createGame('t', PRACTICE_RUN);
    activateBoost(s, 'GRAVITY_WELL');
    const well = s.boosts.well!;
    s.enemyShots = [{ x: well.x - 1200, y: well.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    updateBoosts(s);
    expect(s.enemyShots[0]!.x).toBe(well.x - 1200 + 12);
    expect(s.enemyShots[0]!.y).toBe(well.y);
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
