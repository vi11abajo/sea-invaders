import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CORE_VERSION, checkGoldens, type Golden } from '../src';
import { GOLDEN_SCRIPTS, playScript } from './golden-scripts';

/**
 * The untuned baseline: the same eight golden scripts played with every `TUNING` knob back at
 * 100 %, keeping the same property under test — the knobs only scale speeds. Move a knob and the
 * tuned goldens change while this file must not; change anything else in the simulation and both
 * change together.
 *
 * Regenerate with `UPDATE_GOLDEN=1 npx vitest run test/golden-untuned.test.ts`, alongside the
 * tuned goldens.
 */
vi.mock('../src/config', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/config')>();
  return {
    ...m,
    TUNING: { octopiShotPct: 100, crabMovePct: 100, crabFirePct: 100 },
    SHOT: { ...m.SHOT, speed: m.UNTUNED_SPEED.octopiShot },
  };
});

const FILE = join(process.cwd(), 'golden', `golden-v${CORE_VERSION}-untuned.json`);
const TUNED_FILE = join(process.cwd(), 'golden', `golden-v${CORE_VERSION}.json`);

let fresh: Golden[];

describe('the untuned baseline', () => {
  beforeAll(() => {
    fresh = Object.keys(GOLDEN_SCRIPTS).map((name) => playScript(name).golden);
  });

  it('replaying live untuned play reproduces its result', () => {
    for (const check of checkGoldens(fresh)) expect(check.actual).toEqual(check.expected);
  });

  it('matches the committed untuned file (regenerate with UPDATE_GOLDEN=1)', () => {
    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(FILE, `${JSON.stringify(fresh)}\n`);
    const committed = JSON.parse(readFileSync(FILE, 'utf8')) as Golden[];
    for (const g of committed) expect(g.replay.version).toBe(CORE_VERSION);
    expect(checkGoldens(committed).every((c) => c.ok)).toBe(true);
    expect(committed).toEqual(fresh);
  });

  it('plays out differently from the tuned goldens, script for script', () => {
    const tuned = JSON.parse(readFileSync(TUNED_FILE, 'utf8')) as Golden[];
    expect(tuned.map((g) => g.name)).toEqual(fresh.map((g) => g.name));
    for (const g of fresh) {
      const t = tuned.find((x) => x.name === g.name)!;
      expect({ name: g.name, same: t.expected.hash === g.expected.hash }).toEqual({ name: g.name, same: false });
    }
  });
});
