import type { Bullet, GameState, Obstacle, ObstacleKind } from '../types';

/**
 * The arena objects: boxes a boss raises on the field that eat shots from both sides.
 * The Frost Castellan's crystals are the only kind so far; he raises them and shatters
 * them on cue, and reacts to one being destroyed by draining `GameState.destroyedObstacles` below.
 *
 * The rule is deliberately blunt and symmetric: **any** shot whose centre enters the box is
 * consumed, the player's and the boss's alike, a piercing shot included — a crystal is a wall, not
 * a crab, and nothing flies through it. Only a player's shot costs the box a hit point.
 *
 * `hitObstacle` runs once per tick from `step`, after both sides' shots have moved (`updateEnemyShots`
 * and the gravity pull are done) but **before** `updateBoss`:
 * moved earlier specifically so a boss's own `tick` hook can react to a destruction it caused this
 * very tick, with no delay. A shot the boss casts this same tick (from `updateBoss`, which now runs
 * after this) is therefore not checked against an obstacle until the next tick — unobservable for
 * the Castellan today, since every shot he casts starts at his own muzzle, far from y 3600 where his
 * crystals stand. This still runs before any hit is scored (`popBubbles`, `hitOrbs`, `hitCrabs`,
 * `hitOctopi`), which is what lets a crystal really shield what stands behind it: a player shot is
 * stopped before it can reach a bubble, an orb, a crab or the boss box, and a boss shot before it
 * can reach Octopi.
 *
 * Player shots are walked first and enemy shots second, so a crystal the player shatters this tick
 * no longer stops the enemy fire behind it on the same tick.
 *
 * Every obstacle this removes is reported two ways: the `obstacle_destroyed` event (`s.events` is a
 * write-only outbox for the renderer — this keeps working exactly as before, unconditionally, for
 * whatever the app wants to do with it) and a `{x, y}` entry appended to
 * `GameState.destroyedObstacles` (the sim-internal channel a boss's own hooks may read back from,
 * since reading `s.events` back is not allowed). `updateBoss` (`sim/boss.ts`)
 * sweeps the second list right after `hooks.tick` runs, but not while the boss sits in
 * `state === 'transition'` (a destruction mid-transition survives
 * until fighting resumes rather than being wiped early), and `damageBoss` sweeps it once more at the
 * boss's own death, so a boss that never drains it (or a fight with none at all) can never accumulate
 * stale entries.
 */

/** Raises an obstacle of `kind` centred on `x`, `y`, `w` by `h` units, with `hp` player hits in it. */
export function raiseObstacle(
  s: GameState, kind: ObstacleKind, x: number, y: number, w: number, h: number, hp: number,
): void {
  s.obstacles.push({ x, y, w, h, hp, kind });
}

/** Whether the point `(x, y)` is inside `o`'s box, edges counted as inside. */
function inside(o: Obstacle, x: number, y: number): boolean {
  return Math.abs(x - o.x) * 2 <= o.w && Math.abs(y - o.y) * 2 <= o.h;
}

/** The first obstacle `b`'s centre stands in, or -1. */
function obstacleAt(s: GameState, b: Bullet): number {
  for (let i = 0; i < s.obstacles.length; i++) if (inside(s.obstacles[i]!, b.x, b.y)) return i;
  return -1;
}

/**
 * The per-tick obstacle collision. Costs an arena with nothing standing on it a single
 * length check, which is every tick of the first campaign.
 */
export function hitObstacle(s: GameState): void {
  if (s.obstacles.length === 0) return;
  const shots: Bullet[] = [];
  for (const b of s.shots) {
    const i = obstacleAt(s, b);
    if (i < 0) {
      shots.push(b);
      continue;
    }
    // Player fire is what wears a box down; the shot itself is spent either way, piercing or not.
    const o = s.obstacles[i]!;
    o.hp -= 1;
    if (o.hp <= 0) {
      s.obstacles.splice(i, 1);
      s.events.push({ tick: s.tick, type: 'obstacle_destroyed', x: o.x, y: o.y });
      s.destroyedObstacles.push({ x: o.x, y: o.y });
    }
  }
  s.shots = shots;
  if (s.obstacles.length === 0) return;
  const enemy: Bullet[] = [];
  for (const b of s.enemyShots) {
    if (obstacleAt(s, b) < 0) enemy.push(b);
  }
  s.enemyShots = enemy;
}
