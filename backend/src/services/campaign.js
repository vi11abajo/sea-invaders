// Mirrors the campaign progress rules from `core/src/campaign/progress.ts` (Task 17, not yet
// landed). Once that core module ships, this file is swapped for `mergeProgress`/`isValidProgress`
// imported from `@sea-invaders/core`, per spec §6.

const LEVEL_COUNT = 30;

/** Spec §6.1: `{ v: 1, reef: 1..5, level: 1..6, lives: >=0, cleared: boolean[30], best: number[30] (>=0), updatedAt: positive integer }`. */
export function isValidProgress(x) {
  if (x === null || typeof x !== 'object') return false;
  if (x.v !== 1) return false;
  if (!Number.isInteger(x.reef) || x.reef < 1 || x.reef > 5) return false;
  if (!Number.isInteger(x.level) || x.level < 1 || x.level > 6) return false;
  if (!Number.isInteger(x.lives) || x.lives < 0) return false;
  if (!Array.isArray(x.cleared) || x.cleared.length !== LEVEL_COUNT || !x.cleared.every((c) => typeof c === 'boolean')) return false;
  if (!Array.isArray(x.best) || x.best.length !== LEVEL_COUNT || !x.best.every((b) => Number.isInteger(b) && b >= 0)) return false;
  if (!Number.isInteger(x.updatedAt) || x.updatedAt <= 0) return false;
  return true;
}

/**
 * Spec §6.2: `cleared` is the per-level OR, `best` is the per-level max, and `reef`/`level`/`lives`
 * come from whichever record has the newer `updatedAt` (a tie favors `b`, the incoming PUT body).
 */
export function mergeProgress(a, b) {
  const newer = b.updatedAt >= a.updatedAt ? b : a;
  return {
    v: 1,
    reef: newer.reef,
    level: newer.level,
    lives: newer.lives,
    cleared: a.cleared.map((c, i) => c || b.cleared[i]),
    best: a.best.map((v, i) => Math.max(v, b.best[i])),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}
