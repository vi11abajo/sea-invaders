import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReplayRecorder, checkGoldens, createGame, hashState, step, type Golden } from '../src';
import { GOLDEN_SCRIPTS } from './golden-scripts';

// Tests run from core/ (npm test in core/, and CI sets working-directory: core).
const FILE = join(process.cwd(), 'golden', 'golden-v1.json');

function play(name: string): Golden {
  const script = GOLDEN_SCRIPTS[name]!;
  const input = script.makeInput();
  const seed = `golden-${name}`;
  const s = createGame(seed);
  const rec = new ReplayRecorder(seed);
  for (let t = 1; t <= script.ticks && !s.over; t++) {
    const i = input(t);
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

describe('golden replays', () => {
  it('replaying live play reproduces its result', () => {
    for (const check of checkGoldens(fresh)) expect(check.actual).toEqual(check.expected);
  });

  it('match the committed golden file (regenerate with UPDATE_GOLDEN=1)', () => {
    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(FILE, `${JSON.stringify(fresh)}\n`);
    const committed = JSON.parse(readFileSync(FILE, 'utf8')) as Golden[];
    expect(checkGoldens(committed).every((c) => c.ok)).toBe(true);
    expect(committed).toEqual(fresh);
  });

  it('include a run that ends in game over', () => {
    expect(fresh.find((g) => g.name === 'idle')!.expected.over).toBe(true);
  });
});
