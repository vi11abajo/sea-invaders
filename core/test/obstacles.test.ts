import { describe, expect, it } from 'vitest';
import {
  BOSS, INITIAL_INPUT, PRACTICE_RUN, createGame, hitObstacle, raiseObstacle, spawnBoss, step,
} from '../src';
import type { Bullet, GameState } from '../src';

/** A practice run with the wave cleared away and a kind-1 boss on the field. */
function arena(): GameState {
  const s = createGame('obstacles', { ...PRACTICE_RUN, features: { boosts: false } });
  s.crabs = [];
  spawnBoss(s, 1);
  return s;
}

/** The Castellan's crystal (spec §5.2): a 500 x 700 box of 12 hit points. */
function crystal(s: GameState, x: number, y: number): void {
  raiseObstacle(s, 'crystal', x, y, 500, 700, 12);
}

const shot = (x: number, y: number, data = 0): Bullet => ({ x, y, vx: 0, vy: -240, kind: 'straight', data });

describe('obstacles', () => {
  it('raises a box of its own size and hit points at a point', () => {
    const s = arena();
    crystal(s, 2000, 3600);
    expect(s.obstacles).toEqual([{ x: 2000, y: 3600, w: 500, h: 700, hp: 12, kind: 'crystal' }]);
  });

  it('eats a player shot whose centre enters the box and takes one hit point', () => {
    const s = arena();
    crystal(s, 2000, 3600);
    s.shots.push(shot(2000, 3600));
    hitObstacle(s);
    expect(s.shots).toEqual([]);
    expect(s.obstacles[0]!.hp).toBe(11);
  });

  it('eats a piercing player shot too, and it still costs the crystal one hit point', () => {
    const s = arena();
    crystal(s, 2000, 3600);
    s.shots.push(shot(2000, 3600, 1));
    hitObstacle(s);
    expect(s.shots).toEqual([]);
    expect(s.obstacles[0]!.hp).toBe(11);
  });

  it('eats an enemy shot without damaging the crystal', () => {
    const s = arena();
    crystal(s, 2000, 3600);
    s.enemyShots.push({ x: 2000, y: 3600, vx: 0, vy: 110, kind: 'straight', data: 0 });
    hitObstacle(s);
    expect(s.enemyShots).toEqual([]);
    expect(s.obstacles[0]!.hp).toBe(12);
  });

  it('lets a shot whose centre is outside the box past', () => {
    const s = arena();
    crystal(s, 2000, 3600);
    s.shots.push(shot(2000 + 251, 3600));
    s.enemyShots.push({ x: 2000, y: 3600 - 351, vx: 0, vy: 110, kind: 'straight', data: 0 });
    hitObstacle(s);
    expect(s.shots).toHaveLength(1);
    expect(s.enemyShots).toHaveLength(1);
    expect(s.obstacles[0]!.hp).toBe(12);
  });

  it('counts down to zero and is removed with its position', () => {
    const s = arena();
    crystal(s, 2000, 3600);
    for (let i = 0; i < 12; i++) {
      s.shots.push(shot(2000, 3600));
      hitObstacle(s);
    }
    expect(s.obstacles).toEqual([]);
    const gone = s.events.filter((e) => e.type === 'obstacle_destroyed');
    expect(gone).toHaveLength(1);
    expect(gone[0]).toMatchObject({ type: 'obstacle_destroyed', x: 2000, y: 3600 });
  });

  it('does nothing at all on an arena with no obstacles on it', () => {
    const s = arena();
    s.shots.push(shot(2000, 3600));
    s.enemyShots.push({ x: 2000, y: 3600, vx: 0, vy: 110, kind: 'straight', data: 0 });
    hitObstacle(s);
    expect(s.shots).toHaveLength(1);
    expect(s.enemyShots).toHaveLength(1);
  });

  it('shields the boss from a player shot during a real tick', () => {
    // Without the crystal the shot lands: the control run below proves the tick really does reach
    // the boss box from where the shot starts.
    const control = arena();
    control.shots.push({ x: control.boss!.x, y: 3700, vx: 0, vy: -240, kind: 'straight', data: 0 });
    step(control, INITIAL_INPUT);
    expect(control.boss!.hp).toBe(control.boss!.maxHp - 1);

    const s = arena();
    const b = s.boss!;
    crystal(s, b.x, 3560);
    s.shots.push({ x: b.x, y: 3700, vx: 0, vy: -240, kind: 'straight', data: 0 });
    step(s, INITIAL_INPUT);
    expect(s.shots).toEqual([]);
    expect(s.boss!.hp).toBe(b.maxHp);
    expect(s.obstacles[0]!.hp).toBe(11);
  });

  it('shields Octopi from an enemy shot during a real tick', () => {
    const near = (s: GameState) => ({ x: s.octopi.x, y: s.octopi.y - 200, vx: 0, vy: 110, kind: 'straight' as const, data: 0 });
    const control = arena();
    control.enemyShots = [near(control)];
    step(control, INITIAL_INPUT);
    expect(control.octopi.lives).toBe(PRACTICE_RUN.lives - 1);

    const s = arena();
    s.enemyShots = [near(s)];
    crystal(s, s.octopi.x, s.octopi.y - 200);
    step(s, INITIAL_INPUT);
    expect(s.octopi.lives).toBe(PRACTICE_RUN.lives);
    expect(s.obstacles[0]!.hp).toBe(12);
  });

  it('is not the boss box: raising one leaves the boss alone', () => {
    const s = arena();
    expect(BOSS.width).toBeGreaterThan(0);
    crystal(s, 2000, 3600);
    expect(s.obstacles).toHaveLength(1);
    expect(s.boss).not.toBeNull();
  });
});
