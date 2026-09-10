import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const user = getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { sessionId, score, level, duration, enemiesKilled, accuracy } = body;

    if (!sessionId || score === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify session belongs to user
    const sessionCheck = await pool.query(
      'SELECT session_id, user_id FROM game_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (sessionCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (sessionCheck.rows[0].user_id !== user.userId) {
      return NextResponse.json(
        { error: 'Unauthorized - session belongs to another user' },
        { status: 403 }
      );
    }

    // Save score
    const result = await pool.query(
      `INSERT INTO scores (user_id, session_id, score, level_reached, game_duration, enemies_killed, accuracy)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, session_id, score, level_reached, game_duration, enemies_killed, accuracy, created_at`,
      [user.userId, sessionId, score, level || 1, duration || 0, enemiesKilled || 0, accuracy || 0]
    );

    const savedScore = result.rows[0];

    // Update session final_score and mark as validated
    await pool.query(
      'UPDATE game_sessions SET final_score = $1, is_valid = true WHERE session_id = $2',
      [score, sessionId]
    );

    return NextResponse.json({
      success: true,
      score: {
        id: savedScore.id,
        userId: savedScore.user_id,
        sessionId: savedScore.session_id,
        score: savedScore.score,
        level: savedScore.level_reached,
        duration: savedScore.game_duration,
        enemiesKilled: savedScore.enemies_killed,
        accuracy: savedScore.accuracy,
        createdAt: savedScore.created_at,
      },
    });
  } catch (error) {
    console.error('❌ Score submit error:', error);
    return NextResponse.json(
      {
        error: 'ServerError',
        message: error instanceof Error ? error.message : 'Failed to submit score',
      },
      { status: 500 }
    );
  }
}
