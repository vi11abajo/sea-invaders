import type { OctopiVariant } from '@sea-invaders/core';
import { ITEM_TINT } from '../shop/tints';

/**
 * How Octopi looks (champions and skins design doc §1, §2, §5): its own colours, a legacy tint
 * recolouring the base sprite (`shop/tints.ts`'s `tintMatrix`), or a drawn Front/Ooff pair that
 * replaces the base sprite outright. `front`/`ooff` are static `require`s so Metro finds and bundles
 * every pair (`mobile/assets/sprites/octopi/`, `tools/octopi-sprites.py`'s output); `key` is the
 * pair's slug. Requiring a pair only names it — nothing is decoded until a screen asks for it.
 */
export type Look = { kind: 'base' } | { kind: 'tint'; tint: string } | { kind: 'art'; key: string; front: number; ooff: number };

/** The base Octopi in its own colours. */
export const BASE_LOOK: Look = { kind: 'base' };

function tint(itemId: number): Look {
  return { kind: 'tint', tint: ITEM_TINT[itemId]! };
}

// Every drawn pair, by slug: the 8 champions and the 13 drawn skins (21 pairs).
const AZUL: Look = { kind: 'art', key: 'azul', front: require('../../assets/sprites/octopi/azul-front.png'), ooff: require('../../assets/sprites/octopi/azul-ooff.png') };
const KRANG: Look = { kind: 'art', key: 'krang', front: require('../../assets/sprites/octopi/krang-front.png'), ooff: require('../../assets/sprites/octopi/krang-ooff.png') };
const POSEIDON: Look = { kind: 'art', key: 'poseidon', front: require('../../assets/sprites/octopi/poseidon-front.png'), ooff: require('../../assets/sprites/octopi/poseidon-ooff.png') };
const NOOB: Look = { kind: 'art', key: 'noob', front: require('../../assets/sprites/octopi/noob-front.png'), ooff: require('../../assets/sprites/octopi/noob-ooff.png') };
const CORALUNA: Look = { kind: 'art', key: 'coraluna', front: require('../../assets/sprites/octopi/coraluna-front.png'), ooff: require('../../assets/sprites/octopi/coraluna-ooff.png') };
const SHOUPE: Look = { kind: 'art', key: 'shoupe', front: require('../../assets/sprites/octopi/shoupe-front.png'), ooff: require('../../assets/sprites/octopi/shoupe-ooff.png') };
const HEX: Look = { kind: 'art', key: 'hex', front: require('../../assets/sprites/octopi/hex-front.png'), ooff: require('../../assets/sprites/octopi/hex-ooff.png') };
const KAKASHI: Look = { kind: 'art', key: 'kakashi', front: require('../../assets/sprites/octopi/kakashi-front.png'), ooff: require('../../assets/sprites/octopi/kakashi-ooff.png') };
const BEAR: Look = { kind: 'art', key: 'bear', front: require('../../assets/sprites/octopi/bear-front.png'), ooff: require('../../assets/sprites/octopi/bear-ooff.png') };
const BUNNY: Look = { kind: 'art', key: 'bunny', front: require('../../assets/sprites/octopi/bunny-front.png'), ooff: require('../../assets/sprites/octopi/bunny-ooff.png') };
const SPONGE: Look = { kind: 'art', key: 'sponge', front: require('../../assets/sprites/octopi/sponge-front.png'), ooff: require('../../assets/sprites/octopi/sponge-ooff.png') };
const TIGER: Look = { kind: 'art', key: 'tiger', front: require('../../assets/sprites/octopi/tiger-front.png'), ooff: require('../../assets/sprites/octopi/tiger-ooff.png') };
const GRIM: Look = { kind: 'art', key: 'grim', front: require('../../assets/sprites/octopi/grim-front.png'), ooff: require('../../assets/sprites/octopi/grim-ooff.png') };
const KING: Look = { kind: 'art', key: 'king', front: require('../../assets/sprites/octopi/king-front.png'), ooff: require('../../assets/sprites/octopi/king-ooff.png') };
const MATRIX: Look = { kind: 'art', key: 'matrix', front: require('../../assets/sprites/octopi/matrix-front.png'), ooff: require('../../assets/sprites/octopi/matrix-ooff.png') };
const SHARINGAN: Look = { kind: 'art', key: 'sharingan', front: require('../../assets/sprites/octopi/sharingan-front.png'), ooff: require('../../assets/sprites/octopi/sharingan-ooff.png') };
const PENGU: Look = { kind: 'art', key: 'pengu', front: require('../../assets/sprites/octopi/pengu-front.png'), ooff: require('../../assets/sprites/octopi/pengu-ooff.png') };
const REAPER: Look = { kind: 'art', key: 'reaper', front: require('../../assets/sprites/octopi/reaper-front.png'), ooff: require('../../assets/sprites/octopi/reaper-ooff.png') };
const WIZARD: Look = { kind: 'art', key: 'wizard', front: require('../../assets/sprites/octopi/wizard-front.png'), ooff: require('../../assets/sprites/octopi/wizard-ooff.png') };
const OUTLAW: Look = { kind: 'art', key: 'outlaw', front: require('../../assets/sprites/octopi/outlaw-front.png'), ooff: require('../../assets/sprites/octopi/outlaw-ooff.png') };
const SEEKER: Look = { kind: 'art', key: 'seeker', front: require('../../assets/sprites/octopi/seeker-front.png'), ooff: require('../../assets/sprites/octopi/seeker-ooff.png') };

/**
 * Each skin code's look (design doc §2): 1-4 the legacy tints (items 3-6's `ITEM_TINT`), 5-17 the
 * drawn skins. No entry for code 0 (Octopi's own colours) or a code outside 0..17, so a lookup is
 * typed `Look | undefined` (ruling R-P) and every caller falls back with `?? BASE_LOOK` — or uses
 * `lookOfSkin`, which does.
 */
export const SKIN_LOOK: Readonly<Record<number, Look | undefined>> = {
  1: tint(3), // Lime
  2: tint(4), // Lilac
  3: tint(5), // Ember
  4: tint(6), // Abyss
  5: BEAR,
  6: BUNNY,
  7: SPONGE,
  8: TIGER,
  9: GRIM,
  10: KING,
  11: MATRIX,
  12: SHARINGAN,
  13: PENGU,
  14: REAPER,
  15: WIZARD,
  16: OUTLAW,
  17: SEEKER,
};

/**
 * Each variant's own look (design doc §1): every champion is drawn; the base Octopi keeps its
 * colours. Every variant is listed, but a lookup is typed `Look | undefined` (ruling R-P): a variant
 * read from outside (`VARIANT_OCTOPI[i]` for an unknown selector) may be undefined, so callers fall
 * back with `?? BASE_LOOK`.
 */
export const CHAMPION_LOOK: Readonly<Record<OctopiVariant, Look | undefined>> = {
  base: BASE_LOOK,
  harpoon: AZUL,
  anchor: KRANG,
  trident: POSEIDON,
  noob: NOOB,
  coraluna: CORALUNA,
  shoupe: SHOUPE,
  hex: HEX,
  kakashi: KAKASHI,
};

/**
 * The one rule every Octopi on screen follows (design doc §2): an equipped skin, drawn or tint,
 * wins the look — the champion under it keeps its ability; without one, the champion shows its own
 * art; the base Octopi shows its own colours. A tint over a champion recolours the base sprite, as
 * it always did.
 */
export function octopiLook(skin: number, octopi: OctopiVariant): Look {
  return SKIN_LOOK[skin] ?? CHAMPION_LOOK[octopi] ?? BASE_LOOK;
}

/** Skin `skin`'s look alone, over the base Octopi: a leaderboard row's (daily runs play base, §5). */
export function lookOfSkin(skin: number): Look {
  return SKIN_LOOK[skin] ?? BASE_LOOK;
}

/** A look's identity as a string (`'base'`, `'tint:#RRGGBB'`, `'art:<slug>'`): the key of the UI snapshot cache and of the run's prepared poses. */
export function lookKey(look: Look): string {
  if (look.kind === 'tint') return `tint:${look.tint}`;
  if (look.kind === 'art') return `art:${look.key}`;
  return 'base';
}
