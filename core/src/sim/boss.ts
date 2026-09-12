import type { GameState } from '../types';

/** Task 5 implements the boss. Until then no level spawns one. */
export function updateBoss(_s: GameState): void {}

export function spawnBoss(_s: GameState, _kind: 1 | 2 | 3 | 4 | 5): void {
  throw new Error('boss engine not implemented yet');
}
