import { describe, expect, it } from 'vitest';
import { PRACTICE_RUN, createGame, shotRadius, spawnFormation, updateEnemyShots } from '../src';
import type { CrabType } from '../src';

/** Spawns a lone crab of `type` centred on Octopi's x, then forces a fire (crab 0, no randomness). */
function fire(type: CrabType) {
  const s = createGame('shots', PRACTICE_RUN);
  spawnFormation(s, { formation: 'grid', rows: 1, cols: 1, kinds: [type] });
  s.rngFire = { nextInt: () => 0 } as never; // always fires, picks crab 0
  updateEnemyShots(s);
  return s;
}

describe('CRAB_SHOTS by type', () => {
  it('normal fires one crab shot at speed 110, radius 96, unchanged from today', () => {
    const s = fire('normal');
    expect(s.enemyShots).toHaveLength(1);
    const b = s.enemyShots[0]!;
    expect(b.kind).toBe('crab');
    expect(b.vy).toBe(110); // crab.x === octopi.x, so vx is 0 and vy carries the full speed
    expect(shotRadius(b)).toBe(96);
  });

  it('armored fires one heavy shot at speed 80, radius 140', () => {
    const s = fire('armored');
    expect(s.enemyShots).toHaveLength(1);
    const b = s.enemyShots[0]!;
    expect(b.kind).toBe('heavy');
    expect(b.vy).toBe(80);
    expect(shotRadius(b)).toBe(140);
  });

  it('swift fires one fast shot at speed 150, radius 80', () => {
    const s = fire('swift');
    expect(s.enemyShots).toHaveLength(1);
    const b = s.enemyShots[0]!;
    expect(b.kind).toBe('fast');
    expect(b.vy).toBe(150);
    expect(shotRadius(b)).toBe(80);
  });

  it('fanner fires three crab shots fanned at -20/0/+20 degrees', () => {
    const s = fire('fanner');
    expect(s.enemyShots).toHaveLength(3);
    for (const b of s.enemyShots) {
      expect(b.kind).toBe('crab');
      expect(shotRadius(b)).toBe(96);
    }
    // The straight-down shot (0 degrees) keeps the full speed on vy, vx 0.
    expect(s.enemyShots.find((b) => b.vx === 0)).toMatchObject({ vy: 110 });
    expect(new Set(s.enemyShots.map((b) => b.vx)).size).toBe(3);
  });

  it('a chosen diver fires nothing that tick', () => {
    const s = fire('diver');
    expect(s.enemyShots).toHaveLength(0);
  });
});
