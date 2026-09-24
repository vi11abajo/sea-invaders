import { BOSS, BOSS_SHOT, BOSS_TABLE, FIELD_W, SHOT } from '../config';
import { clamp, idiv, isqrt } from '../fixed';
import { icos, isin } from '../trig';
import type { Bullet, BossKind, BossState, GameState, TableBossKind } from '../types';
import { isActive } from './boosts';
import { BOSS_HOOKS, type BossHooks } from './bosses';
import { raiseShell } from './champions';

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
 * shots once the fuse reaches 0 or the shot passes two thirds of the field.
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
 * 12 shots evenly spread around a full circle, each at its own random
 * speed in [1.0, 1.5]x `BOSS_SHOT.speed`, further scaled by `mult1000` (Crimson's rage). Exported
 * here (rather than kept local to Crimson) because Void's chaos attack reuses it.
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
// The boss shot kinds of reefs 6-10. Each one is cast here and moved in
// `updateEnemyShots` (`crabs.ts`), with its collision radius in `shotRadius` (`collide.ts`); every
// one of them costs Octopi one life, which is `shotDamage`'s default.
// ---------------------------------------------------------------------------------------------

/** Slots a firewall divides the field into (the Verdant Templar's wall). */
export const FIREWALL_SLOTS = 9;

/** Where firewall slot `slot` stands: the centre of its ninth of the field, so no slot sits on an edge. */
export function firewallX(slot: number): number {
  return idiv(FIELD_W * (2 * slot + 1), FIREWALL_SLOTS * 2);
}

/**
 * A wall of straight shots across the whole field with one two-slot doorway in it: all
 * nine slots but `gapSlot` and the slot to its right, so seven shots, at `BOSS_SHOT.speed` straight
 * down.
 *
 * The doorway is **always exactly two slots wide** — that is the contract, not a precondition on
 * the caller. The gap needs a right-hand neighbour to take with it, so `gapSlot` is
 * clamped into `0..FIREWALL_SLOTS - 2`: a caller drawing the slot nearest `rngBoss.nextInt(9)` can
 * hand this an 8, and a wall with a one-slot doorway would be a materially harder wall on one draw
 * in nine. Callers should draw `rngBoss.nextInt(8)`; whatever they hand over, the wall is seven
 * shots with a two-slot doorway.
 */
export function castFirewall(s: GameState, y: number, gapSlot: number): void {
  const gap = clamp(gapSlot, 0, FIREWALL_SLOTS - 2);
  for (let i = 0; i < FIREWALL_SLOTS; i++) {
    if (i === gap || i === gap + 1) continue;
    s.enemyShots.push({ x: firewallX(i), y, vx: 0, vy: BOSS_SHOT.speed, kind: 'firewall', data: 0 });
  }
}

/** Shots a shattered crystal bursts into, and the share of `BOSS_SHOT.speed` they fly at. */
export const SHARD_COUNT = 6;
const SHARD_SPEED_PCT = 900;

/** A crystal's death burst: `SHARD_COUNT` shots evenly around the circle at ×0.9 speed. */
export function castShardRing(s: GameState, x: number, y: number): void {
  for (let i = 0; i < SHARD_COUNT; i++) {
    const deg = idiv(i * 360, SHARD_COUNT);
    const vx = idiv(BOSS_SHOT.speed * icos(deg) * SHARD_SPEED_PCT, 1_000_000);
    const vy = idiv(BOSS_SHOT.speed * isin(deg) * SHARD_SPEED_PCT, 1_000_000);
    s.enemyShots.push({ x, y, vx, vy, kind: 'shard', data: 0 });
  }
}

/**
 * The Gold Corsair's boomerang, as a plain integer parabola: the axe leaves the muzzle
 * falling at `AXE_VY0` and loses `AXE_GRAVITY` of that every tick (in `updateEnemyShots`), so the
 * step it actually takes runs `AXE_VY0 − AXE_GRAVITY`, `AXE_VY0 − 2·AXE_GRAVITY`, … It hangs still
 * on tick `AXE_FALL_TICKS` — the turn — and from there climbs back through the mirror image of the
 * way it came down, `−AXE_GRAVITY`, `−2·AXE_GRAVITY`, …, until it leaves through the top of the
 * field and the usual prune drops it (a shot above the top edge is only kept while it still moves
 * down). Sideways it is a constant `vx`, chosen so the turn happens exactly over `targetX`.
 */
// Balance note: at 120 the turn came at y 7200, above any Octopi (its rows run
// 5000..10550, home 9650); at 162 the axe falls 6480 from the muzzle (y 3660) and turns at 10140,
// just under the home row, so a player who does not move meets the blade.
export const AXE_VY0 = 162;
export const AXE_GRAVITY = 2;
export const AXE_FALL_TICKS = idiv(AXE_VY0, AXE_GRAVITY);

/** Throws an axe from `(fromX, fromY)` that turns over `targetX` and comes back up. */
export function castAxe(s: GameState, fromX: number, fromY: number, targetX: number): void {
  const vx = idiv(targetX - fromX, AXE_FALL_TICKS);
  s.enemyShots.push({ x: fromX, y: fromY, vx, vy: AXE_VY0, kind: 'axe', data: 0 });
}

/** The Storm Tyrant's fork: half-angle in degrees, and the speed it flies at (×1.5). */
export const BOLT_SPREAD = 12;
export const BOLT_SPEED = idiv(BOSS_SHOT.speed * 15, 10);

/** A fast forked pair, `BOLT_SPREAD` degrees either side of straight down. */
export function castBolt(s: GameState, x: number, y: number): void {
  for (const deg of [-BOLT_SPREAD, BOLT_SPREAD]) {
    const vx = idiv(BOLT_SPEED * isin(deg), 1000);
    const vy = idiv(BOLT_SPEED * icos(deg), 1000);
    s.enemyShots.push({ x, y, vx, vy, kind: 'bolt', data: 0 });
  }
}

/**
 * The Storm Tyrant's homing orb. It sinks at a constant `ORB_VY` and turns its `vx`
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
// Balance note: at 30 the orb spent its whole life above Octopi and only touched
// the home row as it died; at 45 it crosses the home row 2.2 s after the cast and leaves through the
// bottom of the field at tick ~169, so `ORB_LIFE` is now only a cap on an orb that somehow stalls.
export const ORB_VY = 45;
export const ORB_VX_MAX = 90;
/** An orb's collision radius: the widest of the reefs 6-10 shots. */
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

/** Sends out one homing orb. */
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

/**
 * Whether a player shot's box overlaps an orb's, the same box test `popBubbles` uses for a bubble.
 * Deliberately wider than the radius-`ORB_RADIUS` circle `hitOctopi` tests the same orb's collision
 * against Octopi with — the same trade-off `touchesBubble`'s own doc explains for the bubble: a
 * player shot is a box, so the cheap box test is the one that matches the rest of `hitCrabs`, and the
 * corners buy a little extra reach on the diagonal.
 */
function touchesOrb(p: Bullet, b: Bullet): boolean {
  return Math.abs(p.x - b.x) * 2 < SHOT.w + ORB_RADIUS * 2
    && Math.abs(p.y - b.y) * 2 < SHOT.h + ORB_RADIUS * 2;
}

/** The Abyssal Huntsman's needle speed (×1.6 the base boss shot). */
export const NEEDLE_SPEED = idiv(BOSS_SHOT.speed * 16, 10);

/**
 * A needle along the line from `(fromX, fromY)` to `(toX, toY)` at `NEEDLE_SPEED`, scaled by
 * `mult1000` (the Huntsman's own control mirror passes 1250 for its ×1.25 — the same
 * `mult1000` idiom `castStraight`/`castRing` already use, default 1000 keeping every existing
 * caller's output identical). The aim is spent the moment it is fired: the shot flies the line it
 * was given and never tracks.
 */
export function castNeedle(s: GameState, fromX: number, fromY: number, toX: number, toY: number, mult1000 = 1000): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = isqrt(dx * dx + dy * dy);
  const speed = idiv(NEEDLE_SPEED * mult1000, 1000);
  const vx = len === 0 ? 0 : idiv(dx * speed, len);
  const vy = len === 0 ? speed : idiv(dy * speed, len);
  s.enemyShots.push({ x: fromX, y: fromY, vx, vy, kind: 'needle', data: 0 });
}

/** Doubles `v` while SCORE_MULTIPLIER is active, passed through unchanged otherwise. */
export function scoreMultiplier(s: GameState, v: number): number {
  return isActive(s, 'SCORE_MULTIPLIER') ? v * 2 : v;
}

/** Scales `v` ×1.55 while Crimson (kind 4) is raging (`effectTicks > 0`), unchanged otherwise. */
export function rageMult(b: BossState, v: number): number {
  if (b.kind === 4 && b.effectTicks > 0) return idiv(v * 155, 100);
  return v;
}

/**
 * Doubles `amount` while the Storm Tyrant (kind 9) is discharged from his own lightning
 * (`b.discharged > 0`), unchanged otherwise — the same kind-gated-multiplier idiom
 * as `rageMult`/`rageDelay` above, so `damageBoss` needs no boss-kind branch of its own. `b.discharged`
 * is 0 for every kind but 9 for the whole of a fight (nothing else ever sets it, `spawnBoss`'s own
 * neutral value), so this is a no-op — reads one field, changes no arithmetic — for kinds 1-8 and 10.
 */
export function dischargeMult(b: BossState, amount: number): number {
  if (b.kind === 9 && b.discharged > 0) return amount * 2;
  return amount;
}

/** Shrinks a delay `d` to match rage's ×1.55 attack frequency while Crimson is raging, unchanged otherwise. */
export function rageDelay(b: BossState, d: number): number {
  if (b.kind === 4 && b.effectTicks > 0) return idiv(d * 100, 155);
  return d;
}

/**
 * Halves a delay `d` while the Abyssal Huntsman's own offence mirror is running (kind 10 only): a
 * player's offence boost picked up mid-fight (`sim/bosses/huntsman.ts`'s own
 * `onBoostPickup`) halves how often he fires for as long as `b.mirror[0]` still counts down. Applied
 * at the one line in `updateBoss` below that redraws `attackTimer` after an attack, the same
 * kind-gated-multiplier idiom `rageDelay`/`dischargeMult` already use for Crimson/Tyrant, so this
 * reads one field and changes no arithmetic for kinds 1-9.
 */
export function mirrorDelay(b: BossState, d: number): number {
  return b.kind === 10 && b.mirror[0] > 0 ? idiv(d, 2) : d;
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

/** Whether `kind` takes its numbers from `BOSS_TABLE`: the reefs 6-10 five, never the first campaign's. */
export function isTableBoss(kind: BossKind): kind is TableBossKind {
  return kind >= 6;
}

/**
 * The hit points, phases and score base of boss `kind`. The first campaign's five keep the legacy
 * formulas exactly — `BOSS.baseHp + BOSS.hpStep*(kind-1)` hit points (`200 + 100*(kind-1)`), `kind`
 * phases, `BOSS.scoreBase * kind` score — and only kinds 6..10 read the explicit `BOSS_TABLE`
 * instead. This is the single place the two rules meet.
 */
export function bossStats(kind: BossKind): Readonly<{ hp: number; phases: number; score: number }> {
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
    // The reefs 6-10 fields, neutral for every boss at spawn and for the whole of a
    // kind-1..5 fight.
    shieldUp: 0, windup: 0, gapSlot: 0, aimX: 0, aimTicks: 0, burst: 0, mirror: [0, 0, 0], discharged: 0,
  };
  s.events.push({ tick: s.tick, type: 'boss_spawn' });
  raiseShell(s); // noob's Shell comes back for the fight, and only here: a new phase does not raise it
  // Phase 1 begins the moment the boss stands. Undefined for every boss of the first campaign, so
  // this adds nothing to their spawn — no draw, no field touched.
  hooks.onPhaseStart?.(s, s.boss);
}

/** Advances the boss by one tick: movement, phase transitions, attack/secondary/ability timers, pending casts. `fightTicks` (which drives the score decay) pauses while POINTS_FREEZE is active. */
export function updateBoss(s: GameState): void {
  const b = s.boss;
  if (!b) return;
  if (!isActive(s, 'POINTS_FREEZE')) b.fightTicks += 1;
  // movement
  const half = idiv(BOSS.width, 2);
  const speed = rageMult(b, BOSS.speed);
  const next = b.x + (b.vx > 0 ? speed : -speed);
  if (next - half < 0 || next + half > FIELD_W) b.vx = -b.vx; else b.x = next;
  // Reefs 6-10: a mechanic that has to keep advancing even through a phase transition —
  // today only the Storm Tyrant's own lanes and discharge window, `sim/bosses/tyrant.ts` — runs here,
  // before the transition check below ever looks at `state`. Undefined for every other kind, so this
  // reads and changes nothing for kinds 1-8 and 10 (see `BossHooks.tickThroughTransition`'s own doc).
  BOSS_HOOKS[b.kind].tickThroughTransition?.(s, b);
  if (b.state === 'transition') {
    b.transitionTicks -= 1;
    if (b.transitionTicks === 0) {
      b.phase += 1;
      b.state = 'fighting';
      s.events.push({ tick: s.tick, type: 'boss_phase' });
      // The new phase begins here. Undefined for kinds 1-5, so their transition is untouched.
      BOSS_HOOKS[b.kind].onPhaseStart?.(s, b);
    }
    return;
  }
  const hooks = BOSS_HOOKS[b.kind];
  b.attackTimer -= 1;
  if (b.attackTimer <= 0) { hooks.attack(s, b); b.attackTimer = mirrorDelay(b, rageDelay(b, attackDelay(s, b.phase))); }
  if (hooks.secondary) { b.secondaryTimer -= 1; if (b.secondaryTimer <= 0) { hooks.secondary(s, b); b.secondaryTimer = secondaryDelay(s); } }
  b.abilityTimer -= 1;
  if (b.abilityTimer <= 0) { hooks.ability(s, b); b.abilityTimer = hooks.nextAbilityTimer(s.rngBoss); }
  runPending(s, b, hooks);
  hooks.tick?.(s, b);
  // `destroyedObstacles` (`sim/obstacles.ts`) is a channel a
  // boss's own `tick` hook may drain (today, only the Frost Castellan's does, for his shard burst);
  // whatever a tick call above left in it — whether that boss has no `tick` hook at all, or has one
  // that has nothing to do with obstacles (Emerald's regen cooldown, say) — is swept here so the
  // list never grows unbounded in a fight that isn't the Castellan's own. Unreached while
  // `state === 'transition'` (the early `return` above), which is the whole fix: an obstacle
  // destroyed mid-transition survives in the list until the boss's own `tick` gets a real chance to
  // drain it, on the first tick fighting resumes, rather than being wiped every tick regardless. A
  // no-op for kinds 1-5 (never populated) and for the Castellan's own fight (its `tick` already
  // emptied the list above, so this reassigns `[]` to `[]`).
  s.destroyedObstacles = [];
}

/**
 * Deals `amount` damage to the boss (unless a shield absorbs it), handling phase transitions and
 * death. `shot` is the player bullet that hit the boss box, forwarded to `hooks.onHit` so a boss
 * whose shield reacts to *where* a shot landed (the Gold Corsair's Spikes) can read it;
 * every other boss's `onHit` ignores the extra argument, and every call site outside `collide.ts`'s
 * own `hitCrabs` (mostly tests, forcing damage by hand) omits it, which is exactly why it is optional.
 */
export function damageBoss(s: GameState, amount: number, shot?: Bullet): void {
  const b = s.boss;
  if (!b || b.state === 'transition') return;
  const hooks = BOSS_HOOKS[b.kind];
  if (hooks.onHit?.(s, b, shot)) return; // shield absorbed it (or, kind 8, reflected it)
  b.hp = Math.max(0, b.hp - dischargeMult(b, amount));
  if (b.hp === 0) {
    const decayed = 100 - Math.floor(b.fightTicks / BOSS.decayEvery);
    s.score += scoreMultiplier(s, idiv(bossStats(b.kind).score * Math.max(1, decayed), 100));
    s.boss = null;
    // With the boss gone, `updateBoss` will never run its own
    // sweep of `destroyedObstacles` again (it returns immediately for `s.boss === null`), so
    // whatever a destruction this very tick left pending is cleared here instead.
    s.destroyedObstacles = [];
    // The rest of the arena goes with the boss too, so the last frame
    // under the level-cleared overlay carries no lightning band, sight line, crystal or chill —
    // nothing a boss-6..10 fight can leave behind survives its own death.
    s.lanes = [];
    s.aims = [];
    s.obstacles = [];
    s.chillTicks = 0;
    s.events.push({ tick: s.tick, type: 'boss_dead' });
    // Whatever the escort has left goes with its boss, without score — but not
    // synchronously. `popSquads` itself runs once,
    // at the end of the tick, from `step.ts`: calling it here, mid-`hitCrabs`'s own loop over
    // `s.shots`, could remove a squad crab before a *later* shot in the same tick's array had its own
    // chance to land the wipe on it — silently losing a Corsair crew's loot purely because of shot
    // order. See `step.ts`'s own call site for how the deferred pop is detected.
    if (s.run.level) { s.cleared = true; s.events.push({ tick: s.tick, type: 'level_cleared' }); }
    return;
  }
  if (b.phase < b.maxPhases && b.hp <= idiv(b.maxHp * (b.maxPhases - b.phase), b.maxPhases)) {
    b.state = 'transition';
    b.transitionTicks = BOSS.transitionTicks;
    // The fight pauses. Undefined for kinds 1-5, so their transition is untouched.
    hooks.onTransition?.(s, b);
  }
}
