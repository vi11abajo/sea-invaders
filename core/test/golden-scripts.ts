import { FIELD_W, INITIAL_INPUT, Rng, clamp, type Input } from '../src';

export interface GoldenScript {
  ticks: number;
  /** Returns a fresh input function; call it once per tick, in order, starting at tick 1. */
  makeInput: () => (tick: number) => Input;
}

/** Triangle wave across the field: x changes every 4 ticks, period 480 ticks. */
function sweepX(tick: number): number {
  const p = Math.floor(tick / 4) % 120;
  const k = p < 60 ? p : 120 - p;
  return 600 + Math.floor((k * 4400) / 60);
}

/** Seeded random walk that changes every 6 ticks. */
function wander(): (tick: number) => Input {
  const r = new Rng('golden-wander-input');
  let x = INITIAL_INPUT.x;
  let y = INITIAL_INPUT.y;
  return (tick) => {
    if (tick % 6 === 0) {
      x = clamp(x + r.nextInt(801) - 400, 0, FIELD_W);
      y = clamp(y + r.nextInt(401) - 200, 5000, 11000);
    }
    return { x, y };
  };
}

export const GOLDEN_SCRIPTS: Record<string, GoldenScript> = {
  idle: { ticks: 3600, makeInput: () => () => INITIAL_INPUT },
  sweep: { ticks: 7200, makeInput: () => (t) => ({ x: sweepX(t), y: 9000 }) },
  wander: { ticks: 10_800, makeInput: wander },
};
