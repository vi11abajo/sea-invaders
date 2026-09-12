import { Hasher } from './hash';
import { BOOST_INDEX, KIND_INDEX, TYPE_INDEX, type GameState } from './types';

/** Hash of every simulation field in a fixed order. Equal hashes mean equal game states. */
export function hashState(s: GameState): string {
  const h = new Hasher();
  h.int(s.tick).int(s.wave).int(s.waveTotal).int(s.score).int(s.kills).int(s.over ? 1 : 0).int(s.dir);
  const p = s.ship;
  h.int(p.x).int(p.y).int(p.cooldown).int(p.invuln).int(p.lives);
  h.int(s.crabs.length);
  for (const c of s.crabs) h.int(c.x).int(c.y).int(c.kind).int(TYPE_INDEX[c.type]).int(c.hp).int(c.dive);
  for (const list of [s.shots, s.enemyShots]) {
    h.int(list.length);
    for (const b of list) h.int(b.x).int(b.y).int(b.vx).int(b.vy).int(KIND_INDEX[b.kind]).int(b.data);
  }
  for (const r of [s.rngWaves, s.rngFire, s.rngBoss, s.rngBoosts]) h.int(r.a).int(r.b).int(r.c).int(r.d);
  h.int(s.cleared ? 1 : 0).int(s.ship.lives);
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
