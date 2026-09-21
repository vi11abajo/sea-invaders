import {
  FIELD_W, createGame, idiv, levelById, step,
  type Bullet, type GameState, type Input, type RunConfig,
} from '../../src';
import { hashStateV10 } from './hash-v10';

/**
 * The frozen inputs of the v10 invariance snapshot (`golden/invariance-v10.json`).
 *
 * Everything here is a verbatim copy of the dodge script `test/golden-scripts.ts` carried at core
 * v10, kept apart from it on purpose: the goldens are retuned whenever the simulation grows, and a
 * retuned input would move the snapshot's numbers without the old simulation having moved at all.
 * This file and the snapshot it feeds are written once and never touched again, so a difference can
 * only come from the game itself.
 *
 * Only campaign levels 1..30 are replayed here. Daily and practice waves draw from a pool that the
 * second campaign widens by design, so they are no business of an invariance check.
 */

/** Triangle wave across the field: x changes every 4 ticks, period 480 ticks. */
function sweepX(tick: number): number {
  const p = Math.floor(tick / 4) % 120;
  const k = p < 60 ? p : 120 - p;
  return 600 + Math.floor((k * 4400) / 60);
}

/** Vertical range within which an incoming enemy shot is worth dodging. */
const DODGE_RANGE_Y = 2000;

/** The wider reaction window a boss fight uses: its shots start far above Octopi. */
const BOSS_DODGE_RANGE_Y = 3000;

/** How many candidate dodge columns span the field. */
const DODGE_COLUMN_COUNT = 7;

/** Candidate dodge columns spanning the field, evenly spaced. */
const DODGE_COLUMNS = Array.from(
  { length: DODGE_COLUMN_COUNT },
  (_, i) => idiv(i * FIELD_W, DODGE_COLUMN_COUNT - 1),
);

/** After holding the same dodge column this long, that column is dropped for one pick. */
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

/**
 * Tick budget of a wave level (one minute of play at 60 Hz). A level the script clears or loses
 * sooner stops there; the rest are snapshotted mid-level, which is just as good a witness.
 */
const WAVE_LEVEL_TICKS = 3600;

/** Tick budget of a boss level (two and a half minutes): a boss fight needs the longer leash. */
const BOSS_LEVEL_TICKS = 9000;

/** The six levels of a reef, the sixth being its boss — frozen here, not read from the level table. */
const LEVELS_PER_REEF = 6;

/** How many campaign levels the snapshot covers: the whole first campaign. */
const LEGACY_LEVELS = 30;

export interface InvarianceScenario {
  /** The campaign level id, 1..30. */
  id: number;
  /** Run seed, fixed per level and shared with no other suite. */
  seed: string;
  /** Tick cap; the play also stops on `over` or `cleared`. */
  ticks: number;
  run: RunConfig;
}

/**
 * One scenario per level of the first campaign, all playing the frozen dodge script. The run config
 * reads the live level table on purpose: a row of levels 1..30 that changed is exactly what this
 * snapshot is here to catch.
 */
export const INVARIANCE_SCENARIOS: readonly InvarianceScenario[] = Array.from(
  { length: LEGACY_LEVELS },
  (_, i): InvarianceScenario => {
    const id = i + 1;
    const boss = id % LEVELS_PER_REEF === 0;
    return {
      id,
      seed: `inv-${id}`,
      ticks: boss ? BOSS_LEVEL_TICKS : WAVE_LEVEL_TICKS,
      run: { mode: 'campaign', level: levelById(id), lives: 5, features: { boosts: true }, octopi: 'base' },
    };
  },
);

/** What the snapshot stores per scenario. */
export interface InvarianceResult {
  id: number;
  ticks: number;
  score: number;
  hash: string;
}

/** Plays one scenario to its cap (or to `cleared`/`over`) and reports what the snapshot compares. */
export function playInvarianceScenario(scenario: InvarianceScenario): InvarianceResult {
  const input = survivor();
  const s = createGame(scenario.seed, scenario.run);
  for (let t = 1; t <= scenario.ticks && !s.over && !s.cleared; t++) step(s, input(t, s));
  return { id: scenario.id, ticks: s.tick, score: s.score, hash: hashStateV10(s) };
}
