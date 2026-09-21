import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  INVARIANCE_SCENARIOS, playInvarianceScenario, type InvariancePlay, type InvarianceResult,
} from './helpers/invariance-script';

/**
 * The safety net of the second campaign: every level of the first one, plus a fought-out round with
 * each of its five bosses, is played with a frozen input script and compared, tick for tick and hash
 * for hash, against a snapshot taken at core v10.
 *
 * The snapshot was generated once, on the core as it stood before any of the second campaign's
 * work, and is never regenerated: `UPDATE_INVARIANCE=1` exists only because the file had to be
 * written in the first place. If this test goes red, the first campaign's simulation moved — fix
 * the game, not the snapshot.
 *
 * It deliberately shares nothing with the goldens: its inputs live in `helpers/invariance-script.ts`
 * and its hash in `helpers/hash-v10.ts`, both frozen, because the goldens and the production hash
 * are meant to grow with the game.
 */

// Tests run from core/ (npm test in core/, and CI sets working-directory: core).
const FILE = join(process.cwd(), 'golden', 'invariance-v10.json');

const LEGACY_LEVELS = 30;

/** The boss levels of the first campaign, each with a deep `boss-<id>` row of its own. */
const BOSS_LEVELS = [6, 12, 18, 24, 30];

/**
 * Whether each deep boss row ends in the boss's death. Void Sovereign (level 30) survived every
 * one of the sixty seeds its row was searched over — the same ceiling the golden `level30`
 * scenario hits, which only ever claims to reach phase 3 — so that row pins the longest fight
 * found rather than a kill.
 */
const BOSS_KILLED: Readonly<Record<number, boolean>> = { 6: true, 12: true, 18: true, 24: true, 30: false };

// Computed lazily in `beforeAll` (not at module load): this replays thirty campaign levels and
// five boss fights.
let plays: InvariancePlay[];
let played: InvarianceResult[];

describe('v10 invariance', () => {
  beforeAll(() => {
    plays = INVARIANCE_SCENARIOS.map(playInvarianceScenario);
    played = plays.map((p) => p.row);
  });

  it('plays every level and boss fight of the first campaign exactly as core v10 did', () => {
    if (process.env.UPDATE_INVARIANCE === '1') writeFileSync(FILE, `${JSON.stringify(played, null, 2)}\n`);
    const committed = JSON.parse(readFileSync(FILE, 'utf8')) as InvarianceResult[];
    expect(committed.length).toBe(played.length);
    for (const expected of committed) {
      const actual = played.find((r) => r.id === expected.id);
      expect(actual, `row ${expected.id}`).toEqual(expected);
    }
  });

  it('covers levels 1 to 30 and every boss fight, each in an end state of its own', () => {
    expect(played.map((r) => r.id)).toEqual([
      ...Array.from({ length: LEGACY_LEVELS }, (_, i) => i + 1),
      ...BOSS_LEVELS.map((id) => `boss-${id}`),
    ]);
    for (const r of played) expect(r.ticks, `row ${r.id}`).toBeGreaterThan(1);
    expect(new Set(played.map((r) => r.hash)).size).toBe(played.length);
  });

  it('fights four of the five bosses to their death, and pins the fifth at its longest fight', () => {
    for (const id of BOSS_LEVELS) {
      const play = plays.find((p) => p.row.id === `boss-${id}`)!;
      // A campaign level with no waves clears exactly when its boss dies, so a cleared boss row
      // pins the whole fight — every phase, the death and the score it pays — not just its opening.
      expect(play.cleared, `boss ${id}`).toBe(BOSS_KILLED[id]);
      // That level's only score comes from the boss, so it pays exactly when the boss falls.
      expect(play.row.score > 0, `boss ${id}`).toBe(BOSS_KILLED[id]);
    }
  });
});
