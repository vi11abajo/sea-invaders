import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  userId: number;
  walletAddress?: string;
  username?: string;
}

export function verifyToken(token: string): AuthUser | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('JWT_SECRET is not configured; rejecting token');
    return null;
  }
  try {
    const decoded = jwt.verify(token, secret, {
      issuer: 'sea-invaders',
      audience: 'sea-invaders-players',
    }) as any;

    return {
      userId: decoded.userId,
      walletAddress: decoded.walletAddress,
      username: decoded.username,
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

export function getAuthUser(request: NextRequest): AuthUser | null {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  return verifyToken(token);
}
