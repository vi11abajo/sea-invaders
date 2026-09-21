import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { INVARIANCE_SCENARIOS, playInvarianceScenario, type InvarianceResult } from './helpers/invariance-script';

/**
 * The safety net of the second campaign: every level of the first one is played with a frozen input
 * script and compared, tick for tick and hash for hash, against a snapshot taken at core v10.
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

// Computed lazily in `beforeAll` (not at module load): this replays thirty campaign levels.
let played: InvarianceResult[];

describe('v10 invariance', () => {
  beforeAll(() => {
    played = INVARIANCE_SCENARIOS.map(playInvarianceScenario);
  });

  it('plays every level of the first campaign exactly as core v10 did', () => {
    if (process.env.UPDATE_INVARIANCE === '1') writeFileSync(FILE, `${JSON.stringify(played, null, 2)}\n`);
    const committed = JSON.parse(readFileSync(FILE, 'utf8')) as InvarianceResult[];
    expect(committed.length).toBe(played.length);
    for (const expected of committed) {
      const actual = played.find((r) => r.id === expected.id);
      expect(actual, `campaign level ${expected.id}`).toEqual(expected);
    }
  });

  it('covers levels 1 to 30, each simulated into an end state of its own', () => {
    expect(played.map((r) => r.id)).toEqual(Array.from({ length: LEGACY_LEVELS }, (_, i) => i + 1));
    for (const r of played) expect(r.ticks, `campaign level ${r.id}`).toBeGreaterThan(1);
    expect(new Set(played.map((r) => r.hash)).size).toBe(LEGACY_LEVELS);
  });
});
