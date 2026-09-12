import { describe, expect, it } from 'vitest';
import { FixedStepper, KIND_INDEX, PRACTICE_RUN, createGame, fitField, snapshot, touchToInput } from '../src';

describe('FixedStepper', () => {
  it('only starts the clock on the first frame', () => {
    expect(new FixedStepper().advance(1000)).toBe(0);
  });

  it('runs 60 ticks per second at 60 Hz', () => {
    const st = new FixedStepper();
    let total = 0;
    for (let i = 0; i <= 60; i++) total += st.advance((i * 1000) / 60);
    expect(total).toBe(60);
  });

  it('runs 60 ticks per second at 120 Hz', () => {
    const st = new FixedStepper();
    let total = 0;
    for (let i = 0; i <= 120; i++) total += st.advance((i * 1000) / 120);
    expect(total).toBe(60);
  });

  it('caps a long stall at 4 ticks and ignores a clock going backwards', () => {
    const st = new FixedStepper();
    st.advance(0);
    expect(st.advance(5000)).toBe(4);
    expect(st.advance(4000)).toBe(0);
  });
});

describe('fitField', () => {
  it('fits a 400×890 dp phone by width and leaves a 90 dp HUD band on top', () => {
    const l = fitField(400, 890);
    expect(l.scale).toBeCloseTo(400 / 5625, 12);
    expect(l.offsetX).toBeCloseTo(0, 9);
    expect(l.height).toBeCloseTo(800, 9);
    expect(l.offsetY).toBeCloseTo(90, 9);
  });

  it('fits a wide screen by height and centres it', () => {
    const l = fitField(1000, 1125);
    expect(l.scale).toBeCloseTo(0.1, 12);
    expect(l.width).toBeCloseTo(562.5, 9);
    expect(l.offsetX).toBeCloseTo(218.75, 9);
    expect(l.offsetY).toBeCloseTo(0, 9);
  });
});

describe('touchToInput', () => {
  it('maps screen points to integer milli-units and lifts the target', () => {
    const l = fitField(400, 890);
    expect(touchToInput(l, 100, 490, 0)).toEqual({ x: 1406, y: 5625 });
    expect(touchToInput(l, 0, 890, 1200)).toEqual({ x: 0, y: 10050 });
  });
});

describe('snapshot', () => {
  it('copies positions into flat arrays', () => {
    const s = createGame('f', PRACTICE_RUN);
    s.shots = [{ x: 1, y: 2, vx: 0, vy: -240, kind: 'straight', data: 0 }];
    s.enemyShots = [{ x: 3, y: 4, vx: 5, vy: 6, kind: 'crab', data: 0 }];
    const f = snapshot(s);
    expect(f.ship).toEqual({ x: 2812, y: 9650, invuln: 0 });
    expect(f.lives).toBe(3);
    expect(f.crabs).toHaveLength(18 * 5);
    expect(f.crabs.slice(0, 2)).toEqual([812, 1500]);
    expect(f.shots).toEqual([1, 2]);
    expect(f.enemyShots).toEqual([3, 4, KIND_INDEX.crab]);
  });

  it('does not share arrays with the game state', () => {
    const s = createGame('f', PRACTICE_RUN);
    const f = snapshot(s);
    s.crabs[0]!.x = -1;
    expect(f.crabs[0]).toBe(812);
  });
});
