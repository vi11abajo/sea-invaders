import { BOSS, BOSS_SHOT, FIELD_W } from '../config';
import { idiv } from '../fixed';
import { icos, isin } from '../trig';
import type { BossState, GameState } from '../types';
import { isActive } from './boosts';
import { BOSS_HOOKS, type BossHooks } from './bosses';

/** The point boss shots are fired from: the bottom-centre of the boss box. */
export function muzzle(b: BossState): { x: number; y: number } {
  return { x: b.x, y: b.y + idiv(BOSS.height, 2) };
}

/** A straight shot down the field, speed scaled by `mult1000` (1000 = ×1). */
export function castStraight(s: GameState, x: number, y: number, mult1000 = 1000): void {
  s.enemyShots.push({ x, y, vx: 0, vy: idiv(BOSS_SHOT.speed * mult1000, 1000), kind: 'straight', data: 0 });
}

/** A shot that sways sideways; `updateEnemyShots` flips `vx` every 20 ticks via `data`. */
export function castZigzag(s: GameState, x: number, y: number, dir: 1 | -1): void {
  s.enemyShots.push({ x, y, vx: dir * 73, vy: 110, kind: 'zigzag', data: 20 });
}

/** A slow, oversized shot (collision radius ×2, applied by kind in `hitShip`). */
export function castLarge(s: GameState, x: number, y: number): void {
  s.enemyShots.push({ x, y, vx: 0, vy: 93, kind: 'large', data: 0 });
}

/** `count` shots spread evenly around a full circle, speed scaled by `mult1000`; `radiusBoost` widens the collision radius (added to `BOSS_SHOT.radius` in `hitShip`). */
export function castRing(s: GameState, x: number, y: number, count: number, mult1000 = 1000, radiusBoost = 0): void {
  for (let i = 0; i < count; i++) {
    const deg = idiv(i * 360, count);
    const vx = idiv(BOSS_SHOT.speed * icos(deg) * mult1000, 1_000_000);
    const vy = idiv(BOSS_SHOT.speed * isin(deg) * mult1000, 1_000_000);
    s.enemyShots.push({ x, y, vx, vy, kind: 'ring', data: radiusBoost });
  }
}

/**
 * `count` shots aimed downward at a random angle in [0, 180] degrees and a random speed in
 * [0.5, 1.0]x, fuse `data` set to 45 ticks; `updateEnemyShots` replaces each with 4 `fragment`
 * shots once the fuse reaches 0 or the shot passes two thirds of the field (spec §4.1 `explosive`).
 */
export function castExplosive(s: GameState, x: number, y: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const deg = s.rngBoss.nextInt(181);
    const mult = 500 + s.rngBoss.nextInt(501);
    const vx = idiv(BOSS_SHOT.speed * icos(deg) * mult, 1_000_000);
    const vy = Math.abs(idiv(BOSS_SHOT.speed * isin(deg) * mult, 1_000_000));
    s.enemyShots.push({ x, y, vx, vy, kind: 'explosive', data: 45 });
  }
}

/** A straight-falling shot with collision radius 173 (`shotRadius`), speed scaled by `mult1000`. */
export function castMeteor(s: GameState, x: number, y: number, mult1000: number): void {
  s.enemyShots.push({ x, y, vx: 0, vy: idiv(BOSS_SHOT.speed * mult1000, 1000), kind: 'meteor', data: 0 });
}

/** Doubles `v` while SCORE_MULTIPLIER is active (spec §5.2), passed through unchanged otherwise. */
export function scoreMultiplier(s: GameState, v: number): number {
  return isActive(s, 'SCORE_MULTIPLIER') ? v * 2 : v;
}

/** Identity until Task 9: Crimson (kind 4) under rage will scale speeds ×1.55 while `effectTicks > 0`. */
export function rageMult(b: BossState, v: number): number {
  if (b.kind === 4 && b.effectTicks > 0) return v;
  return v;
}

/** Identity until Task 9: Crimson (kind 4) under rage will shrink delays while `effectTicks > 0`. */
export function rageDelay(b: BossState, d: number): number {
  if (b.kind === 4 && b.effectTicks > 0) return d;
  return d;
}

/** Emerald's secondary-attack timer: 1.0-2.2 s. */
export function secondaryDelay(s: GameState): number {
  return 60 + s.rngBoss.nextInt(73);
}

/** Base delay before the next primary attack, shrinking 20% per phase reached. */
export function attackDelay(s: GameState, phase: number): number {
  return idiv(BOSS.attackBase * (5 - (phase - 1)), 5) + s.rngBoss.nextInt(BOSS.attackJitter);
}

/** Decrements every `[ticksLeft, castId]` pair in `b.pending`, casting (via the boss's own `hooks.cast`) at 0. */
function runPending(s: GameState, b: BossState, hooks: BossHooks): void {
  if (b.pending.length === 0) return;
  const next: number[] = [];
  for (let i = 0; i < b.pending.length; i += 2) {
    const ticksLeft = b.pending[i]! - 1;
    const castId = b.pending[i + 1]!;
    if (ticksLeft <= 0) hooks.cast?.(s, b, castId);
    else next.push(ticksLeft, castId);
  }
  b.pending = next;
}

/** Spawns the boss of `kind` (1..5), with `kind` phases and legacy hp `50 + 25*(kind-1)`. */
export function spawnBoss(s: GameState, kind: 1 | 2 | 3 | 4 | 5): void {
  const maxPhases = kind; // 1..5, as the legacy table
  const maxHp = BOSS.baseHp + BOSS.hpStep * (kind - 1);
  const hooks = BOSS_HOOKS[kind];
  s.boss = {
    kind, hp: maxHp, maxHp, phase: 1, maxPhases,
    x: idiv(FIELD_W, 2), y: BOSS.top + idiv(BOSS.height, 2),
    vx: s.rngBoss.nextInt(2) === 0 ? BOSS.speed : -BOSS.speed,
    state: 'fighting', transitionTicks: 0,
    attackTimer: attackDelay(s, 1), secondaryTimer: hooks.secondary ? secondaryDelay(s) : 0,
    abilityTimer: hooks.initialAbilityTimer(s.rngBoss),
    fightTicks: 0, shieldHp: 0, regenCooldown: 0, effectTicks: 0, spiral: 0, pending: [],
  };
  s.events.push({ tick: s.tick, type: 'boss_spawn' });
}

/** Advances the boss by one tick: movement, phase transitions, attack/secondary/ability timers, pending casts. `fightTicks` (which drives the score decay) pauses while POINTS_FREEZE is active (spec §5.2). */
export function updateBoss(s: GameState): void {
  const b = s.boss;
  if (!b) return;
  if (!isActive(s, 'POINTS_FREEZE')) b.fightTicks += 1;
  // movement
  const half = idiv(BOSS.width, 2);
  const speed = rageMult(b, BOSS.speed);
  const next = b.x + (b.vx > 0 ? speed : -speed);
  if (next - half < 0 || next + half > FIELD_W) b.vx = -b.vx; else b.x = next;
  if (b.state === 'transition') {
    b.transitionTicks -= 1;
    if (b.transitionTicks === 0) { b.phase += 1; b.state = 'fighting'; s.events.push({ tick: s.tick, type: 'boss_phase' }); }
    return;
  }
  const hooks = BOSS_HOOKS[b.kind];
  b.attackTimer -= 1;
  if (b.attackTimer <= 0) { hooks.attack(s, b); b.attackTimer = rageDelay(b, attackDelay(s, b.phase)); }
  if (hooks.secondary) { b.secondaryTimer -= 1; if (b.secondaryTimer <= 0) { hooks.secondary(s, b); b.secondaryTimer = secondaryDelay(s); } }
  b.abilityTimer -= 1;
  if (b.abilityTimer <= 0) { hooks.ability(s, b); b.abilityTimer = hooks.nextAbilityTimer(s.rngBoss); }
  runPending(s, b, hooks);
  hooks.tick?.(s, b);
}

/** Deals `amount` damage to the boss (unless a shield absorbs it), handling phase transitions and death. */
export function damageBoss(s: GameState, amount: number): void {
  const b = s.boss;
  if (!b || b.state === 'transition') return;
  const hooks = BOSS_HOOKS[b.kind];
  if (hooks.onHit?.(s, b)) return; // shield absorbed it
  b.hp = Math.max(0, b.hp - amount);
  if (b.hp === 0) {
    const decayed = 100 - Math.floor(b.fightTicks / BOSS.decayEvery);
    s.score += scoreMultiplier(s, idiv(BOSS.scoreBase * b.kind * Math.max(1, decayed), 100));
    s.boss = null;
    s.events.push({ tick: s.tick, type: 'boss_dead' });
    if (s.run.level) { s.cleared = true; s.events.push({ tick: s.tick, type: 'level_cleared' }); }
    return;
  }
  if (b.phase < b.maxPhases && b.hp <= idiv(b.maxHp * (b.maxPhases - b.phase), b.maxPhases)) {
    b.state = 'transition';
    b.transitionTicks = BOSS.transitionTicks;
  }
}
