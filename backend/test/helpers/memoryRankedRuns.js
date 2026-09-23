/** The one user the fakes know about; tests sign tokens for it. */
export const TEST_USER = { id: 7, wallet_address: 'Ab12xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxCd34', username: 'Ab12...Cd34' };

const runs = new Map();
const users = new Map([[TEST_USER.id, TEST_USER]]);

export function reset() {
  runs.clear();
}

/** Test seeding: stores a run as `started`, with no attempt check (the service goes through `insertRunWithinAttempts`). */
export async function insertRun(run) {
  runs.set(run.id, { skin: 0, ...run, status: 'started' });
}

export async function getRun(id) {
  return runs.get(id) ?? null;
}

/** Mirrors the real query: a run closed as `update_required` is not a spent attempt, everything else is. */
export async function countRunsForDay(userId, day) {
  return [...runs.values()].filter((r) => r.userId === userId && r.day === day && r.status !== 'update_required').length;
}

/** Stands in for the advisory lock of the real transaction: every count-and-insert waits for the one before it. */
let lockTail = Promise.resolve();

/**
 * Mirrors the real transaction: counts the user's runs for the day and inserts `run` only while
 * fewer than `allowed` were spent. The yield between the count and the insert stands in for the
 * database round trip there, so without the lock parallel calls would all read the same count.
 */
export function insertRunWithinAttempts(run, allowed) {
  const result = lockTail.then(async () => {
    const used = await countRunsForDay(run.userId, run.day);
    await new Promise((resolve) => setImmediate(resolve));
    if (used >= allowed) return { inserted: false, used };
    await insertRun(run);
    return { inserted: true, used };
  });
  lockTail = result.catch(() => {});
  return result;
}

/** Mirrors the real update: only a `started` run is closed, and the answer says whether this call closed it. */
export async function finishRun(id, patch) {
  const run = runs.get(id);
  if (!run || run.status !== 'started') return false;
  runs.set(id, { ...run, ...patch });
  return true;
}

/** Test-only: overwrites fields of a stored run whatever its status, e.g. to simulate a later correction of its score. */
export function patchRun(id, patch) {
  runs.set(id, { ...runs.get(id), ...patch });
}

export async function bestForDay(userId, day) {
  const best = [...runs.values()]
    .filter((r) => r.userId === userId && r.day === day && r.status === 'verified')
    .sort((a, b) => b.score - a.score || a.finishedAt - b.finishedAt)[0];
  return best ? { score: best.score, runId: best.id, skin: best.skin ?? 0 } : null;
}

export async function leaderboardForDay(day, limit) {
  const bestPerUser = new Map();
  for (const r of [...runs.values()].filter((r) => r.day === day && r.status === 'verified')) {
    const cur = bestPerUser.get(r.userId);
    if (!cur || r.score > cur.score || (r.score === cur.score && r.finishedAt < cur.finishedAt)) bestPerUser.set(r.userId, r);
  }
  return [...bestPerUser.values()]
    .sort((a, b) => b.score - a.score || a.finishedAt - b.finishedAt)
    .slice(0, limit)
    .map((r) => ({
      userId: r.userId,
      username: users.get(r.userId)?.username ?? '',
      walletAddress: users.get(r.userId)?.wallet_address ?? '',
      score: r.score,
      runId: r.id,
      skin: r.skin ?? 0,
    }));
}

/** The skin of each user's highest-scoring verified run among `days` (tie: earliest finished), for a batch of users at once. */
export async function bestSkinForUsers(userIds, days) {
  const idSet = new Set(userIds);
  const daySet = new Set(days);
  const bestPerUser = new Map();
  for (const r of runs.values()) {
    if (r.status !== 'verified' || !idSet.has(r.userId) || !daySet.has(r.day)) continue;
    const cur = bestPerUser.get(r.userId);
    if (!cur || r.score > cur.score || (r.score === cur.score && r.finishedAt < cur.finishedAt)) bestPerUser.set(r.userId, r);
  }
  return [...bestPerUser.entries()].map(([userId, r]) => ({ userId, skin: r.skin ?? 0 }));
}

export async function verifiedRunsForDay(day, limit) {
  return [...runs.values()].filter((r) => r.day === day && r.status === 'verified').sort((a, b) => b.score - a.score || a.finishedAt - b.finishedAt).slice(0, limit);
}
