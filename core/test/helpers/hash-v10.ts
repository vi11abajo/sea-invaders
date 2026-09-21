import { Hasher } from '../../src/hash';
import type { GameState } from '../../src/types';

/**
 * A frozen copy of core v10's `hashState` (`src/state-hash.ts`, field list and order exactly as they
 * stood at CORE_VERSION 10), used by `invariance-v10.test.ts` alone.
 *
 * The production hash gains fields as the game gains state; this one never does, so the invariance
 * snapshot keeps reading only the v10 fields. A mismatch against `golden/invariance-v10.json` then
 * means the old simulation itself moved, not that the hash learned something new.
 *
 * The index tables below are frozen here rather than imported from `src/types.ts` for the same
 * reason: a later renumbering there would move these hashes without a single tick of the old game
 * having changed. `Hasher` is still imported - it is a dependency-free integer mixer, and every
 * golden and replay in the project is keyed off it, so it cannot move on its own.
 *
 * Never change what this hashes or the order it hashes it in, and never regenerate the snapshot it
 * feeds.
 */

/** The five crab kinds core v10 had, at their v10 hash indices. */
const TYPE_INDEX_V10: Readonly<Record<string, number>> = {
  normal: 0, armored: 1, swift: 2, heavy: 3, elder: 4,
};

/** The fourteen bullet kinds core v10 had, at their v10 hash indices. */
const KIND_INDEX_V10: Readonly<Record<string, number>> = {
  crab: 0, straight: 1, zigzag: 2, large: 3, wave: 4, ring: 5, explosive: 6, fragment: 7,
  meteor: 8, berserk: 9, spiral: 10, gravity: 11, clone: 12,
  heavy: 13,
};

/** The fifteen boosts core v10 had, at their v10 hash indices. */
const BOOST_INDEX_V10: Readonly<Record<string, number>> = {
  RAPID_FIRE: 0, ICE_FREEZE: 1, HEALTH_BOOST: 2, POINTS_FREEZE: 3,
  SHIELD_BARRIER: 4, AUTO_TARGET: 5, INVINCIBILITY: 6, MULTI_SHOT: 7, SCORE_MULTIPLIER: 8,
  WAVE_BLAST: 9, COIN_SHOWER: 10, GRAVITY_WELL: 11, PIERCING_BULLETS: 12,
  RANDOM_CHAOS: 13, SPEED_TAMER: 14,
};

/**
 * The v10 index of `name`, or a loud failure. A level of the first campaign can only ever hold
 * things v10 knew about, so anything newer turning up in a scenario is a simulation change of its
 * own - louder as a thrown error than as a silent hash.
 */
function indexV10(table: Readonly<Record<string, number>>, what: string, name: string): number {
  const index = table[name];
  if (index === undefined) throw new Error(`${what} "${name}" did not exist in core v10`);
  return index;
}

export function hashStateV10(s: GameState): string {
  const h = new Hasher();
  h.int(s.tick).int(s.wave).int(s.waveTotal).int(s.score).int(s.kills).int(s.over ? 1 : 0).int(s.dir).int(s.scoreDecay);
  const p = s.octopi;
  h.int(p.x).int(p.y).int(p.cooldown).int(p.invuln).int(p.lives);
  h.int(s.crabs.length);
  for (const c of s.crabs) {
    h.int(c.x).int(c.y).int(c.kind).int(indexV10(TYPE_INDEX_V10, 'crab kind', c.type)).int(c.hp);
  }
  for (const list of [s.shots, s.enemyShots]) {
    h.int(list.length);
    for (const b of list) {
      h.int(b.x).int(b.y).int(b.vx).int(b.vy).int(indexV10(KIND_INDEX_V10, 'bullet kind', b.kind)).int(b.data);
    }
  }
  for (const r of [s.rngWaves, s.rngFire, s.rngBoss, s.rngBoosts]) h.int(r.a).int(r.b).int(r.c).int(r.d);
  h.int(s.cleared ? 1 : 0).int(s.arrival);
  if (s.boss) {
    const b = s.boss;
    h.int(b.kind).int(b.hp).int(b.maxHp).int(b.phase).int(b.x).int(b.y).int(b.vx).int(b.state === 'fighting' ? 0 : 1)
      .int(b.transitionTicks).int(b.attackTimer).int(b.secondaryTimer).int(b.abilityTimer).int(b.fightTicks)
      .int(b.shieldHp).int(b.regenCooldown).int(b.effectTicks).int(b.spiral);
    h.int(b.pending.length);
    for (const p2 of b.pending) h.int(p2);
  } else {
    h.int(-1);
  }
  h.int(s.boosts.active.length);
  for (const a of s.boosts.active) h.int(indexV10(BOOST_INDEX_V10, 'boost', a.type)).int(a.ticksLeft);
  h.int(s.boosts.shield).int(s.boosts.tamerStacks);
  if (s.boosts.well) h.int(s.boosts.well.x).int(s.boosts.well.y);
  else h.int(-1);
  h.int(s.drops.length);
  for (const d of s.drops) h.int(d.x).int(d.y).int(indexV10(BOOST_INDEX_V10, 'boost', d.boost)).int(d.ttl);
  return h.digest();
}
