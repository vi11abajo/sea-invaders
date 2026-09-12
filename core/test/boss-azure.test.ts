import { describe, expect, it } from 'vitest';
import {
  BOSS, BOSS_SHOT, INITIAL_INPUT, PRACTICE_RUN, createGame, damageBoss, hashState, muzzle, spawnBoss, step,
  updateBoss,
} from '../src';

const fresh = (kind: 1 | 2 | 3 | 4 | 5 = 2) => {
  const s = createGame('azure', { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, kind);
  return s;
};

describe('Azure Leviathan (kind 2)', () => {
  it('fires one large shot at the muzzle in phase 1', () => {
    const s = fresh();
    const b = s.boss!;
    s.rngBoss = { nextInt: () => 0 } as never;
    b.attackTimer = 1;
    updateBoss(s); // moves the boss, then fires at its post-move muzzle
    const m = muzzle(b);
    expect(s.enemyShots).toHaveLength(1);
    expect(s.enemyShots[0]).toMatchObject({ x: m.x, y: m.y, vx: 0, vy: 93, kind: 'large' });
  });

  it('enters phase 2 at hp <= 37 (75 * (2-1)/2) after the 120-tick transition', () => {
    const s = fresh();
    damageBoss(s, 38); // 75 - 38 = 37
    expect(s.boss).toMatchObject({ hp: 37, state: 'transition', transitionTicks: BOSS.transitionTicks, phase: 1 });
    for (let i = 0; i < BOSS.transitionTicks; i++) updateBoss(s);
    expect(s.boss).toMatchObject({ state: 'fighting', phase: 2 });
  });

  it('fires 7 tidal-wave shots with symmetric vx and positive vy in phase 2', () => {
    const s = fresh();
    const b = s.boss!;
    damageBoss(s, 38);
    for (let i = 0; i < BOSS.transitionTicks; i++) updateBoss(s);
    expect(b.phase).toBe(2);
    s.rngBoss = { nextInt: () => 0 } as never;
    s.enemyShots = [];
    b.attackTimer = 1;
    updateBoss(s);
    expect(s.enemyShots).toHaveLength(7);
    for (const shot of s.enemyShots) {
      expect(shot.kind).toBe('wave');
      expect(shot.vy).toBeGreaterThan(0);
    }
    // Symmetric pairs: shot 0 <-> shot 6, shot 1 <-> shot 5, shot 2 <-> shot 4; centre shot 3 is vx 0.
    expect(s.enemyShots[0]!.vx).toBe(-s.enemyShots[6]!.vx);
    expect(s.enemyShots[1]!.vx).toBe(-s.enemyShots[5]!.vx);
    expect(s.enemyShots[2]!.vx).toBe(-s.enemyShots[4]!.vx);
    expect(s.enemyShots[3]!.vx).toBe(0);
  });

  it('restores the shield to 5 and emits the event when the ability triggers with no shield', () => {
    const s = fresh();
    const b = s.boss!;
    b.shieldHp = 0;
    b.abilityTimer = 1;
    s.rngBoss = { nextInt: () => 0 } as never;
    updateBoss(s);
    expect(b.shieldHp).toBe(5);
    expect(s.events).toContainEqual({ tick: s.tick, type: 'boss_ability', name: 'shield' });
  });

  it('does nothing when the ability triggers while the shield is still up', () => {
    const s = fresh();
    const b = s.boss!;
    b.shieldHp = 3;
    b.abilityTimer = 1;
    s.rngBoss = { nextInt: () => 0 } as never;
    updateBoss(s);
    expect(b.shieldHp).toBe(3);
    expect(s.events.find((e) => e.type === 'boss_ability')).toBeUndefined();
  });

  it('absorbs 5 hits into the shield leaving hp intact, the 5th firing a 12-shot shield-break ring', () => {
    const s = fresh();
    const b = s.boss!;
    b.shieldHp = 5;
    for (let i = 0; i < 4; i++) {
      damageBoss(s, 1);
      expect(b.hp).toBe(75);
    }
    expect(b.shieldHp).toBe(1);
    expect(s.enemyShots).toHaveLength(0);

    damageBoss(s, 1); // the 5th hit brings the shield to 0
    expect(b.hp).toBe(75);
    expect(b.shieldHp).toBe(0);
    expect(s.enemyShots).toHaveLength(12);
    for (const shot of s.enemyShots) {
      expect(shot.kind).toBe('ring');
      expect(shot.data).toBe(29);
      const speed = Math.round(Math.sqrt(shot.vx * shot.vx + shot.vy * shot.vy));
      expect(speed).toBeGreaterThanOrEqual(idivSpeedFloor());
    }
    expect(s.events).toContainEqual({ tick: s.tick, type: 'shield_break' });

    // A 6th hit now damages hp directly since the shield is down.
    damageBoss(s, 1);
    expect(b.hp).toBe(74);
  });

  it('is deterministic over 600 ticks', () => {
    const a = fresh();
    const b = fresh();
    for (let i = 0; i < 600; i++) {
      step(a, INITIAL_INPUT);
      step(b, INITIAL_INPUT);
    }
    expect(hashState(a)).toBe(hashState(b));
  });
});

/** Loose lower bound for the shield-break ring's speed (BOSS_SHOT.speed * 1.2, integer trig rounding). */
function idivSpeedFloor(): number {
  return Math.floor(BOSS_SHOT.speed * 1.2 * 0.9);
}
