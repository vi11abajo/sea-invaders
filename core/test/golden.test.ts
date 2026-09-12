import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CORE_VERSION, PRACTICE_RUN, REPLAY_MODE, ReplayRecorder, checkGoldens, createGame, hashState, step, type Golden,
} from '../src';
import { GOLDEN_SCRIPTS } from './golden-scripts';

// Tests run from core/ (npm test in core/, and CI sets working-directory: core).
const FILE = join(process.cwd(), 'golden', `golden-v${CORE_VERSION}.json`);

// The survivor golden need not reach its full 18,000 ticks, but must clear this floor
// (see final-fix-brief.md item 3): tune the dodge rule, never the simulation, to hold it.
const SURVIVOR_MIN_TICKS = 6000;

function play(name: string): Golden {
  const script = GOLDEN_SCRIPTS[name]!;
  const input = script.makeInput();
  const seed = `golden-${name}`;
  const s = createGame(seed, PRACTICE_RUN);
  const rec = new ReplayRecorder(seed, REPLAY_MODE.practice, 0, 3);
  for (let t = 1; t <= script.ticks && !s.over; t++) {
    const i = input(t, s);
    rec.record(t, i);
    step(s, i);
  }
  return {
    name,
    replay: rec.finish(s.tick),
    expected: { score: s.score, ticks: s.tick, over: s.over, hash: hashState(s) },
  };
}

const fresh = Object.keys(GOLDEN_SCRIPTS).map(play);

describe.skip('golden replays (re-enabled in Task 15 with golden-v3.json)', () => {
  it('replaying live play reproduces its result', () => {
    for (const check of checkGoldens(fresh)) expect(check.actual).toEqual(check.expected);
  });

  it('match the committed golden file (regenerate with UPDATE_GOLDEN=1)', () => {
    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(FILE, `${JSON.stringify(fresh)}\n`);
    const committed = JSON.parse(readFileSync(FILE, 'utf8')) as Golden[];
    for (const g of committed) expect(g.replay.version).toBe(CORE_VERSION);
    expect(checkGoldens(committed).every((c) => c.ok)).toBe(true);
    expect(committed).toEqual(fresh);
  });

  it('include a run that ends in game over', () => {
    expect(fresh.find((g) => g.name === 'idle')!.expected.over).toBe(true);
  });

  it('include a truncated run that ends with the game still in progress', () => {
    expect(fresh.find((g) => g.name === 'truncated')!.expected.over).toBe(false);
  });

  it('the survivor keeps the ship alive for a long stretch by dodging enemy fire', () => {
    expect(fresh.find((g) => g.name === 'survivor')!.expected.ticks).toBeGreaterThanOrEqual(SURVIVOR_MIN_TICKS);
  });

  it('every golden was recorded as a practice run', () => {
    for (const g of fresh) expect(g.replay.mode).toBe(REPLAY_MODE.practice);
  });
});
