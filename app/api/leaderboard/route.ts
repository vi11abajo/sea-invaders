import { NextRequest, NextResponse } from 'next/server';
// Conditional import to prevent errors if DB is not configured
let pool: any = null;
try {
  pool = require('@/lib/db').default;
} catch (error) {
  console.error('⚠️  Failed to import database pool:', error);
}

// Types for leaderboard entries
interface LeaderboardEntry {
  rank: number;
  player: string;
  score: number;
  level: number;
  date: string;
  avatar?: string;
  username?: string;
}

// Start and end of the week (Monday 00:01 UTC - Sunday 23:59 UTC)
function getWeekBounds() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday

  // Start of the week (Monday 00:00:01 UTC)
  const startOfWeek = new Date(now);
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // on Sunday, go back 6 days
  startOfWeek.setUTCDate(now.getUTCDate() - daysToMonday);
  startOfWeek.setUTCHours(0, 0, 1, 0);

  // End of the week (Sunday 23:59:59 UTC)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
  endOfWeek.setUTCHours(23, 59, 59, 999);

  return { startOfWeek, endOfWeek };
}

// Start and end of the day (00:00:01 - 23:59:59 UTC)
function getDayBounds() {
  const now = new Date();

  // Start of the day (00:00:01 UTC)
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 1, 0);

  // End of the day (23:59:59 UTC)
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);

  return { startOfDay, endOfDay };
}

export async function GET(request: NextRequest) {
  try {
    // Check if pool was imported successfully
    if (!pool) {
      return NextResponse.json({
        success: true,
        entries: [],
        total: 0,
        page: 1,
        limit: 50,
        hasMore: false,
        message: 'Database pool not initialized - check DB configuration',
      });
    }

    // Check if database is available
    try {
      await pool.query('SELECT 1');
    } catch (dbError) {
      console.error('⚠️  Database not available:', dbError);
      return NextResponse.json({
        success: true,
        entries: [],
        total: 0,
        page: 1,
        limit: 50,
        hasMore: false,
        message: 'Database not available - please configure DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD',
      });
    }

    const searchParams = request.nextUrl.searchParams;
    const filter = searchParams.get('filter') || 'all'; // all, weekly, daily
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = '';
    let params: any[] = [];

    // Build the SQL query for the selected filter
    switch (filter) {
      case 'weekly': {
        const { startOfWeek, endOfWeek } = getWeekBounds();
        query = `
          SELECT
            ROW_NUMBER() OVER (ORDER BY s.score DESC) as rank,
            COALESCE(u.username, u.fid::text, 'Player') as player,
            s.score,
            s.level_reached as level,
            to_char(s.created_at, 'YYYY-MM-DD') as date,
            u.avatar,
            u.username
          FROM scores s
          LEFT JOIN users u ON s.user_id = u.id
          WHERE s.created_at >= $1 AND s.created_at <= $2
          ORDER BY s.score DESC
          LIMIT $3 OFFSET $4
        `;
        params = [startOfWeek.toISOString(), endOfWeek.toISOString(), limit, (page - 1) * limit];
        break;
      }

      case 'daily': {
        const { startOfDay, endOfDay } = getDayBounds();
        query = `
          SELECT
            ROW_NUMBER() OVER (ORDER BY s.score DESC) as rank,
            COALESCE(u.username, u.fid::text, 'Player') as player,
            s.score,
            s.level_reached as level,
            to_char(s.created_at, 'YYYY-MM-DD') as date,
            u.avatar,
            u.username
          FROM scores s
          LEFT JOIN users u ON s.user_id = u.id
          WHERE s.created_at >= $1 AND s.created_at <= $2
          ORDER BY s.score DESC
          LIMIT $3 OFFSET $4
        `;
        params = [startOfDay.toISOString(), endOfDay.toISOString(), limit, (page - 1) * limit];
        break;
      }

      case 'all':
      default: {
        query = `
          SELECT
            ROW_NUMBER() OVER (ORDER BY s.score DESC) as rank,
            COALESCE(u.username, u.fid::text, 'Player') as player,
            s.score,
            s.level_reached as level,
            to_char(s.created_at, 'YYYY-MM-DD') as date,
            u.avatar,
            u.username
          FROM scores s
          LEFT JOIN users u ON s.user_id = u.id
          ORDER BY s.score DESC
          LIMIT $1 OFFSET $2
        `;
        params = [limit, (page - 1) * limit];
        break;
      }
    }

    // Run the query
    const result = await pool.query(query, params);

    // Total row count for pagination
    let totalQuery = 'SELECT COUNT(*) FROM scores';
    let totalParams: any[] = [];

    if (filter === 'weekly') {
      const { startOfWeek, endOfWeek } = getWeekBounds();
      totalQuery += ' WHERE created_at >= $1 AND created_at <= $2';
      totalParams = [startOfWeek.toISOString(), endOfWeek.toISOString()];
    } else if (filter === 'daily') {
      const { startOfDay, endOfDay } = getDayBounds();
      totalQuery += ' WHERE created_at >= $1 AND created_at <= $2';
      totalParams = [startOfDay.toISOString(), endOfDay.toISOString()];
    }

    const totalResult = await pool.query(totalQuery, totalParams);
    const total = parseInt(totalResult.rows[0].count);

    // Map rows to LeaderboardEntry
    const entries: LeaderboardEntry[] = result.rows.map((row: any) => ({
      rank: parseInt(row.rank),
      player: row.player,
      score: row.score,
      level: row.level,
      date: row.date,
      avatar: row.avatar,
      username: row.username,
    }));

    return NextResponse.json({
      success: true,
      entries,
      total,
      page,
      limit,
      hasMore: (page * limit) < total,
    });
  } catch (error) {
    console.error('Leaderboard API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}

// POST endpoint for adding new scores
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { player, score, level } = body;

    // Validate input
    if (!player || !score || !level) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (typeof score !== 'number' || score < 0 || score > 1000000) {
      return NextResponse.json(
        { success: false, error: 'Invalid score value' },
        { status: 400 }
      );
    }

    // Insert the new result
    const result = await pool.query(
      'INSERT INTO leaderboard (player, score, level, date) VALUES ($1, $2, $3, NOW()) RETURNING id',
      [player, score, level]
    );

    // Get the player's rank
    const rankResult = await pool.query(
      'SELECT COUNT(*) + 1 as rank FROM leaderboard WHERE score > $1',
      [score]
    );

    const rank = parseInt(rankResult.rows[0].rank);

    console.log('New score submitted:', { player, score, level, rank });

    return NextResponse.json({
      success: true,
      message: 'Score submitted successfully',
      rank,
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error('Score submission error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit score' },
      { status: 500 }
    );
  }
}
