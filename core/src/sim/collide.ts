import { BOSS, CRAB, CRAB_TYPES, ENEMY_SHOT, OCTOPI, SHOT } from '../config';
import { clamp, idiv } from '../fixed';
import type { Bullet, Crab, GameState } from '../types';
import { isActive, rollDrop, scoreDecayPct } from './boosts';
import { damageBoss, scoreMultiplier } from './boss';

/**
 * Kills a crab outright: rolls its drop, scores its points (wave-scaled, scaled by the wave-mode
 * score-decay percentage — spec C7 — then doubled by SCORE_MULTIPLIER), and counts the kill. Shared
 * by `hitCrabs` (a lethal bullet hit) and WAVE_BLAST (spec C4, `boostEffects.ts`) so the two paths
 * can never disagree on scoring. The caller removes `c` from `s.crabs` itself (a splice by index in
 * `hitCrabs`, a filter in WAVE_BLAST).
 */
export function killCrab(s: GameState, c: Crab): void {
  rollDrop(s, c.x, c.y);
  const base = CRAB_TYPES[c.type].points * s.wave;
  s.score += scoreMultiplier(s, idiv(base * scoreDecayPct(s), 100));
  s.kills += 1;
}

const CRAB_HALF = idiv(CRAB.size, 2);
const BOSS_HALF_W = idiv(BOSS.width, 2);
const BOSS_HALF_H = idiv(BOSS.height, 2);

/** Enemy shot collision radius by kind: `large` is ×2, `ring` widens by its own `data`, `fragment`/`meteor`/`heavy` are fixed sizes, everything else is the base radius. */
export function shotRadius(b: Bullet): number {
  if (b.kind === 'large') return ENEMY_SHOT.radius * 2;
  if (b.kind === 'ring') return ENEMY_SHOT.radius + b.data;
  if (b.kind === 'fragment') return 48;
  if (b.kind === 'meteor') return 173;
  if (b.kind === 'heavy') return 154; // the red crab's shot: ENEMY_SHOT.radius * 1.6
  return ENEMY_SHOT.radius;
}

/**
 * Lives one enemy shot costs when it lands (spec §1): the red crab's `heavy` shot hits for two,
 * everything else — every other crab shot and every boss shot — for one.
 */
export function shotDamage(b: Bullet): 1 | 2 {
  return b.kind === 'heavy' ? 2 : 1;
}

/**
 * Each player shot hits the first crab it overlaps, or damages the boss box; a kill (hp reaches 0)
 * scores the type's points × wave (doubled by SCORE_MULTIPLIER). A PIERCING_BULLETS shot
 * (`data & 1`) is never consumed by a crab hit — killing or not — so it keeps flying; the boss
 * branch still consumes it. Spec §5.2 is "one hit per crab per shot": a piercing shot that damages
 * a crab without killing it is pushed clear of that crab's overlap box (`shot.y` moved just past
 * the box, matching this function's own overlap test) so the next tick's pass can't re-hit the
 * same crab — player shots fly up (decreasing y) and crabs march down slower than `SHOT.speed`, so
 * a shot never re-enters a box it has already cleared.
 */
export function hitCrabs(s: GameState): void {
  const kept: Bullet[] = [];
  for (const b of s.shots) {
    const i = s.crabs.findIndex(
      (c) => Math.abs(b.x - c.x) * 2 < SHOT.w + CRAB.size && Math.abs(b.y - c.y) * 2 < SHOT.h + CRAB.size,
    );
    if (i < 0) {
      if (s.boss && Math.abs(b.x - s.boss.x) * 2 < SHOT.w + BOSS.width && Math.abs(b.y - s.boss.y) * 2 < SHOT.h + BOSS.height) {
        damageBoss(s, 1);
        continue;
      }
      kept.push(b);
      continue;
    }
    const c = s.crabs[i]!;
    c.hp -= 1;
    if (c.hp <= 0) {
      s.crabs.splice(i, 1);
      killCrab(s, c);
    } else if (b.data & 1) {
      b.y = c.y - idiv(CRAB.size, 2) - idiv(SHOT.h, 2) - 1;
    }
    if (b.data & 1) kept.push(b);
  }
  s.shots = kept;
}

/**
 * Enemy shots, crab bodies and the boss box hurt Octopi unless it is invulnerable. A crab that
 * touches Octopi dies without score. INVINCIBILITY ignores every hit outright (no life loss, no
 * shield use, no crab removal). Otherwise SHIELD_BARRIER absorbs a hit (see `applyOctopiHit`) before
 * any life is lost.
 */
export function hitOctopi(s: GameState): void {
  if (s.octopi.invuln > 0 || s.over) return;
  if (isActive(s, 'INVINCIBILITY')) return;
  const { x, y } = s.octopi;
  for (const b of s.enemyShots) {
    const dx = b.x - x;
    const dy = b.y - y;
    const reach = OCTOPI.hitRadius + shotRadius(b);
    if (dx * dx + dy * dy < reach * reach) {
      applyOctopiHit(s, shotDamage(b));
      return;
    }
  }
  const r2 = OCTOPI.hitRadius * OCTOPI.hitRadius;
  for (let i = 0; i < s.crabs.length; i++) {
    const c = s.crabs[i]!;
    const dx = x - clamp(x, c.x - CRAB_HALF, c.x + CRAB_HALF);
    const dy = y - clamp(y, c.y - CRAB_HALF, c.y + CRAB_HALF);
    if (dx * dx + dy * dy < r2) {
      s.crabs.splice(i, 1);
      applyOctopiHit(s, 1);
      return;
    }
  }
  if (s.boss) {
    const b = s.boss;
    const dx = x - clamp(x, b.x - BOSS_HALF_W, b.x + BOSS_HALF_W);
    const dy = y - clamp(y, b.y - BOSS_HALF_H, b.y + BOSS_HALF_H);
    if (dx * dx + dy * dy < r2) {
      applyOctopiHit(s, 1);
      return;
    }
  }
}

/**
 * A hit worth `damage` lives lands on Octopi: SHIELD_BARRIER absorbs the whole hit while charged
 * (spec §5.2 — one charge, however hard the shot), otherwise that many lives are lost.
 */
function applyOctopiHit(s: GameState, damage: number): void {
  if (s.boosts.shield > 0) {
    s.boosts.shield -= 1;
    s.octopi.invuln = 30;
    s.events.push({ tick: s.tick, type: 'player_hit' });
    if (s.boosts.shield === 0) {
      s.boosts.active = s.boosts.active.filter((a) => a.type !== 'SHIELD_BARRIER');
      s.events.push({ tick: s.tick, type: 'boost_expire', boost: 'SHIELD_BARRIER' });
    }
    return;
  }
  loseLife(s, damage);
}

/**
 * Costs Octopi `damage` lives (one by default, two for a red crab's `heavy` shot): lives never go
 * below zero, the run ends when they reach it, and however many lives the hit took it is still one
 * hit — one invulnerability window, one clearing of the enemy shots, one `player_hit` event.
 */
export function loseLife(s: GameState, damage = 1): void {
  s.octopi.lives = Math.max(0, s.octopi.lives - damage);
  s.octopi.invuln = OCTOPI.invulnTicks;
  s.enemyShots = [];
  s.events.push({ tick: s.tick, type: 'player_hit' });
  if (s.octopi.lives <= 0) s.over = true;
}
