import { describe, expect, it } from 'vitest';
import {
  BOSS, OCTOPI, PRACTICE_RUN, TIDE_REVIVE_LIVES, activateBoost, breakShell, createGame, damageBoss, fireIntervalFor, hitOctopi, idiv,
  killCrab, levelById, loseLife, lowLifeFireBonusPctFor, nextWave, revive, spawnBoss, spawnWave, step, updateBoss,
  updateEnemyShots, updateShots, type GameState, type OctopiVariant, type RunConfig,
} from '../src';

const runWith = (octopi: OctopiVariant): RunConfig => ({ ...PRACTICE_RUN, octopi });
const level = (octopi: OctopiVariant): RunConfig => ({ mode: 'campaign', level: levelById(2), lives: 5, features: { boosts: true }, octopi });

/** A plain crab shot parked on Octopi, then `hitOctopi`: one hit worth one life, if nothing takes it. */
function hitOnOctopi(s: GameState): void {
  s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
  hitOctopi(s);
}

/** Counts `n` kills of the field's first crab through `killCrab`, which leaves the crab standing. */
function killTimes(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) killCrab(s, s.crabs[0]!);
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
  it('noob: the Shell takes the first hit of a wave instead of a life, and not the second', () => {
    const s = createGame('t', level('noob'));
    expect(s.octopi.shell).toBe(1); // the level's first wave raised it
    hitOnOctopi(s);
    expect(s.octopi).toMatchObject({ lives: 5, shell: 0, invuln: 30 });
    expect(s.events.filter((e) => e.type === 'shell_break' || e.type === 'player_hit'))
      .toEqual([{ tick: 0, type: 'shell_break', x: s.octopi.x, y: s.octopi.y }]);
    expect(s.enemyShots).toHaveLength(1); // like a shield charge, the shell clears no shots
    s.octopi.invuln = 0;
    hitOnOctopi(s);
    expect(s.octopi).toMatchObject({ lives: 4, shell: 0, invuln: OCTOPI.invulnTicks });
    expect(s.events.filter((e) => e.type === 'shell_break')).toHaveLength(1);
  });

  it('noob: the Shell comes back with the next wave, campaign and practice alike', () => {
    const s = createGame('t', level('noob'));
    hitOnOctopi(s);
    expect(s.octopi.shell).toBe(0);
    nextWave(s);
    expect(s.wave).toBe(2);
    expect(s.octopi.shell).toBe(1);
    const practice = createGame('t', runWith('noob'));
    expect(practice.octopi.shell).toBe(1);
    hitOnOctopi(practice);
    expect(practice.octopi.shell).toBe(0);
    spawnWave(practice, 2);
    expect(practice.octopi.shell).toBe(1);
  });

  it('noob: the Shell goes before a SHIELD_BARRIER charge', () => {
    const s = createGame('t', level('noob'));
    activateBoost(s, 'SHIELD_BARRIER');
    hitOnOctopi(s);
    expect({ shell: s.octopi.shell, shield: s.boosts.shield, lives: s.octopi.lives }).toEqual({ shell: 0, shield: 3, lives: 5 });
    s.octopi.invuln = 0;
    hitOnOctopi(s);
    expect({ shell: s.octopi.shell, shield: s.boosts.shield, lives: s.octopi.lives }).toEqual({ shell: 0, shield: 2, lives: 5 });
  });

  it('noob: a boss fight raises the Shell, a phase change does not', () => {
    const s = createGame('t', { ...level('noob'), level: levelById(12) }); // the Azure Leviathan, two phases
    expect(s.boss!.kind).toBe(2);
    expect(s.octopi.shell).toBe(1); // the fight's spawn raised it
    expect(breakShell(s)).toBe(true);
    const maxHp = s.boss!.maxHp;
    damageBoss(s, maxHp - idiv(maxHp, 2)); // down to half: the transition to phase 2 starts
    for (let t = 0; t < BOSS.transitionTicks; t++) updateBoss(s);
    expect(s.boss!.phase).toBe(2);
    expect(s.events.some((e) => e.type === 'boss_phase')).toBe(true);
    expect(s.octopi.shell).toBe(0);
    spawnBoss(s, 2);
    expect(s.octopi.shell).toBe(1);
  });

  it('noob: INVINCIBILITY takes the hit before the Shell does, so the Shell stays up', () => {
    const s = createGame('t', level('noob'));
    activateBoost(s, 'INVINCIBILITY');
    hitOnOctopi(s);
    expect({ shell: s.octopi.shell, lives: s.octopi.lives }).toEqual({ shell: 1, lives: 5 });
    expect(s.events.some((e) => e.type === 'shell_break')).toBe(false);
  });

  it('noob: a Tide revive brings lives back but not the Shell, which waits for the next wave', () => {
    const s = createGame('t', level('noob'));
    hitOnOctopi(s); // the Shell takes the first hit
    s.octopi.lives = 1;
    s.octopi.invuln = 0;
    hitOnOctopi(s); // the last life
    expect({ over: s.over, lives: s.octopi.lives }).toEqual({ over: true, lives: 0 });
    revive(s);
    expect({ over: s.over, lives: s.octopi.lives, shell: s.octopi.shell }).toEqual({ over: false, lives: TIDE_REVIVE_LIVES, shell: 0 });
  });

  it('every other variant never has a Shell: a wave or a boss fight raises nothing, a hit costs a life', () => {
    for (const octopi of ['base', 'harpoon', 'anchor', 'trident', 'coraluna', 'shoupe', 'hex', 'kakashi'] as const) {
      const s = createGame('t', level(octopi));
      nextWave(s);
      spawnBoss(s, 2);
      expect({ octopi, shell: s.octopi.shell }).toEqual({ octopi, shell: 0 });
      expect(breakShell(s)).toBe(false);
      const lives = s.octopi.lives;
      hitOnOctopi(s);
      expect({ octopi, lives: s.octopi.lives }).toEqual({ octopi, lives: lives - 1 });
    }
  });

  it('coraluna: Coral growth grows exactly one life on the 120th kill, with a coral_growth event', () => {
    const s = createGame('t', level('coraluna'));
    s.octopi.lives = 3;
    killTimes(s, 119); // counts only; nothing is removed from the field here
    expect({ lives: s.octopi.lives, growthKills: s.growthKills }).toEqual({ lives: 3, growthKills: 119 });
    expect(s.events.some((e) => e.type === 'coral_growth')).toBe(false);
    killTimes(s, 1);
    expect(s.octopi.lives).toBe(4);
    expect(s.events.filter((e) => e.type === 'coral_growth')).toEqual([{ tick: 0, type: 'coral_growth', x: s.octopi.x, y: s.octopi.y }]);
  });

  it('coraluna: a 120th kill on the same tick as a lethal hit grows the life first, so the run goes on', () => {
    const s = createGame('t', level('coraluna'));
    s.arrival = 0;
    s.growthKills = 119;
    s.octopi.lives = 1;
    const crab = s.crabs[0]!;
    crab.hp = 1;
    // One of Octopi's shots parked on that crab and one crab shot parked on Octopi: `step` scores the
    // shot (`hitCrabs`) before it lets the crab shot land (`hitOctopi`).
    s.shots = [{ x: crab.x, y: crab.y, vx: 0, vy: 0, kind: 'straight', data: 0 }];
    s.enemyShots = [{ x: s.octopi.x, y: s.octopi.y, vx: 0, vy: 0, kind: 'crab', data: 0 }];
    step(s, { x: s.octopi.x, y: s.octopi.y });
    expect(s.events.some((e) => e.type === 'coral_growth')).toBe(true);
    expect(s.events.some((e) => e.type === 'player_hit')).toBe(true);
    expect({ over: s.over, lives: s.octopi.lives }).toEqual({ over: false, lives: 1 });
  });

  it('coraluna: Coral growth never grows twice in a run', () => {
    const s = createGame('t', level('coraluna'));
    s.octopi.lives = 2;
    killTimes(s, 500);
    expect({ lives: s.octopi.lives, growthKills: s.growthKills }).toEqual({ lives: 3, growthKills: 120 });
    expect(s.events.filter((e) => e.type === 'coral_growth')).toHaveLength(1);
  });

  it('coraluna: Coral growth never goes above 5 lives, and a growth due at 5 is spent without one', () => {
    const s = createGame('t', level('coraluna'));
    expect(s.octopi.lives).toBe(5);
    killTimes(s, 120);
    expect({ lives: s.octopi.lives, growthKills: s.growthKills }).toEqual({ lives: 5, growthKills: 120 });
    loseLife(s);
    killTimes(s, 240);
    expect(s.octopi.lives).toBe(4);
    expect(s.events.some((e) => e.type === 'coral_growth')).toBe(false);
  });

  it('coraluna: a WAVE_BLAST kill counts towards Coral growth like any other', () => {
    const s = createGame('t', level('coraluna'));
    s.octopi.lives = 3;
    s.growthKills = 119;
    activateBoost(s, 'WAVE_BLAST');
    expect(s.octopi.lives).toBe(4);
    expect(s.events.filter((e) => e.type === 'coral_growth')).toHaveLength(1);
  });

  it('every other variant never counts a kill towards Coral growth', () => {
    for (const octopi of ['base', 'harpoon', 'anchor', 'trident', 'noob', 'shoupe', 'hex', 'kakashi'] as const) {
      const s = createGame('t', level(octopi));
      s.octopi.lives = 3;
      killTimes(s, 150);
      expect({ octopi, lives: s.octopi.lives, growthKills: s.growthKills }).toEqual({ octopi, lives: 3, growthKills: 0 });
      expect(s.events.some((e) => e.type === 'coral_growth')).toBe(false);
    }
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
});
