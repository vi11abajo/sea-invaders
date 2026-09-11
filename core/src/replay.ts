import { createGame, INITIAL_INPUT } from './game';
import { hashState } from './state-hash';
import { step } from './step';
import type { Input } from './types';

/** Bumped whenever simulation behaviour changes; replays only run on the version that recorded them. */
export const CORE_VERSION = 2;

/** 15 minutes at 60 Hz: an upper bound on how long a single replay may run or claim to run. */
export const MAX_REPLAY_TICKS = 54_000;
export const MAX_REPLAY_INPUTS = MAX_REPLAY_TICKS;

/** Which leaderboard/queue a replay belongs to. */
export type ReplayMode = 0 | 1 | 2;
export const REPLAY_MODE = { practice: 0, daily: 1, campaign: 2 } as const;

export interface Replay {
  version: number;
  mode: ReplayMode;
  seed: string;
  /** Number of ticks the recording client simulated. */
  ticks: number;
  /** Flat [tick, x, y] triples, written only on change; ticks strictly increase. INITIAL_INPUT applies before the first. */
  inputs: number[];
}

export interface ReplayResult {
  score: number;
  ticks: number;
  over: boolean;
  hash: string;
}

export class ReplayRecorder {
  private readonly inputs: number[] = [];
  private lastX = INITIAL_INPUT.x;
  private lastY = INITIAL_INPUT.y;

  constructor(private readonly seed: string, private readonly mode: ReplayMode) {}

  /** Call right before the step() that produces `tick`, with the input that step will use. */
  record(tick: number, input: Input): void {
    if (input.x === this.lastX && input.y === this.lastY) return;
    this.inputs.push(tick, input.x, input.y);
    this.lastX = input.x;
    this.lastY = input.y;
  }

  finish(ticks: number): Replay {
    return { version: CORE_VERSION, mode: this.mode, seed: this.seed, ticks, inputs: this.inputs.slice() };
  }
}

/**
 * Replays `replay` and returns its outcome. When `expected` is given, the replay's own seed/mode
 * must match it first — a cheap check before spending time simulating a mismatched run.
 */
export function runReplay(replay: Replay, expected?: { seed?: string; mode?: ReplayMode }): ReplayResult {
  if (replay.version !== CORE_VERSION) {
    throw new Error(`replay core version ${replay.version} does not match ${CORE_VERSION}`);
  }
  if (expected?.seed !== undefined && expected.seed !== replay.seed) {
    throw new Error('replay seed mismatch');
  }
  if (expected?.mode !== undefined && expected.mode !== replay.mode) {
    throw new Error('replay mode mismatch');
  }
  if (replay.ticks > MAX_REPLAY_TICKS) throw new Error('replay ticks exceed maximum');
  if (replay.inputs.length / 3 > MAX_REPLAY_INPUTS) throw new Error('replay input count exceeds maximum');
  const s = createGame(replay.seed);
  const { inputs } = replay;
  let x = INITIAL_INPUT.x;
  let y = INITIAL_INPUT.y;
  let next = 0;
  for (let t = 1; t <= replay.ticks; t++) {
    while (next < inputs.length && inputs[next]! <= t) {
      x = inputs[next + 1]!;
      y = inputs[next + 2]!;
      next += 3;
    }
    step(s, { x, y });
  }
  return { score: s.score, ticks: s.tick, over: s.over, hash: hashState(s) };
}

function pushVarint(out: number[], v: number): void {
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
}

const zigzag = (v: number): number => (v >= 0 ? v * 2 : -v * 2 - 1);
const unzigzag = (u: number): number => (u % 2 === 0 ? u / 2 : -(u + 1) / 2);

const MIN_COORD = -2_147_483_648;
const MAX_COORD = 2_147_483_647;

/** Compact binary form: varint header, ASCII seed, then per change a tick delta and zigzag x/y deltas. */
export function encodeReplay(r: Replay): Uint8Array {
  const out: number[] = [];
  pushVarint(out, r.version);
  pushVarint(out, r.mode);
  pushVarint(out, r.ticks);
  pushVarint(out, r.seed.length);
  for (let i = 0; i < r.seed.length; i++) {
    const code = r.seed.charCodeAt(i);
    if (code > 0x7f) throw new Error('replay seed must be ASCII');
    out.push(code);
  }
  pushVarint(out, r.inputs.length / 3);
  let t = 0;
  let x = INITIAL_INPUT.x;
  let y = INITIAL_INPUT.y;
  for (let i = 0; i < r.inputs.length; i += 3) {
    pushVarint(out, r.inputs[i]! - t);
    pushVarint(out, zigzag(r.inputs[i + 1]! - x));
    pushVarint(out, zigzag(r.inputs[i + 2]! - y));
    t = r.inputs[i]!;
    x = r.inputs[i + 1]!;
    y = r.inputs[i + 2]!;
  }
  return Uint8Array.from(out);
}

export function decodeReplay(bytes: Uint8Array): Replay {
  let pos = 0;
  /** Varint reader: at most 5 bytes; a continuation bit on the 5th, or an unsafe result, is a hard error. */
  const read = (): number => {
    let result = 0;
    let mul = 1;
    for (let i = 0; i < 5; i++) {
      if (pos >= bytes.length) throw new Error('truncated replay');
      const byte = bytes[pos++]!;
      result += (byte & 0x7f) * mul;
      if ((byte & 0x80) === 0) {
        if (!Number.isSafeInteger(result)) throw new Error('replay varint too long');
        return result;
      }
      if (i === 4) throw new Error('replay varint too long');
      mul *= 0x80;
    }
    throw new Error('replay varint too long');
  };
  const version = read();
  if (version < 1 || version > 255) throw new Error('replay version out of range');
  const mode = read();
  if (mode !== 0 && mode !== 1 && mode !== 2) throw new Error('replay mode invalid');
  const ticks = read();
  if (ticks > MAX_REPLAY_TICKS) throw new Error('replay ticks exceed maximum');
  const seedLength = read();
  if (seedLength > 64) throw new Error('replay seed too long');
  if (pos + seedLength > bytes.length) throw new Error('truncated replay');
  let seed = '';
  for (let i = 0; i < seedLength; i++) {
    const code = bytes[pos++]!;
    if (code > 0x7f) throw new Error('replay seed must be ASCII');
    seed += String.fromCharCode(code);
  }
  const count = read();
  if (count > MAX_REPLAY_INPUTS) throw new Error('replay input count exceeds maximum');
  const inputs: number[] = [];
  let t = 0;
  let x = INITIAL_INPUT.x;
  let y = INITIAL_INPUT.y;
  let prevTick = 0;
  for (let i = 0; i < count; i++) {
    t += read();
    if (t <= prevTick || t > ticks) throw new Error('replay tick out of order');
    prevTick = t;
    x += unzigzag(read());
    y += unzigzag(read());
    if (x < MIN_COORD || x > MAX_COORD || y < MIN_COORD || y > MAX_COORD) {
      throw new Error('replay coordinate out of range');
    }
    inputs.push(t, x, y);
  }
  if (pos !== bytes.length) throw new Error('trailing bytes in replay');
  return { version, mode, seed, ticks, inputs };
}
