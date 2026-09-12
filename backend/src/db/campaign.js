import pool from '../config/database.js';

/** Returns the stored campaign progress JSON object for `userId`, or null if none exists yet. */
export async function getProgress(userId) {
  const result = await pool.query('SELECT data FROM campaign_progress WHERE user_id = $1', [userId]);
  const row = result.rows[0];
  return row ? row.data : null;
}

/** Upserts the campaign progress JSON for `userId`. `data.updatedAt` is epoch ms. */
export async function upsertProgress(userId, data) {
  await pool.query(
    `INSERT INTO campaign_progress (user_id, data, updated_at)
     VALUES ($1, $2, to_timestamp($3 / 1000.0))
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [userId, data, data.updatedAt],
  );
}
