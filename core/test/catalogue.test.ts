import { describe, expect, it } from 'vitest';
import {
  AWARDS, ITEM_NAMES, LEGACY_LEVEL_COUNT, LEVEL_COUNT, SEEKER_SKIN_CODE, SKIN_COUNT, SKIN_ITEM_IDS, SKIN_NAMES,
  VARIANT_BY_INDEX, VARIANT_INDEX, VARIANT_ITEM_IDS, VARIANT_NAMES, awardLevelOf, earnedAwards, newProgress,
  skinOfItem, variantOfItem,
} from '../src';

describe('catalogue', () => {
  it('numbers the variants base..kakashi 0..8 and the reverse list agrees', () => {
    expect(VARIANT_INDEX).toEqual({ base: 0, harpoon: 1, anchor: 2, trident: 3, noob: 4, coraluna: 5, shoupe: 6, hex: 7, kakashi: 8 });
    expect(VARIANT_BY_INDEX).toEqual(['base', 'harpoon', 'anchor', 'trident', 'noob', 'coraluna', 'shoupe', 'hex', 'kakashi']);
    expect(VARIANT_ITEM_IDS).toEqual([null, 0, 1, 2, 15, 16, 17, null, null]);
  });

  it('numbers the skins 0..17 with items for the tints and the eight sold looks only', () => {
    expect(SKIN_COUNT).toBe(18);
    expect(SKIN_NAMES).toHaveLength(SKIN_COUNT);
    expect(SKIN_ITEM_IDS).toEqual([null, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, null, null, null, null, null]);
    expect(SKIN_NAMES[SEEKER_SKIN_CODE]).toBe('Seeker');
  });

  it('names every catalogue item from the two name lists', () => {
    expect(ITEM_NAMES).toEqual({
      0: 'Azul', 1: 'Krang', 2: 'Poseidon', 3: 'Lime', 4: 'Lilac', 5: 'Ember', 6: 'Abyss',
      7: 'Bear', 8: 'Bunny', 9: 'Sponge', 10: 'Tiger', 11: 'Grim', 12: 'King', 13: 'Matrix', 14: 'Sharingan',
      15: 'Noob', 16: 'Coraluna', 17: 'Shoupe',
    });
    expect(VARIANT_NAMES.harpoon).toBe('Azul');
    expect(variantOfItem(16)).toBe(VARIANT_INDEX.coraluna);
    expect(variantOfItem(7)).toBeNull();
    expect(skinOfItem(14)).toBe(12);
    expect(skinOfItem(0)).toBeNull();
  });

  it('variantOfItem answers null for anything that is not a non-negative integer', () => {
    for (const bad of [null, undefined, -1, 1.5, Number.NaN, '1', [1]]) {
      expect(variantOfItem(bad as unknown as number)).toBeNull();
    }
    expect(variantOfItem(0)).toBe(VARIANT_INDEX.harpoon);
  });

  it('skinOfItem answers null for anything that is not a non-negative integer', () => {
    for (const bad of [null, undefined, -1, 3.5, Number.NaN, '3', [3]]) {
      expect(skinOfItem(bad as unknown as number)).toBeNull();
    }
    expect(skinOfItem(3)).toBe(1);
  });

  it('awards the four looks and two champions on the even bosses and bosses 5 and 10', () => {
    expect(AWARDS).toEqual({
      12: { kind: 'skin', skin: 13 }, 24: { kind: 'skin', skin: 14 }, 30: { kind: 'variant', variant: 'hex' },
      36: { kind: 'skin', skin: 15 }, 48: { kind: 'skin', skin: 16 }, 60: { kind: 'variant', variant: 'kakashi' },
    });
    expect(awardLevelOf({ kind: 'variant', variant: 'kakashi' })).toBe(60);
    expect(awardLevelOf({ kind: 'variant', variant: 'noob' })).toBeNull();
  });

  it('earnedAwards derives from cleared levels, grows a legacy record, and never invents', () => {
    const p = newProgress(1);
    expect(earnedAwards(p)).toEqual({ variants: [], skins: [] });
    p.cleared[11] = true; p.cleared[29] = true; // levels 12 and 30
    expect(earnedAwards(p)).toEqual({ variants: ['hex'], skins: [13] });
    const legacy = { ...newProgress(1), cleared: Array(LEGACY_LEVEL_COUNT).fill(true), best: Array(LEGACY_LEVEL_COUNT).fill(0) };
    expect(earnedAwards(legacy)).toEqual({ variants: ['hex'], skins: [13, 14] });
    const all = { ...newProgress(1), cleared: Array(LEVEL_COUNT).fill(true) };
    expect(earnedAwards(all)).toEqual({ variants: ['hex', 'kakashi'], skins: [13, 14, 15, 16] });
  });
});
