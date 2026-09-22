import { describe, expect, it } from 'vitest';
import {
  AXE_FALL_TICKS, AXE_GRAVITY, AXE_VY0, BOLT_SPEED, BOLT_SPREAD, BOSS_SHOT, FIELD_W, FIREWALL_SLOTS,
  NEEDLE_SPEED, ORB_HP, ORB_LIFE, ORB_STEER, ORB_VY, OCTOPI, BOSS, muzzle, FIELD_H, PRACTICE_RUN, SHARD_COUNT, castAxe, castBolt,
  castFirewall, castNeedle, castOrb, castShardRing, createGame, firewallX, hitOrbs, icos, idiv, isin,
  isqrt, orbHp, orbTicks, shotDamage, shotRadius, spawnBoss, updateEnemyShots,
} from '../src';
import type { GameState } from '../src';

function arena(): GameState {
  const s = createGame('boss-shots', { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, 1);
  s.enemyShots = [];
  return s;
}

/** One pass of the shot motion with nothing alive to fire: `s.crabs` is empty, so nothing is added. */
function tickShots(s: GameState): void {
  updateEnemyShots(s);
}

/** The firewall slots no shot of the wall standing in `s` occupies, ascending. */
function freeSlots(s: GameState): number[] {
  const free: number[] = [];
  for (let i = 0; i < FIREWALL_SLOTS; i++) {
    if (!s.enemyShots.some((b) => b.x === firewallX(i))) free.push(i);
  }
  return free;
}

describe('firewall', () => {
  it('lays nine slots evenly across the field', () => {
    expect(FIREWALL_SLOTS).toBe(9);
    const xs = Array.from({ length: FIREWALL_SLOTS }, (_, i) => firewallX(i));
    for (const x of xs) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(FIELD_W);
    }
    const gaps = xs.slice(1).map((x, i) => x - xs[i]!);
    for (const g of gaps) expect(g).toBe(gaps[0]);
  });

  it('spawns seven shots, leaving the gap slot and the one to its right empty', () => {
    const s = arena();
    castFirewall(s, 1000, 3);
    expect(s.enemyShots).toHaveLength(FIREWALL_SLOTS - 2);
    const xs = s.enemyShots.map((b) => b.x);
    expect(xs).not.toContain(firewallX(3));
    expect(xs).not.toContain(firewallX(4));
    expect(xs).toContain(firewallX(2));
    expect(xs).toContain(firewallX(5));
  });

  it('leaves exactly two adjacent slots free for every gap the boss may pick', () => {
    for (let gap = 0; gap <= FIREWALL_SLOTS - 2; gap++) {
      const s = arena();
      castFirewall(s, 1000, gap);
      expect(freeSlots(s)).toEqual([gap, gap + 1]);
    }
  });

  it('still leaves a two-slot doorway when the gap is out of range (ruling R13)', () => {
    // Spec §5.2 draws "the slot nearest rngBoss.nextInt(9)", which yields 8 one time in nine; a
    // doorway one slot wide would be a materially harder wall. The helper's contract is the
    // doorway, not a precondition on the caller.
    for (const gap of [FIREWALL_SLOTS - 1, FIREWALL_SLOTS, 100, -1, -100]) {
      const s = arena();
      castFirewall(s, 1000, gap);
      const free = freeSlots(s);
      expect({ gap, shots: s.enemyShots.length, width: free.length, adjacent: free[1]! - free[0]! })
        .toEqual({ gap, shots: FIREWALL_SLOTS - 2, width: 2, adjacent: 1 });
      expect(free[0]).toBeGreaterThanOrEqual(0);
      expect(free[1]).toBeLessThanOrEqual(FIREWALL_SLOTS - 1);
    }
  });

  it('falls straight down at the boss shot speed', () => {
    const s = arena();
    castFirewall(s, 1000, 0);
    for (const b of s.enemyShots) {
      expect(b).toMatchObject({ vx: 0, vy: BOSS_SHOT.speed, kind: 'firewall', y: 1000 });
      expect(shotRadius(b)).toBe(96);
      expect(shotDamage(b)).toBe(1);
    }
  });
});

describe('shard ring', () => {
  it('bursts into six shots evenly around the circle at 0.9x speed', () => {
    const s = arena();
    castShardRing(s, 2000, 3000);
    expect(s.enemyShots).toHaveLength(SHARD_COUNT);
    const slow = idiv(BOSS_SHOT.speed * 9, 10);
    expect(s.enemyShots[0]).toMatchObject({ x: 2000, y: 3000, vx: slow, vy: 0, kind: 'shard' });
    for (let i = 0; i < SHARD_COUNT; i++) {
      const deg = idiv(i * 360, SHARD_COUNT);
      expect(s.enemyShots[i]!.vx).toBe(idiv(BOSS_SHOT.speed * icos(deg) * 900, 1_000_000));
      expect(s.enemyShots[i]!.vy).toBe(idiv(BOSS_SHOT.speed * isin(deg) * 900, 1_000_000));
    }
    expect(shotRadius(s.enemyShots[0]!)).toBe(96);
    expect(shotDamage(s.enemyShots[0]!)).toBe(1);
  });
});

describe('axe', () => {
  it('leaves the muzzle falling and reaches the target x exactly at the turn', () => {
    const s = arena();
    castAxe(s, 1000, 500, 1000 + 50 * AXE_FALL_TICKS); // 50 a tick keeps the turn inside the field
    const axe = s.enemyShots[0]!;
    expect(axe).toMatchObject({ x: 1000, y: 500, vx: 50, vy: AXE_VY0, kind: 'axe' });
    expect(shotRadius(axe)).toBe(140);
    expect(shotDamage(axe)).toBe(1);
    for (let t = 0; t < AXE_FALL_TICKS; t++) tickShots(s);
    expect(axe.x).toBe(1000 + 50 * AXE_FALL_TICKS);
    expect(axe.vy).toBe(0);
  });

  it('falls, turns and climbs back along the mirrored path', () => {
    const s = arena();
    castAxe(s, 2000, 500, 2000);
    const axe = s.enemyShots[0]!;
    const ys: number[] = [axe.y];
    for (let t = 0; t < AXE_FALL_TICKS * 2; t++) {
      tickShots(s);
      ys.push(axe.y);
    }
    const dy = ys.slice(1).map((y, i) => y - ys[i]!);
    expect(dy[AXE_FALL_TICKS - 1]).toBe(0); // the turn: one tick hanging still
    for (let k = 1; k < AXE_FALL_TICKS; k++) {
      expect(dy[AXE_FALL_TICKS - 1 - k]).toBe(k * AXE_GRAVITY);
      expect(dy[AXE_FALL_TICKS - 1 + k]).toBe(-k * AXE_GRAVITY);
    }
    expect(Math.max(...ys)).toBe(ys[AXE_FALL_TICKS]);
  });

  it('is dropped once it has climbed out through the top', () => {
    const s = arena();
    s.enemyShots.push({ x: 2000, y: -200, vx: 0, vy: -50, kind: 'axe', data: 0 });
    s.enemyShots.push({ x: 2600, y: -200, vx: 0, vy: 50, kind: 'axe', data: 0 });
    tickShots(s);
    expect(s.enemyShots.map((b) => b.x)).toEqual([2600]); // the climbing one is gone
  });
});

describe('bolt', () => {
  it('forks into a fast pair at a fixed spread', () => {
    const s = arena();
    castBolt(s, 2000, 1000);
    expect(BOLT_SPREAD).toBe(12);
    expect(BOLT_SPEED).toBe(idiv(BOSS_SHOT.speed * 15, 10));
    expect(s.enemyShots).toHaveLength(2);
    expect(s.enemyShots[0]).toMatchObject({
      x: 2000, y: 1000, kind: 'bolt',
      vx: idiv(BOLT_SPEED * isin(-BOLT_SPREAD), 1000),
      vy: idiv(BOLT_SPEED * icos(-BOLT_SPREAD), 1000),
    });
    expect(s.enemyShots[1]!.vx).toBe(-s.enemyShots[0]!.vx);
    expect(s.enemyShots[1]!.vy).toBe(s.enemyShots[0]!.vy);
    expect(shotRadius(s.enemyShots[0]!)).toBe(80);
    expect(shotDamage(s.enemyShots[0]!)).toBe(1);
  });
});

describe('orb', () => {
  it('starts with its full life and hit points packed into one int', () => {
    const s = arena();
    castOrb(s, 2000, 1000);
    const orb = s.enemyShots[0]!;
    expect(orb).toMatchObject({ x: 2000, y: 1000, vx: 0, vy: ORB_VY, kind: 'orb' });
    expect(orbTicks(orb)).toBe(ORB_LIFE);
    expect(orbHp(orb)).toBe(ORB_HP);
    expect(shotRadius(orb)).toBe(170);
    expect(shotDamage(orb)).toBe(1);
  });

  it('steers towards Octopi by at most three units a tick and keeps vy', () => {
    const s = arena();
    s.octopi.x = FIELD_W - 500;
    castOrb(s, 500, 1000);
    const orb = s.enemyShots[0]!;
    let last = orb.vx;
    for (let t = 0; t < 20; t++) {
      tickShots(s);
      expect(orb.vx - last).toBeLessThanOrEqual(ORB_STEER);
      expect(orb.vx - last).toBeGreaterThanOrEqual(-ORB_STEER);
      last = orb.vx;
      expect(orb.vy).toBe(ORB_VY);
    }
    expect(orb.vx).toBeGreaterThan(0); // it turned towards Octopi, which is to its right
  });

  it('turns the other way when Octopi crosses it', () => {
    const s = arena();
    s.octopi.x = 500;
    castOrb(s, 3000, 1000);
    const orb = s.enemyShots[0]!;
    for (let t = 0; t < 10; t++) tickShots(s);
    expect(orb.vx).toBe(-ORB_STEER * 10);
  });

  it('lives exactly 240 ticks', () => {
    const s = arena();
    castOrb(s, 2000, 500);
    for (let t = 0; t < ORB_LIFE - 1; t++) tickShots(s);
    expect(s.enemyShots).toHaveLength(1);
    expect(orbTicks(s.enemyShots[0]!)).toBe(1);
    tickShots(s);
    expect(s.enemyShots).toEqual([]);
  });

  it('takes three player shots, consuming each non-piercing one', () => {
    const s = arena();
    castOrb(s, 2000, 1000);
    const orb = s.enemyShots[0]!;
    for (let i = 0; i < 2; i++) {
      s.shots.push({ x: 2000, y: 1000, vx: 0, vy: -240, kind: 'straight', data: 0 });
      hitOrbs(s);
      expect(s.shots).toEqual([]);
      expect(s.enemyShots).toHaveLength(1);
      expect(orbHp(orb)).toBe(ORB_HP - 1 - i);
    }
    s.shots.push({ x: 2000, y: 1000, vx: 0, vy: -240, kind: 'straight', data: 0 });
    hitOrbs(s);
    expect(s.enemyShots).toEqual([]);
  });

  it('lets a piercing shot damage it and fly on', () => {
    const s = arena();
    castOrb(s, 2000, 1000);
    s.shots.push({ x: 2000, y: 1000, vx: 0, vy: -240, kind: 'straight', data: 1 });
    hitOrbs(s);
    expect(s.shots).toHaveLength(1);
    expect(orbHp(s.enemyShots[0]!)).toBe(ORB_HP - 1);
  });

  it('does nothing on a field with no orb in it', () => {
    const s = arena();
    s.shots.push({ x: 2000, y: 1000, vx: 0, vy: -240, kind: 'straight', data: 0 });
    hitOrbs(s);
    expect(s.shots).toHaveLength(1);
  });
});

describe('needle', () => {
  it('flies straight at the point it was aimed at, 1.6x the boss shot speed', () => {
    expect(NEEDLE_SPEED).toBe(idiv(BOSS_SHOT.speed * 16, 10));
    const s = arena();
    castNeedle(s, 2000, 1000, 2000, 9000);
    expect(s.enemyShots[0]).toMatchObject({ x: 2000, y: 1000, vx: 0, vy: NEEDLE_SPEED, kind: 'needle' });
    expect(shotRadius(s.enemyShots[0]!)).toBe(70);
    expect(shotDamage(s.enemyShots[0]!)).toBe(1);
  });

  it('keeps that speed on a diagonal aim', () => {
    const s = arena();
    castNeedle(s, 1000, 1000, 4000, 5000);
    const b = s.enemyShots[0]!;
    const speed = isqrt(b.vx * b.vx + b.vy * b.vy);
    expect(Math.abs(speed - NEEDLE_SPEED)).toBeLessThanOrEqual(2);
    expect(b.vx * 4).toBe(b.vy * 3); // the 3-4-5 aim, kept exactly
  });
});

// The owner's balance note of 2026-09-22 (on-device): the Corsair's axe turned above every row Octopi
// can stand on, and the Tyrant's orb only touched the home row as it died. Both shots must reach the
// player now, measured from the muzzle a boss actually fires from.
describe('reach of the boss shots (owner balance note 2026-09-22)', () => {
  const muzzleY = BOSS.top + BOSS.height; // `muzzle(b)`: boss centre + half the box, at the resting y

  it("the axe turns below Octopi's home row", () => {
    const s = arena();
    castAxe(s, 2800, muzzleY, 2800);
    const axe = s.enemyShots[0]!;
    let deepest = axe.y;
    for (let t = 0; t < AXE_FALL_TICKS; t++) { tickShots(s); deepest = Math.max(deepest, axe.y); }
    expect(deepest).toBeGreaterThan(OCTOPI.startY);
    expect(deepest).toBeLessThan(OCTOPI.maxY); // it still turns inside the field, above the very bottom
  });

  it("the orb crosses Octopi's home row well before its life runs out", () => {
    const s = arena();
    castOrb(s, 2800, muzzleY);
    const orb = s.enemyShots[0]!;
    let crossed = -1;
    for (let t = 1; t <= ORB_LIFE && s.enemyShots.length === 1; t++) {
      tickShots(s);
      if (crossed < 0 && orb.y >= OCTOPI.startY) crossed = t;
    }
    expect(crossed).toBeGreaterThan(0);
    expect(crossed).toBeLessThan((ORB_LIFE * 2) / 3); // tick ~134 of 240 at ORB_VY 45 from the muzzle
    expect(s.enemyShots).toEqual([]); // and it left through the bottom of the field before the cap
  });
});
