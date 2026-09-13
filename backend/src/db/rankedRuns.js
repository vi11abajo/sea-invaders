import pool from '../config/database.js';

const toIso = (unixSeconds) => new Date(unixSeconds * 1000).toISOString();

function rowToRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    day: row.day,
    seed: row.seed,
    coreVersion: row.core_version,
    startedAt: Math.floor(new Date(row.started_at).getTime() / 1000),
    finishedAt: row.finished_at ? Math.floor(new Date(row.finished_at).getTime() / 1000) : null,
    ticks: row.ticks,
    score: row.score,
    stateHash: row.state_hash,
    gameOver: row.game_over,
    status: row.status,
    skin: row.skin,
  };
}

export async function insertRun({ id, userId, day, seed, coreVersion, startedAt, skin }) {
  await pool.query(
    'INSERT INTO ranked_runs (id, user_id, day, seed, core_version, started_at, skin) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, userId, day, seed, coreVersion, toIso(startedAt), skin ?? 0],
  );
}

export async function getRun(id) {
  const result = await pool.query('SELECT * FROM ranked_runs WHERE id = $1', [id]);
  return rowToRun(result.rows[0]);
}

export async function countRunsForDay(userId, day) {
  const result = await pool.query('SELECT COUNT(*)::int AS n FROM ranked_runs WHERE user_id = $1 AND day = $2', [userId, day]);
  return result.rows[0].n;
}

export async function finishRun(id, { finishedAt, ticks, score, stateHash, gameOver, replay, status, rejectReason }) {
  await pool.query(
    `UPDATE ranked_runs
       SET finished_at = $2, ticks = $3, score = $4, state_hash = $5, game_over = $6, replay = $7, status = $8, reject_reason = $9
     WHERE id = $1`,
    [id, toIso(finishedAt), ticks ?? null, score ?? null, stateHash ?? null, gameOver ?? null, replay ?? null, status, rejectReason ?? null],
  );
}

export async function bestForDay(userId, day) {
  const result = await pool.query(
    `SELECT id, score, skin FROM ranked_runs WHERE user_id = $1 AND day = $2 AND status = 'verified' ORDER BY score DESC, finished_at ASC LIMIT 1`,
    [userId, day],
  );
  return result.rows[0] ? { score: result.rows[0].score, runId: result.rows[0].id, skin: result.rows[0].skin } : null;
}

export async function leaderboardForDay(day, limit) {
  const result = await pool.query(
    `SELECT DISTINCT ON (r.user_id) r.user_id, u.username, u.wallet_address, r.score, r.id, r.finished_at, r.skin
       FROM ranked_runs r JOIN users u ON u.id = r.user_id
      WHERE r.day = $1 AND r.status = 'verified'
      ORDER BY r.user_id, r.score DESC, r.finished_at ASC`,
    [day],
  );
  return result.rows
    .sort((a, b) => b.score - a.score || new Date(a.finished_at) - new Date(b.finished_at))
    .slice(0, limit)
    .map((row) => ({ userId: row.user_id, username: row.username, walletAddress: row.wallet_address, score: row.score, runId: row.id, skin: row.skin }));
}

/** The skin of each `userIds` user's highest-scoring verified run among `days` (tie: earliest finished), in one query. */
export async function bestSkinForUsers(userIds, days) {
  if (!userIds || userIds.length === 0) return [];
  const result = await pool.query(
    `SELECT DISTINCT ON (user_id) user_id, skin
       FROM ranked_runs
      WHERE user_id = ANY($1) AND day = ANY($2) AND status = 'verified'
      ORDER BY user_id, score DESC, finished_at ASC`,
    [userIds, days],
  );
  return result.rows.map((row) => ({ userId: row.user_id, skin: row.skin }));
}

export async function verifiedRunsForDay(day, limit) {
  const result = await pool.query(
    `SELECT * FROM ranked_runs WHERE day = $1 AND status = 'verified' ORDER BY score DESC, finished_at ASC LIMIT $2`,
    [day, limit],
  );
  return result.rows.map((row) => ({ ...rowToRun(row), replay: row.replay }));
}
