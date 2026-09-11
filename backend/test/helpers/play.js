import { REPLAY_MODE, ReplayRecorder, createGame, encodeReplay, step } from '@sea-invaders/core';

/** Plays `ticks` ticks (or until game over) with a slow sweep and returns the encoded replay as base64. */
export function playReplay(seed, ticks, mode = REPLAY_MODE.daily) {
  const game = createGame(seed);
  const recorder = new ReplayRecorder(seed, mode);
  for (let t = 1; t <= ticks && !game.over; t++) {
    const input = { x: 800 + ((t * 5) % 4000), y: 9000 };
    recorder.record(t, input);
    step(game, input);
  }
  const replay = recorder.finish(game.tick);
  return { base64: Buffer.from(encodeReplay(replay)).toString('base64'), score: game.score, ticks: game.tick, over: game.over };
}
