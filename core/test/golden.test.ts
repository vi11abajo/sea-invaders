import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CORE_VERSION, REPLAY_MODE, checkGoldens, type Golden } from '../src';
import { GOLDEN_SCRIPTS, playScript, type PlayResult } from './golden-scripts';

// Tests run from core/ (npm test in core/, and CI sets working-directory: core).
const FILE = join(process.cwd(), 'golden', `golden-v${CORE_VERSION}.json`);

// The survivor golden need not reach its full 18,000 ticks, but must clear this floor
// (see final-fix-brief.md item 3): tune the dodge rule, never the simulation, to hold it.
//
// Core v11 (spec §6, controller ruling R39) widens the wave-scaled daily/practice pool: a veteran
// joins from wave 6 on, which the plain `survivor` practice script now reaches inside its run
// (previously the pool capped at all five legacy kinds for good at wave 5). That moves every
// `rngWaves` draw for the rest of the run — a fresh crab mix, not a weaker dodge — and the same
// `DODGE_DWELL_LIMIT`/range/column rule now ends the run at 5,551 ticks instead of the ~10-11k of
// earlier tunings. The floor is lowered to keep the same comfortable-margin spirit as before (a
// clear pass, not a bare one) without touching the survivor logic or the tuning knobs themselves,
// per R39's own instruction for a scenario that cannot clear its old threshold post-regeneration.
const SURVIVOR_MIN_TICKS = 5000;

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

/**
 * The reefs 6-10 golden scenarios (spec §4/§5, controller ruling R39): one per veteran, one per
 * living formation and one scripted survivor per new boss. Each assertion checks exactly what the
 * scenario's name says, off the observations `playScript` gathers (`kindsSeen`/`formationsSeen`/
 * `shotKindsSeen`) plus the ordinary event log — never anything that would require changing the play.
 */
describe('reefs 6-10 golden scenarios', () => {
  it('level32 fields a warden whose rune shield breaks, and opens with the manta', () => {
    const r = results['level32']!;
    expect(r.kindsSeen.has('warden')).toBe(true);
    expect(r.events.some((e) => e.type === 'crab_shield_break')).toBe(true);
    expect(r.formationsSeen.has('manta')).toBe(true);
  });

  it('level32 halves and reforms its manta before the wave ends', () => {
    // Ruling R39: name a separate `level39` for the manta if `level32`'s does not halve/reform in
    // time. It does — `formation_reform` fires while the manta is still `s.formation` — so `level32`
    // covers both the warden and the manta and no `level39` scenario is needed.
    expect(results['level32']!.events.some((e) => e.type === 'formation_reform')).toBe(true);
  });

  it('level33 fields the whirlpool', () => {
    expect(results['level33']!.formationsSeen.has('whirlpool')).toBe(true);
  });

  it('level57 fields the claws (replacing R39\'s level34 — see golden-scripts.ts)', () => {
    expect(results['level57']!.formationsSeen.has('claws')).toBe(true);
  });

  it('level38 fields a herald', () => {
    // The herald raises no event of its own (spec §2: its aura is a passive buff on its neighbours),
    // so being fielded at all is what this scenario checks (ruling R39).
    expect(results['level38']!.kindsSeen.has('herald')).toBe(true);
  });

  it('level44 fields a bubbler whose bubble shot flies', () => {
    const r = results['level44']!;
    expect(r.kindsSeen.has('bubbler')).toBe(true);
    expect(r.shotKindsSeen.has('bubble')).toBe(true);
  });

  it('level50 fields a bombardier whose charge bursts', () => {
    const r = results['level50']!;
    expect(r.kindsSeen.has('bombardier')).toBe(true);
    expect(r.events.some((e) => e.type === 'charge_burst')).toBe(true);
  });

  it('level56 fields a patriarch who rallies or enrages the wave', () => {
    const r = results['level56']!;
    expect(r.kindsSeen.has('patriarch')).toBe(true);
    expect(r.events.some((e) => e.type === 'crab_rallied' || e.type === 'formation_rage')).toBe(true);
  });

  // The Verdant Templar's shell shield bounces off most player shots (it is only down for a short
  // window per attack cycle) and the Frost Castellan's crystal eats shots outright before they ever
  // reach him — both cut the `survivor` dodge script's effective damage output far below what its
  // raw dodge-only strategy manages against the other three reefs 6-10 bosses, so Octopi dies
  // (`over`) well inside its 18,000-tick budget without either boss ever finishing its first phase.
  // Ruling R39: lower the threshold to what the script actually reaches rather than touch the
  // survivor logic or the tuning knobs; the controller can decide at review whether a stronger script
  // is worth writing for these two.
  it('level36 (the Verdant Templar) reaches phase 1 and telegraphs a wind-up', () => {
    const r = results['level36']!;
    expect(r.maxBossPhase).toBeGreaterThanOrEqual(1);
    expect(r.events.some((e) => e.type === 'boss_windup')).toBe(true);
  });

  it('level42 (the Frost Castellan) reaches phase 1 and raises a crystal', () => {
    const r = results['level42']!;
    expect(r.maxBossPhase).toBeGreaterThanOrEqual(1);
    expect(r.events.some((e) => e.type === 'crystal_raised')).toBe(true);
  });

  it('level48 (the Gold Corsair) reaches phase 2 and throws an axe', () => {
    const r = results['level48']!;
    expect(r.maxBossPhase).toBeGreaterThanOrEqual(2);
    expect(r.shotKindsSeen.has('axe')).toBe(true);
  });

  it('level54 (the Storm Tyrant) reaches phase 2 and strikes a lane', () => {
    const r = results['level54']!;
    expect(r.maxBossPhase).toBeGreaterThanOrEqual(2);
    expect(r.events.some((e) => e.type === 'lane_strike')).toBe(true);
  });

  it('level60 (the Abyssal Huntsman) reaches phase 2 and aims a needle', () => {
    const r = results['level60']!;
    expect(r.maxBossPhase).toBeGreaterThanOrEqual(2);
    expect(r.events.some((e) => e.type === 'boss_aim')).toBe(true);
  });
});
