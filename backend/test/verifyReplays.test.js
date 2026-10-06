import { CORE_VERSION, decodeReplay } from '@sea-invaders/core';
import { describe, expect, it } from 'vitest';
import { dailySeed } from '../src/services/dailySeed.js';
import { simulateDailyReplay } from '../src/services/dailyReplay.js';
import { checkRun, fetchDay } from '../src/tools/verifyReplays.js';
import { playReplay } from './helpers/play.js';

const SECRET = 'v'.repeat(40);
const seed = dailySeed(SECRET, 20_000);

/** A run as `/api/daily/replays/:day` publishes it, with the score and hash the server would have recorded. */
function publishedRun(overrides = {}) {
  const played = playReplay(seed, 900);
  const result = simulateDailyReplay(decodeReplay(new Uint8Array(Buffer.from(played.base64, 'base64'))), seed);
  return {
    runId: 'run-1', walletAddress: 'Wallet1111', coreVersion: CORE_VERSION,
    score: result.score, ticks: result.ticks, stateHash: result.hash, gameOver: result.over, finishedAt: 1, replay: played.base64,
    ...overrides,
  };
}

describe('checkRun', () => {
  it('matches a genuine run', () => {
    expect(checkRun(publishedRun(), seed)).toMatchObject({ runId: 'run-1', status: 'match' });
  });

  it('flags a score the replay does not produce', () => {
    const run = publishedRun();
    const checked = checkRun({ ...run, score: run.score + 1 }, seed);
    expect(checked.status).toBe('mismatch');
    expect(checked.detail).toContain(`score ${run.score}`);
  });

  it('flags a replay recorded on another seed', () => {
    expect(checkRun(publishedRun(), dailySeed(SECRET, 20_001)).status).toBe('mismatch');
  });

  it('skips a run recorded on another core version instead of judging it', () => {
    const checked = checkRun(publishedRun({ coreVersion: CORE_VERSION - 1 }), seed);
    expect(checked.status).toBe('skipped');
    expect(checked.detail).toContain(`core ${CORE_VERSION - 1}`);
  });
});

describe('fetchDay', () => {
  it('follows the pages until a short one', async () => {
    const pages = [
      { day: 5, seed: 's', offset: 0, limit: 2, runs: [{ runId: 'a' }, { runId: 'b' }] },
      { day: 5, seed: 's', offset: 2, limit: 2, runs: [{ runId: 'c' }] },
    ];
    const urls = [];
    const fakeFetch = async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => pages[urls.length - 1] };
    };
    const day = await fetchDay('https://api.example', 5, fakeFetch);
    expect(urls).toEqual(['https://api.example/api/daily/replays/5?offset=0', 'https://api.example/api/daily/replays/5?offset=2']);
    expect(day).toEqual({ day: 5, seed: 's', runs: [{ runId: 'a' }, { runId: 'b' }, { runId: 'c' }] });
  });

  it("reports the server's message for a day that is still open", async () => {
    const fakeFetch = async () => ({ ok: false, status: 404, json: async () => ({ message: 'Replays are published once the day closes' }) });
    await expect(fetchDay('https://api.example', 9, fakeFetch)).rejects.toThrow('Replays are published once the day closes');
  });
});
