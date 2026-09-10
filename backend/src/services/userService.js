import pool from '../config/database.js';

/**
 * Create or Update user from Discord data
 */
export async function upsertUser(discordUser) {
  const { id, username, discriminator, avatar, email } = discordUser;

  try {
    const result = await pool.query(
      `INSERT INTO users (discord_id, username, discriminator, avatar, email)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (discord_id)
       DO UPDATE SET
         username = EXCLUDED.username,
         discriminator = EXCLUDED.discriminator,
         avatar = EXCLUDED.avatar,
         email = EXCLUDED.email,
         updated_at = NOW()
       RETURNING *`,
      [id, username, discriminator, avatar, email]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Error upserting user:', error);
    throw error;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId) {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by ID:', error);
    throw error;
  }
}

/**
 * Get user by Discord ID
 */
export async function getUserByDiscordId(discordId) {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE discord_id = $1',
      [discordId]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by Discord ID:', error);
    throw error;
  }
}

/**
 * Get user statistics
 */
export async function getUserStats(userId) {
  try {
    const result = await pool.query(
      `SELECT us.*, u.username, u.avatar
       FROM user_stats us
       JOIN users u ON us.user_id = u.id
       WHERE us.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // If statistics don't exist, create empty
      await pool.query(
        'INSERT INTO user_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [userId]
      );

      return {
        user_id: userId,
        total_games: 0,
        best_score: 0,
        total_score: 0,
        avg_score: 0,
        max_level_reached: 0,
        total_playtime: 0,
        tournaments_participated: 0,
        tournaments_won: 0,
      };
    }

    return result.rows[0];
  } catch (error) {
    console.error('Error getting user stats:', error);
    throw error;
  }
}

export default {
  upsertUser,
  getUserById,
  getUserByDiscordId,
  getUserStats,
};
