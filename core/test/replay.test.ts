import { describe, expect, it } from 'vitest';
import {
  CORE_VERSION, INITIAL_INPUT, MAX_REPLAY_INPUTS, MAX_REPLAY_TICKS, REPLAY_MODE, ReplayRecorder, createGame,
  decodeReplay, encodeReplay, hashState, runReplay, step, type Input, type Replay,
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
    const rec = new ReplayRecorder('r', REPLAY_MODE.practice);
    rec.record(1, INITIAL_INPUT);
    rec.record(2, { x: 3000, y: 9000 });
    rec.record(3, { x: 3000, y: 9000 });
    rec.record(4, { x: 2000, y: 9000 });
    expect(rec.finish(4)).toEqual({
      version: CORE_VERSION, mode: REPLAY_MODE.practice, seed: 'r', ticks: 4, inputs: [2, 3000, 9000, 4, 2000, 9000],
    });
  });

  it('writes the mode it was constructed with', () => {
    const rec = new ReplayRecorder('r', REPLAY_MODE.daily);
    expect(rec.finish(0).mode).toBe(REPLAY_MODE.daily);
  });
});

describe('runReplay', () => {
  it('reproduces a recorded run: same score, tick, end state and hash', () => {
    const s = createGame('rr');
    const rec = new ReplayRecorder('rr', REPLAY_MODE.practice);
    for (let t = 1; t <= 1800 && !s.over; t++) {
      const input = { x: 1000 + ((t * 37) % 3600), y: 8000 + ((t * 11) % 2000) };
      rec.record(t, input);
      step(s, input);
    }
    expect(runReplay(rec.finish(s.tick))).toEqual({ score: s.score, ticks: s.tick, over: s.over, hash: hashState(s) });
  });

  it('rejects a replay from another core version', () => {
    expect(() => runReplay({ version: CORE_VERSION + 1, mode: REPLAY_MODE.practice, seed: 'x', ticks: 1, inputs: [] }))
      .toThrow();
  });

  it('rejects a seed mismatch against the expected seed', () => {
    const rec = new ReplayRecorder('a', REPLAY_MODE.practice);
    const replay = rec.finish(1);
    expect(() => runReplay(replay, { seed: 'b' })).toThrow('replay seed mismatch');
  });

  it('rejects a mode mismatch against the expected mode', () => {
    const rec = new ReplayRecorder('a', REPLAY_MODE.practice);
    const replay = rec.finish(1);
    expect(() => runReplay(replay, { mode: REPLAY_MODE.daily })).toThrow('replay mode mismatch');
  });

  it('accepts a replay whose seed and mode match what was expected', () => {
    const rec = new ReplayRecorder('a', REPLAY_MODE.campaign);
    const replay = rec.finish(1);
    expect(() => runReplay(replay, { seed: 'a', mode: REPLAY_MODE.campaign })).not.toThrow();
  });

  it('rejects a replay whose declared ticks exceed the maximum, even without going through decodeReplay', () => {
    const replay: Replay = {
      version: CORE_VERSION, mode: REPLAY_MODE.practice, seed: 'x', ticks: MAX_REPLAY_TICKS + 1, inputs: [],
    };
    expect(() => runReplay(replay)).toThrow();
  });

  it('rejects a replay whose recorded input count exceeds the maximum, even without going through decodeReplay', () => {
    const inputs: number[] = [];
    for (let i = 0; i < MAX_REPLAY_INPUTS + 1; i++) inputs.push(i + 1, 0, 0);
    const replay: Replay = {
      version: CORE_VERSION, mode: REPLAY_MODE.practice, seed: 'x', ticks: MAX_REPLAY_TICKS, inputs,
    };
    expect(() => runReplay(replay)).toThrow();
  });

  it('a replay whose declared ticks is shorter than the recording reproduces a live game stepped that many ticks', () => {
    const seed = 'trunc';
    // Input changes only in the first 50 ticks, then holds steady, so every recorded input tick
    // is well under the 400 we later declare — decodeReplay would otherwise reject a `ticks` that
    // is smaller than a recorded tick.
    const inputAt = (t: number): Input => (t <= 50 ? { x: 1000 + t * 7, y: 8000 + t * 3 } : { x: 1350, y: 8150 });

    const s = createGame(seed);
    const rec = new ReplayRecorder(seed, REPLAY_MODE.practice);
    for (let t = 1; t <= 1000; t++) {
      const input = inputAt(t);
      rec.record(t, input);
      step(s, input);
    }
    const recorded = rec.finish(1000);
    const truncated = decodeReplay(encodeReplay({ ...recorded, ticks: 200 }));
    expect(truncated.ticks).toBe(200);

    const live = createGame(seed);
    for (let t = 1; t <= 200; t++) step(live, inputAt(t));

    expect(runReplay(truncated)).toEqual({ score: live.score, ticks: live.tick, over: live.over, hash: hashState(live) });
    expect(live.over).toBe(false);
  });
});

describe('replay codec', () => {
  it('round-trips', () => {
    const r: Replay = {
      version: 1, mode: REPLAY_MODE.daily, seed: 'abc123', ticks: 500,
      inputs: [1, 0, 11250, 7, 5625, 0, 300, 2812, 9650],
    };
    expect(decodeReplay(encodeReplay(r))).toEqual(r);
  });

  it('rejects truncated input, trailing bytes and a non-ASCII seed', () => {
    const bytes = encodeReplay({ version: 1, mode: REPLAY_MODE.practice, seed: 's', ticks: 10, inputs: [1, 2, 3] });
    expect(() => decodeReplay(bytes.slice(0, bytes.length - 1))).toThrow();
    expect(() => decodeReplay(Uint8Array.from([...bytes, 0]))).toThrow();
    expect(() => encodeReplay({ version: 1, mode: REPLAY_MODE.practice, seed: 'é', ticks: 1, inputs: [] })).toThrow();
  });

  function varintBytes(v: number): number[] {
    const out: number[] = [];
    while (v >= 0x80) {
      out.push((v % 0x80) | 0x80);
      v = Math.floor(v / 0x80);
    }
    out.push(v);
    return out;
  }

  const zig = (v: number): number => (v >= 0 ? v * 2 : -v * 2 - 1);

  /** version, mode, ticks and an (optionally empty) ASCII seed — the fixed prefix every replay starts with. */
  function header(version: number, mode: number, ticks: number, seed: string): number[] {
    const out = [...varintBytes(version), ...varintBytes(mode), ...varintBytes(ticks), ...varintBytes(seed.length)];
    for (let i = 0; i < seed.length; i++) out.push(seed.charCodeAt(i));
    return out;
  }

  it('rejects a varint whose 5th byte still carries the continuation bit', () => {
    const bytes = Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff, 0x01]);
    expect(() => decodeReplay(bytes)).toThrow('replay varint too long');
  });

  it('rejects a version outside [1, 255]', () => {
    expect(() => decodeReplay(Uint8Array.from([0]))).toThrow();
    expect(() => decodeReplay(Uint8Array.from(varintBytes(256)))).toThrow();
  });

  it('rejects a mode that is not 0, 1 or 2', () => {
    const bytes = Uint8Array.from([...varintBytes(2), ...varintBytes(3)]);
    expect(() => decodeReplay(bytes)).toThrow('replay mode invalid');
  });

  it('rejects ticks beyond MAX_REPLAY_TICKS', () => {
    const bytes = Uint8Array.from([...varintBytes(2), ...varintBytes(0), ...varintBytes(MAX_REPLAY_TICKS + 1)]);
    expect(() => decodeReplay(bytes)).toThrow();
  });

  it('rejects a seed longer than 64 bytes', () => {
    const bytes = Uint8Array.from([...varintBytes(2), ...varintBytes(0), ...varintBytes(10), ...varintBytes(65)]);
    expect(() => decodeReplay(bytes)).toThrow();
  });

  it('rejects a seed byte above 0x7f (non-ASCII)', () => {
    const bytes = Uint8Array.from([...varintBytes(2), ...varintBytes(0), ...varintBytes(10), ...varintBytes(1), 200]);
    expect(() => decodeReplay(bytes)).toThrow();
  });

  it('rejects an input count beyond MAX_REPLAY_INPUTS', () => {
    const bytes = Uint8Array.from([...header(2, 0, 10, ''), ...varintBytes(MAX_REPLAY_INPUTS + 1)]);
    expect(() => decodeReplay(bytes)).toThrow();
  });

  it('rejects a tick that does not strictly increase over the previous one', () => {
    const bytes = Uint8Array.from([
      ...header(2, 0, 5, ''),
      ...varintBytes(2), // count
      ...varintBytes(3), ...varintBytes(zig(0)), ...varintBytes(zig(0)), // tick 3
      ...varintBytes(0), // delta 0 -> tick still 3, not strictly greater
    ]);
    expect(() => decodeReplay(bytes)).toThrow();
  });

  it('rejects a tick greater than the declared ticks', () => {
    const bytes = Uint8Array.from([
      ...header(2, 0, 5, ''),
      ...varintBytes(1), // count
      ...varintBytes(6), // tick 6 > ticks 5
    ]);
    expect(() => decodeReplay(bytes)).toThrow();
  });

  it('rejects an x/y coordinate outside the signed 32-bit range', () => {
    const bytes = Uint8Array.from([
      ...header(2, 0, 10, ''),
      ...varintBytes(1), // count
      ...varintBytes(1), // tick 1
      ...varintBytes(zig(3_000_000_000)), // pushes x far past 2_147_483_647
      ...varintBytes(zig(0)),
    ]);
    expect(() => decodeReplay(bytes)).toThrow();
  });
});
