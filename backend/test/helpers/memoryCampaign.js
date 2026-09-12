/** In-memory stand-in for `db/campaign.js`. */
const progressByUser = new Map(); // userId -> stored progress object

export function reset() {
  progressByUser.clear();
}

export async function getProgress(userId) {
  return progressByUser.get(userId) ?? null;
}

export async function upsertProgress(userId, data) {
  progressByUser.set(userId, data);
}
