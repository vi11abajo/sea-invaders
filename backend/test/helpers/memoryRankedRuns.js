/** The one user the fakes know about; tests sign tokens for it. */
export const TEST_USER = { id: 7, wallet_address: 'Ab12xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxCd34', username: 'Ab12...Cd34' };

const runs = new Map();
const users = new Map([[TEST_USER.id, TEST_USER]]);

export function reset() {
  runs.clear();
}

export async function insertRun(run) {
  runs.set(run.id, { skin: 0, ...run, status: 'started' });
}

export async function getRun(id) {
  return runs.get(id) ?? null;
}

export async function countRunsForDay(userId, day) {
  return [...runs.values()].filter((r) => r.userId === userId && r.day === day).length;
}

export async function finishRun(id, patch) {
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
