import { Hasher } from './hash';
import {
  BEHAVIOUR_INDEX, BOOST_INDEX, KIND_INDEX, OBSTACLE_INDEX, TYPE_INDEX, type GameState,
} from './types';

/** Hash of every simulation field in a fixed order. Equal hashes mean equal game states. */
export function hashState(s: GameState): string {
  const h = new Hasher();
  h.int(s.tick).int(s.wave).int(s.waveTotal).int(s.score).int(s.kills).int(s.over ? 1 : 0).int(s.dir).int(s.scoreDecay);
  const p = s.octopi;
  h.int(p.x).int(p.y).int(p.cooldown).int(p.invuln).int(p.lives);
  h.int(s.crabs.length);
  for (const c of s.crabs) {
    h.int(c.x).int(c.y).int(c.kind).int(TYPE_INDEX[c.type]).int(c.hp)
      .int(c.slot).int(c.shield).int(c.shieldTimer).int(c.rallies).int(c.rallyTimer).int(c.squad);
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
  // The campaign wave's living state, appended last so every older field keeps its place.
  // The slot list itself is not hashed. Its positions follow from the wave's silhouette and its
  // `reformed` flag, and which crab holds which slot is already in each crab's `slot` above. Its kinds
  // do NOT all follow that way: a whirlpool's `rotate` (`sim/living.ts`) moves `slots[].type` round
  // the ring on every ring step, and that field is not hashed today, so two states that differ only in
  // the kind a free slot would rally back (`sim/veterans.ts`) hash equal. Replays stay deterministic
  // (the run's history fixes the field); hashing it is a `CORE_VERSION` bump with regenerated goldens,
  // so it waits for the next one. A wave with no formation at all - daily, practice, a boss round -
  // hashes the -1 marker instead.
  const f = s.formation;
  if (f) {
    h.int(BEHAVIOUR_INDEX[f.behaviour]).int(f.ox).int(f.oy).int(f.dirL).int(f.dirR)
      .int(f.rotateTick).int(f.reformed ? 1 : 0).int(f.glideTicks);
  } else {
    h.int(-1);
  }
  // The veteran skill state, appended after everything above so every older field keeps
  // its place: the formation's rage, the kinds a daily/practice grid wave's rows spawned with (what
  // a patriarch's rally brings back), and each crab's rally mark. The crab count is already hashed
  // with the crabs themselves, so the trailing per-crab run below is unambiguous.
  h.int(s.rageTicks);
  h.int(s.gridRows.length);
  for (const t of s.gridRows) h.int(TYPE_INDEX[t]);
  for (const c of s.crabs) h.int(c.revived);
  // The boss arena of reefs 6-10, appended after everything above so every older
  // field keeps its place: the squads, the arena objects, the Tyrant's lanes, the cold snap, the
  // Huntsman's sight lines, the eight new `BossState` fields (in their own guarded block, so a
  // round with no boss is unambiguous exactly as the older boss block is), and each crab's squad
  // cell. The crab count is already hashed with the crabs themselves, so the trailing per-crab run
  // is unambiguous.
  h.int(s.squads.length);
  // `bossKind`/`alive` are appended after `id`/`dir` so every
  // older field keeps its place; a state with no squad on it hashes the same `0` length as before and
  // never reaches this line at all.
  for (const q of s.squads) h.int(q.id).int(q.dir).int(q.bossKind).int(q.alive);
  h.int(s.obstacles.length);
  for (const o of s.obstacles) h.int(o.x).int(o.y).int(o.w).int(o.h).int(o.hp).int(OBSTACLE_INDEX[o.kind]);
  h.int(s.lanes.length);
  for (const v of s.lanes) h.int(v);
  h.int(s.chillTicks);
  h.int(s.aims.length);
  for (const v of s.aims) h.int(v);
  if (s.boss) {
    const b = s.boss;
    h.int(b.shieldUp).int(b.windup).int(b.gapSlot).int(b.aimX).int(b.aimTicks).int(b.burst)
      .int(b.mirror[0]).int(b.mirror[1]).int(b.mirror[2]).int(b.discharged);
  } else {
    h.int(-1);
  }
  for (const c of s.crabs) h.int(c.cell);
  // `destroyedObstacles`, appended last of all so every older
  // field keeps its place: a sim-internal, single-tick channel that is empty at the start and the
  // end of every tick but a boss's own destroying one, so it is usually empty and this usually costs
  // one int.
  h.int(s.destroyedObstacles.length);
  for (const o of s.destroyedObstacles) h.int(o.x).int(o.y);
  // Coraluna's Coral growth counter, appended last so every older field keeps its place; it stays 0
  // for every other variant, so their runs only gain this one trailing int.
  h.int(s.growthKills);
  // Shoupe's Last stand carry, appended last so every older field keeps its place; it stays 0 for
  // every other variant, so their runs only gain this one trailing int.
  h.int(s.octopi.fireCarry);
  // Noob's Shell, appended last so every older field keeps its place; it stays 0 for every other
  // variant, so their runs only gain this one trailing int.
  h.int(s.octopi.shell);
  return h.digest();
}
