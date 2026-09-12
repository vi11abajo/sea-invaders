import pool from '../config/database.js';

/** Upserts the confirmed on-chain record for `(userId, day)`. */
export async function upsertRecord({ userId, day, score, signature }) {
  await pool.query(
    `INSERT INTO ranked_records (user_id, day, score, signature, confirmed_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, day) DO UPDATE SET score = EXCLUDED.score, signature = EXCLUDED.signature, confirmed_at = NOW()`,
    [userId, day, score, signature],
  );
}

export async function getRecord(userId, day) {
  const result = await pool.query('SELECT * FROM ranked_records WHERE user_id = $1 AND day = $2', [userId, day]);
  const row = result.rows[0];
  if (!row) return null;
  return { userId: row.user_id, day: row.day, score: row.score, signature: row.signature, confirmedAt: row.confirmed_at };
}
