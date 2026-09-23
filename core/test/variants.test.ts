import { describe, expect, it } from 'vitest';
import {
  INITIAL_INPUT, OCTOPI, PRACTICE_RUN, createGame, hashState, levelById, step, updateShots,
  type OctopiVariant, type RunConfig,
} from '../src';

const runWith = (octopi: OctopiVariant): RunConfig => ({ ...PRACTICE_RUN, octopi });

describe('octopi variants', () => {
  it('harpoon fires every 6 ticks instead of the base 8', () => {
    const s = createGame('t', runWith('harpoon'));
    for (let t = 1; t <= 5; t++) updateShots(s);
    expect(s.shots).toHaveLength(0);
    updateShots(s); // tick 6: first shot
    expect(s.shots).toHaveLength(1);
    for (let t = 7; t <= 24; t++) updateShots(s); // three more, every 6 ticks: 12, 18, 24
    expect(s.shots).toHaveLength(4);
  });

  it('base, anchor and trident keep the base 8-tick cadence', () => {
    for (const octopi of ['base', 'anchor', 'trident'] as const) {
      const s = createGame('t', runWith(octopi));
      for (let t = 1; t <= 7; t++) updateShots(s);
      expect(s.shots).toHaveLength(0);
      updateShots(s); // tick 8: first shot
      expect(s.shots).toHaveLength(1);
    }
  });

  it('anchor starts with one extra life on top of RunConfig.lives', () => {
    expect(createGame('t', runWith('base')).octopi.lives).toBe(OCTOPI.lives);
    expect(createGame('t', runWith('anchor')).octopi.lives).toBe(OCTOPI.lives + 1);
  });

  it('a fresh reef entry (5 lives) with the anchor variant starts the run with 6', () => {
    const reefEntry: RunConfig = { mode: 'campaign', level: levelById(1), lives: 5, features: { boosts: true }, octopi: 'anchor' };
    expect(createGame('reef1', reefEntry).octopi.lives).toBe(6);
  });

  it('trident tags every shot with the piercing bit even without the PIERCING_BULLETS boost', () => {
    const s = createGame('t', runWith('trident'));
    for (let t = 1; t <= 8; t++) updateShots(s);
    expect(s.shots).toHaveLength(1);
    expect(s.shots[0]!.data & 1).toBe(1);
  });

  it('base, harpoon and anchor never force the piercing bit on their own', () => {
    for (const octopi of ['base', 'harpoon', 'anchor'] as const) {
      const s = createGame('t', runWith(octopi));
      for (let t = 1; t <= 8; t++) updateShots(s);
      expect(s.shots[0]!.data & 1).toBe(0);
    }
  });

  // Only the original four: their overrides act from tick 1. A later champion's ability may never
  // come into play in a run (champion-noob and champion-shoupe share one golden hash), so the
  // replay header, not the hash, carries which champion played.
  it('the four original variants hash differently from the same seed: their overrides act from tick 1', () => {
    const variants: OctopiVariant[] = ['base', 'harpoon', 'anchor', 'trident'];
    const hashes = variants.map((octopi) => {
      const s = createGame('variant-hash', runWith(octopi));
      for (let t = 1; t <= 8; t++) step(s, INITIAL_INPUT);
      return hashState(s);
    });
    expect(new Set(hashes).size).toBe(variants.length);
  });
});
