import { BOOSTS, BOSS, FIELD_W } from '../../config';
import { clamp, idiv } from '../../fixed';
import type { CrabType } from '../../levels';
import type { BossState, BoostType, GameState } from '../../types';
import { castNeedle, muzzle } from '../boss';
import { SQUAD_BAND, spawnSquad } from '../squads';
import type { BossHooks } from './index';

/**
 * Abyssal Huntsman (kind 10, spec §5.2 row 10): the old warden of the Hollow Throne, and the last of
 * reefs 6-10's five. He hunts with the player's own tricks — every boost the player picks up hands
 * him a mirror of it for as long as it would have lasted the player — and he hunts with a needle gun:
 * a sight line fixes on Octopi for a spell, then a needle flies exactly the line it was shown on,
 * never chasing wherever Octopi has moved to since.
 *
 * **The sight line and the needle** (`attack`, `pushAimLine`, `tick`, ruling R28): `attack` records the
 * muzzle-to-Octopi segment as a *real* group in `s.aims` — `[muzzle.x, muzzle.y, octopi.x, octopi.y,
 * 0, ticksLeft]`, `decoy = 0` — via `pushAimLine`, which raises `boss_aim` for it (ruling R51, fix
 * round 1: for *every* line pushed, the 40-tick opener and each 12-tick re-aim alike, not just the
 * opener — the app cues the needle telegraph off it each time). The ordinary `tick` hook (which only
 * ever runs while the boss is fighting, never mid-transition) counts every group in `s.aims` down
 * together with `b.aimX`/`b.aimTicks`, exactly as the Verdant Templar's own `windup`/Frost Castellan's
 * own `aimTicks` already count down in their own `tick` hooks — a value set by `attack` is not spared
 * its first decrement on the very tick it starts (the same convention `templar.ts`'s own file doc
 * names for its wind-up). When the real group's own `ticksLeft` reaches 0 the needle flies exactly the
 * segment it was drawn with — Octopi moving after the aim was fixed changes nothing, because nothing
 * about the needle's course is read again — and the group (with any decoys sharing its `ticksLeft`)
 * is dropped outright: `s.aims` holds live lines only, never one sitting at 0.
 *
 * Phase 1 is one line, one needle: `b.burst` — this boss's own use of the field every reefs-6-10 boss
 * shares as scratch storage (`types.ts`'s own comment lists every claimant) — is set to 1 at the
 * attack and decremented to 0 the moment that needle fires, so no re-aim follows. From phase 2 on, a
 * "burst of three" (spec §5.2) sets `b.burst = 3`: firing a needle decrements it, and while it is
 * still above 0 a fresh 12-tick real group is drawn at once, to Octopi's position *at that tick* —
 * "each re-aimed" (spec) — so the rhythm the task brief spells out is line 40 → needle → line 12 →
 * needle → line 12 → needle, three needles twelve ticks apart, each line exactly what its own needle
 * flies. `attackDelay` for the *next* attack cycle is drawn by the shared `updateBoss` right after
 * `attack` returns, exactly as for every boss — it is simply irrelevant until the whole burst above
 * has run its course (ruling R34, below).
 *
 * **One hunt at a time** (ruling R34): phase 4's own `attackDelay` can run as short as 48 ticks
 * (`BOSS.attackBase` × 2/5, no jitter) and an offence mirror halves whatever it draws, so `attack`
 * can be asked to fire again while a line or burst from the *previous* call is still live. It refuses
 * outright — no draw, no new line, no `boss_clone`/`boss_aim` — the instant `b.aimTicks > 0`, which is
 * true for exactly as long as any line (the 40-tick opener or a 12-tick re-aim) is still counting
 * down, burst or no burst: the hunter finishes what he started, and the timer `updateBoss` redraws
 * regardless simply waits its turn.
 *
 * **Decoys** (`pushAimLine`, phase 3+, ruling R29): two mirror copies of the real line, at `leftX`/
 * `rightX` about the boss's own x — Void Sovereign's own `castClone` formula (`bosses/void.ts`),
 * copied here rather than imported (each boss module of reefs 6-10 stands alone; importing across
 * them would only wire in a needless coupling for four lines of arithmetic). `boss_clone` itself is
 * raised once per `attack` call, not once per line drawn — the same "one event per activation" the
 * Storm Tyrant's own `lane_warning` already keeps for its own multi-item firings — but a decoy pair
 * is pushed alongside *every* real group, the 40-tick opener and each 12-tick re-aim alike, each time
 * freshly mirrored about the boss's current x (it can have walked a little between them). `attack`
 * computes `mirrorXs(b)` once, for the `boss_clone` event, and hands that same pair into `pushAimLine`
 * for the opener's own decoys (fix round 1, minor #4 — the two would otherwise read identical values
 * off the same untouched `b.x` twice in one call); a re-aim from `tick` below has no such event to
 * share the value with, so it calls `pushAimLine` with no pair and lets it compute a fresh one there,
 * off whatever `b.x` the boss has walked to by then. A decoy's far point is the real line's own far
 * point shifted by the same offset as its own near point — `toX + (leftX − b.x)`, clamped inside the
 * field — so its line is a parallel copy of the real one, never its own independent aim; it carries
 * `decoy = 1`, counts down exactly alongside the real group, and fires nothing when it reaches 0 —
 * `tick` below only ever calls `castNeedle` for the one group whose `decoy` is 0.
 *
 * **The honour guard** (`onPhaseStart`, phase 4 only, ruling R30, direction fixed by ruling R50 —
 * fix round 1): one `guard5` squad, one veteran of each of reef 10's own five kinds (`HUNTSMAN_GUARD`,
 * tiers 0-4 — a five-kind roster maps tier for tier, spec §1's own row for reef 10), in the squad band
 * alongside every other boss's own escort (`SQUAD_BAND`, `sim/bosses/tyrant.ts`'s own escort). Gated
 * on the same cap every escort obeys (rulings R15/R24): skipped outright, no retry later, once 4 or
 * more squad crabs already live. The direction is a fixed 1 (marching right), no draw at all — the
 * Verdant Templar's own `line4` warden escort uses the same fixed direction (`bosses/templar.ts`'s
 * own `raiseWardenLine`); an earlier draft of this file drew `nextInt(2)` for it, but the controller's
 * ruling (fix round 1) settled it as fixed, since this squad only ever raises once in a fight (there
 * is only one phase 4) and there is no second firing for a direction to vary against.
 *
 * **Mirror** (`onBoostPickup`, `tickThroughTransition`, `onHit`, rulings R25-R27): the one mechanic of
 * this boss that is not driven by his own timers at all — see `ability`'s own doc below for why. Every
 * one of the fifteen `BoostType`s falls into exactly one of three classes (spec §5.2), read off
 * `MIRROR_CLASS`:
 *
 * - **Offence** (RAPID_FIRE, MULTI_SHOT, PIERCING_BULLETS, AUTO_TARGET, SCORE_MULTIPLIER): the
 *   *running* `b.attackTimer` is halved the instant the pickup lands (`idiv(b.attackTimer, 2)`), and
 *   every attack delay `updateBoss` draws while the mirror is still up is halved too —
 *   `sim/boss.ts`'s own `mirrorDelay`, a kind-10-gated helper applied at the one line that redraws
 *   `attackTimer` after an attack, the same idiom `rageDelay`/`dischargeMult` already use for
 *   Crimson/Tyrant.
 * - **Defence** (SHIELD_BARRIER, INVINCIBILITY, HEALTH_BOOST): `b.shieldHp` is set (refilled, not
 *   added to) to 40 and a `boss_ability`/`'shield'` announces it — Azure's own naming for a shield
 *   just granted (`bosses/azure.ts`) — and `onHit` below absorbs one hit per point of it, raising
 *   `boss_block` per hit exactly as the Verdant Templar's own closed guard does (`bosses/templar.ts`).
 *   Player shots deal 1 damage to a boss box (`collide.ts`), so 40 points is 40 hits absorbed whole,
 *   no damage leaking through any of them.
 * - **Control** (ICE_FREEZE, SPEED_TAMER, GRAVITY_WELL, WAVE_BLAST, POINTS_FREEZE): every needle fired
 *   while it is up flies at ×1.25 — `castNeedle`'s own `mult1000` argument (default 1000, this boss's
 *   own `tick` passes 1250), the same scaling idiom `castStraight`/`castRing` already take.
 * - **Neither** (COIN_SHOWER, RANDOM_CHAOS): mirrors nothing at all — a boost RANDOM_CHAOS itself
 *   rolls is not a pickup of its own (spec §5.2), which is exactly why `sim/boosts.ts`'s own call site
 *   hands this hook the drop's *own* `type` rather than whatever `activateBoost` resolved it to.
 *
 * A pickup of any mirrored class (re)sets `b.mirror[class]` to that boost's own `BOOSTS[type].duration`
 * — refreshed, not stacked, exactly like the player's own active-boost timers — or 300 ticks where
 * that duration is 0 or −1 (HEALTH_BOOST, WAVE_BLAST: instant; SHIELD_BARRIER, SPEED_TAMER: until
 * broken/permanent — none of which name a mirror-able duration of their own). All three of
 * `b.mirror`'s entries count down every tick the boss exists, including through a phase transition —
 * the player's own boost keeps running through one, so its mirror must too — which is exactly why
 * that decrement lives in `tickThroughTransition` (called by `updateBoss` before it ever checks
 * `state`) rather than the ordinary `tick` (which a transition freezes outright). The defence mirror's
 * own shield goes with its timer: the tick `b.mirror[1]` reaches 0, `b.shieldHp` is zeroed alongside
 * it, whatever is left of the 40.
 *
 * **The Mirror is not a timed ability** (`ability`, ruling R31): every other boss's `ability` fires on
 * its own `abilityTimer`/`nextAbilityTimer` cadence; this one is entirely event-driven (a pickup, not
 * a clock), so `ability` itself is a no-op and both timers return a large fixed value — 100000 ticks,
 * well over a fight's own length — *without* drawing from `rngBoss` at all: there is nothing here for
 * a draw to decide, and a boss that never truly reaches 0 on this timer in real play would only ever
 * cost the stream a phantom draw for no mechanic to use.
 *
 * **A phase turn drops the aim, never the mirror** (`onTransition`, ruling R33): `s.aims = []`,
 * `b.aimTicks = 0`, `b.burst = 0` — a sight line or a burst interrupted by the turn is simply lost,
 * nothing fires from it. The mirror timers are untouched here: they run through the turn regardless,
 * in `tickThroughTransition` above.
 *
 * **The RNG draw order**, every draw `rngBoss`, fixed:
 *
 * 1. Spawn (`spawnBoss`, generic for every boss): facing (`nextInt(2)`), `attackDelay(s, 1)`'s own
 *    jitter (`nextInt(BOSS.attackJitter)`). `initialAbilityTimer` draws nothing at all (ruling R31).
 * 2. Every tick, `tickThroughTransition` draws nothing — the three mirror counters are plain
 *    arithmetic.
 * 3. Only while fighting: if the attack timer reaches 0, `attack` itself draws nothing at all — the
 *    sight line, the burst count and the decoy geometry are all deterministic reads of `s.octopi`/
 *    `b.x` — then the unconditional `attackDelay` jitter redraw every boss gets
 *    (`nextInt(BOSS.attackJitter)`), further shrunk by `mirrorDelay`/`rageDelay` (arithmetic only, no
 *    draw of their own).
 * 4. The ability timer never reaches 0 in real play (100000 ticks); if a test forces it to, `ability`
 *    draws nothing and `nextAbilityTimer` draws nothing (ruling R31).
 * 5. `runPending` (no `cast`/`pending` for this boss) and the ordinary `tick` hook (the sight-line/
 *    needle bookkeeping above) draw nothing at all.
 * 6. `onPhaseStart`, phase 4 only: draws nothing — the honour guard's direction is a fixed 1, no draw
 *    at all (ruling R50, fix round 1); `spawnSquad` itself draws nothing either.
 * 7. `onBoostPickup`/`onHit`/`onTransition` all draw nothing — pure lookups and arithmetic.
 *
 * So a Huntsman fight draws only two numbers from `rngBoss` in its entire course beyond the ordinary
 * per-attack jitter: the spawn-time facing and jitter, and nothing else, ever. `boss-huntsman.test.ts`
 * pins this.
 */

/** One of the three classes every mirrorable `BoostType` falls into (spec §5.2); `undefined` for the two that mirror nothing at all (COIN_SHOWER, RANDOM_CHAOS). */
const OFFENCE = 0;
const DEFENCE = 1;
const CONTROL = 2;

/** Every `BoostType` mapped to its mirror class (spec §5.2). All fifteen are listed; the two left out of every branch (COIN_SHOWER, RANDOM_CHAOS) fall through `mirrorClass` to `undefined`. */
const MIRROR_CLASS: Partial<Record<BoostType, 0 | 1 | 2>> = {
  RAPID_FIRE: OFFENCE, MULTI_SHOT: OFFENCE, PIERCING_BULLETS: OFFENCE, AUTO_TARGET: OFFENCE, SCORE_MULTIPLIER: OFFENCE,
  SHIELD_BARRIER: DEFENCE, INVINCIBILITY: DEFENCE, HEALTH_BOOST: DEFENCE,
  ICE_FREEZE: CONTROL, SPEED_TAMER: CONTROL, GRAVITY_WELL: CONTROL, WAVE_BLAST: CONTROL, POINTS_FREEZE: CONTROL,
};

/** `type`'s mirror class, or `undefined` for the two that mirror nothing (COIN_SHOWER, RANDOM_CHAOS). */
function mirrorClass(type: BoostType): 0 | 1 | 2 | undefined {
  return MIRROR_CLASS[type];
}

/** How many ticks a pickup of `type` mirrors for: its own table duration, or 300 where that is 0 or −1 (ruling R26). Never read for a `type` with no mirror class. */
function mirrorTicks(type: BoostType): number {
  const duration = BOOSTS[type].duration;
  return duration <= 0 ? 300 : duration;
}

/** Points a shield the defence mirror grants absorbs before it is spent (spec §5.2: 40 player shots, at 1 damage each). */
const HUNTSMAN_SHIELD_HP = 40;

/** How much faster a needle flies while the control mirror is up (spec §5.2: ×1.25, `castNeedle`'s own `mult1000`). */
const HUNTSMAN_CONTROL_MULT = 1250;

/** Needles a burst still owes once it starts: one in phase 1, three from phase 2 on (spec §5.2). */
function burstSize(phase: number): number {
  return phase >= 2 ? 3 : 1;
}

/** Ticks a sight line shows before it fires: 40 for the opener, 12 for every burst re-aim (spec §5.2). */
const HUNTSMAN_LINE_OPEN = 40;
const HUNTSMAN_LINE_REAIM = 12;

/** The two mirror x's a decoy pair stands at, about the boss's own x (spec §5.2, ruling R29) — Void Sovereign's own `castClone` formula (`bosses/void.ts`), copied rather than imported (see the file doc). */
function mirrorXs(b: BossState): { leftX: number; rightX: number } {
  const half = idiv(BOSS.width, 2);
  return { leftX: Math.max(half, b.x - 1200), rightX: Math.min(FIELD_W - half, b.x + 1200) };
}

/**
 * Pushes one real sight-line group `[fromX, fromY, octopi.x, octopi.y, 0, ticksLeft]` onto `s.aims`,
 * records it in `b.aimX`/`b.aimTicks`, raises `boss_aim` for it (ruling R51, fix round 1: every line,
 * not just the opener), and — from phase 3 on (ruling R29) — a parallel decoy pair alongside it, each
 * a copy of the real line shifted by its own mirror offset and clamped inside the field. Used both for
 * the 40-tick opener and every 12-tick burst re-aim. `mirror` lets a caller that already computed
 * `mirrorXs(b)` for its own purpose (`attack`, for the `boss_clone` event) hand the same pair in rather
 * than have this recompute an identical one off the same untouched `b.x` (fix round 1, minor #4); a
 * re-aim from `tick` below has no such value to share and simply omits it, so this computes its own,
 * fresh, off whatever `b.x` the boss has walked to by then.
 */
function pushAimLine(
  s: GameState, b: BossState, fromX: number, fromY: number, ticksLeft: number,
  mirror?: { leftX: number; rightX: number },
): void {
  const toX = s.octopi.x;
  const toY = s.octopi.y;
  b.aimX = toX;
  b.aimTicks = ticksLeft;
  s.aims.push(fromX, fromY, toX, toY, 0, ticksLeft);
  s.events.push({ tick: s.tick, type: 'boss_aim' });
  if (b.phase < 3) return;
  const { leftX, rightX } = mirror ?? mirrorXs(b);
  const leftToX = clamp(toX + (leftX - b.x), 0, FIELD_W);
  const rightToX = clamp(toX + (rightX - b.x), 0, FIELD_W);
  s.aims.push(leftX, fromY, leftToX, toY, 1, ticksLeft);
  s.aims.push(rightX, fromY, rightToX, toY, 1, ticksLeft);
}

/** Squad crabs alive right now, summed across every squad — the cap every escort obeys (rulings R15/R24). */
function liveSquadCrabs(s: GameState): number {
  let total = 0;
  for (const q of s.squads) total += q.alive;
  return total;
}

/** Squad crabs alive at which the honour guard is skipped outright, no retry later (rulings R15/R24). */
export const HUNTSMAN_GUARD_CAP = 4;

/**
 * The honour guard's roster (spec §1's own row for reef 10): one veteran of each kind, tiers 0-4. A
 * five-kind roster maps tier for tier (`kindForTier`, `levels.ts`), so `guard5`'s template (`'01234'`)
 * fields exactly this one of each.
 */
export const HUNTSMAN_GUARD: readonly CrabType[] = ['elder', 'warden', 'herald', 'bombardier', 'patriarch'];

/** The Mirror's own "ability" timer (ruling R31): fixed, far past any real fight's length, so this boss's ability slot never truly fires — see the file doc for why no draw backs it. */
const HUNTSMAN_ABILITY_TIMER = 100_000;

export const HUNTSMAN_HOOKS: BossHooks = {
  attack(s, b) {
    // Ruling R34: a line or burst from a previous attack is still live. No draw, no new line.
    if (b.aimTicks > 0) return;
    b.burst = burstSize(b.phase);
    // Computed once (fix round 1, minor #4) and handed to `pushAimLine` below, which would otherwise
    // read an identical pair off the same untouched `b.x` a second time this same call.
    const mirror = b.phase >= 3 ? mirrorXs(b) : undefined;
    if (mirror) s.events.push({ tick: s.tick, type: 'boss_clone', leftX: mirror.leftX, rightX: mirror.rightX });
    const m = muzzle(b);
    pushAimLine(s, b, m.x, m.y, HUNTSMAN_LINE_OPEN, mirror);
  },
  ability() {
    // Event-driven, not timed (ruling R31): see `onBoostPickup` below and the file doc.
  },
  initialAbilityTimer: () => HUNTSMAN_ABILITY_TIMER,
  nextAbilityTimer: () => HUNTSMAN_ABILITY_TIMER,
  onHit(s, b) {
    // The defence mirror's shield (ruling R27): absorbs one hit per point, the Verdant Templar's own
    // closed-guard naming (`boss_block`) for each one, no damage leaking through any of them.
    if (b.shieldHp <= 0) return false;
    b.shieldHp -= 1;
    s.events.push({ tick: s.tick, type: 'boss_block' });
    return true;
  },
  onBoostPickup(s, b, type) {
    const cls = mirrorClass(type);
    if (cls === undefined) return; // COIN_SHOWER, RANDOM_CHAOS: mirror nothing (spec §5.2)
    b.mirror[cls] = mirrorTicks(type);
    if (cls === OFFENCE) {
      b.attackTimer = idiv(b.attackTimer, 2);
    } else if (cls === DEFENCE) {
      b.shieldHp = HUNTSMAN_SHIELD_HP;
      s.events.push({ tick: s.tick, type: 'boss_ability', name: 'shield' });
    }
  },
  tickThroughTransition(_s, b) {
    // The mirror timers run through a transition (ruling R26): the player's own boost keeps counting
    // down through one, so its mirror must too. The defence shield goes with its own timer.
    for (let i = 0; i < 3; i++) {
      if (b.mirror[i]! <= 0) continue;
      b.mirror[i]! -= 1;
      if (i === DEFENCE && b.mirror[i] === 0) b.shieldHp = 0;
    }
  },
  onTransition(s, b) {
    // Ruling R33: a line or burst the turn interrupts is simply lost, nothing fires from it. The
    // mirror timers are untouched — they live in `tickThroughTransition` above, which runs regardless.
    s.aims = [];
    b.aimTicks = 0;
    b.burst = 0;
  },
  onPhaseStart(s, b) {
    if (b.phase !== 4) return;
    if (liveSquadCrabs(s) >= HUNTSMAN_GUARD_CAP) return; // the cap every escort obeys (R15/R24)
    // Fixed direction, no draw at all (ruling R50, fix round 1) — the Verdant Templar's own `line4`
    // warden escort marches the same way.
    spawnSquad(s, 'guard5', HUNTSMAN_GUARD, idiv(FIELD_W, 2), SQUAD_BAND.maxY, 1);
  },
  tick(s, b) {
    if (b.aimTicks <= 0) return;
    b.aimTicks -= 1;
    // Every group in `s.aims` counts down together (ruling R28); the real one's own segment is
    // remembered so the needle can fly it once every group sharing its `ticksLeft` is dropped below.
    let real: [number, number, number, number] | null = null;
    const kept: number[] = [];
    for (let i = 0; i < s.aims.length; i += 6) {
      const ticksLeft = s.aims[i + 5]! - 1;
      if (ticksLeft > 0) {
        kept.push(s.aims[i]!, s.aims[i + 1]!, s.aims[i + 2]!, s.aims[i + 3]!, s.aims[i + 4]!, ticksLeft);
        continue;
      }
      if (s.aims[i + 4] === 0) real = [s.aims[i]!, s.aims[i + 1]!, s.aims[i + 2]!, s.aims[i + 3]!];
    }
    s.aims = kept;
    if (!real) return; // b.aimTicks stays in sync with the real group; defensive only
    const mult1000 = b.mirror[CONTROL]! > 0 ? HUNTSMAN_CONTROL_MULT : 1000;
    castNeedle(s, real[0], real[1], real[2], real[3], mult1000);
    b.burst -= 1;
    if (b.burst > 0) pushAimLine(s, b, muzzle(b).x, muzzle(b).y, HUNTSMAN_LINE_REAIM);
    else b.aimTicks = 0;
  },
};
