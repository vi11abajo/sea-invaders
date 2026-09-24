import { BOSS, CRAB, CRAB_TYPES, ENEMY_SHOT, OCTOPI, SHOT, invulnTicksFor, surgeEveryFor } from '../config';
import { clamp, idiv } from '../fixed';
import type { Bullet, Crab, GameState, Squad } from '../types';
import { isActive, rollDrop, scoreDecayPct, spawnDrop } from './boosts';
import { ORB_RADIUS, damageBoss, scoreMultiplier } from './boss';
import { BUBBLE_RADIUS, CHARGE_RADIUS, enrage, shieldAbsorbs } from './veterans';

/**
 * Kills a crab outright: rolls its drop, scores its points (wave-scaled, scaled by the wave-mode
 * score-decay percentage, then doubled by SCORE_MULTIPLIER), and counts the kill. Shared
 * by `hitCrabs` (a lethal bullet hit) and WAVE_BLAST (`boostEffects.ts`) so the two paths
 * can never disagree on scoring. The caller removes `c` from `s.crabs` itself (a splice by index in
 * `hitCrabs`, a filter in WAVE_BLAST).
 *
 * The wave multiplier has a floor of 1 (a squad crab "scores normally"): a boss level
 * spawns no wave at all, so `s.wave` is 0 on the one round squad crabs are ever shot down in, and
 * without the floor every one of them would be worth nothing. It changes no other path — a crab
 * only ever exists on a round that has a wave number of at least 1.
 */
export function killCrab(s: GameState, c: Crab): void {
  rollDrop(s, c.x, c.y);
  const base = CRAB_TYPES[c.type].points * Math.max(1, s.wave);
  s.score += scoreMultiplier(s, idiv(base * scoreDecayPct(s), 100));
  s.kills += 1;
  // Coraluna counts every kill towards its next Surge, the crabs a
  // WAVE_BLAST or a Surge itself sweeps away included, and `surgeIfDue` (`boostEffects.ts`) spends
  // them; no other variant ever moves this counter.
  if (surgeEveryFor(s.run.octopi) > 0) s.surgeKills += 1;
  enrage(s, c); // a dying patriarch enrages what is left of its formation
  countDownSquad(s, c); // kind 8 only: a wiped boarding crew loots
}

/**
 * Decrements `c`'s own squad's `alive` count — every squad crab
 * kill counts down, through every path that reaches `killCrab` (a direct bullet hit via `hitCrabs`
 * below, WAVE_BLAST's own kill loop in `boostEffects.ts`, and later the Storm Tyrant's lane strike),
 * regardless of which boss the squad belongs to. This replaced a live scan of `s.crabs` for a
 * same-squad survivor: that scan is unreliable whenever more than one squad crab dies
 * in the same pass before any of them is actually removed from `s.crabs` — WAVE_BLAST computes its
 * whole kill list against the *original* `s.crabs` and only removes them in one batch afterwards
 * (`applyWaveBlast`, `sim/boostEffects.ts`), so every kill in that batch, including the crew's true
 * last one, would still find its doomed-but-not-yet-removed crew-mates sitting in `s.crabs` and never
 * detect the wipe at all. Counting `alive` down needs no `s.crabs` snapshot to agree with, so it is
 * correct regardless of how (or how late) the caller batches its own removals.
 *
 * A no-op for `c.squad <= 0` (every wave crab, and every crab of the first campaign) or a squad id
 * `s.squads` no longer lists (already popped this tick — see `popSquads`'s own new call site in
 * `step.ts`, and its doc for why a squad crab removed *there* never reaches `killCrab`, and so never
 * reaches this function, at all).
 *
 * Only the Gold Corsair's own crews loot on a wipe (kind 8): `lootCrewIfWiped` below reads
 * the freshly updated count and the squad's own recorded `bossKind` (not the *live* `s.boss?.kind` —
 * see `Squad.bossKind`'s own doc, `types.ts`, for why: a squad can outlive its own boss by up to one
 * tick, so `s.boss` may already be `null` by the time a later shot in the same tick lands the crew's
 * true last kill), so the Verdant Templar's own `line4` escort (or any other boss's future squad)
 * counts down to 0 exactly the same way and simply has nothing that reacts to it.
 */
function countDownSquad(s: GameState, c: Crab): void {
  if (c.squad <= 0) return;
  const q = s.squads.find((sq) => sq.id === c.squad);
  if (!q) return;
  if (q.alive > 0) q.alive -= 1;
  lootCrewIfWiped(s, c, q);
}

/**
 * Gold Corsair only (kind 8): a boarding crew the player wipes out — every one of its
 * crabs dead — drops one guaranteed boost at the last crab's own position, `crew_looted`. Sim-state
 * only (no reading of `s.events`): `q` is `countDownSquad`'s own squad object, already
 * carrying its freshly decremented `alive` — nothing has to survive to a later tick.
 *
 * A no-op while `q.alive > 0` (the crew still has a survivor) or `q.bossKind !== 8` (raised by a boss
 * other than the Corsair — kinds 1-7, 9, 10 — or, defensively, no boss at all) — so this changes
 * nothing for the Verdant Templar's own escort, or for any other fight. A crew popped whole at the
 * Corsair's own death does not loot: `popSquads` (`sim/squads.ts`, now called once at
 * the end of the tick from `step.ts`) removes every squad crab from
 * `s.crabs` with one filter, never through `killCrab`, so neither this function nor `countDownSquad`
 * above is ever reached for that removal at all.
 */
function lootCrewIfWiped(s: GameState, c: Crab, q: Squad): void {
  if (q.alive > 0 || q.bossKind !== 8) return;
  spawnDrop(s, c.x, c.y);
  s.events.push({ tick: s.tick, type: 'crew_looted' });
}

const CRAB_HALF = idiv(CRAB.size, 2);
const BOSS_HALF_W = idiv(BOSS.width, 2);
const BOSS_HALF_H = idiv(BOSS.height, 2);

/**
 * Enemy shot collision radius by kind: `large` is ×2, `ring` widens by its own `data`,
 * `fragment`/`meteor`/`heavy`/`bubble`/`charge` and the reefs 6-10 `axe`/`bolt`/`orb`/`needle` are
 * fixed sizes, everything else — `firewall` and `shard` among them — is the base radius.
 */
export function shotRadius(b: Bullet): number {
  if (b.kind === 'large') return ENEMY_SHOT.radius * 2;
  if (b.kind === 'ring') return ENEMY_SHOT.radius + b.data;
  if (b.kind === 'fragment') return 48;
  if (b.kind === 'meteor') return 173;
  if (b.kind === 'heavy') return 154; // the red crab's shot: ENEMY_SHOT.radius * 1.6
  if (b.kind === 'bubble') return BUBBLE_RADIUS; // the bubbler's drifting bubble
  if (b.kind === 'charge') return CHARGE_RADIUS; // the bombardier's charge
  if (b.kind === 'axe') return 140; // the Corsair's boomerang
  if (b.kind === 'bolt') return 80; // the Tyrant's fork, thin and fast
  if (b.kind === 'orb') return ORB_RADIUS; // the Tyrant's homing orb
  if (b.kind === 'needle') return 70; // the Huntsman's needle, the thinnest of them all
  return ENEMY_SHOT.radius;
}

/**
 * Lives one enemy shot costs when it lands: the red crab's `heavy` shot and the
 * bombardier's `charge` hit for two, everything else — every other crab shot, the charge's own
 * fragments, every boss shot and all six of the reefs 6-10 kinds — for one. SHIELD_BARRIER still
 * absorbs the whole hit, however hard.
 */
export function shotDamage(b: Bullet): 1 | 2 {
  return b.kind === 'heavy' || b.kind === 'charge' ? 2 : 1;
}

/**
 * Each player shot hits the first crab it overlaps, or damages the boss box; a kill (hp reaches 0)
 * scores the type's points × wave (doubled by SCORE_MULTIPLIER). A shielded warden eats a
 * non-piercing hit whole instead: no hit points lost, the shot consumed, the shield down for a
 * while. A PIERCING_BULLETS shot
 * (`data & 1`) is never consumed by a crab hit — killing or not — so it keeps flying; the boss
 * branch still consumes it. The rule is "one hit per crab per shot": a piercing shot that damages
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
        damageBoss(s, 1, b); // `b` is the player shot; the Gold Corsair's Spikes reads its x
        continue;
      }
      kept.push(b);
      continue;
    }
    const c = s.crabs[i]!;
    if (shieldAbsorbs(s, c, b)) continue; // a warden's rune shield eats a non-piercing shot
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
 * Whether Octopi can be hit at all right now: not already under its post-hit invulnerability window,
 * the run not already over, and INVINCIBILITY not active. The one guard `hitOctopi`'s own shot/crab/
 * boss matching and `damageOctopiDirect`'s direct hit (the Storm
 * Tyrant's lane strike, `sim/bosses/tyrant.ts`) both check before doing anything else, factored out so
 * the two can never drift apart.
 */
function octopiVulnerable(s: GameState): boolean {
  if (s.octopi.invuln > 0 || s.over) return false;
  return !isActive(s, 'INVINCIBILITY');
}

/**
 * Enemy shots, crab bodies and the boss box hurt Octopi unless it is invulnerable. A crab that
 * touches Octopi dies without score. INVINCIBILITY ignores every hit outright (no life loss, no
 * shield use, no crab removal). Otherwise SHIELD_BARRIER absorbs a hit (see `applyOctopiHit`) before
 * any life is lost.
 */
export function hitOctopi(s: GameState): void {
  if (!octopiVulnerable(s)) return;
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
      enrage(s, c); // a patriarch that reaches Octopi enrages its formation all the same
      countDownSquad(s, c); // a squad crab that walks into Octopi still counts down its squad's alive
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
 * (one charge, however hard the shot), otherwise that many lives are lost.
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
 * Costs Octopi one life exactly as an enemy shot landing on it would (the Storm Tyrant's
 * lane strike, `sim/bosses/tyrant.ts`): the same `octopiVulnerable` guard `hitOctopi` checks before it
 * ever goes looking for a shot or a crab to land a hit, then the same SHIELD_BARRIER-or-lose-a-life
 * effect every other hit goes through (`applyOctopiHit`). A lane strike is not an entry in
 * `s.enemyShots`, so it cannot go through `hitOctopi`'s own shot-matching loop; this reuses the rest
 * of that damage function with only the matching skipped, not a different one — `hitOctopi` itself is
 * untouched.
 */
export function damageOctopiDirect(s: GameState, damage = 1): void {
  if (!octopiVulnerable(s)) return;
  applyOctopiHit(s, damage);
}

/**
 * Costs Octopi `damage` lives (one by default, two for a red crab's `heavy` shot): lives never go
 * below zero, the run ends when they reach it, and however many lives the hit took it is still one
 * hit — one invulnerability window, one clearing of the enemy shots, one `player_hit` event. The
 * window is the variant's own (`invulnTicksFor`: noob's Thick skin lasts 180 ticks, everyone else's
 * `OCTOPI.invulnTicks`).
 */
export function loseLife(s: GameState, damage = 1): void {
  s.octopi.lives = Math.max(0, s.octopi.lives - damage);
  s.octopi.invuln = invulnTicksFor(s.run.octopi);
  s.enemyShots = [];
  s.events.push({ tick: s.tick, type: 'player_hit' });
  if (s.octopi.lives <= 0) s.over = true;
}
