import { describe, expect, it } from 'vitest';
import { INITIAL_INPUT, createGame, hitCrabs, hitShip, step } from '../src';

describe('hitCrabs', () => {
  it('removes the first overlapping crab and the shot, scoring 10 × wave', () => {
    const s = createGame('t');
    s.wave = 2;
    s.crabs = [{ x: 1000, y: 1000, kind: 0 }, { x: 1000, y: 1100, kind: 1 }];
    s.shots = [{ x: 1000, y: 1000, vx: 0, vy: -240 }, { x: 4000, y: 1000, vx: 0, vy: -240 }];
    hitCrabs(s);
    expect(s.crabs).toEqual([{ x: 1000, y: 1100, kind: 1 }]);
    expect(s.shots).toEqual([{ x: 4000, y: 1000, vx: 0, vy: -240 }]);
    expect(s).toMatchObject({ score: 20, kills: 1 });
  });

  it('uses box overlap: 324 off-centre hits, 325 misses', () => {
    const s = createGame('t');
    s.crabs = [{ x: 1000, y: 1000, kind: 0 }];
    s.shots = [{ x: 1325, y: 1000, vx: 0, vy: 0 }];
    hitCrabs(s);
    expect(s.crabs).toHaveLength(1);
    s.shots = [{ x: 1324, y: 1000, vx: 0, vy: 0 }];
    hitCrabs(s);
    expect(s.crabs).toHaveLength(0);
  });
});

describe('hitShip', () => {
  it('loses a life on an enemy shot, grants invulnerability and clears shots', () => {
    const s = createGame('t');
    s.enemyShots = [{ x: s.ship.x, y: s.ship.y + 255, vx: 0, vy: 0 }, { x: 100, y: 100, vx: 0, vy: 0 }];
    hitShip(s);
    expect(s.ship).toMatchObject({ lives: 2, invuln: 120 });
    expect(s.enemyShots).toEqual([]);
  });

  it('misses a shot just outside the hitbox', () => {
    const s = createGame('t');
    s.enemyShots = [{ x: s.ship.x, y: s.ship.y + 256, vx: 0, vy: 0 }];
    hitShip(s);
    expect(s.ship.lives).toBe(3);
  });

  it('ignores hits while invulnerable', () => {
    const s = createGame('t');
    s.ship.invuln = 5;
    s.enemyShots = [{ x: s.ship.x, y: s.ship.y, vx: 0, vy: 0 }];
    hitShip(s);
    expect(s.ship.lives).toBe(3);
  });

  it('destroys a crab that touches the ship and costs a life', () => {
    const s = createGame('t');
    s.crabs = [{ x: s.ship.x + 400, y: s.ship.y, kind: 0 }];
    hitShip(s);
    expect(s.ship.lives).toBe(2);
    expect(s.crabs).toHaveLength(0);
    expect(s.score).toBe(0);
  });

  it('ends the run on the last life', () => {
    const s = createGame('t');
    s.ship.lives = 1;
    s.enemyShots = [{ x: s.ship.x, y: s.ship.y, vx: 0, vy: 0 }];
    hitShip(s);
    expect(s.over).toBe(true);
  });
});

describe('step with collisions', () => {
  it('spawns the next wave when the last crab dies', () => {
    const s = createGame('t');
    s.crabs = [{ x: s.ship.x, y: s.ship.y - 1500, kind: 0 }];
    s.waveTotal = 1;
    s.shots = [{ x: s.ship.x, y: s.ship.y - 1500 + 240, vx: 0, vy: -240 }];
    step(s, INITIAL_INPUT);
    expect(s).toMatchObject({ wave: 2, score: 10, kills: 1 });
    expect(s.crabs).toHaveLength(24);
  });

  it('an idle ship is eventually destroyed and the run ends', () => {
    const s = createGame('idle');
    for (let t = 0; t < 60 * 60 * 10 && !s.over; t++) step(s, INITIAL_INPUT);
    expect(s.over).toBe(true);
    expect(s.ship.lives).toBe(0);
  });
});
