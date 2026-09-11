import { FIELD_W, INITIAL_INPUT, Rng, clamp, idiv, type Bullet, type GameState, type Input } from '../src';

export interface GoldenScript {
  ticks: number;
  /** Returns a fresh input function; call it once per tick, in order, starting at tick 1, with the state right before that tick's step(). */
  makeInput: () => (tick: number, s: GameState) => Input;
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

/** Candidate dodge columns spanning the field, evenly spaced. */
const DODGE_COLUMNS = Array.from({ length: 9 }, (_, i) => idiv(i * FIELD_W, 8));

/**
 * After holding the same dodge column this long, that column is dropped from consideration for
 * one pick: dwelling in one corner lets shots fired over many ticks all converge on it.
 */
const DODGE_DWELL_LIMIT = 8;

/**
 * Dodges every threatening enemy shot (within DODGE_RANGE_Y vertically) at once by moving to
 * whichever column keeps the largest possible distance from all of them, with the dwell limit
 * above forcing it to relocate rather than getting cornered — otherwise sweeps like `sweep`.
 */
function survivor(): (tick: number, s: GameState) => Input {
  let lastColumn = DODGE_COLUMNS[idiv(DODGE_COLUMNS.length, 2)]!;
  let dwell = 0;
  return (tick, s) => {
    const threats: Bullet[] = [];
    for (const b of s.enemyShots) {
      if (Math.abs(b.y - s.ship.y) <= DODGE_RANGE_Y) threats.push(b);
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

export const GOLDEN_SCRIPTS: Record<string, GoldenScript> = {
  idle: { ticks: 3600, makeInput: () => () => INITIAL_INPUT },
  sweep: { ticks: 7200, makeInput: () => (t) => ({ x: sweepX(t), y: 9000 }) },
  wander: { ticks: 10_800, makeInput: wander },
  // Same input trajectory as `wander`, cut short with the game still running.
  truncated: { ticks: 600, makeInput: wander },
  survivor: { ticks: 18_000, makeInput: survivor },
};
