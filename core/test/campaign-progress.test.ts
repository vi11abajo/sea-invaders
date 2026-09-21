import { describe, expect, it } from 'vitest';
import {
  LEGACY_LEVEL_COUNT,
  LEVEL_COUNT,
  LEVELS_PER_REEF,
  REEF_LIVES,
  REEFS,
  applyLevelResult,
  currentLevelId,
  extendProgress,
  isValidProgress,
  livesForEntry,
  mergeProgress,
  newProgress,
  reviveReef,
  settleProgress,
  type CampaignProgress,
} from '../src';

function progress(overrides: Partial<CampaignProgress> = {}): CampaignProgress {
  return { ...newProgress(1000), ...overrides };
}

/** A `cleared`/`best` array of `length` entries: `head` at the front, `fill` everywhere after it. */
function levels<T>(head: readonly T[], fill: T, length = LEVEL_COUNT): T[] {
  return Array.from({ length }, (_, i) => head[i] ?? fill);
}

describe('campaign progress', () => {
  it('gives a fresh reef entry 5 lives on level 1, regardless of stored lives', () => {
    const p = progress({ reef: 2, level: 1, lives: 0 });
    expect(livesForEntry(p)).toBe(REEF_LIVES);
  });

  it('carries an extra life from a HEALTH_BOOST into the next entry', () => {
    const p = progress({ reef: 1, level: 2, lives: 5 });
    const { next, outcome } = applyLevelResult(p, { levelId: 2, practice: false, cleared: true, livesLeft: 6, score: 500, now: 2000 });
    expect(outcome).toBe('cleared');
    expect(next.level).toBe(3);
    expect(next.lives).toBe(6);
    expect(livesForEntry(next)).toBe(6);
  });

  it('resets to level 1 with 5 lives when the reef is lost', () => {
    const p = progress({ reef: 3, level: 4, lives: 1 });
    const { next, outcome } = applyLevelResult(p, { levelId: currentLevelId(p), practice: false, cleared: false, livesLeft: 0, score: 0, now: 2000 });
    expect(outcome).toBe('reef_lost');
    expect(next.reef).toBe(3);
    expect(next.level).toBe(1);
    expect(next.lives).toBe(REEF_LIVES);
  });

  it('keeps lives and position on a non-fatal failure', () => {
    const p = progress({ reef: 1, level: 2, lives: 5 });
    const { next, outcome } = applyLevelResult(p, { levelId: currentLevelId(p), practice: false, cleared: false, livesLeft: 2, score: 0, now: 2000 });
    expect(outcome).toBe('failed');
    expect(next.reef).toBe(1);
    expect(next.level).toBe(2);
    expect(next.lives).toBe(2);
  });

  it('practice never touches lives or position, only best', () => {
    const p = progress({ reef: 2, level: 3, lives: 2 });
    const { next, outcome } = applyLevelResult(p, { levelId: 8, practice: true, cleared: true, livesLeft: 0, score: 700, now: 3000 });
    expect(outcome).toBe('practice');
    expect(next.reef).toBe(p.reef);
    expect(next.level).toBe(p.level);
    expect(next.lives).toBe(p.lives);
    expect(next.cleared).toEqual(p.cleared);
    expect(next.best[7]).toBe(700);
    expect(next.updatedAt).toBe(3000);
  });

  it('throws when a non-practice result targets a level other than the current one', () => {
    const p = progress({ reef: 1, level: 1 });
    expect(() => applyLevelResult(p, { levelId: 2, practice: false, cleared: true, livesLeft: 5, score: 0, now: 2000 })).toThrow(
      'level is not the current level',
    );
  });

  it('merges by taking the later position and the union of cleared/best', () => {
    const a = progress({
      reef: 1,
      level: 2,
      lives: 4,
      cleared: levels([true], false),
      best: levels([100], 0),
      updatedAt: 1000,
    });
    const b = progress({
      reef: 1,
      level: 3,
      lives: 5,
      cleared: levels([false, true], false),
      best: levels([0, 200], 0),
      updatedAt: 2000,
    });
    const merged = mergeProgress(a, b);
    expect(merged.reef).toBe(b.reef); // b is newer
    expect(merged.level).toBe(b.level);
    expect(merged.lives).toBe(b.lives);
    expect(merged.cleared[0]).toBe(true);
    expect(merged.cleared[1]).toBe(true);
    expect(merged.best[0]).toBe(100);
    expect(merged.best[1]).toBe(200);
    expect(merged.updatedAt).toBe(2000);
  });

  it('breaks a merge tie on updatedAt in favor of b', () => {
    const a = progress({ reef: 1, level: 1, updatedAt: 5000 });
    const b = progress({ reef: 4, level: 5, updatedAt: 5000 });
    const merged = mergeProgress(a, b);
    expect(merged.reef).toBe(4);
    expect(merged.level).toBe(5);
  });

  it('keeps the pointer of the side that has cleared more levels, however old it is', () => {
    // A fresh install (newer, nothing cleared) merging with a finished campaign on the server.
    const finished = progress({
      reef: REEFS,
      level: LEVELS_PER_REEF,
      lives: 2,
      cleared: levels([], true),
      best: levels([], 500),
      updatedAt: 1000,
    });
    const fresh = progress({ reef: 1, level: 1, lives: REEF_LIVES, updatedAt: 9000 });
    for (const merged of [mergeProgress(finished, fresh), mergeProgress(fresh, finished)]) {
      expect(merged.reef).toBe(REEFS);
      expect(merged.level).toBe(LEVELS_PER_REEF);
      expect(merged.lives).toBe(2);
      expect(merged.cleared.every(Boolean)).toBe(true);
      expect(merged.updatedAt).toBe(9000);
    }
  });

  it('settles a pointer left inside a finished campaign on the last boss', () => {
    const stale = progress({ reef: 1, level: 1, lives: REEF_LIVES, cleared: levels([], true), updatedAt: 3000 });
    const settled = settleProgress(stale);
    expect(settled.reef).toBe(REEFS);
    expect(settled.level).toBe(LEVELS_PER_REEF);
    expect(settled.updatedAt).toBe(3000);
    // Both copies carrying the stale pointer (the state an older merge rule left behind) still settle.
    const merged = mergeProgress(stale, { ...stale, updatedAt: 4000 });
    expect(merged.reef).toBe(REEFS);
    expect(merged.level).toBe(LEVELS_PER_REEF);
  });

  it('settles a pointer inside a fully cleared reef on the next reef with fresh lives', () => {
    const cleared = levels(Array<boolean>(LEVELS_PER_REEF).fill(true), false);
    const settled = settleProgress(progress({ reef: 1, level: 4, lives: 2, cleared }));
    expect(settled.reef).toBe(2);
    expect(settled.level).toBe(1);
    expect(settled.lives).toBe(REEF_LIVES);
  });

  it('leaves a reef-lost reset and the campaign-complete position alone', () => {
    const reset = progress({ reef: 1, level: 1, lives: REEF_LIVES, cleared: levels([true, true, true], false) });
    expect(settleProgress(reset)).toBe(reset);
    const done = progress({ reef: REEFS, level: LEVELS_PER_REEF, lives: 1, cleared: levels([], true) });
    expect(settleProgress(done)).toBe(done);
    expect(settleProgress(newProgress(1))).toEqual(newProgress(1));
  });

  it('keeps the newer pointer when both sides have cleared the same levels (a reef-lost reset)', () => {
    const cleared = levels([true, true, true], false);
    const before = progress({ reef: 1, level: 4, lives: 1, cleared, updatedAt: 1000 });
    const reset = progress({ reef: 1, level: 1, lives: REEF_LIVES, cleared, updatedAt: 2000 });
    const merged = mergeProgress(before, reset);
    expect(merged.level).toBe(1);
    expect(merged.lives).toBe(REEF_LIVES);
  });

  it('moves a boss clear to the next reef with fresh lives on entry', () => {
    const p = progress({ reef: 1, level: LEVELS_PER_REEF, lives: 3 });
    const id = currentLevelId(p);
    expect(id).toBe(6);
    const { next, outcome } = applyLevelResult(p, { levelId: id, practice: false, cleared: true, livesLeft: 1, score: 999, now: 2000 });
    expect(outcome).toBe('cleared');
    expect(next.reef).toBe(2);
    expect(next.level).toBe(1);
    expect(livesForEntry(next)).toBe(REEF_LIVES);
  });

  it('clears the final level (id 60) into campaign_complete, staying at reef 10 level 6', () => {
    const p = progress({ reef: REEFS, level: LEVELS_PER_REEF, lives: 2 });
    const id = currentLevelId(p);
    expect(id).toBe(LEVEL_COUNT);
    const { next, outcome } = applyLevelResult(p, { levelId: id, practice: false, cleared: true, livesLeft: 2, score: 42, now: 2000 });
    expect(outcome).toBe('campaign_complete');
    expect(next.reef).toBe(REEFS);
    expect(next.level).toBe(LEVELS_PER_REEF);
    expect(next.cleared[LEVEL_COUNT - 1]).toBe(true);
    expect(next.best[LEVEL_COUNT - 1]).toBe(42);
  });

  it('walks the first campaign on into the second: clearing level 30 opens reef 6', () => {
    const p = progress({ reef: 5, level: LEVELS_PER_REEF, lives: 1 });
    const id = currentLevelId(p);
    expect(id).toBe(LEGACY_LEVEL_COUNT);
    const { next, outcome } = applyLevelResult(p, { levelId: id, practice: false, cleared: true, livesLeft: 1, score: 42, now: 2000 });
    expect(outcome).toBe('cleared');
    expect(next.reef).toBe(6);
    expect(next.level).toBe(1);
    expect(livesForEntry(next)).toBe(REEF_LIVES);
  });

  it('reviveReef resets lives to 3 and keeps the current level', () => {
    const p = progress({ reef: 2, level: 4, lives: 0 });
    const revived = reviveReef(p, 9999);
    expect(revived.lives).toBe(3);
    expect(revived.reef).toBe(2);
    expect(revived.level).toBe(4);
    expect(revived.updatedAt).toBe(9999);
  });

  it('rejects progress objects with wrong-length cleared or best arrays', () => {
    const p = newProgress(1000);
    expect(isValidProgress(p)).toBe(true);
    expect(isValidProgress({ ...p, cleared: p.cleared.slice(0, LEVEL_COUNT - 1) })).toBe(false);
    expect(isValidProgress({ ...p, best: p.best.slice(0, LEVEL_COUNT - 1) })).toBe(false);
    expect(isValidProgress({ ...p, cleared: [...p.cleared, false] })).toBe(false);
    expect(isValidProgress(null)).toBe(false);
    expect(isValidProgress({ ...p, v: 2 })).toBe(false);
    // Neither campaign's length, and two lengths that disagree with each other.
    expect(isValidProgress({ ...p, cleared: p.cleared.slice(0, 45), best: p.best.slice(0, 45) })).toBe(false);
    expect(isValidProgress({ ...p, cleared: p.cleared.slice(0, LEGACY_LEVEL_COUNT) })).toBe(false);
  });

  it('starts a fresh campaign with one entry per level of both campaigns', () => {
    const p = newProgress(1000);
    expect(REEFS).toBe(10);
    expect(LEVEL_COUNT).toBe(60);
    expect(p.cleared).toHaveLength(LEVEL_COUNT);
    expect(p.best).toHaveLength(LEVEL_COUNT);
  });

  it('accepts a record from before the second campaign and pads it with false and 0', () => {
    const old = progress({
      cleared: levels([true, true], false, LEGACY_LEVEL_COUNT),
      best: levels([700], 0, LEGACY_LEVEL_COUNT),
    });
    expect(isValidProgress(old)).toBe(true);
    const grown = extendProgress(old);
    expect(grown.cleared).toEqual(levels([true, true], false));
    expect(grown.best).toEqual(levels([700], 0));
    // Already the full length: handed back untouched, so a settle can still return its input.
    expect(extendProgress(grown)).toBe(grown);
  });

  it('merges a thirty-level record with a sixty-level one, either way round', () => {
    const old = progress({
      cleared: levels([true], false, LEGACY_LEVEL_COUNT),
      best: levels([100], 0, LEGACY_LEVEL_COUNT),
      updatedAt: 1000,
    });
    const grown = progress({ cleared: levels([false, true], false), best: levels([0, 200], 0), updatedAt: 2000 });
    for (const merged of [mergeProgress(old, grown), mergeProgress(grown, old)]) {
      expect(merged.cleared).toEqual(levels([true, true], false));
      expect(merged.best).toEqual(levels([100, 200], 0));
    }
  });

  it('accepts every reef of both campaigns and nothing past the last one', () => {
    const p = newProgress(1000);
    expect(isValidProgress({ ...p, reef: REEFS })).toBe(true);
    expect(isValidProgress({ ...p, reef: REEFS + 1 })).toBe(false);
  });

  it('settles a finished first campaign onto the first level of reef 6', () => {
    const p = progress({
      reef: 5,
      level: LEVELS_PER_REEF,
      lives: 1,
      cleared: levels(Array<boolean>(LEGACY_LEVEL_COUNT).fill(true), false),
    });
    const settled = settleProgress(p);
    expect(settled.reef).toBe(6);
    expect(settled.level).toBe(1);
    expect(settled.lives).toBe(REEF_LIVES);
  });

  it('settles a campaign cleared to the last level onto the last boss', () => {
    const settled = settleProgress(progress({ reef: 1, level: 1, cleared: levels([], true) }));
    expect(settled.reef).toBe(REEFS);
    expect(settled.level).toBe(LEVELS_PER_REEF);
  });
});
