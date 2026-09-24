import { describe, expect, it } from 'vitest';
import {
  INITIAL_INPUT, OCTOPI, PRACTICE_RUN, activateBoost, createGame, fireIntervalFor, idiv, killCrab, levelById,
  loseLife, lowLifeFireBonusPctFor, spawnBoss, step, surgeIfDue, updateEnemyShots, updateShots, type Crab,
  type GameState, type OctopiVariant, type RunConfig,
} from '../src';

const runWith = (octopi: OctopiVariant): RunConfig => ({ ...PRACTICE_RUN, octopi });
const level = (octopi: OctopiVariant): RunConfig => ({ mode: 'campaign', level: levelById(2), lives: 5, features: { boosts: true }, octopi });

/** A plain one-hit crab at `(x, y)`; `tag` rides in the cosmetic `kind` so a test can tell its rows apart. */
const crab = (x: number, y: number, tag: number): Crab => ({
  x, y, kind: tag, type: 'normal', hp: 1, slot: -1, shield: 0, shieldTimer: 0, rallies: 0, rallyTimer: 0, squad: 0, cell: -1, revived: 0,
});

/**
 * A practice run of `octopi` whose field is exactly `rows` rows of three crabs, 1000 units apart (far
 * more than WAVE_BLAST's 367-unit row band), the lowest row tagged 0; no crab fires, and a WAVE_BLAST
 * drop sits on Octopi so the next tick's `updateBoosts` picks it up.
 */
function blastReady(octopi: OctopiVariant, rows: number, surgeKills: number): GameState {
  const s = createGame('surge-pickup', runWith(octopi));
  s.rngFire = { nextInt: () => 999 } as never; // nothing new fires
  s.crabs = [];
  for (let r = 0; r < rows; r++) for (const x of [2000, 2800, 3600]) s.crabs.push(crab(x, 3000 - r * 1000, r));
  s.surgeKills = surgeKills;
  s.drops.push({ x: s.octopi.x, y: s.octopi.y, boost: 'WAVE_BLAST', ttl: 100 });
  return s;
}

/** Whether this tick's `updateShots` fires: the cooldown runs out on a tick it enters at 1 or below. */
function firesNow(s: GameState): boolean {
  const due = s.octopi.cooldown <= 1;
  updateShots(s);
  return due;
}

/** The ticks (1-based) on which Octopi fires over `ticks` ticks of `updateShots`, lives pinned to `livesAt(t)` before tick `t`. */
function fireTicks(s: GameState, ticks: number, livesAt: (t: number) => number): number[] {
  const fired: number[] = [];
  for (let t = 1; t <= ticks; t++) {
    s.octopi.lives = livesAt(t);
    if (firesNow(s)) fired.push(t);
  }
  return fired;
}

/** The gaps between consecutive fire ticks. */
const gaps = (ticks: number[]): number[] => ticks.slice(1).map((t, i) => t - ticks[i]!);

/** Runs `updateShots` until Octopi has fired `n` more times; the gaps in ticks, the first counted from this call. */
function nextGaps(s: GameState, n: number): number[] {
  const out: number[] = [];
  let since = 0;
  while (out.length < n) {
    since += 1;
    if (firesNow(s)) {
      out.push(since);
      since = 0;
    }
  }
  return out;
}

describe('champions', () => {
  it('noob: Thick skin gives 180 ticks of grace after a hit, base 120', () => {
    const base = createGame('t', runWith('base'));
    loseLife(base);
    expect(base.octopi.invuln).toBe(OCTOPI.invulnTicks);
    const noob = createGame('t', runWith('noob'));
    loseLife(noob);
    expect(noob.octopi.invuln).toBe(180);
  });

  it('coraluna: Surge sweeps the bottom row on the 30th kill and raises a surge event', () => {
    const s = createGame('surge', level('coraluna'));
    const bottom = Math.max(...s.crabs.map((c) => c.y));
    const before = s.crabs.length;
    for (let i = 0; i < 29; i++) killCrab(s, s.crabs[0]!); // counts only; nothing removed here
    surgeIfDue(s);
    expect(s.events.some((e) => e.type === 'surge')).toBe(false);
    killCrab(s, s.crabs[0]!);
    surgeIfDue(s);
    expect(s.events.filter((e) => e.type === 'surge')).toHaveLength(1);
    expect(s.crabs.every((c) => bottom - c.y > 367)).toBe(true); // the bottom row is gone
    expect(s.crabs.length).toBeLessThan(before);
    // The 30 are spent; the sweep's own kills go through `killCrab`, which counts every kill, so
    // they already stand towards the next surge.
    expect(s.surgeKills).toBe(before - s.crabs.length);
  });

  it('coraluna: a WAVE_BLAST pickup that makes the 30th kill surges on that same tick', () => {
    const s = blastReady('coraluna', 3, 29);
    step(s, INITIAL_INPUT);
    expect(s.tick).toBe(1);
    expect(s.events.filter((e) => e.type === 'boost_pickup')).toEqual([{ tick: 1, type: 'boost_pickup', boost: 'WAVE_BLAST' }]);
    // The pickup swept row 0 (29 + 3 = 32), then the surge swept the field's bottom row after it,
    // row 1, whose three kills count towards the next surge: 32 - 30 + 3 = 5.
    expect(s.events.filter((e) => e.type === 'surge')).toEqual([{ tick: 1, type: 'surge', x: s.octopi.x, y: s.octopi.y }]);
    expect(s.crabs.map((c) => c.kind)).toEqual([2, 2, 2]);
    expect(s.kills).toBe(6);
    expect(s.surgeKills).toBe(5);
  });

  it('coraluna: a 30th kill that empties the field wastes the surge there and never touches the next wave', () => {
    const coraluna = blastReady('coraluna', 1, 27);
    const base = blastReady('base', 1, 0);
    step(coraluna, INITIAL_INPUT);
    step(base, INITIAL_INPUT);
    expect(coraluna.events.filter((e) => e.type === 'surge')).toEqual([{ tick: 1, type: 'surge', x: coraluna.octopi.x, y: coraluna.octopi.y }]);
    expect(coraluna.surgeKills).toBe(0);
    // `nextWave` raised wave 2 on the same tick, whole: crab for crab the wave a base run raises.
    expect(coraluna.wave).toBe(2);
    expect(coraluna.crabs.length).toBeGreaterThan(0);
    expect(coraluna.crabs).toEqual(base.crabs);
    step(coraluna, INITIAL_INPUT);
    step(base, INITIAL_INPUT);
    expect(coraluna.events.filter((e) => e.type === 'surge')).toHaveLength(1);
    expect(coraluna.crabs).toEqual(base.crabs);
  });

  it('coraluna: a surge due on an empty field is spent and shown, and changes nothing else', () => {
    const s = createGame('surge', level('coraluna'));
    s.crabs = [];
    s.surgeKills = 30;
    const rest = (g: GameState): string => JSON.stringify({ ...g, events: [], surgeKills: 0 });
    const before = rest(s);
    const eventsBefore = s.events.length;
    surgeIfDue(s);
    expect(s.surgeKills).toBe(0);
    expect(s.events.slice(eventsBefore)).toEqual([{ tick: s.tick, type: 'surge', x: s.octopi.x, y: s.octopi.y }]);
    expect(rest(s)).toBe(before);
  });

  it('base never surges however many kills', () => {
    const s = createGame('surge', level('base'));
    for (let i = 0; i < 60; i++) killCrab(s, s.crabs[0]!);
    surgeIfDue(s);
    expect(s.surgeKills).toBe(0);
    expect(s.events.some((e) => e.type === 'surge')).toBe(false);
  });

  it('shoupe: Last stand adds 60 / 45 / 30 / 15 / 0 % fire rate at 1 / 2 / 3 / 4 / 5+ lives', () => {
    expect([1, 2, 3, 4, 5, 6, 12, 100].map((lives) => lowLifeFireBonusPctFor('shoupe', lives)))
      .toEqual([60, 45, 30, 15, 0, 0, 0, 0]);
    expect(lowLifeFireBonusPctFor('shoupe', 0)).toBe(60); // never above the whole bonus
  });

  it('shoupe: the interval averages exactly 5 / 5.517 / 6.153 / 6.956 / 8 ticks at 1..5 lives', () => {
    // `milli` is 8000 / (1 + bonus) in thousandths of a tick; `shots` is how many land in 30 000
    // ticks from the opening shot on tick 8, i.e. ceil(29 993 000 / milli).
    const cases = [
      { lives: 1, milli: 5000, shots: 5999, gaps: [5] },
      { lives: 2, milli: 5517, shots: 5437, gaps: [5, 6] },
      { lives: 3, milli: 6153, shots: 4875, gaps: [6, 7] },
      { lives: 4, milli: 6956, shots: 4312, gaps: [6, 7] },
      { lives: 5, milli: 8000, shots: 3750, gaps: [8] },
    ];
    for (const c of cases) {
      const s = createGame('t', runWith('shoupe'));
      const fired = fireTicks(s, 30_000, () => c.lives);
      expect({ lives: c.lives, shots: fired.length, first: fired[0] }).toEqual({ lives: c.lives, shots: c.shots, first: 8 });
      // Any thousand consecutive gaps add up to exactly the interval in milli-ticks: the carry never
      // drops or invents a fraction of a tick.
      const spans = new Set<number>();
      for (let k = 0; k + 1000 < fired.length; k++) spans.add(fired[k + 1000]! - fired[k]!);
      expect({ lives: c.lives, spans: [...spans] }).toEqual({ lives: c.lives, spans: [c.milli] });
      expect({ lives: c.lives, gaps: [...new Set(gaps(fired))].sort() }).toEqual({ lives: c.lives, gaps: c.gaps });
    }
  });

  it('shoupe: the bonus follows the lives down and back up mid-run', () => {
    const s = createGame('t', runWith('shoupe'));
    s.octopi.lives = 5;
    expect(nextGaps(s, 3)).toEqual([8, 8, 8]);
    for (let i = 0; i < 4; i++) loseLife(s); // down to the last life
    // The cooldown already running was set at five lives; the shots after it come every 5 ticks.
    expect(nextGaps(s, 4)).toEqual([8, 5, 5, 5]);
    activateBoost(s, 'HEALTH_BOOST'); // back up to two lives
    // 5517 milli-ticks a shot from a zero carry: 5 (517 over), 6 (34), 5 (551), 6 (68), 5 (585), 6 (102).
    expect(nextGaps(s, 6)).toEqual([5, 5, 6, 5, 6, 5]);
    expect(s.octopi.fireCarry).toBe(102);
    loseLife(s); // the last life again: 5000 milli-ticks a shot, the carry kept as it is
    expect(nextGaps(s, 3)).toEqual([6, 5, 5]);
    expect(s.octopi.fireCarry).toBe(102);
    for (let i = 0; i < 4; i++) activateBoost(s, 'HEALTH_BOOST'); // five lives: no bonus at all
    expect(nextGaps(s, 3)).toEqual([5, 8, 8]);
  });

  it('shoupe: RAPID_FIRE\'s 4 beats every Last stand interval and leaves the carry where it was', () => {
    const last = createGame('t', runWith('shoupe'));
    last.octopi.lives = 1;
    activateBoost(last, 'RAPID_FIRE');
    expect(nextGaps(last, 3)).toEqual([8, 4, 4]); // 4 beats even the last life's 5
    const s = createGame('t', runWith('shoupe'));
    s.octopi.lives = 2;
    expect(nextGaps(s, 3)).toEqual([8, 5, 6]);
    expect(s.octopi.fireCarry).toBe(551);
    activateBoost(s, 'RAPID_FIRE');
    expect(nextGaps(s, 4)).toEqual([5, 4, 4, 4]);
    expect(s.octopi.fireCarry).toBe(551);
    s.boosts.active = []; // the boost is over: the carry picks up where it stopped
    // The last rapid 4 runs out, then 5517 + 551 = 6068 (a 6, 68 over) and 5517 + 68 = 5585 (a 5,
    // 585 over) are the next two cooldowns set.
    expect(nextGaps(s, 2)).toEqual([4, 6]);
    expect(s.octopi.fireCarry).toBe(585);
  });

  it('every other variant keeps its plain cadence at any life count, and never carries a fraction', () => {
    for (const octopi of ['base', 'harpoon', 'anchor', 'trident', 'noob', 'coraluna', 'hex', 'kakashi'] as const) {
      expect(lowLifeFireBonusPctFor(octopi, 1)).toBeNull();
      for (const lives of [1, 2, 3, 4, 5]) {
        const s = createGame('t', runWith(octopi));
        const fired = fireTicks(s, 400, () => lives);
        expect({ octopi, lives, gaps: [...new Set(gaps(fired))] }).toEqual({ octopi, lives, gaps: [fireIntervalFor(octopi)] });
        expect(s.octopi.fireCarry).toBe(0);
      }
    }
  });

  it('hex: every enemy shot moves 70 % of its speed, the stored velocity untouched', () => {
    for (const [octopi, dy] of [['base', 100], ['hex', 70]] as const) {
      const s = createGame('t', runWith(octopi));
      s.enemyShots.push({ x: 2000, y: 2000, vx: -50, vy: 100, kind: 'crab', data: 0 });
      updateEnemyShots(s);
      const b = s.enemyShots.find((sh) => sh.kind === 'crab')!;
      expect(b.y).toBe(2000 + dy);
      expect(b.x).toBe(octopi === 'hex' ? 2000 - 35 : 1950);
      expect(b.vy).toBe(100);
    }
  });

  it('hex: a boss shot is slowed too, truncating towards zero, except while Crimson rages', () => {
    for (const rage of [0, 60]) {
      const s = createGame('t', runWith('hex'));
      s.crabs = []; // nothing new fires
      spawnBoss(s, 4);
      s.boss!.effectTicks = rage; // Crimson's rage: immune to slowdowns, and so to Hex
      s.enemyShots = [
        { x: 2000, y: 2000, vx: -55, vy: 105, kind: 'large', data: 0 },
        { x: 3000, y: 2000, vx: -55, vy: 105, kind: 'crab', data: 0 },
      ];
      updateEnemyShots(s);
      const [bossShot, crabShot] = s.enemyShots;
      // idiv(-55 * 70, 100) = -38 (not the floor's -39) and idiv(105 * 70, 100) = 73: truncated
      // towards zero.
      expect(bossShot).toMatchObject(rage > 0 ? { x: 1945, y: 2105 } : { x: 1962, y: 2073 });
      expect(bossShot).toMatchObject({ vx: -55, vy: 105 });
      expect(crabShot).toMatchObject({ x: 2962, y: 2073, vx: -55, vy: 105 });
    }
  });

  it('kakashi: Copy stretches a timed boost to 133 %, leaves instant and permanent ones alone', () => {
    const s = createGame('t', runWith('kakashi'));
    activateBoost(s, 'RAPID_FIRE');
    expect(s.boosts.active.find((a) => a.type === 'RAPID_FIRE')!.ticksLeft).toBe(798);
    activateBoost(s, 'SHIELD_BARRIER');
    expect(s.boosts.active.find((a) => a.type === 'SHIELD_BARRIER')!.ticksLeft).toBe(-1);
    const base = createGame('t', runWith('base'));
    activateBoost(base, 'RAPID_FIRE');
    expect(base.boosts.active.find((a) => a.type === 'RAPID_FIRE')!.ticksLeft).toBe(600);
  });

  it('kakashi: Copy leaves an instant boost instant and stretches GRAVITY_WELL to 798', () => {
    const s = createGame('t', runWith('kakashi'));
    activateBoost(s, 'HEALTH_BOOST');
    activateBoost(s, 'COIN_SHOWER');
    expect(s.boosts.active).toEqual([]);
    activateBoost(s, 'GRAVITY_WELL');
    expect(s.boosts.active).toEqual([{ type: 'GRAVITY_WELL', ticksLeft: 798 }]);
  });

  it('kakashi: Copy stretches a RANDOM_CHAOS roll to 133 % of what the same roll gives base', () => {
    // Same seed, so both runs draw the same pick and the same 600..900 roll from `rngBoosts`; base
    // keeps the roll as drawn, which is the exact number kakashi's entry must be 133 % of.
    const s = createGame('chaos-copy', runWith('kakashi'));
    const base = createGame('chaos-copy', runWith('base'));
    const picked = activateBoost(s, 'RANDOM_CHAOS').type;
    expect(activateBoost(base, 'RANDOM_CHAOS').type).toBe(picked);
    expect(['HEALTH_BOOST', 'COIN_SHOWER', 'WAVE_BLAST']).not.toContain(picked); // a timed pick, or the seed proves nothing
    const roll = base.boosts.active.find((a) => a.type === picked)!.ticksLeft;
    expect(roll).toBeGreaterThanOrEqual(600);
    expect(roll).toBeLessThanOrEqual(900);
    expect(s.boosts.active.find((a) => a.type === picked)!.ticksLeft).toBe(idiv(roll * 133, 100));
  });

  it('the old variants never count kills for a surge', () => {
    for (const octopi of ['base', 'harpoon', 'anchor', 'trident'] as const) {
      const s = createGame('t', level(octopi));
      for (let i = 0; i < 40; i++) killCrab(s, s.crabs[0]!);
      expect(s.surgeKills).toBe(0);
    }
  });
});
