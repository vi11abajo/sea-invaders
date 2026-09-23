import pool from '../config/database.js';

async function findWalletUser(walletAddress) {
  const found = await pool.query('SELECT id, wallet_address, username FROM users WHERE wallet_address = $1', [walletAddress]);
  return found.rows[0] ?? null;
}

/**
 * Finds the user for a wallet or creates one whose display name is the shortened address. Two
 * first sign-ins of one wallet can race: the unique wallet index lets one insert win, and the
 * other finds nothing inserted and reads the winner's row instead of failing.
 */
export async function findOrCreateWalletUser(walletAddress) {
  const found = await findWalletUser(walletAddress);
  if (found) return found;
  const username = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  const inserted = await pool.query(
    `INSERT INTO users (wallet_address, username) VALUES ($1, $2)
     ON CONFLICT (wallet_address) WHERE wallet_address IS NOT NULL DO NOTHING
     RETURNING id, wallet_address, username`,
    [walletAddress, username],
  );
  return inserted.rows[0] ?? (await findWalletUser(walletAddress));
}

/** Batch-looks-up users by wallet address, for annotating a list of on-chain wallets with usernames. */
export async function findUsersByWallets(addresses) {
  if (!addresses || addresses.length === 0) return [];
  const result = await pool.query('SELECT id, wallet_address, username FROM users WHERE wallet_address = ANY($1)', [addresses]);
  return result.rows;
}

// The Seeker mirror (design doc §3): a copy of the on-chain link, written at confirm time so the
// leaderboards can render the SEEKER badge without one chain read per row. `Player.seeker` and the
// `SeekerLink` PDA stay the truth - nothing here ever grants a badge the chain does not show.

/** The Seeker Genesis Token mint a wallet has linked, or `null` when it has linked none. */
export async function getSeekerMint(walletAddress) {
  const result = await pool.query('SELECT seeker_mint FROM users WHERE wallet_address = $1', [walletAddress]);
  return result.rows[0]?.seeker_mint ?? null;
}

/** The wallet the mirror already holds `sgtMint` for, or `null` - the mirror's half of the one-token-one-player rule. */
export async function findWalletBySeekerMint(sgtMint) {
  const result = await pool.query('SELECT wallet_address FROM users WHERE seeker_mint = $1', [sgtMint]);
  return result.rows[0]?.wallet_address ?? null;
}

/** Records a confirmed link. A wallet with no user row (never signed in) is simply left alone. */
export async function setSeekerMint(walletAddress, sgtMint) {
  await pool.query('UPDATE users SET seeker_mint = $2, seeker_linked_at = NOW() WHERE wallet_address = $1', [walletAddress, sgtMint]);
}

/** The subset of `addresses` whose users have a linked Seeker Genesis Token, in one query - the leaderboards' badge lookup. */
export async function findSeekerWallets(addresses) {
  if (!addresses || addresses.length === 0) return [];
  const result = await pool.query(
    'SELECT wallet_address FROM users WHERE wallet_address = ANY($1) AND seeker_mint IS NOT NULL',
    [addresses],
  );
  return result.rows.map((row) => row.wallet_address);
}
