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
    const { sessionId, events } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId' },
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
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Update last heartbeat time and events
    await pool.query(
      'UPDATE game_sessions SET last_heartbeat = NOW(), events = $1 WHERE session_id = $2',
      [JSON.stringify(events || []), sessionId]
    );

    return NextResponse.json({
      success: true,
      message: 'Heartbeat received',
    });
  } catch (error) {
    console.error('❌ Heartbeat error:', error);
    return NextResponse.json(
      {
        error: 'ServerError',
        message: error instanceof Error ? error.message : 'Heartbeat failed',
      },
      { status: 500 }
    );
  }
}
