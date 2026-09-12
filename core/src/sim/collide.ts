import { BOSS, CRAB, CRAB_TYPES, ENEMY_SHOT, SHIP, SHOT } from '../config';
import { clamp, idiv } from '../fixed';
import type { Bullet, GameState } from '../types';
import { isActive, rollDrop } from './boosts';
import { damageBoss, scoreMultiplier } from './boss';

const CRAB_HALF = idiv(CRAB.size, 2);
const BOSS_HALF_W = idiv(BOSS.width, 2);
const BOSS_HALF_H = idiv(BOSS.height, 2);

/** Enemy shot collision radius by kind: `large` is ×2, `ring` widens by its own `data`, `fragment`/`meteor` are fixed sizes, everything else is the base radius. */
export function shotRadius(b: Bullet): number {
  if (b.kind === 'large') return ENEMY_SHOT.radius * 2;
  if (b.kind === 'ring') return ENEMY_SHOT.radius + b.data;
  if (b.kind === 'fragment') return 48;
  if (b.kind === 'meteor') return 173;
  return ENEMY_SHOT.radius;
}

/**
 * Each player shot hits the first crab it overlaps, or damages the boss box; a kill (hp reaches 0)
 * scores the type's points × wave (doubled by SCORE_MULTIPLIER). A PIERCING_BULLETS shot
 * (`data & 1`) is never consumed by a crab hit — killing or not — so it keeps flying; the boss
 * branch still consumes it.
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
      rollDrop(s, c.x, c.y);
      s.score += scoreMultiplier(s, CRAB_TYPES[c.type].points * s.wave);
      s.kills += 1;
    }
    if (b.data & 1) kept.push(b);
  }
  s.shots = kept;
}

/**
 * Enemy shots, crab bodies and the boss box hurt the ship unless it is invulnerable. A crab that
 * touches the ship dies without score. INVINCIBILITY ignores every hit outright (no life loss, no
 * shield use, no crab removal). Otherwise SHIELD_BARRIER absorbs a hit (see `applyShipHit`) before
 * any life is lost.
 */
export function hitShip(s: GameState): void {
  if (s.ship.invuln > 0 || s.over) return;
  if (isActive(s, 'INVINCIBILITY')) return;
  const { x, y } = s.ship;
  for (const b of s.enemyShots) {
    const dx = b.x - x;
    const dy = b.y - y;
    const reach = SHIP.hitRadius + shotRadius(b);
    if (dx * dx + dy * dy < reach * reach) {
      applyShipHit(s);
      return;
    }
  }
  const r2 = SHIP.hitRadius * SHIP.hitRadius;
  for (let i = 0; i < s.crabs.length; i++) {
    const c = s.crabs[i]!;
    const dx = x - clamp(x, c.x - CRAB_HALF, c.x + CRAB_HALF);
    const dy = y - clamp(y, c.y - CRAB_HALF, c.y + CRAB_HALF);
    if (dx * dx + dy * dy < r2) {
      s.crabs.splice(i, 1);
      applyShipHit(s);
      return;
    }
  }
  if (s.boss) {
    const b = s.boss;
    const dx = x - clamp(x, b.x - BOSS_HALF_W, b.x + BOSS_HALF_W);
    const dy = y - clamp(y, b.y - BOSS_HALF_H, b.y + BOSS_HALF_H);
    if (dx * dx + dy * dy < r2) {
      applyShipHit(s);
      return;
    }
  }
}

/** A hit lands on the ship: SHIELD_BARRIER absorbs it while charged (spec §5.2), otherwise a life is lost. */
function applyShipHit(s: GameState): void {
  if (s.boosts.shield > 0) {
    s.boosts.shield -= 1;
    s.ship.invuln = 30;
    s.events.push({ tick: s.tick, type: 'player_hit' });
    if (s.boosts.shield === 0) {
      s.boosts.active = s.boosts.active.filter((a) => a.type !== 'SHIELD_BARRIER');
      s.events.push({ tick: s.tick, type: 'boost_expire', boost: 'SHIELD_BARRIER' });
    }
    return;
  }
  loseLife(s);
}

export function loseLife(s: GameState): void {
  s.ship.lives -= 1;
  s.ship.invuln = SHIP.invulnTicks;
  s.enemyShots = [];
  if (s.ship.lives <= 0) s.over = true;
}
