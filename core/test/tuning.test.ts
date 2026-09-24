import { describe, expect, it } from 'vitest';
import { BASE_SPEED_PCT, SHOT, SPEED_PCT, TUNING, UNTUNED_SPEED, fireChance, marchSteps, scalePct } from '../src';

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
    expect(scalePct(50, 90)).toBe(45);
    expect(scalePct(25, 90)).toBe(22);
  });

  it('derives the effective speeds from the reference and the knobs', () => {
    expect(SPEED_PCT).toEqual({
      octopiShot: scalePct(BASE_SPEED_PCT.octopiShot, TUNING.octopiShotPct),
      crabMove: scalePct(BASE_SPEED_PCT.crabMove, TUNING.crabMovePct),
      crabFire: scalePct(BASE_SPEED_PCT.crabFire, TUNING.crabFirePct),
    });
    expect(SHOT.speed).toBe(scalePct(UNTUNED_SPEED.octopiShot, SPEED_PCT.octopiShot));
    expect(fireChance(1)).toBe(scalePct(20, SPEED_PCT.crabFire));
  });

  it('measures every knob against the reference speed: 100 keeps it, 50 halves it', () => {
    // A knob at 100 hands back the reference exactly, so the derived speeds are the reference's own.
    for (const pct of Object.values(BASE_SPEED_PCT)) expect(scalePct(pct, 100)).toBe(pct);
    expect(scalePct(UNTUNED_SPEED.octopiShot, scalePct(BASE_SPEED_PCT.octopiShot, 100))).toBe(192);
    // At 50 each effective speed is half the reference: Octopi's shots 192 -> 96 units a tick, the
    // march 90 -> 45 steps per 100 ticks, the wave-1 fire chance 18 -> 9 per mille.
    expect(scalePct(UNTUNED_SPEED.octopiShot, scalePct(BASE_SPEED_PCT.octopiShot, 50))).toBe(96);
    expect(totalSteps(scalePct(BASE_SPEED_PCT.crabMove, 50), 100)).toBe(45);
    expect(scalePct(20, scalePct(BASE_SPEED_PCT.crabFire, 50))).toBe(9);
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

  it('holds the reference and the current knobs (a change needs a CORE_VERSION bump and new goldens)', () => {
    expect(BASE_SPEED_PCT).toEqual({ octopiShot: 80, crabMove: 90, crabFire: 90 });
    expect(TUNING).toEqual({ octopiShotPct: 100, crabMovePct: 100, crabFirePct: 100 });
    expect(SPEED_PCT).toEqual({ octopiShot: 80, crabMove: 90, crabFire: 90 });
    expect(SHOT.speed).toBe(192);
    expect(fireChance(1)).toBe(18);
  });
});
