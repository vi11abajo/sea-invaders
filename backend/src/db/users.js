import pool from '../config/database.js';

/** Finds the user for a wallet or creates one whose display name is the shortened address. */
export async function findOrCreateWalletUser(walletAddress) {
  const found = await pool.query('SELECT id, wallet_address, username FROM users WHERE wallet_address = $1', [walletAddress]);
  if (found.rows.length > 0) return found.rows[0];
  const username = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  const inserted = await pool.query(
    'INSERT INTO users (wallet_address, username) VALUES ($1, $2) RETURNING id, wallet_address, username',
    [walletAddress, username],
  );
  return inserted.rows[0];
}

/** Batch-looks-up users by wallet address, for annotating a list of on-chain wallets with usernames. */
export async function findUsersByWallets(addresses) {
  if (!addresses || addresses.length === 0) return [];
  const result = await pool.query('SELECT id, wallet_address, username FROM users WHERE wallet_address = ANY($1)', [addresses]);
  return result.rows;
}
