import { BOSS, BOSS_SHOT, BOSS_TABLE, FIELD_W, SHOT } from '../config';
import { idiv, isqrt } from '../fixed';
import { icos, isin } from '../trig';
import type { Bullet, BossKind, BossState, GameState, TableBossKind } from '../types';
import { isActive } from './boosts';
import { BOSS_HOOKS, type BossHooks } from './bosses';
import { popSquads } from './squads';

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

/** A slow, oversized shot (collision radius ×2, applied by kind in `hitOctopi`). */
export function castLarge(s: GameState, x: number, y: number): void {
  s.enemyShots.push({ x, y, vx: 0, vy: 93, kind: 'large', data: 0 });
}

/** `count` shots spread evenly around a full circle, speed scaled by `mult1000`; `radiusBoost` widens the collision radius (added to `BOSS_SHOT.radius` in `hitOctopi`). */
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

/**
 * 12 shots evenly spread around a full circle (spec §4.1 `berserk` row), each at its own random
 * speed in [1.0, 1.5]x `BOSS_SHOT.speed`, further scaled by `mult1000` (Crimson's rage). Exported
 * here (rather than kept local to Crimson) because Task 10's Void chaos attack reuses it.
 */
export function castBerserk(s: GameState, x: number, y: number, mult1000: number): void {
  for (let i = 0; i < 12; i++) {
    const deg = idiv(i * 360, 12);
    const speedMult = 1000 + s.rngBoss.nextInt(501);
    const m = idiv(speedMult * mult1000, 1000);
    const vx = idiv(BOSS_SHOT.speed * icos(deg) * m, 1_000_000);
    const vy = idiv(BOSS_SHOT.speed * isin(deg) * m, 1_000_000);
    s.enemyShots.push({ x, y, vx, vy, kind: 'berserk', data: 0 });
  }
}

// ---------------------------------------------------------------------------------------------
// The boss shot kinds of reefs 6-10 (spec §5.1). Each one is cast here and moved in
// `updateEnemyShots` (`crabs.ts`), with its collision radius in `shotRadius` (`collide.ts`); every
// one of them costs Octopi one life, which is `shotDamage`'s default.
// ---------------------------------------------------------------------------------------------

/** Slots a firewall divides the field into (spec §5.2, the Verdant Templar's wall). */
export const FIREWALL_SLOTS = 9;

/** Where firewall slot `slot` stands: the centre of its ninth of the field, so no slot sits on an edge. */
export function firewallX(slot: number): number {
  return idiv(FIELD_W * (2 * slot + 1), FIREWALL_SLOTS * 2);
}

/**
 * A wall of straight shots across the whole field with one two-slot doorway in it (spec §5.2): all
 * nine slots but `gapSlot` and the slot to its right, so seven shots, at `BOSS_SHOT.speed` straight
 * down. `gapSlot` runs 0..7 — the gap always has a right-hand neighbour to take with it.
 */
export function castFirewall(s: GameState, y: number, gapSlot: number): void {
  for (let i = 0; i < FIREWALL_SLOTS; i++) {
    if (i === gapSlot || i === gapSlot + 1) continue;
    s.enemyShots.push({ x: firewallX(i), y, vx: 0, vy: BOSS_SHOT.speed, kind: 'firewall', data: 0 });
  }
}

/** Shots a shattered crystal bursts into, and the share of `BOSS_SHOT.speed` they fly at (spec §5.2). */
export const SHARD_COUNT = 6;
const SHARD_SPEED_PCT = 900;

/** A crystal's death burst: `SHARD_COUNT` shots evenly around the circle at ×0.9 speed (spec §5.2). */
export function castShardRing(s: GameState, x: number, y: number): void {
  for (let i = 0; i < SHARD_COUNT; i++) {
    const deg = idiv(i * 360, SHARD_COUNT);
    const vx = idiv(BOSS_SHOT.speed * icos(deg) * SHARD_SPEED_PCT, 1_000_000);
    const vy = idiv(BOSS_SHOT.speed * isin(deg) * SHARD_SPEED_PCT, 1_000_000);
    s.enemyShots.push({ x, y, vx, vy, kind: 'shard', data: 0 });
  }
}

/**
 * The Gold Corsair's boomerang (spec §5.2), as a plain integer parabola: the axe leaves the muzzle
 * falling at `AXE_VY0` and loses `AXE_GRAVITY` of that every tick (in `updateEnemyShots`), so the
 * step it actually takes runs `AXE_VY0 − AXE_GRAVITY`, `AXE_VY0 − 2·AXE_GRAVITY`, … It hangs still
 * on tick `AXE_FALL_TICKS` — the turn — and from there climbs back through the mirror image of the
 * way it came down, `−AXE_GRAVITY`, `−2·AXE_GRAVITY`, …, until it leaves through the top of the
 * field and the usual prune drops it (a shot above the top edge is only kept while it still moves
 * down). Sideways it is a constant `vx`, chosen so the turn happens exactly over `targetX`.
 */
export const AXE_VY0 = 120;
export const AXE_GRAVITY = 2;
export const AXE_FALL_TICKS = idiv(AXE_VY0, AXE_GRAVITY);

/** Throws an axe from `(fromX, fromY)` that turns over `targetX` and comes back up (spec §5.2). */
export function castAxe(s: GameState, fromX: number, fromY: number, targetX: number): void {
  const vx = idiv(targetX - fromX, AXE_FALL_TICKS);
  s.enemyShots.push({ x: fromX, y: fromY, vx, vy: AXE_VY0, kind: 'axe', data: 0 });
}

/** The Storm Tyrant's fork: half-angle in degrees, and the speed it flies at (spec §5.2: ×1.5). */
export const BOLT_SPREAD = 12;
export const BOLT_SPEED = idiv(BOSS_SHOT.speed * 15, 10);

/** A fast forked pair, `BOLT_SPREAD` degrees either side of straight down (spec §5.2). */
export function castBolt(s: GameState, x: number, y: number): void {
  for (const deg of [-BOLT_SPREAD, BOLT_SPREAD]) {
    const vx = idiv(BOLT_SPEED * isin(deg), 1000);
    const vy = idiv(BOLT_SPEED * icos(deg), 1000);
    s.enemyShots.push({ x, y, vx, vy, kind: 'bolt', data: 0 });
  }
}

/**
 * The Storm Tyrant's homing orb (spec §5.2). It sinks at a constant `ORB_VY` and turns its `vx`
 * towards Octopi by at most `ORB_STEER` a tick (in `updateEnemyShots`), capped at `ORB_VX_MAX` so a
 * long chase cannot wind it up past any speed the game fires; it lives `ORB_LIFE` ticks, which at
 * that sinking speed is what ends it rather than the bottom of the field; and it takes `ORB_HP`
 * player shots before it goes, like a tougher bubble.
 *
 * `Bullet.data` carries both counters at once, `ticksLeft * 4 + hp`: the hit points need two bits
 * and the life needs the rest, so no new `Bullet` field was necessary. Read them with `orbTicks`
 * and `orbHp`, never by hand.
 */
export const ORB_LIFE = 240;
export const ORB_HP = 3;
export const ORB_STEER = 3;
export const ORB_VY = 30;
export const ORB_VX_MAX = 90;
/** An orb's collision radius (spec §5.1): the widest of the reefs 6-10 shots. */
export const ORB_RADIUS = 170;

/** Packs an orb's remaining life and hit points into one `Bullet.data` int. */
export function packOrb(ticksLeft: number, hp: number): number {
  return ticksLeft * 4 + hp;
}

/** Ticks of life left in an orb. */
export function orbTicks(b: Bullet): number {
  return idiv(b.data, 4);
}

/** Hit points left in an orb. */
export function orbHp(b: Bullet): number {
  return b.data & 3;
}

/** Sends out one homing orb (spec §5.2). */
export function castOrb(s: GameState, x: number, y: number): void {
  s.enemyShots.push({ x, y, vx: 0, vy: ORB_VY, kind: 'orb', data: packOrb(ORB_LIFE, ORB_HP) });
}

/**
 * Player shots meeting orbs, called once per tick from `step` right after `popBubbles` and before
 * `hitCrabs` — the same place in the tick, and the same rule, as the bubbler's bubble: the first
 * orb a shot touches takes one hit point, and the shot is consumed unless it pierces. An orb out of
 * hit points is removed. Costs a field with no orb in it one scan that leaves immediately.
 */
export function hitOrbs(s: GameState): void {
  if (s.shots.length === 0) return;
  let any = false;
  for (const b of s.enemyShots) {
    if (b.kind === 'orb') {
      any = true;
      break;
    }
  }
  if (!any) return;
  const kept: Bullet[] = [];
  for (const p of s.shots) {
    const i = s.enemyShots.findIndex((b) => b.kind === 'orb' && touchesOrb(p, b));
    if (i < 0) {
      kept.push(p);
      continue;
    }
    const orb = s.enemyShots[i]!;
    if (orbHp(orb) <= 1) s.enemyShots.splice(i, 1);
    else orb.data -= 1;
    if ((p.data & 1) !== 0) kept.push(p);
  }
  s.shots = kept;
}

/** Whether a player shot's box overlaps an orb's, the same box test `popBubbles` uses for a bubble. */
function touchesOrb(p: Bullet, b: Bullet): boolean {
  return Math.abs(p.x - b.x) * 2 < SHOT.w + ORB_RADIUS * 2
    && Math.abs(p.y - b.y) * 2 < SHOT.h + ORB_RADIUS * 2;
}

/** The Abyssal Huntsman's needle speed (spec §5.2: ×1.6 the base boss shot). */
export const NEEDLE_SPEED = idiv(BOSS_SHOT.speed * 16, 10);

/**
 * A needle along the line from `(fromX, fromY)` to `(toX, toY)` at `NEEDLE_SPEED` (spec §5.2). The
 * aim is spent the moment it is fired: the shot flies the line it was given and never tracks.
 */
export function castNeedle(s: GameState, fromX: number, fromY: number, toX: number, toY: number): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = isqrt(dx * dx + dy * dy);
  const vx = len === 0 ? 0 : idiv(dx * NEEDLE_SPEED, len);
  const vy = len === 0 ? NEEDLE_SPEED : idiv(dy * NEEDLE_SPEED, len);
  s.enemyShots.push({ x: fromX, y: fromY, vx, vy, kind: 'needle', data: 0 });
}

/** Doubles `v` while SCORE_MULTIPLIER is active (spec §5.2), passed through unchanged otherwise. */
export function scoreMultiplier(s: GameState, v: number): number {
  return isActive(s, 'SCORE_MULTIPLIER') ? v * 2 : v;
}

/** Scales `v` ×1.55 while Crimson (kind 4) is raging (`effectTicks > 0`, spec §4.2 row 4), unchanged otherwise. */
export function rageMult(b: BossState, v: number): number {
  if (b.kind === 4 && b.effectTicks > 0) return idiv(v * 155, 100);
  return v;
}

/** Shrinks a delay `d` to match rage's ×1.55 attack frequency while Crimson is raging, unchanged otherwise. */
export function rageDelay(b: BossState, d: number): number {
  if (b.kind === 4 && b.effectTicks > 0) return idiv(d * 100, 155);
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

/** Whether `kind` takes its numbers from `BOSS_TABLE` (spec §5): the reefs 6-10 five, never the first campaign's. */
export function isTableBoss(kind: BossKind): kind is TableBossKind {
  return kind >= 6;
}

/**
 * The hit points, phases and score base of boss `kind`. The first campaign's five keep the legacy
 * formulas exactly — `BOSS.baseHp + BOSS.hpStep*(kind-1)` hit points (spec §14 amendment:
 * `200 + 100*(kind-1)`), `kind` phases, `BOSS.scoreBase * kind` score — and only kinds 6..10 read
 * the explicit table of spec §5. This is the single place the two rules meet.
 */
export function bossStats(kind: BossKind): { hp: number; phases: number; score: number } {
  if (isTableBoss(kind)) return BOSS_TABLE[kind];
  return { hp: BOSS.baseHp + BOSS.hpStep * (kind - 1), phases: kind, score: BOSS.scoreBase * kind };
}

/** Spawns the boss of `kind`, with the hit points and phases `bossStats` gives it. */
export function spawnBoss(s: GameState, kind: BossKind): void {
  const { hp: maxHp, phases: maxPhases } = bossStats(kind);
  const hooks = BOSS_HOOKS[kind];
  s.boss = {
    kind, hp: maxHp, maxHp, phase: 1, maxPhases,
    x: idiv(FIELD_W, 2), y: BOSS.top + idiv(BOSS.height, 2),
    vx: s.rngBoss.nextInt(2) === 0 ? BOSS.speed : -BOSS.speed,
    state: 'fighting', transitionTicks: 0,
    attackTimer: attackDelay(s, 1), secondaryTimer: hooks.secondary ? secondaryDelay(s) : 0,
    abilityTimer: hooks.initialAbilityTimer(s.rngBoss),
    fightTicks: 0, shieldHp: 0, regenCooldown: 0, effectTicks: 0, spiral: 0, pending: [],
    // The reefs 6-10 fields (spec §5.2), neutral for every boss at spawn and for the whole of a
    // kind-1..5 fight.
    shieldUp: 0, windup: 0, gapSlot: 0, aimX: 0, aimTicks: 0, burst: 0, mirror: [0, 0, 0], discharged: 0,
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
    s.score += scoreMultiplier(s, idiv(bossStats(b.kind).score * Math.max(1, decayed), 100));
    s.boss = null;
    s.events.push({ tick: s.tick, type: 'boss_dead' });
    // Spec §5.1: whatever the escort has left goes with its boss, without score. A no-op on every
    // fight of the first campaign, which never raises a squad.
    popSquads(s);
    if (s.run.level) { s.cleared = true; s.events.push({ tick: s.tick, type: 'level_cleared' }); }
    return;
  }
  if (b.phase < b.maxPhases && b.hp <= idiv(b.maxHp * (b.maxPhases - b.phase), b.maxPhases)) {
    b.state = 'transition';
    b.transitionTicks = BOSS.transitionTicks;
  }
}
