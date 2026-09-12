import { describe, expect, it } from 'vitest';
import {
  LEVELS_PER_REEF,
  REEF_LIVES,
  REEFS,
  applyLevelResult,
  currentLevelId,
  isValidProgress,
  livesForEntry,
  mergeProgress,
  newProgress,
  revive,
  type CampaignProgress,
} from '../src';

function progress(overrides: Partial<CampaignProgress> = {}): CampaignProgress {
  return { ...newProgress(1000), ...overrides };
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
      cleared: [true, false, ...Array(28).fill(false)],
      best: [100, 0, ...Array(28).fill(0)],
      updatedAt: 1000,
    });
    const b = progress({
      reef: 1,
      level: 3,
      lives: 5,
      cleared: [false, true, ...Array(28).fill(false)],
      best: [0, 200, ...Array(28).fill(0)],
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

  it('clears the final level (id 30) into campaign_complete, staying at reef 5 level 6', () => {
    const p = progress({ reef: REEFS, level: LEVELS_PER_REEF, lives: 2 });
    const id = currentLevelId(p);
    expect(id).toBe(30);
    const { next, outcome } = applyLevelResult(p, { levelId: id, practice: false, cleared: true, livesLeft: 2, score: 42, now: 2000 });
    expect(outcome).toBe('campaign_complete');
    expect(next.reef).toBe(REEFS);
    expect(next.level).toBe(LEVELS_PER_REEF);
    expect(next.cleared[29]).toBe(true);
    expect(next.best[29]).toBe(42);
  });

  it('revive resets lives to 3 and keeps the current level', () => {
    const p = progress({ reef: 2, level: 4, lives: 0 });
    const revived = revive(p, 9999);
    expect(revived.lives).toBe(3);
    expect(revived.reef).toBe(2);
    expect(revived.level).toBe(4);
    expect(revived.updatedAt).toBe(9999);
  });

  it('rejects progress objects with wrong-length cleared or best arrays', () => {
    const p = newProgress(1000);
    expect(isValidProgress(p)).toBe(true);
    expect(isValidProgress({ ...p, cleared: p.cleared.slice(0, 29) })).toBe(false);
    expect(isValidProgress({ ...p, best: p.best.slice(0, 29) })).toBe(false);
    expect(isValidProgress({ ...p, cleared: [...p.cleared, false] })).toBe(false);
    expect(isValidProgress(null)).toBe(false);
    expect(isValidProgress({ ...p, v: 2 })).toBe(false);
  });
});
