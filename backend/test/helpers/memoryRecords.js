/** In-memory stand-in for `db/records.js`. */
const records = new Map(); // `${userId}:${day}` -> record

function key(userId, day) {
  return `${userId}:${day}`;
}

export function reset() {
  records.clear();
}

/** Mirrors `db/records.js`'s upsert: never lowers an already-stored score. */
export async function upsertRecord({ userId, day, score, signature }) {
  const existing = records.get(key(userId, day));
  if (existing && score <= existing.score) return;
  records.set(key(userId, day), { userId, day, score, signature, confirmedAt: new Date().toISOString() });
}

export async function getRecord(userId, day) {
  return records.get(key(userId, day)) ?? null;
}
