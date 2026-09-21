/** Persisted campaign progress: spec §6.1. Pure functions only — never mutate their inputs. */
export interface CampaignProgress {
  v: 1;
  /** 1..10, the reef currently being played. */
  reef: number;
  /** 1..6, the next level to play in that reef. */
  level: number;
  /** Reef lives, 0..infinity (no cap). */
  lives: number;
  /**
   * One entry per level id (1-indexed id -> array index id-1), `LEVEL_COUNT` total. A record
   * written before reefs 6-10 existed carries `LEGACY_LEVEL_COUNT` entries and is grown by
   * `extendProgress` wherever it is read.
   */
  cleared: boolean[];
  /** Best score per level id, same indexing as `cleared`. */
  best: number[];
  /** Epoch ms. */
  updatedAt: number;
}

export const REEF_LIVES = 5;
export const REVIVE_LIVES = 3;
export const REEFS = 10;
export const LEVELS_PER_REEF = 6;

/** Every level of both campaigns: six per reef. */
export const LEVEL_COUNT = REEFS * LEVELS_PER_REEF;

/**
 * The level count of the first campaign, and so the length of every record written before reefs
 * 6-10 existed: an old app's PUT and a phone's stored copy both still arrive this long.
 */
export const LEGACY_LEVEL_COUNT = 30;

/**
 * Grows a record of the first campaign to the full `LEVEL_COUNT`, padding the new levels with
 * `false` / `0`; a record that is already the full length is handed back untouched, so callers that
 * extend before doing their own work keep returning their input unchanged where they used to.
 */
export function extendProgress(p: CampaignProgress): CampaignProgress {
  if (p.cleared.length === LEVEL_COUNT && p.best.length === LEVEL_COUNT) return p;
  return {
    ...p,
    cleared: Array.from({ length: LEVEL_COUNT }, (_, i) => p.cleared[i] ?? false),
    best: Array.from({ length: LEVEL_COUNT }, (_, i) => p.best[i] ?? 0),
  };
}

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

/** The level id (1..`LEVEL_COUNT`) the progress currently points at: `(reef-1)*6 + level`. */
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
 * A record of the first campaign is grown first, so a campaign finished before reefs 6-10 existed
 * settles on to the first level of reef 6 instead of staying on the fifth reef's boss.
 */
export function settleProgress(input: CampaignProgress): CampaignProgress {
  const p = extendProgress(input);
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
 * one on a tie, and `second` on a full tie); the result is settled (`settleProgress`). Either side may
 * still be a record of the first campaign - an old app syncing with a phone that has the second, or
 * the other way round - so both are grown to the full length before anything is compared.
 */
export function mergeProgress(first: CampaignProgress, second: CampaignProgress): CampaignProgress {
  const a = extendProgress(first);
  const b = extendProgress(second);
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

/**
 * Structural validation for progress loaded from storage or the network: spec §6.1. Both array
 * lengths are accepted - `LEGACY_LEVEL_COUNT` from an app or a server that predates reefs 6-10,
 * `LEVEL_COUNT` from one that has them - as long as the two arrays agree with each other.
 */
export function isValidProgress(x: unknown): x is CampaignProgress {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.v !== 1) return false;
  if (!Number.isInteger(o.reef) || (o.reef as number) < 1 || (o.reef as number) > REEFS) return false;
  if (!Number.isInteger(o.level) || (o.level as number) < 1 || (o.level as number) > LEVELS_PER_REEF) return false;
  if (!Number.isInteger(o.lives) || (o.lives as number) < 0) return false;
  if (!Array.isArray(o.cleared) || !Array.isArray(o.best)) return false;
  const count = o.cleared.length;
  if (count !== LEGACY_LEVEL_COUNT && count !== LEVEL_COUNT) return false;
  if (o.best.length !== count) return false;
  if (!o.cleared.every((c) => typeof c === 'boolean')) return false;
  if (!o.best.every((b) => Number.isInteger(b) && b >= 0)) return false;
  if (!Number.isInteger(o.updatedAt) || (o.updatedAt as number) <= 0) return false;
  return true;
}
