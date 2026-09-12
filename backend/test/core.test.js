import { CORE_VERSION, DAILY_RUN, REPLAY_MODE, ReplayRecorder, createGame, runReplay, step } from '@sea-invaders/core';
import { describe, expect, it } from 'vitest';

describe('core from the CommonJS build', () => {
  it('re-simulates a short run and returns its score and hash', () => {
    const seed = 'backend-smoke';
    const game = createGame(seed, DAILY_RUN);
    const recorder = new ReplayRecorder(seed, REPLAY_MODE.daily, 0, DAILY_RUN.lives);
    for (let t = 1; t <= 300 && !game.over; t++) {
      recorder.record(t, { x: 2812, y: 9650 });
      step(game, { x: 2812, y: 9650 });
    }
    const result = runReplay(recorder.finish(game.tick), { seed, mode: REPLAY_MODE.daily });
    expect(result.ticks).toBe(game.tick);
    expect(result.score).toBe(game.score);
    expect(result.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(CORE_VERSION).toBe(3);
  });
});
