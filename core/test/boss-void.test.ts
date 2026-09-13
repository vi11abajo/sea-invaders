import { describe, expect, it } from 'vitest';
import {
  BOSS, BOSS_HOOKS, FIELD_W, INITIAL_INPUT, PRACTICE_RUN, activateBoost, createGame, hashState, idiv, isqrt, muzzle,
  SHOT, pullShotsTowardGravity, spawnBoss, step, updateShots,
} from '../src';
import { autoTargetSteer, velocity } from './auto-target-steer';

const fresh = () => {
  const s = createGame('void', { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, 5);
  return s;
};

const VOID = BOSS_HOOKS[5];
// Cast ids, matching the module constants in `src/sim/bosses/void.ts`.
const SPIRAL = 1;
const CLONE = 2;
const GRAVITY = 3;
const BERSERK = 4;
const EXPLOSIVE3 = 5;

describe('Void Sovereign (kind 5)', () => {
  it('teleports the boss to a fresh x within [half, FIELD_W - half] and emits boss_teleport', () => {
    const s = fresh();
    const b = s.boss!;
    const half = idiv(BOSS.width, 2);
    for (let i = 0; i < 200; i++) {
      const fromX = b.x;
      VOID.attack(s, b);
      expect(b.x).toBeGreaterThanOrEqual(half);
      expect(b.x).toBeLessThanOrEqual(FIELD_W - half);
      expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_teleport', fromX, toX: b.x });
    }
  });

  it('teleports then schedules the phase attack: straight now, spiral/clone/gravity pending in phases 2-4', () => {
    const s = fresh();
    const b = s.boss!;
    b.phase = 1;
    VOID.attack(s, b);
    expect(s.enemyShots.filter((sh) => sh.kind === 'straight')).toHaveLength(1);

    s.enemyShots = [];
    b.phase = 2;
    b.pending = [];
    VOID.attack(s, b);
    expect(b.pending).toEqual([12, SPIRAL]);

    b.phase = 3;
    b.pending = [];
    VOID.attack(s, b);
    expect(b.pending).toEqual([18, CLONE]);

    b.phase = 4;
    b.pending = [];
    VOID.attack(s, b);
    expect(b.pending).toEqual([15, GRAVITY]);
  });

  it('phase 5 chaos never teleports: casts a spiral now and schedules berserk at +12, explosive at +24', () => {
    const s = fresh();
    const b = s.boss!;
    b.phase = 5;
    VOID.attack(s, b);
    expect(s.enemyShots).toHaveLength(6);
    for (const shot of s.enemyShots) expect(shot.kind).toBe('spiral');
    expect(b.pending).toEqual([12, BERSERK, 24, EXPLOSIVE3]);
    expect(s.events.some((e) => e.type === 'boss_teleport')).toBe(false);
  });

  it('spiral advances b.spiral by 12 per cast and yields 6 spiral shots', () => {
    const s = fresh();
    const b = s.boss!;
    b.spiral = 0;
    VOID.cast!(s, b, SPIRAL);
    expect(s.enemyShots).toHaveLength(6);
    for (const shot of s.enemyShots) {
      expect(shot.kind).toBe('spiral');
      expect(shot.data).toBe(0);
    }
    expect(s.enemyShots[0]).toMatchObject({ vx: 88, vy: 33 }); // deg 0: icos=1000, isin=0
    expect(b.spiral).toBe(12);

    s.enemyShots = [];
    VOID.cast!(s, b, SPIRAL);
    expect(s.enemyShots).toHaveLength(6);
    expect(b.spiral).toBe(24);
  });

  it('clone emits an 8-shot ring and boss_clone with x positions clamped to the field', () => {
    const s = fresh();
    const b = s.boss!;
    const half = idiv(BOSS.width, 2);

    VOID.cast!(s, b, CLONE);
    expect(s.enemyShots).toHaveLength(8);
    for (const shot of s.enemyShots) expect(shot.kind).toBe('ring');
    expect(s.events).toContainEqual({
      tick: s.tick,
      type: 'boss_clone',
      leftX: Math.max(half, b.x - 1200),
      rightX: Math.min(FIELD_W - half, b.x + 1200),
    });

    // Near the left wall, leftX clamps at `half` instead of going negative.
    b.x = half;
    VOID.cast!(s, b, CLONE);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_clone', leftX: half, rightX: half + 1200 });

    // Near the right wall, rightX clamps at `FIELD_W - half`.
    b.x = FIELD_W - half;
    VOID.cast!(s, b, CLONE);
    expect(s.events).toContainEqual({
      tick: s.tick,
      type: 'boss_clone',
      leftX: FIELD_W - half - 1200,
      rightX: FIELD_W - half,
    });
  });

  it('gravity casts 16 shots on a 300-radius ring around the muzzle, flying outward', () => {
    const s = fresh();
    const b = s.boss!;
    const m = muzzle(b);
    VOID.cast!(s, b, GRAVITY);
    expect(s.enemyShots).toHaveLength(16);
    for (const shot of s.enemyShots) {
      expect(shot.kind).toBe('gravity');
      expect(shot.data).toBe(0);
      const dx = shot.x - m.x;
      const dy = shot.y - m.y;
      const radius = isqrt(dx * dx + dy * dy);
      expect(radius).toBeGreaterThanOrEqual(299); // integer-trig rounding
      expect(radius).toBeLessThanOrEqual(300);
      const speed = isqrt(shot.vx * shot.vx + shot.vy * shot.vy);
      // Integer trig truncates each axis separately, so an off-axis magnitude can land a couple
      // units under the nominal 55 (0.5x BOSS_SHOT.speed); it's exact on the 4 cardinal degrees.
      expect(speed).toBeGreaterThanOrEqual(53);
      expect(speed).toBeLessThanOrEqual(55);
    }
  });

  it('pulls a player shot placed 500 units away 10 units per tick towards a gravity shot', () => {
    const s = fresh();
    s.enemyShots = [{ x: 1000, y: 1000, vx: 0, vy: 0, kind: 'gravity', data: 0 }];
    s.shots = [{ x: 1500, y: 1000, vx: 0, vy: 0, kind: 'straight', data: 0 }];
    pullShotsTowardGravity(s);
    expect(s.shots[0]).toMatchObject({ x: 1490, y: 1000 });
  });

  it('does not pull a player shot beyond 800 units from a gravity shot', () => {
    const s = fresh();
    s.enemyShots = [{ x: 0, y: 0, vx: 0, vy: 0, kind: 'gravity', data: 0 }];
    s.shots = [{ x: 900, y: 0, vx: 0, vy: 0, kind: 'straight', data: 0 }];
    pullShotsTowardGravity(s);
    expect(s.shots[0]!.x).toBe(900);
  });

  it('ignores non-gravity enemy shots when pulling', () => {
    const s = fresh();
    s.enemyShots = [{ x: 1000, y: 1000, vx: 0, vy: 0, kind: 'straight', data: 0 }];
    s.shots = [{ x: 1200, y: 1000, vx: 0, vy: 0, kind: 'straight', data: 0 }];
    pullShotsTowardGravity(s);
    expect(s.shots[0]!.x).toBe(1200);
  });

  it('sets effectTicks to 180 and emits player_freeze plus boss_ability freeze on the ability', () => {
    const s = fresh();
    const b = s.boss!;
    VOID.ability(s, b);
    expect(b.effectTicks).toBe(180);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'player_freeze', ticks: 180 });
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_ability', name: 'freeze' });
  });

  it('freezes a player shot in flight for exactly 180 ticks, then resumes it with its original velocity', () => {
    const s = fresh();
    const b = s.boss!;
    s.shots = [{ x: 1000, y: 5000, vx: 0, vy: -50, kind: 'straight', data: 0 }];
    VOID.ability(s, b);
    expect(b.effectTicks).toBe(180);

    const yBefore = s.shots[0]!.y;
    for (let i = 0; i < 180; i++) {
      updateShots(s);
      VOID.tick!(s, b);
    }
    expect(s.shots[0]!.y).toBe(yBefore); // never moved while frozen
    expect(b.effectTicks).toBe(0);

    updateShots(s);
    expect(s.shots[0]!.y).toBe(yBefore - 50); // resumes with its original vy, untouched
  });

  it('does not let AUTO_TARGET steer a frozen shot, then resumes steering once the freeze ends', () => {
    const s = fresh();
    const b = s.boss!;
    activateBoost(s, 'AUTO_TARGET');
    s.crabs = [{ x: 5000, y: 500, kind: 0, type: 'normal', hp: 1, dive: 0, homeX: 5000, homeY: 500 }];
    s.shots = [{ x: 1000, y: 5000, vx: 0, vy: -SHOT.speed, kind: 'straight', data: 0 }];
    VOID.ability(s, b);
    expect(b.effectTicks).toBe(180);

    for (let i = 0; i < 180; i++) {
      updateShots(s);
      VOID.tick!(s, b);
    }
    expect(s.shots[0]!.vx).toBe(0); // AUTO_TARGET steering skipped while frozen: stored vx untouched
    expect(s.shots[0]!.vy).toBe(-SHOT.speed); // motion skipped too
    expect(b.effectTicks).toBe(0);

    updateShots(s);
    // Steers again immediately once the freeze ends: after the move, the boss (left at its default
    // spawn point, ~2812,2180) is nearer than the crab, so AUTO_TARGET aims at the boss.
    expect(velocity(s.shots[0]!)).toEqual(autoTargetSteer(b.x - 1000, b.y - (5000 - SHOT.speed)));
  });

  it('is deterministic over 600 ticks', () => {
    const a = fresh();
    const c = fresh();
    for (let i = 0; i < 600; i++) {
      step(a, INITIAL_INPUT);
      step(c, INITIAL_INPUT);
    }
    expect(hashState(a)).toBe(hashState(c));
  });
});
