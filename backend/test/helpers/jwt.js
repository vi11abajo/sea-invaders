import jwt from 'jsonwebtoken';

export const TEST_SECRET = 'test-secret-that-is-long-enough-for-hs256-0123456789';
process.env.JWT_SECRET = TEST_SECRET;

/** A token the app's authenticateToken middleware accepts. */
export function tokenFor(user) {
  return jwt.sign(
    { userId: user.id, walletAddress: user.wallet_address, username: user.username },
    TEST_SECRET,
    { algorithm: 'HS256', issuer: 'sea-invaders', audience: 'sea-invaders-players', expiresIn: '1h' },
  );
}
