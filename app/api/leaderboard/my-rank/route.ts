import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const user = getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's rank in the leaderboard
    const result = await pool.query(
      `WITH ranked_scores AS (
        SELECT
          user_id,
          MAX(score) as best_score,
          ROW_NUMBER() OVER (ORDER BY MAX(score) DESC) as rank
        FROM scores
        GROUP BY user_id
      )
      SELECT rank, best_score
      FROM ranked_scores
      WHERE user_id = $1`,
      [user.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        rank: null,
        best_score: 0,
        message: 'No scores yet'
      });
    }

    return NextResponse.json({
      success: true,
      rank: parseInt(result.rows[0].rank),
      best_score: result.rows[0].best_score
    });
  } catch (error) {
    console.error('❌ My rank error:', error);
    return NextResponse.json(
      {
        error: 'ServerError',
        message: error instanceof Error ? error.message : 'Failed to get rank',
      },
      { status: 500 }
    );
  }
}
