import { describe, expect, it } from 'vitest';
import {
  OCTOPI, PRACTICE_RUN, activateBoost, createGame, killCrab, levelById, loseLife,
  surgeIfDue, updateEnemyShots, updateShots, type OctopiVariant, type RunConfig,
} from '../src';

const runWith = (octopi: OctopiVariant): RunConfig => ({ ...PRACTICE_RUN, octopi });
const level = (octopi: OctopiVariant): RunConfig => ({ mode: 'campaign', level: levelById(2), lives: 5, features: { boosts: true }, octopi });

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
    // The 30 are spent; the sweep's own kills go through `killCrab`, which counts every kill (spec
    // §1), so they already stand towards the next surge.
    expect(s.surgeKills).toBe(before - s.crabs.length);
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

  it('the old variants keep their first-tick hash inputs: no surge counter for them', () => {
    for (const octopi of ['base', 'harpoon', 'anchor', 'trident'] as const) {
      const s = createGame('t', level(octopi));
      for (let i = 0; i < 40; i++) killCrab(s, s.crabs[0]!);
      expect(s.surgeKills).toBe(0);
    }
  });
});
