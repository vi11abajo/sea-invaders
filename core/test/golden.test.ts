import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CORE_VERSION, REPLAY_MODE, checkGoldens, type Golden } from '../src';
import { GOLDEN_SCRIPTS, playScript, type PlayResult } from './golden-scripts';

// Tests run from core/ (npm test in core/, and CI sets working-directory: core).
const FILE = join(process.cwd(), 'golden', `golden-v${CORE_VERSION}.json`);

// The survivor golden need not reach its full 18,000 ticks, but must clear this floor
// (see final-fix-brief.md item 3): tune the dodge rule, never the simulation, to hold it.
const SURVIVOR_MIN_TICKS = 6000;

// Computed lazily in `beforeAll` (not at module load): PRACTICE_RUN/DAILY_RUN have boosts on and
// the campaign scripts spend real ticks simulating a boss fight, so this is worth deferring past
// module load (matters if this file is ever imported without running its tests).
let results: Record<string, PlayResult>;
let fresh: Golden[];

describe('golden replays', () => {
  beforeAll(() => {
    results = Object.fromEntries(Object.keys(GOLDEN_SCRIPTS).map((name) => [name, playScript(name)]));
    fresh = Object.values(results).map((r) => r.golden);
  });

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

  it('the survivor keeps Octopi alive for a long stretch by dodging enemy fire', () => {
    expect(fresh.find((g) => g.name === 'survivor')!.expected.ticks).toBeGreaterThanOrEqual(SURVIVOR_MIN_TICKS);
  });

  it('idle, sweep, wander, truncated and survivor were recorded as practice runs', () => {
    for (const name of ['idle', 'sweep', 'wander', 'truncated', 'survivor']) {
      expect(fresh.find((g) => g.name === name)!.replay.mode).toBe(REPLAY_MODE.practice);
    }
  });

  it('level6 clears the level, having killed its boss', () => {
    const r = results['level6']!;
    expect(r.events.some((e) => e.type === 'boss_dead')).toBe(true);
    expect(r.cleared).toBe(true);
    expect(fresh.find((g) => g.name === 'level6')!.expected.over).toBe(false);
  });

  it('level30 reaches at least boss phase 3', () => {
    expect(results['level30']!.maxBossPhase).toBeGreaterThanOrEqual(3);
  });

  it('level6 and level30 were recorded as campaign runs with their level id and 5 lives', () => {
    expect(fresh.find((g) => g.name === 'level6')!.replay).toMatchObject({ mode: REPLAY_MODE.campaign, levelId: 6, lives: 5 });
    expect(fresh.find((g) => g.name === 'level30')!.replay).toMatchObject({ mode: REPLAY_MODE.campaign, levelId: 30, lives: 5 });
  });

  it('boosted picked up at least 5 boosts and was recorded as a daily run', () => {
    const r = results['boosted']!;
    expect(r.events.filter((e) => e.type === 'boost_pickup').length).toBeGreaterThanOrEqual(5);
    expect(fresh.find((g) => g.name === 'boosted')!.replay).toMatchObject({ mode: REPLAY_MODE.daily, levelId: 0 });
  });
});
