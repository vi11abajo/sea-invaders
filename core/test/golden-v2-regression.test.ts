import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hasher, INITIAL_INPUT, createGame, step, type GameState, type Golden } from '../src';

/** The v2 state hash: only the fields that existed in core v2, in the v2 order. */
function hashV2(s: GameState): string {
  const h = new Hasher();
  h.int(s.tick).int(s.wave).int(s.waveTotal).int(s.score).int(s.kills).int(s.over ? 1 : 0).int(s.dir);
  const p = s.ship;
  h.int(p.x).int(p.y).int(p.cooldown).int(p.invuln).int(p.lives);
  h.int(s.crabs.length);
  for (const c of s.crabs) h.int(c.x).int(c.y).int(c.kind);
  for (const list of [s.shots, s.enemyShots]) { h.int(list.length); for (const b of list) h.int(b.x).int(b.y).int(b.vx).int(b.vy); }
  for (const r of [s.rngWaves, s.rngFire]) h.int(r.a).int(r.b).int(r.c).int(r.d);
  return h.digest();
}

const goldens = JSON.parse(readFileSync(join(process.cwd(), 'golden', 'golden-v2.json'), 'utf8')) as Golden[];

describe('core v2 goldens still reproduce with boosts off', () => {
  for (const g of goldens) {
    it(g.name, () => {
      const s = createGame(g.replay.seed, { mode: 'practice', lives: 3, features: { boosts: false } });
      const { inputs } = g.replay;
      let x = INITIAL_INPUT.x, y = INITIAL_INPUT.y, next = 0;
      for (let t = 1; t <= g.replay.ticks; t++) {
        while (next < inputs.length && inputs[next]! <= t) { x = inputs[next + 1]!; y = inputs[next + 2]!; next += 3; }
        step(s, { x, y });
      }
      expect({ score: s.score, ticks: s.tick, over: s.over, hash: hashV2(s) }).toEqual(g.expected);
    });
  }
});
