/** Persisted campaign progress: spec §6.1. Pure functions only — never mutate their inputs. */
export interface CampaignProgress {
  v: 1;
  /** 1..5, the reef currently being played. */
  reef: number;
  /** 1..6, the next level to play in that reef. */
  level: number;
  /** Reef lives, 0..infinity (no cap). */
  lives: number;
  /** One entry per level id (1-indexed id -> array index id-1), 30 total. */
  cleared: boolean[];
  /** Best score per level id, same indexing as `cleared`. */
  best: number[];
  /** Epoch ms. */
  updatedAt: number;
}

export const REEF_LIVES = 5;
export const REVIVE_LIVES = 3;
export const REEFS = 5;
export const LEVELS_PER_REEF = 6;

const LEVEL_COUNT = REEFS * LEVELS_PER_REEF;

/** A fresh campaign: reef 1, level 1, full reef lives, nothing cleared. */
export function newProgress(now: number): CampaignProgress {
  return {
    v: 1,
    reef: 1,
    level: 1,
    lives: REEF_LIVES,
    cleared: Array<boolean>(LEVEL_COUNT).fill(false),
    best: Array<number>(LEVEL_COUNT).fill(0),
    updatedAt: now,
  };
}

/** The level id (1..30) the progress currently points at: `(reef-1)*6 + level`. */
export function currentLevelId(p: CampaignProgress): number {
  return (p.reef - 1) * LEVELS_PER_REEF + p.level;
}

/** Lives a level starts with on entry: a fresh reef (level 1) always starts full. */
export function livesForEntry(p: CampaignProgress): number {
  return p.level === 1 ? REEF_LIVES : p.lives;
}

type LevelOutcome = 'practice' | 'cleared' | 'failed' | 'reef_lost' | 'campaign_complete';

type LevelResult = {
  levelId: number;
  practice: boolean;
  cleared: boolean;
  livesLeft: number;
  score: number;
  now: number;
};

/**
 * Applies one level's result to progress. Only the level `currentLevelId(p)` points at may be
 * played non-practice; a non-practice result for any other level id throws.
 */
export function applyLevelResult(p: CampaignProgress, r: LevelResult): { next: CampaignProgress; outcome: LevelOutcome } {
  const idx = r.levelId - 1;

  if (r.practice) {
    const best = p.best.slice();
    best[idx] = Math.max(best[idx] ?? 0, r.score);
    return { next: { ...p, best, updatedAt: r.now }, outcome: 'practice' };
  }

  if (currentLevelId(p) !== r.levelId) throw new Error('level is not the current level');

  if (r.cleared) {
    const cleared = p.cleared.slice();
    cleared[idx] = true;
    const best = p.best.slice();
    best[idx] = Math.max(best[idx] ?? 0, r.score);

    if (r.levelId === LEVEL_COUNT) {
      return {
        next: { ...p, reef: REEFS, level: LEVELS_PER_REEF, lives: r.livesLeft, cleared, best, updatedAt: r.now },
        outcome: 'campaign_complete',
      };
    }
    if (p.level === LEVELS_PER_REEF) {
      return {
        next: { ...p, reef: p.reef + 1, level: 1, lives: r.livesLeft, cleared, best, updatedAt: r.now },
        outcome: 'cleared',
      };
    }
    return {
      next: { ...p, level: p.level + 1, lives: r.livesLeft, cleared, best, updatedAt: r.now },
      outcome: 'cleared',
    };
  }

  if (r.livesLeft > 0) {
    return { next: { ...p, lives: r.livesLeft, updatedAt: r.now }, outcome: 'failed' };
  }

  return { next: { ...p, level: 1, lives: REEF_LIVES, updatedAt: r.now }, outcome: 'reef_lost' };
}

/**
 * Refills a lost reef's lives to `REVIVE_LIVES` and keeps the current reef/level. Named `reviveReef`
 * (not `revive`) so it never collides with `sim/revive.ts`'s `revive(s: GameState)` — the two are
 * unrelated: this one restarts a whole reef after `reef_lost`, that one revives mid-level after the
 * Tide's last life (spec §4).
 */
export function reviveReef(p: CampaignProgress, now: number): CampaignProgress {
  return { ...p, lives: REVIVE_LIVES, updatedAt: now };
}

/** Whether every level of `reef` (1..REEFS) is cleared. */
function reefCleared(p: CampaignProgress, reef: number): boolean {
  const first = (reef - 1) * LEVELS_PER_REEF;
  for (let i = 0; i < LEVELS_PER_REEF; i++) if (!p.cleared[first + i]) return false;
  return true;
}

/**
 * Moves a pointer that sits inside a fully cleared reef on to where play actually stands: the first
 * level of the next uncleared reef with fresh lives, or the campaign-complete position (the last
 * reef's boss) once everything is cleared. Play never leaves the pointer there - a boss clear moves
 * it on at once - but an old merge rule did (a reinstall merged with a finished campaign kept the
 * fresh copy's reef 1 / level 1), and both copies then carried the stale pointer, so the merge rule
 * alone could no longer recover it. A reef-lost reset (pointer at level 1 of a reef that is not
 * fully cleared) is left exactly as it is. `updatedAt` is untouched: this is a repair, not a play.
 */
export function settleProgress(p: CampaignProgress): CampaignProgress {
  let reef = p.reef;
  while (reef < REEFS && reefCleared(p, reef)) reef += 1;
  const moved = reef !== p.reef;
  if (reef === REEFS && reefCleared(p, REEFS)) {
    if (!moved && p.level === LEVELS_PER_REEF) return p;
    return { ...p, reef: REEFS, level: LEVELS_PER_REEF, lives: moved ? REEF_LIVES : p.lives };
  }
  return moved ? { ...p, reef, level: 1, lives: REEF_LIVES } : p;
}

/**
 * Spec §6.2: per-level OR/max, position fields from the side that has cleared more levels (the newer
 * one on a tie, and `b` on a full tie); the result is settled (`settleProgress`).
 */
export function mergeProgress(a: CampaignProgress, b: CampaignProgress): CampaignProgress {
  const newer = b.updatedAt >= a.updatedAt ? b : a;
  // The pointer (reef, level, lives) follows the side that has cleared more levels - the side that
  // has actually played further - and only on a tie the newer one. A fresh install merging with a
  // finished campaign otherwise dragged the pointer back to reef 1 (owner's phone, 2026-09-17),
  // while a reef-lost reset (same cleared count on both sides) still keeps the newer pointer.
  const clearedA = a.cleared.filter(Boolean).length;
  const clearedB = b.cleared.filter(Boolean).length;
  const lead = clearedA > clearedB ? a : clearedB > clearedA ? b : newer;
  return settleProgress({
    v: 1,
    reef: lead.reef,
    level: lead.level,
    lives: lead.lives,
    cleared: a.cleared.map((c, i) => c || b.cleared[i]!),
    best: a.best.map((v, i) => Math.max(v, b.best[i]!)),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  });
}

/** Structural validation for progress loaded from storage or the network: spec §6.1. */
export function isValidProgress(x: unknown): x is CampaignProgress {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.v !== 1) return false;
  if (!Number.isInteger(o.reef) || (o.reef as number) < 1 || (o.reef as number) > REEFS) return false;
  if (!Number.isInteger(o.level) || (o.level as number) < 1 || (o.level as number) > LEVELS_PER_REEF) return false;
  if (!Number.isInteger(o.lives) || (o.lives as number) < 0) return false;
  if (!Array.isArray(o.cleared) || o.cleared.length !== LEVEL_COUNT || !o.cleared.every((c) => typeof c === 'boolean')) return false;
  if (!Array.isArray(o.best) || o.best.length !== LEVEL_COUNT || !o.best.every((b) => Number.isInteger(b) && b >= 0)) return false;
  if (!Number.isInteger(o.updatedAt) || (o.updatedAt as number) <= 0) return false;
  return true;
}
