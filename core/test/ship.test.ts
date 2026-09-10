import { describe, expect, it } from 'vitest';
import { INITIAL_INPUT, createGame, moveShip, step, updateShots } from '../src';

describe('moveShip', () => {
  it('moves at most 250 per tick toward the target', () => {
    const s = createGame('t');
    moveShip(s, { x: 4000, y: 9650 });
    expect(s.ship.x).toBe(2812 + 250);
    for (let i = 0; i < 10; i++) moveShip(s, { x: 4000, y: 9650 });
    expect(s.ship.x).toBe(4000);
  });

  it('keeps the ship inside its area', () => {
    const s = createGame('t');
    for (let i = 0; i < 100; i++) moveShip(s, { x: -9999, y: 0 });
    expect(s.ship).toMatchObject({ x: 562, y: 5000 });
    for (let i = 0; i < 100; i++) moveShip(s, { x: 99999, y: 99999 });
    expect(s.ship).toMatchObject({ x: 5625 - 562, y: 10550 });
  });
});

describe('updateShots', () => {
  it('fires every 8 ticks from the ship nose', () => {
    const s = createGame('t');
    for (let t = 1; t <= 7; t++) updateShots(s);
    expect(s.shots).toHaveLength(0);
    updateShots(s);
    expect(s.shots).toEqual([{ x: 2812, y: 9650 - 562, vx: 0, vy: -240 }]);
    for (let t = 9; t <= 24; t++) updateShots(s);
    expect(s.shots).toHaveLength(3);
  });

  it('moves shots up and drops them once they leave the field', () => {
    const s = createGame('t');
    s.ship.cooldown = 1000;
    s.shots = [{ x: 100, y: 300, vx: 0, vy: -240 }];
    updateShots(s);
    expect(s.shots[0]!.y).toBe(60);
    updateShots(s); // y = -180: bottom edge -180 + 180 = 0 → gone
    expect(s.shots).toHaveLength(0);
  });
});

describe('step', () => {
  it('advances one tick and does nothing once the run is over', () => {
    const s = createGame('t');
    step(s, INITIAL_INPUT);
    expect(s.tick).toBe(1);
    s.over = true;
    step(s, INITIAL_INPUT);
    expect(s.tick).toBe(1);
  });

  it('counts invulnerability down to zero', () => {
    const s = createGame('t');
    s.ship.invuln = 2;
    for (let i = 0; i < 3; i++) step(s, INITIAL_INPUT);
    expect(s.ship.invuln).toBe(0);
  });
});
