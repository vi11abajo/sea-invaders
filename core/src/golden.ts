import { CORE_VERSION, runReplay, type Replay, type ReplayResult } from './replay';

export interface Golden {
  name: string;
  replay: Replay;
  expected: ReplayResult;
}

export interface GoldenCheck {
  name: string;
  ok: boolean;
  expected: ReplayResult;
  actual: ReplayResult;
}

/** Re-runs each golden replay and compares it with its recorded result. Used by Vitest (V8) and the app self-test (Hermes). */
export function checkGoldens(goldens: readonly Golden[]): GoldenCheck[] {
  return goldens.map((g) => {
    if (g.replay.version !== CORE_VERSION) {
      throw new Error(`golden "${g.name}" was recorded with core version ${g.replay.version}, expected ${CORE_VERSION}`);
    }
    const actual = runReplay(g.replay);
    const e = g.expected;
    const ok = actual.score === e.score && actual.ticks === e.ticks && actual.over === e.over && actual.hash === e.hash;
    return { name: g.name, ok, expected: e, actual };
  });
}
