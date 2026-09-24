import { describe, expect, it } from 'vitest';
import { DAILY_RUN, FIELD_W, createGame, hashState, idiv, step, type Bullet, type GameState, type Input } from '../src';

/**
 * Proves the "stretch the climb after wave 5" change (`dailyPool`'s slower veteran cadence in
 * `levels.ts`, `fireRamp`'s shallower ramp past wave 6 in `sim/crabs.ts`) leaves a DAILY_RUN's
 * waves 1-6 exactly as they were: both functions are unchanged for wave <= 6 by construction (see
 * their own unit tests), and this replays that claim end to end rather than trusting the algebra
 * alone.
 *
 * `PRE_CHANGE_HASHES` was recorded by running the dodge script below (a self-contained copy of
 * golden-scripts.ts's `survivor`, so this file has no dependency on that one) against a DAILY_RUN
 * on the pre-change core (the working tree with only this change stashed out, `git stash` /
 * `git stash pop` around a throwaway recording script) — the state hash at every wave transition
 * through wave 6, plus the hash at the tick the run ended (still inside wave 6). None of the
 * existing goldens cover a DAILY_RUN this far without dying earlier than wave 6 (`idle`/`sweep`/
 * `wander`/`truncated` never reach it, and `boosted`'s seed changes with this edit — see
 * golden-scripts.ts), so this dedicated replay is the proof, not a byproduct of the golden suite.
 */
const PRE_CHANGE_HASHES: ReadonlyArray<{ wave: number; tick: number; hash: string }> = [
  { wave: 2, tick: 229, hash: '138ca08407e7a7ae' },
  { wave: 3, tick: 1157, hash: '8388f4123726b3e4' },
  { wave: 4, tick: 1653, hash: 'fc1ae3ea5c4d009a' },
  { wave: 5, tick: 2333, hash: 'c46572ad205344d2' },
  { wave: 6, tick: 2774, hash: 'f0cd63624d7908de' },
  { wave: 6, tick: 2966, hash: '033f5b1b352aa80c' }, // over=true, still inside wave 6
];

const DODGE_RANGE_Y = 2000;
const DODGE_COLUMN_COUNT = 7;
const DODGE_COLUMNS = Array.from({ length: DODGE_COLUMN_COUNT }, (_, i) => idiv(i * FIELD_W, DODGE_COLUMN_COUNT - 1));
const DODGE_DWELL_LIMIT = 7;

function sweepX(tick: number): number {
  const p = Math.floor(tick / 4) % 120;
  const k = p < 60 ? p : 120 - p;
  return 600 + Math.floor((k * 4400) / 60);
}

/** A self-contained copy of golden-scripts.ts's `survivor` dodge script. */
function survivorInput(): (tick: number, s: GameState) => Input {
  let lastColumn = DODGE_COLUMNS[idiv(DODGE_COLUMNS.length, 2)]!;
  let dwell = 0;
  return (tick, s) => {
    const threats: Bullet[] = [];
    for (const b of s.enemyShots) {
      if (Math.abs(b.y - s.octopi.y) <= DODGE_RANGE_Y) threats.push(b);
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

describe('DAILY_RUN waves 1-6 stay state-identical after the curve-B change', () => {
  it('reproduces the pre-change hash at every wave transition through wave 6', () => {
    const s = createGame('curve-b-hash-check', DAILY_RUN);
    const input = survivorInput();
    const hashes: Array<{ wave: number; tick: number; hash: string }> = [];
    let lastWave = s.wave;
    for (let t = 1; t <= 60_000 && s.wave <= 6 && !s.over; t++) {
      step(s, input(t, s));
      if (s.wave !== lastWave || s.over) {
        hashes.push({ wave: s.wave, tick: s.tick, hash: hashState(s) });
        lastWave = s.wave;
      }
    }
    expect(hashes).toEqual(PRE_CHANGE_HASHES);
  });
});
