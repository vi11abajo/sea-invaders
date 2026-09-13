import { describe, expect, it } from 'vitest';
import { DIVER, SHOT, TUNING, UNTUNED_SPEED, fireChance, marchSteps, scalePct } from '../src';

/** Total march steps over ticks 0..ticks-1 at `pct`. */
function totalSteps(pct: number, ticks: number): number {
  let n = 0;
  for (let t = 0; t < ticks; t++) n += marchSteps(t, pct);
  return n;
}

describe('game-speed tuning', () => {
  it('scales integers by percent, rounding towards zero', () => {
    expect(scalePct(240, 100)).toBe(240);
    expect(scalePct(240, 80)).toBe(192);
    expect(scalePct(220, 90)).toBe(198);
    expect(scalePct(25, 90)).toBe(22);
  });

  it('derives the tuned speeds from the knobs', () => {
    expect(SHOT.speed).toBe(scalePct(UNTUNED_SPEED.octopiShot, TUNING.octopiShotPct));
    expect(DIVER.speed).toBe(scalePct(UNTUNED_SPEED.diver, TUNING.crabMovePct));
    expect(fireChance(1)).toBe(scalePct(20, TUNING.crabFirePct));
  });

  it('marches exactly pct steps per 100 ticks, spread evenly', () => {
    for (const pct of [50, 90, 100, 150]) expect(totalSteps(pct, 100)).toBe(pct);
    // At 90 the formation marches on ticks 0-8 and rests on tick 9 of every ten.
    expect(Array.from({ length: 20 }, (_, t) => marchSteps(t, 90))).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    ]);
    expect(Array.from({ length: 10 }, (_, t) => marchSteps(t, 100))).toEqual(Array(10).fill(1));
    expect(Array.from({ length: 4 }, (_, t) => marchSteps(t, 150))).toEqual([2, 1, 2, 1]);
  });

  it('holds the owner tuning of 2026-09-13 (a change needs a CORE_VERSION bump and new goldens)', () => {
    expect(TUNING).toEqual({ octopiShotPct: 80, crabMovePct: 90, crabFirePct: 90 });
    expect(SHOT.speed).toBe(192);
    expect(DIVER.speed).toBe(198);
  });
});
