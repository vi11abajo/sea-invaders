// Re-checks every ranked run of a closed day against the public API, without trusting the server:
// it downloads the day's seed and replays (GET /api/daily/replays/:day), re-simulates each replay
// with this checkout's game core, and compares the score, ticks, state hash and game-over flag
// with what the server recorded.
//
//   npm run build:core            (once, in backend/)
//   npm run verify:replays -- 20727 [--api https://api.seainvaders.xyz]
//
// A run recorded on another core version is listed as skipped: check out the commit that shipped
// that core to judge it. The exit code is 1 when any run does not match.
import { pathToFileURL } from 'node:url';
import { CORE_VERSION, decodeReplay } from '@sea-invaders/core';
import { simulateDailyReplay } from '../services/dailyReplay.js';

export const DEFAULT_API = 'https://api.seainvaders.xyz';

/** Re-simulates one published run on `seed`: `match`, `mismatch` (with what differs) or `skipped` (another core). */
export function checkRun(run, seed) {
  const base = { runId: run.runId, walletAddress: run.walletAddress, score: run.score };
  if (run.coreVersion !== CORE_VERSION) {
    return { ...base, status: 'skipped', detail: `recorded on core ${run.coreVersion}; this checkout plays core ${CORE_VERSION}` };
  }
  let result;
  try {
    result = simulateDailyReplay(decodeReplay(new Uint8Array(Buffer.from(run.replay, 'base64'))), seed);
  } catch (error) {
    return { ...base, status: 'mismatch', detail: error.message };
  }
  const differences = [];
  if (result.score !== run.score) differences.push(`score ${result.score}, recorded ${run.score}`);
  if (result.ticks !== run.ticks) differences.push(`ticks ${result.ticks}, recorded ${run.ticks}`);
  if (result.hash !== run.stateHash) differences.push(`state hash ${result.hash}, recorded ${run.stateHash}`);
  if (result.over !== run.gameOver) differences.push(`game over ${result.over}, recorded ${run.gameOver}`);
  return differences.length > 0 ? { ...base, status: 'mismatch', detail: differences.join('; ') } : { ...base, status: 'match', detail: '' };
}

/** Downloads every page of a day's published replays: `{ day, seed, runs }`. */
export async function fetchDay(api, day, fetchImpl = fetch) {
  const runs = [];
  let seed = null;
  for (let offset = 0; ;) {
    const res = await fetchImpl(`${api}/api/daily/replays/${day}?offset=${offset}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
    seed = body.seed;
    runs.push(...body.runs);
    if (body.runs.length < body.limit) break;
    offset += body.runs.length;
  }
  return { day, seed, runs };
}

async function main(args) {
  const apiAt = args.indexOf('--api');
  const api = apiAt >= 0 ? args[apiAt + 1] : DEFAULT_API;
  const dayArg = args.find((arg, i) => /^\d+$/.test(arg) && args[i - 1] !== '--api');
  if (!dayArg || !api) {
    console.error('Usage: npm run verify:replays -- <day> [--api https://api.seainvaders.xyz]');
    process.exitCode = 2;
    return;
  }
  const { day, seed, runs } = await fetchDay(api.replace(/\/+$/, ''), Number(dayArg));
  const counts = { match: 0, mismatch: 0, skipped: 0 };
  for (const run of runs) {
    const checked = checkRun(run, seed);
    counts[checked.status] += 1;
    console.log(`${checked.status.padEnd(8)} ${String(checked.score).padStart(9)}  ${checked.walletAddress}  ${checked.runId}${checked.detail ? `  (${checked.detail})` : ''}`);
  }
  console.log(`Day ${day}: ${runs.length} verified run(s) published; ${counts.match} match, ${counts.mismatch} mismatch, ${counts.skipped} skipped.`);
  if (counts.mismatch > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
