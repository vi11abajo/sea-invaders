import { describe, expect, it } from 'vitest';
import { BOOSTS, PRACTICE_RUN, activateBoost, createGame, updateBoosts } from '../src';
import type { BoostType, Rng } from '../src';

/** Overrides `rng.nextInt` to return `sequence` in order, one value per call. */
function stubNextInt(rng: Rng, sequence: number[]): void {
  let i = 0;
  rng.nextInt = ((_n: number) => sequence[i++]!) as Rng['nextInt'];
}

/**
 * Hand-copied on purpose (not imported from `../src/sim/boosts`): checking it against `BOOSTS`
 * below would be tautological against the production list otherwise, and this way a change to
 * either one that breaks the spec §5.2 correspondence fails a test instead of passing silently.
 *
 * The exact pool RANDOM_CHAOS picks from (spec §5.2, Task 15 decision): the ten timed boosts
 * (duration 600 or 466), in `BoostType`'s declaration order, excluding RANDOM_CHAOS itself.
 */
const CHAOS_POOL: BoostType[] = [
  'RAPID_FIRE', 'ICE_FREEZE', 'POINTS_FREEZE', 'AUTO_TARGET', 'INVINCIBILITY',
  'MULTI_SHOT', 'SCORE_MULTIPLIER', 'RICOCHET', 'GRAVITY_WELL', 'PIERCING_BULLETS',
];

describe('RANDOM_CHAOS', () => {
  it('activates a randomly-picked timed boost instead of itself, with a 600-900 tick duration', () => {
    const s = createGame('chaos-direct', PRACTICE_RUN);
    stubNextInt(s.rngBoosts, [3, 100]); // index 3 -> AUTO_TARGET; 600 + 100 = 700 ticks
    activateBoost(s, 'RANDOM_CHAOS');
    expect(s.boosts.active).toEqual([{ type: 'AUTO_TARGET', ticksLeft: 700 }]);
    expect(s.boosts.active.some((a) => a.type === 'RANDOM_CHAOS')).toBe(false);
  });

  it('a drop pickup behaves the same as a direct activation', () => {
    const s = createGame('chaos-drop', PRACTICE_RUN);
    stubNextInt(s.rngBoosts, [3, 100]); // same roll as the direct-activation case above
    s.drops.push({ x: s.ship.x, y: s.ship.y, boost: 'RANDOM_CHAOS', ttl: 100 });
    updateBoosts(s);
    // updateBoosts ticks every active boost down by one right after the pickup in the same call,
    // same as any other freshly-picked-up timed boost would (see boosts.test.ts).
    expect(s.boosts.active).toEqual([{ type: 'AUTO_TARGET', ticksLeft: 699 }]);
    expect(s.boosts.active.some((a) => a.type === 'RANDOM_CHAOS')).toBe(false);
    expect(s.events.at(-1)).toMatchObject({ type: 'boost_pickup', boost: 'RANDOM_CHAOS' });
  });

  it('a GRAVITY_WELL roll anchors its well at the ship position', () => {
    const s = createGame('chaos-well', PRACTICE_RUN);
    s.ship.x = 1234;
    s.ship.y = 5678;
    stubNextInt(s.rngBoosts, [8, 0]); // index 8 -> GRAVITY_WELL
    activateBoost(s, 'RANDOM_CHAOS');
    expect(s.boosts.active).toEqual([{ type: 'GRAVITY_WELL', ticksLeft: 600 }]);
    expect(s.boosts.well).toEqual({ x: 1234, y: 5678 });
  });

  it('a drop that resolves to GRAVITY_WELL anchors the well at the drop position, like a real GRAVITY_WELL pickup', () => {
    const s = createGame('chaos-well-drop', PRACTICE_RUN);
    s.ship.x = 1000;
    s.ship.y = 9000;
    stubNextInt(s.rngBoosts, [8, 0]); // index 8 -> GRAVITY_WELL
    s.drops.push({ x: 1050, y: 8980, boost: 'RANDOM_CHAOS', ttl: 100 }); // falls to y 9040 this tick
    updateBoosts(s);
    expect(s.boosts.active[0]).toMatchObject({ type: 'GRAVITY_WELL' });
    expect(s.boosts.well).toEqual({ x: 1050, y: 9040 });
  });

  it('the pool covers exactly the ten timed boosts (duration 600 or 466), in declaration order', () => {
    const timedTypes = (Object.keys(BOOSTS) as BoostType[]).filter(
      (t) => t !== 'RANDOM_CHAOS' && (BOOSTS[t].duration === 600 || BOOSTS[t].duration === 466),
    );
    expect(CHAOS_POOL).toHaveLength(10);
    expect([...CHAOS_POOL].sort()).toEqual([...timedTypes].sort());

    for (let i = 0; i < CHAOS_POOL.length; i++) {
      const s = createGame(`chaos-index-${i}`, PRACTICE_RUN);
      stubNextInt(s.rngBoosts, [i, 0]);
      activateBoost(s, 'RANDOM_CHAOS');
      expect(s.boosts.active[0]!.type).toBe(CHAOS_POOL[i]);
    }
  });
});
