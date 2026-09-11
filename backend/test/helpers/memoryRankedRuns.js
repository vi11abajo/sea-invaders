/** The one user the fakes know about; tests sign tokens for it. */
export const TEST_USER = { id: 7, wallet_address: 'Ab12xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxCd34', username: 'Ab12...Cd34' };

const runs = new Map();
const users = new Map([[TEST_USER.id, TEST_USER]]);

export function reset() {
  runs.clear();
}

export async function insertRun(run) {
  runs.set(run.id, { ...run, status: 'started' });
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
    .sort((a, b) => b.score - a.score)[0];
  return best ? { score: best.score, runId: best.id } : null;
}

export async function leaderboardForDay(day, limit) {
  const bestPerUser = new Map();
  for (const r of [...runs.values()].filter((r) => r.day === day && r.status === 'verified')) {
    const cur = bestPerUser.get(r.userId);
    if (!cur || r.score > cur.score) bestPerUser.set(r.userId, r);
  }
  return [...bestPerUser.values()]
    .sort((a, b) => b.score - a.score || a.finishedAt - b.finishedAt)
    .slice(0, limit)
    .map((r) => ({ userId: r.userId, username: users.get(r.userId)?.username ?? '', walletAddress: users.get(r.userId)?.wallet_address ?? '', score: r.score, runId: r.id }));
}

export async function verifiedRunsForDay(day, limit) {
  return [...runs.values()].filter((r) => r.day === day && r.status === 'verified').sort((a, b) => b.score - a.score).slice(0, limit);
}
