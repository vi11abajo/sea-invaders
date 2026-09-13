import { describe, expect, it } from 'vitest';
import { BOOSTS, PRACTICE_RUN, WELL, activateBoost, createGame, updateBoosts } from '../src';
import type { BoostType, Rng } from '../src';

/** Overrides `rng.nextInt` to return `sequence` in order, one value per call. */
function stubNextInt(rng: Rng, sequence: number[]): void {
  let i = 0;
  rng.nextInt = ((_n: number) => sequence[i++]!) as Rng['nextInt'];
}

/**
 * Hand-copied on purpose (not imported from `../src/sim/boosts`): checking it against `BOOSTS`
 * below would be tautological against the production list otherwise, and this way a change to
 * either one that breaks the spec correspondence fails a test instead of passing silently.
 *
 * The exact pool RANDOM_CHAOS picks from (spec C8): every boost except RANDOM_CHAOS itself, in
 * `BoostType`'s declaration order (14 candidates — RICOCHET was removed from the game entirely,
 * owner decision, Phase 3A.1 lane C).
 */
const CHAOS_POOL: BoostType[] = [
  'RAPID_FIRE', 'ICE_FREEZE', 'HEALTH_BOOST', 'POINTS_FREEZE', 'SHIELD_BARRIER', 'AUTO_TARGET',
  'INVINCIBILITY', 'MULTI_SHOT', 'SCORE_MULTIPLIER', 'WAVE_BLAST', 'COIN_SHOWER', 'GRAVITY_WELL',
  'PIERCING_BULLETS', 'SPEED_TAMER',
];

describe('RANDOM_CHAOS', () => {
  it('activates a randomly-picked timed boost instead of itself, with a 600-900 tick duration', () => {
    const s = createGame('chaos-direct', PRACTICE_RUN);
    stubNextInt(s.rngBoosts, [5, 100]); // index 5 -> AUTO_TARGET; 600 + 100 = 700 ticks
    activateBoost(s, 'RANDOM_CHAOS');
    expect(s.boosts.active).toEqual([{ type: 'AUTO_TARGET', ticksLeft: 700 }]);
    expect(s.boosts.active.some((a) => a.type === 'RANDOM_CHAOS')).toBe(false);
  });

  it('a drop pickup behaves the same as a direct activation', () => {
    const s = createGame('chaos-drop', PRACTICE_RUN);
    stubNextInt(s.rngBoosts, [5, 100]); // same roll as the direct-activation case above
    s.drops.push({ x: s.ship.x, y: s.ship.y, boost: 'RANDOM_CHAOS', ttl: 100 });
    updateBoosts(s);
    // updateBoosts ticks every active boost down by one right after the pickup in the same call,
    // same as any other freshly-picked-up timed boost would (see boosts.test.ts).
    expect(s.boosts.active).toEqual([{ type: 'AUTO_TARGET', ticksLeft: 699 }]);
    expect(s.boosts.active.some((a) => a.type === 'RANDOM_CHAOS')).toBe(false);
    expect(s.events.at(-1)).toMatchObject({ type: 'boost_pickup', boost: 'RANDOM_CHAOS' });
  });

  it('an instant HEALTH_BOOST pick applies immediately with no active-timer entry', () => {
    const s = createGame('chaos-health', PRACTICE_RUN);
    const before = s.ship.lives;
    stubNextInt(s.rngBoosts, [2, 100]); // index 2 -> HEALTH_BOOST; the duration roll is drawn but unused
    const result = activateBoost(s, 'RANDOM_CHAOS');
    expect(result).toEqual({ type: 'HEALTH_BOOST', consumed: true });
    expect(s.ship.lives).toBe(before + 1);
    expect(s.boosts.active).toHaveLength(0);
  });

  it('an instant COIN_SHOWER pick applies immediately', () => {
    const s = createGame('chaos-coin', PRACTICE_RUN);
    s.score = 400;
    stubNextInt(s.rngBoosts, [10, 0]); // index 10 -> COIN_SHOWER
    activateBoost(s, 'RANDOM_CHAOS');
    expect(s.score).toBe(500); // +25%
    expect(s.boosts.active).toHaveLength(0);
  });

  it('a WAVE_BLAST pick with no crabs is not consumed, matching a direct pickup (spec C4)', () => {
    const s = createGame('chaos-wave-blast', PRACTICE_RUN);
    s.crabs = [];
    stubNextInt(s.rngBoosts, [9, 0]); // index 9 -> WAVE_BLAST
    const result = activateBoost(s, 'RANDOM_CHAOS');
    expect(result).toEqual({ type: 'WAVE_BLAST', consumed: false });
  });

  describe('SHIELD_BARRIER via chaos (spec C8)', () => {
    it('becomes a timed shield that drops to 0 on expiry', () => {
      const s = createGame('chaos-shield', PRACTICE_RUN);
      stubNextInt(s.rngBoosts, [4, 0]); // index 4 -> SHIELD_BARRIER, ticksLeft 600
      activateBoost(s, 'RANDOM_CHAOS');
      expect(s.boosts.shield).toBe(3);
      expect(s.boosts.active).toEqual([{ type: 'SHIELD_BARRIER', ticksLeft: 600 }]);
      for (let i = 0; i < 600; i++) updateBoosts(s);
      expect(s.boosts.shield).toBe(0);
      expect(s.boosts.active).toHaveLength(0);
    });

    it('is a no-op (still consumed) when a direct pickup follows while the timed shield is up (spec C6)', () => {
      const s = createGame('chaos-shield-nop', PRACTICE_RUN);
      stubNextInt(s.rngBoosts, [4, 0]);
      activateBoost(s, 'RANDOM_CHAOS'); // timed shield, shield = 3
      const result = activateBoost(s, 'SHIELD_BARRIER'); // direct pickup while it's active
      expect(result).toEqual({ type: 'SHIELD_BARRIER', consumed: true });
      expect(s.boosts.shield).toBe(3);
      expect(s.boosts.active).toEqual([{ type: 'SHIELD_BARRIER', ticksLeft: 600 }]); // untouched
    });
  });

  describe('SPEED_TAMER via chaos (spec C8)', () => {
    it('adds a timed stack that expires independently of a permanent stack', () => {
      const s = createGame('chaos-tamer', PRACTICE_RUN);
      activateBoost(s, 'SPEED_TAMER'); // permanent stack: tamerStacks 1, ticksLeft -1
      stubNextInt(s.rngBoosts, [13, 0]); // index 13 -> SPEED_TAMER, chaos ticksLeft 600
      activateBoost(s, 'RANDOM_CHAOS');
      expect(s.boosts.tamerStacks).toBe(2);
      expect(s.boosts.active.filter((a) => a.type === 'SPEED_TAMER')).toEqual([
        { type: 'SPEED_TAMER', ticksLeft: -1 },
        { type: 'SPEED_TAMER', ticksLeft: 600 },
      ]);
      for (let i = 0; i < 600; i++) updateBoosts(s);
      expect(s.boosts.tamerStacks).toBe(1); // only the timed stack expired
      expect(s.boosts.active).toEqual([{ type: 'SPEED_TAMER', ticksLeft: -1 }]);
    });
  });

  describe('GRAVITY_WELL via chaos', () => {
    it('rolls its own random centre, not the ship or drop position', () => {
      const s = createGame('chaos-well', PRACTICE_RUN);
      s.ship.x = 1234;
      s.ship.y = 5678;
      stubNextInt(s.rngBoosts, [11, 0, 100, 200]); // index 11 -> GRAVITY_WELL, ticks 600, well roll (100, 200)
      activateBoost(s, 'RANDOM_CHAOS');
      expect(s.boosts.active).toEqual([{ type: 'GRAVITY_WELL', ticksLeft: 600 }]);
      expect(s.boosts.well).toEqual({ x: WELL.margin + 100, y: WELL.margin + 200 });
    });

    it('a drop pickup rolls its own centre too, not the drop position', () => {
      const s = createGame('chaos-well-drop', PRACTICE_RUN);
      s.ship.x = 1000;
      s.ship.y = 9000;
      stubNextInt(s.rngBoosts, [11, 0, 100, 200]);
      s.drops.push({ x: 1050, y: 8980, boost: 'RANDOM_CHAOS', ttl: 100 }); // falls to y 9040 this tick
      updateBoosts(s);
      expect(s.boosts.active[0]).toMatchObject({ type: 'GRAVITY_WELL' });
      expect(s.boosts.well).toEqual({ x: WELL.margin + 100, y: WELL.margin + 200 });
    });
  });

  it('the pool covers exactly the 14 non-RANDOM_CHAOS boosts, in declaration order', () => {
    const allTypes = (Object.keys(BOOSTS) as BoostType[]).filter((t) => t !== 'RANDOM_CHAOS');
    expect(CHAOS_POOL).toHaveLength(14);
    expect([...CHAOS_POOL].sort()).toEqual([...allTypes].sort());

    for (let i = 0; i < CHAOS_POOL.length; i++) {
      const s = createGame(`chaos-index-${i}`, PRACTICE_RUN);
      stubNextInt(s.rngBoosts, [i, 0, 0, 0]); // trailing zeros feed GRAVITY_WELL's own well roll if picked
      const result = activateBoost(s, 'RANDOM_CHAOS');
      expect(result.type).toBe(CHAOS_POOL[i]);
    }
  });
});
