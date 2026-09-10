import { createGame, INITIAL_INPUT } from './game';
import { hashState } from './state-hash';
import { step } from './step';
import type { Input } from './types';

/** Bumped whenever simulation behaviour changes; replays only run on the version that recorded them. */
export const CORE_VERSION = 1;

export interface Replay {
  version: number;
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

  constructor(private readonly seed: string) {}

  /** Call right before the step() that produces `tick`, with the input that step will use. */
  record(tick: number, input: Input): void {
    if (input.x === this.lastX && input.y === this.lastY) return;
    this.inputs.push(tick, input.x, input.y);
    this.lastX = input.x;
    this.lastY = input.y;
  }

  finish(ticks: number): Replay {
    return { version: CORE_VERSION, seed: this.seed, ticks, inputs: this.inputs.slice() };
  }
}

export function runReplay(replay: Replay): ReplayResult {
  if (replay.version !== CORE_VERSION) {
    throw new Error(`replay core version ${replay.version} does not match ${CORE_VERSION}`);
  }
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

/** Compact binary form: varint header, ASCII seed, then per change a tick delta and zigzag x/y deltas. */
export function encodeReplay(r: Replay): Uint8Array {
  const out: number[] = [];
  pushVarint(out, r.version);
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
  const read = (): number => {
    let result = 0;
    let mul = 1;
    let byte: number;
    do {
      if (pos >= bytes.length) throw new Error('truncated replay');
      byte = bytes[pos++]!;
      result += (byte & 0x7f) * mul;
      mul *= 0x80;
    } while (byte & 0x80);
    return result;
  };
  const version = read();
  const ticks = read();
  const seedLength = read();
  if (pos + seedLength > bytes.length) throw new Error('truncated replay');
  let seed = '';
  for (let i = 0; i < seedLength; i++) seed += String.fromCharCode(bytes[pos++]!);
  const count = read();
  const inputs: number[] = [];
  let t = 0;
  let x = INITIAL_INPUT.x;
  let y = INITIAL_INPUT.y;
  for (let i = 0; i < count; i++) {
    t += read();
    x += unzigzag(read());
    y += unzigzag(read());
    inputs.push(t, x, y);
  }
  if (pos !== bytes.length) throw new Error('trailing bytes in replay');
  return { version, seed, ticks, inputs };
}
