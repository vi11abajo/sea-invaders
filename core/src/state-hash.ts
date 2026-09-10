import { Hasher } from './hash';
import type { GameState } from './types';

/** Hash of every simulation field in a fixed order. Equal hashes mean equal game states. */
export function hashState(s: GameState): string {
  const h = new Hasher();
  h.int(s.tick).int(s.wave).int(s.waveTotal).int(s.score).int(s.kills).int(s.over ? 1 : 0).int(s.dir);
  const p = s.ship;
  h.int(p.x).int(p.y).int(p.cooldown).int(p.invuln).int(p.lives);
  h.int(s.crabs.length);
  for (const c of s.crabs) h.int(c.x).int(c.y).int(c.kind);
  for (const list of [s.shots, s.enemyShots]) {
    h.int(list.length);
    for (const b of list) h.int(b.x).int(b.y).int(b.vx).int(b.vy);
  }
  for (const r of [s.rngWaves, s.rngFire]) h.int(r.a).int(r.b).int(r.c).int(r.d);
  return h.digest();
}
