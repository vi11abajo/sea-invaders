import {
  DAILY_RUN, FIELD_W, INITIAL_INPUT, REPLAY_MODE, Rng, clamp, idiv, levelById, levelSeed,
  type Bullet, type GameState, type Input, type ReplayMode, type RunConfig,
} from '../src';

export interface GoldenScript {
  ticks: number;
  /** Returns a fresh input function; call it once per tick, in order, starting at tick 1, with the state right before that tick's step(). */
  makeInput: () => (tick: number, s: GameState) => Input;
  /** Defaults to `PRACTICE_RUN` (idle/sweep/wander/truncated/survivor). */
  run?: RunConfig;
  /** Defaults to `REPLAY_MODE.practice`. */
  mode?: ReplayMode;
  /** Defaults to `golden-${name}`. `level6`/`level30` key off the level id instead, matching `runFromReplay`. */
  seed?: string;
}

/** Triangle wave across the field: x changes every 4 ticks, period 480 ticks. */
function sweepX(tick: number): number {
  const p = Math.floor(tick / 4) % 120;
  const k = p < 60 ? p : 120 - p;
  return 600 + Math.floor((k * 4400) / 60);
}

/** Seeded random walk that changes every 6 ticks. */
function wander(): (tick: number) => Input {
  const r = new Rng('golden-wander-input');
  let x = INITIAL_INPUT.x;
  let y = INITIAL_INPUT.y;
  return (tick) => {
    if (tick % 6 === 0) {
      x = clamp(x + r.nextInt(801) - 400, 0, FIELD_W);
      y = clamp(y + r.nextInt(401) - 200, 5000, 11000);
    }
    return { x, y };
  };
}

/** Vertical range within which an incoming enemy shot is worth dodging. */
const DODGE_RANGE_Y = 1500;

/**
 * A boss's shots start far above Octopi (muzzle near the top of the field) and take longer to
 * arrive than a crab's, so a boss fight uses a wider reaction window than the crab-wave one above
 * (tuned so `survivor` still clears levels 6 and 30 without regressing the plain wave-mode floor,
 * `SURVIVOR_MIN_TICKS` in golden.test.ts).
 */
const BOSS_DODGE_RANGE_Y = 3000;

/** Candidate dodge columns spanning the field, evenly spaced. */
const DODGE_COLUMNS = Array.from({ length: 9 }, (_, i) => idiv(i * FIELD_W, 8));

/**
 * After holding the same dodge column this long, that column is dropped from consideration for
 * one pick: dwelling in one corner lets shots fired over many ticks all converge on it. Retuned
 * from 8 to 5 across Phase 3A.1 lane C's two fix rounds: the boost-table-size changes (RICOCHET
 * removed, WAVE_BLAST scoped to the bottom row, the RANDOM_CHAOS pool widened) and, in fix round 1,
 * player shots actually moving on both axes (so MULTI_SHOT/AUTO_TARGET pickups change which crabs
 * die and when) each shift every subsequent `rngBoosts` draw for the fixed `golden-survivor` seed —
 * an unavoidable side effect of correctly implementing the spec, not a simulation regression. This
 * value was found by sweeping dwell/range/column-count against `survivor`, `level6` and `level30`
 * at once and picking one with comfortable margin on `survivor` (~11,400 ticks, not a bare pass over
 * the 6000 floor) that also still clears level 6 and reaches level 30's boss phase 3 — the smallest
 * change from the pre-lane-C values (1500/8/9 columns) that satisfies all three.
 */
const DODGE_DWELL_LIMIT = 5;

/**
 * Dodges every threatening enemy shot (within DODGE_RANGE_Y vertically) at once by moving to
 * whichever column keeps the largest possible distance from all of them, with the dwell limit
 * above forcing it to relocate rather than getting cornered — otherwise sweeps like `sweep`.
 */
function survivor(): (tick: number, s: GameState) => Input {
  let lastColumn = DODGE_COLUMNS[idiv(DODGE_COLUMNS.length, 2)]!;
  let dwell = 0;
  return (tick, s) => {
    const range = s.boss ? BOSS_DODGE_RANGE_Y : DODGE_RANGE_Y;
    const threats: Bullet[] = [];
    for (const b of s.enemyShots) {
      if (Math.abs(b.y - s.octopi.y) <= range) threats.push(b);
    }
    if (threats.length > 0) {
      const candidates = dwell >= DODGE_DWELL_LIMIT ? DODGE_COLUMNS.filter((c) => c !== lastColumn) : DODGE_COLUMNS;
      let bestColumn = candidates[0]!;
      let bestMinDist = -1;
      for (const column of candidates) {
        let minDist = Infinity;
        for (const b of threats) minDist = Math.min(minDist, Math.abs(column - b.x));
        if (minDist > bestMinDist) {
          bestMinDist = minDist;
          bestColumn = column;
        }
      }
      dwell = bestColumn === lastColumn ? dwell + 1 : 0;
      lastColumn = bestColumn;
      return { x: bestColumn, y: 9000 };
    }
    dwell = 0;
    return { x: sweepX(tick), y: 9000 };
  };
}

const CAMPAIGN_RUN = (id: 6 | 30): RunConfig => ({
  mode: 'campaign', level: levelById(id), lives: 5, features: { boosts: true }, octopi: 'base',
});

export const GOLDEN_SCRIPTS: Record<string, GoldenScript> = {
  idle: { ticks: 3600, makeInput: () => () => INITIAL_INPUT },
  sweep: { ticks: 7200, makeInput: () => (t) => ({ x: sweepX(t), y: 9000 }) },
  wander: { ticks: 10_800, makeInput: wander },
  // Same input trajectory as `wander`, cut short with the game still running.
  truncated: { ticks: 600, makeInput: wander },
  survivor: { ticks: 18_000, makeInput: survivor },
  // Plays on level 6 (reef 1's boss) as a campaign run, stopping early on `cleared || over`;
  // `ticks` here is only the fallback cap for that early-exit loop.
  level6: {
    ticks: 18_000, makeInput: survivor, run: CAMPAIGN_RUN(6), mode: REPLAY_MODE.campaign, seed: levelSeed('golden', 6),
  },
  // Plays on level 30 (reef 5's boss, the Void Sovereign) as a campaign run, stopping early on
  // `cleared || over`; `ticks` here is only the fallback cap for that early-exit loop.
  level30: {
    ticks: 18_000, makeInput: survivor, run: CAMPAIGN_RUN(30), mode: REPLAY_MODE.campaign, seed: levelSeed('golden', 30),
  },
  // The `wander` input trajectory on a boosted daily run: exercises boost pickups/effects end to
  // end. `wander` never dodges, so the run ends in game over well short of `ticks`; this seed was
  // picked (search, not the sim) for at least 5 boost_pickup events before Octopi dies. Re-picked
  // whenever the `rngBoosts` draw sequence changes (Phase 3A.1: RICOCHET removed, chaos pool 10 -> 14,
  // drop chance 7 % -> 3 %): `golden-boosted-19` gives 7 pickups at the current rules.
  boosted: { ticks: 10_800, makeInput: wander, run: DAILY_RUN, mode: REPLAY_MODE.daily, seed: 'golden-boosted-19' },
};
