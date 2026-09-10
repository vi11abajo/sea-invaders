import { describe, expect, it } from 'vitest';
import {
  CORE_VERSION, INITIAL_INPUT, ReplayRecorder, createGame, decodeReplay, encodeReplay, hashState, runReplay, step,
  type Replay,
} from '../src';

describe('hashState', () => {
  it('is equal for equal states and changes with any field, including RNG state', () => {
    const a = createGame('h');
    const b = createGame('h');
    expect(hashState(a)).toBe(hashState(b));
    b.ship.x += 1;
    expect(hashState(b)).not.toBe(hashState(a));
    const c = createGame('h');
    c.rngFire.nextU32();
    expect(hashState(c)).not.toBe(hashState(a));
  });
});

describe('ReplayRecorder', () => {
  it('stores only input changes', () => {
    const rec = new ReplayRecorder('r');
    rec.record(1, INITIAL_INPUT);
    rec.record(2, { x: 3000, y: 9000 });
    rec.record(3, { x: 3000, y: 9000 });
    rec.record(4, { x: 2000, y: 9000 });
    expect(rec.finish(4)).toEqual({ version: CORE_VERSION, seed: 'r', ticks: 4, inputs: [2, 3000, 9000, 4, 2000, 9000] });
  });
});

describe('runReplay', () => {
  it('reproduces a recorded run: same score, tick, end state and hash', () => {
    const s = createGame('rr');
    const rec = new ReplayRecorder('rr');
    for (let t = 1; t <= 1800 && !s.over; t++) {
      const input = { x: 1000 + ((t * 37) % 3600), y: 8000 + ((t * 11) % 2000) };
      rec.record(t, input);
      step(s, input);
    }
    expect(runReplay(rec.finish(s.tick))).toEqual({ score: s.score, ticks: s.tick, over: s.over, hash: hashState(s) });
  });

  it('rejects a replay from another core version', () => {
    expect(() => runReplay({ version: CORE_VERSION + 1, seed: 'x', ticks: 1, inputs: [] })).toThrow();
  });
});

describe('replay codec', () => {
  it('round-trips', () => {
    const r: Replay = { version: 1, seed: 'abc123', ticks: 500, inputs: [1, 0, 11250, 7, 5625, 0, 300, 2812, 9650] };
    expect(decodeReplay(encodeReplay(r))).toEqual(r);
  });

  it('rejects truncated input, trailing bytes and a non-ASCII seed', () => {
    const bytes = encodeReplay({ version: 1, seed: 's', ticks: 10, inputs: [1, 2, 3] });
    expect(() => decodeReplay(bytes.slice(0, bytes.length - 1))).toThrow();
    expect(() => decodeReplay(Uint8Array.from([...bytes, 0]))).toThrow();
    expect(() => encodeReplay({ version: 1, seed: 'é', ticks: 1, inputs: [] })).toThrow();
  });
});
