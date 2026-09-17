import {
  DAILY_RUN, FIELD_W, INITIAL_INPUT, PRACTICE_RUN, REPLAY_MODE, ReplayRecorder, Rng, clamp, createGame,
  hashState, idiv, levelById, levelSeed, step,
  type Bullet, type GameEvent, type GameState, type Golden, type Input, type ReplayMode, type RunConfig,
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

/**
 * Vertical range within which an incoming enemy shot is worth dodging (see `DODGE_DWELL_LIMIT`).
 * Widened from 1200 with the enemy rework of core v8: a red crab's `heavy` shot flies at 140
 * instead of 110 and covers a 154-unit radius instead of 96, so the old window left the dodge too
 * late to clear it.
 */
const DODGE_RANGE_Y = 2000;

/**
 * A boss's shots start far above Octopi (muzzle near the top of the field) and take longer to
 * arrive than a crab's, so a boss fight uses a wider reaction window than the crab-wave one above
 * (tuned so `survivor` still clears levels 6 and 30 without regressing the plain wave-mode floor,
 * `SURVIVOR_MIN_TICKS` in golden.test.ts).
 */
const BOSS_DODGE_RANGE_Y = 3000;

/** How many candidate dodge columns span the field (see `DODGE_DWELL_LIMIT`). */
const DODGE_COLUMN_COUNT = 7;

/** Candidate dodge columns spanning the field, evenly spaced (see `DODGE_DWELL_LIMIT`). */
const DODGE_COLUMNS = Array.from(
  { length: DODGE_COLUMN_COUNT },
  (_, i) => idiv(i * FIELD_W, DODGE_COLUMN_COUNT - 1),
);

/**
 * After holding the same dodge column this long, that column is dropped from consideration for
 * one pick: dwelling in one corner lets shots fired over many ticks all converge on it. It stands
 * at 7 today, after three retunings. It first went from 8 to 5 across Phase 3A.1 lane C's two fix
 * rounds: the boost-table-size changes (RICOCHET removed, WAVE_BLAST scoped to the bottom row, the
 * RANDOM_CHAOS pool widened) and, in fix round 1, player shots actually moving on both axes (so
 * MULTI_SHOT/AUTO_TARGET pickups change which crabs die and when) each shift every subsequent
 * `rngBoosts` draw for the fixed `golden-survivor` seed — an unavoidable side effect of correctly
 * implementing the spec, not a simulation regression. That value was found by sweeping
 * dwell/range/column-count against `survivor`, `level6` and `level30` at once and picking one with
 * comfortable margin on `survivor` (~11,400 ticks, not a bare pass over the 6000 floor) that also
 * still clears level 6 and reaches level 30's boss phase 3 — the smallest change from the
 * pre-lane-C values (1500/8/9 columns) that satisfies all three.
 * Retuned again with the game-speed tuning of 2026-09-13 (slower Octopi shots, slower and less
 * trigger-happy crabs), which shifts every draw the same way: the same three-way sweep picked range
 * 1200, dwell 7 and 11 columns (`survivor` ~10,200 ticks, level 6 cleared, level 30 phase 3).
 * Core v8's enemy rework (heavier and faster red shots worth two lives, yellow and violet crabs
 * firing twice as often, no dives) made the old rule die around tick 1,800, so the same three-way
 * sweep ran again over range x dwell x column count: it kept the dwell at 7 and picked range 2000
 * with 7 columns (`survivor` 11,058 ticks, level 6 cleared, level 30 phase 3) — fewer, wider-apart
 * columns move Octopi further out of a shot's way per relocation, which is what the harder shots
 * call for.
 */
const DODGE_DWELL_LIMIT = 7;

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
  // The `survivor` input on a boosted daily run: exercises boost pickups/effects end to end. The seed
  // was picked (search, not the sim) for at least 5 boost_pickup events, and is re-picked whenever
  // the `rngBoosts` draw sequence changes. Until the game-speed tuning of 2026-09-13 this used the
  // non-dodging `wander` input, but its runs end too early with it. Core v8's enemy rework moved
  // every draw again and left `golden-boosted-0` with too few pickups, so the search ran once more:
  // `golden-boosted-16` gives 8 pickups over 8171 ticks.
  boosted: { ticks: 10_800, makeInput: survivor, run: DAILY_RUN, mode: REPLAY_MODE.daily, seed: 'golden-boosted-16' },
};

export interface PlayResult {
  golden: Golden;
  /** Every event pushed to `s.events` over the whole play (never cleared mid-run). */
  events: GameEvent[];
  /** `s.cleared` at the end of the play. */
  cleared: boolean;
  /** The highest `s.boss.phase` seen at any point during the play (0 if no boss ever spawned). */
  maxBossPhase: number;
}

/**
 * Plays one script to its tick cap (or to `cleared`/`over`, whichever comes first) and records it.
 * Shared by the tuned goldens in `golden.test.ts` and the untuned baseline in
 * `golden-untuned.test.ts`, which plays these very scripts with the TUNING knobs mocked back to
 * 100 % — both go through this one function so the only difference between the two golden files is
 * the tuning itself.
 */
export function playScript(name: string): PlayResult {
  const script = GOLDEN_SCRIPTS[name]!;
  const input = script.makeInput();
  const run = script.run ?? PRACTICE_RUN;
  const mode = script.mode ?? REPLAY_MODE.practice;
  const levelId = run.level?.id ?? 0;
  const seed = script.seed ?? `golden-${name}`;
  const s = createGame(seed, run);
  const rec = new ReplayRecorder(seed, mode, levelId, run.lives, run.octopi);
  let maxBossPhase = 0;
  for (let t = 1; t <= script.ticks && !s.over && !s.cleared; t++) {
    const i = input(t, s);
    rec.record(t, i);
    step(s, i);
    if (s.boss) maxBossPhase = Math.max(maxBossPhase, s.boss.phase);
  }
  return {
    golden: {
      name,
      replay: rec.finish(s.tick),
      expected: { score: s.score, ticks: s.tick, over: s.over, hash: hashState(s) },
    },
    events: s.events,
    cleared: s.cleared,
    maxBossPhase,
  };
}
