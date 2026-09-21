import { Hasher } from '../../src/hash';
import { BOOST_INDEX, KIND_INDEX, TYPE_INDEX, type GameState } from '../../src/types';

/**
 * A frozen copy of core v10's `hashState` (`src/state-hash.ts`, field list and order exactly as they
 * stood at CORE_VERSION 10), used by `invariance-v10.test.ts` alone.
 *
 * The production hash gains fields as the game gains state; this one never does, so the invariance
 * snapshot keeps reading only the v10 fields. A mismatch against `golden/invariance-v10.json` then
 * means the old simulation itself moved, not that the hash learned something new.
 *
 * Never edit this file, and never regenerate the snapshot it feeds.
 */
export function hashStateV10(s: GameState): string {
  const h = new Hasher();
  h.int(s.tick).int(s.wave).int(s.waveTotal).int(s.score).int(s.kills).int(s.over ? 1 : 0).int(s.dir).int(s.scoreDecay);
  const p = s.octopi;
  h.int(p.x).int(p.y).int(p.cooldown).int(p.invuln).int(p.lives);
  h.int(s.crabs.length);
  for (const c of s.crabs) {
    h.int(c.x).int(c.y).int(c.kind).int(TYPE_INDEX[c.type]).int(c.hp);
  }
  for (const list of [s.shots, s.enemyShots]) {
    h.int(list.length);
    for (const b of list) h.int(b.x).int(b.y).int(b.vx).int(b.vy).int(KIND_INDEX[b.kind]).int(b.data);
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
  for (const a of s.boosts.active) h.int(BOOST_INDEX[a.type]).int(a.ticksLeft);
  h.int(s.boosts.shield).int(s.boosts.tamerStacks);
  if (s.boosts.well) h.int(s.boosts.well.x).int(s.boosts.well.y);
  else h.int(-1);
  h.int(s.drops.length);
  for (const d of s.drops) h.int(d.x).int(d.y).int(BOOST_INDEX[d.boost]).int(d.ttl);
  return h.digest();
}
