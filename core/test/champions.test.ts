import { describe, expect, it } from 'vitest';
import {
  INITIAL_INPUT, OCTOPI, PRACTICE_RUN, activateBoost, createGame, idiv, killCrab, levelById, loseLife, spawnBoss,
  step, surgeIfDue, updateEnemyShots, updateShots, type Crab, type GameState, type OctopiVariant, type RunConfig,
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

  it('shoupe: Last stand fires every 5 ticks on the last life, 8 otherwise', () => {
    const s = createGame('t', runWith('shoupe'));
    for (let t = 1; t <= 8; t++) updateShots(s); // first shot at tick 8
    expect(s.shots).toHaveLength(1);
    expect(s.octopi.cooldown).toBe(8);
    s.octopi.lives = 1;
    for (let t = 1; t <= 8; t++) updateShots(s);
    expect(s.octopi.cooldown).toBe(5);
  });

  it('shoupe: RAPID_FIRE\'s 4 still beats Last stand\'s 5 on the last life', () => {
    const s = createGame('t', runWith('shoupe'));
    s.octopi.lives = 1;
    activateBoost(s, 'RAPID_FIRE');
    for (let t = 1; t <= 8; t++) updateShots(s); // first shot at tick 8
    expect(s.shots).toHaveLength(1);
    expect(s.octopi.cooldown).toBe(4);
  });

  it('hex: every enemy shot moves 90 % of its speed, the stored velocity untouched', () => {
    for (const [octopi, dy] of [['base', 100], ['hex', 90]] as const) {
      const s = createGame('t', runWith(octopi));
      s.enemyShots.push({ x: 2000, y: 2000, vx: -50, vy: 100, kind: 'crab', data: 0 });
      updateEnemyShots(s);
      const b = s.enemyShots.find((sh) => sh.kind === 'crab')!;
      expect(b.y).toBe(2000 + dy);
      expect(b.x).toBe(octopi === 'hex' ? 2000 - 45 : 1950);
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
      // idiv(-55 * 90, 100) = -49 and idiv(105 * 90, 100) = 94: truncated towards zero.
      expect(bossShot).toMatchObject(rage > 0 ? { x: 1945, y: 2105 } : { x: 1951, y: 2094 });
      expect(bossShot).toMatchObject({ vx: -55, vy: 105 });
      expect(crabShot).toMatchObject({ x: 2951, y: 2094, vx: -55, vy: 105 });
    }
  });

  it('kakashi: Copy stretches a timed boost to 150 %, leaves instant and permanent ones alone', () => {
    const s = createGame('t', runWith('kakashi'));
    activateBoost(s, 'RAPID_FIRE');
    expect(s.boosts.active.find((a) => a.type === 'RAPID_FIRE')!.ticksLeft).toBe(900);
    activateBoost(s, 'SHIELD_BARRIER');
    expect(s.boosts.active.find((a) => a.type === 'SHIELD_BARRIER')!.ticksLeft).toBe(-1);
    const base = createGame('t', runWith('base'));
    activateBoost(base, 'RAPID_FIRE');
    expect(base.boosts.active.find((a) => a.type === 'RAPID_FIRE')!.ticksLeft).toBe(600);
  });

  it('kakashi: Copy leaves an instant boost instant and stretches GRAVITY_WELL to 900', () => {
    const s = createGame('t', runWith('kakashi'));
    activateBoost(s, 'HEALTH_BOOST');
    activateBoost(s, 'COIN_SHOWER');
    expect(s.boosts.active).toEqual([]);
    activateBoost(s, 'GRAVITY_WELL');
    expect(s.boosts.active).toEqual([{ type: 'GRAVITY_WELL', ticksLeft: 900 }]);
  });

  it('kakashi: Copy stretches a RANDOM_CHAOS roll to 150 % of what the same roll gives base', () => {
    // Same seed, so both runs draw the same pick and the same 600..900 roll from `rngBoosts`; base
    // keeps the roll as drawn, which is the exact number kakashi's entry must be 150 % of.
    const s = createGame('chaos-copy', runWith('kakashi'));
    const base = createGame('chaos-copy', runWith('base'));
    const picked = activateBoost(s, 'RANDOM_CHAOS').type;
    expect(activateBoost(base, 'RANDOM_CHAOS').type).toBe(picked);
    expect(['HEALTH_BOOST', 'COIN_SHOWER', 'WAVE_BLAST']).not.toContain(picked); // a timed pick, or the seed proves nothing
    const roll = base.boosts.active.find((a) => a.type === picked)!.ticksLeft;
    expect(roll).toBeGreaterThanOrEqual(600);
    expect(roll).toBeLessThanOrEqual(900);
    expect(s.boosts.active.find((a) => a.type === picked)!.ticksLeft).toBe(idiv(roll * 150, 100));
  });

  it('the old variants never count kills for a surge', () => {
    for (const octopi of ['base', 'harpoon', 'anchor', 'trident'] as const) {
      const s = createGame('t', level(octopi));
      for (let i = 0; i < 40; i++) killCrab(s, s.crabs[0]!);
      expect(s.surgeKills).toBe(0);
    }
  });
});
