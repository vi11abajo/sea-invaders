import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CORE_VERSION, PRACTICE_RUN, REPLAY_MODE, ReplayRecorder, checkGoldens, createGame, hashState, step,
  type GameEvent, type Golden,
} from '../src';
import { GOLDEN_SCRIPTS } from './golden-scripts';

// Tests run from core/ (npm test in core/, and CI sets working-directory: core).
const FILE = join(process.cwd(), 'golden', `golden-v${CORE_VERSION}.json`);

// The survivor golden need not reach its full 18,000 ticks, but must clear this floor
// (see final-fix-brief.md item 3): tune the dodge rule, never the simulation, to hold it.
const SURVIVOR_MIN_TICKS = 6000;

interface PlayResult {
  golden: Golden;
  /** Every event pushed to `s.events` over the whole play (never cleared mid-run). */
  events: GameEvent[];
  /** `s.cleared` at the end of the play. */
  cleared: boolean;
  /** The highest `s.boss.phase` seen at any point during the play (0 if no boss ever spawned). */
  maxBossPhase: number;
}

function play(name: string): PlayResult {
  const script = GOLDEN_SCRIPTS[name]!;
  const input = script.makeInput();
  const run = script.run ?? PRACTICE_RUN;
  const mode = script.mode ?? REPLAY_MODE.practice;
  const levelId = run.level?.id ?? 0;
  const seed = script.seed ?? `golden-${name}`;
  const s = createGame(seed, run);
  const rec = new ReplayRecorder(seed, mode, levelId, run.lives);
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

// Computed lazily in `beforeAll` (not at module load): PRACTICE_RUN/DAILY_RUN have boosts on and
// the campaign scripts spend real ticks simulating a boss fight, so this is worth deferring past
// module load (matters if this file is ever imported without running its tests).
let results: Record<string, PlayResult>;
let fresh: Golden[];

describe('golden replays', () => {
  beforeAll(() => {
    results = Object.fromEntries(Object.keys(GOLDEN_SCRIPTS).map((name) => [name, play(name)]));
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

  it('the survivor keeps the ship alive for a long stretch by dodging enemy fire', () => {
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
