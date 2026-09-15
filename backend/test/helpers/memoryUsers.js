/** In-memory stand-in for `db/users.js`. Pre-seeded with `TEST_USER` from `memoryRankedRuns.js`. */
import { TEST_USER } from './memoryRankedRuns.js';

const users = new Map([[TEST_USER.wallet_address, { id: TEST_USER.id, wallet_address: TEST_USER.wallet_address, username: TEST_USER.username }]]);

export function reset() {
  users.clear();
  users.set(TEST_USER.wallet_address, { id: TEST_USER.id, wallet_address: TEST_USER.wallet_address, username: TEST_USER.username });
}

export async function findOrCreateWalletUser(walletAddress) {
  const found = users.get(walletAddress);
  if (found) return found;
  const username = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  const created = { id: users.size + 1, wallet_address: walletAddress, username };
  users.set(walletAddress, created);
  return created;
}

export async function findUsersByWallets(addresses) {
  return addresses.map((address) => users.get(address)).filter(Boolean);
}

export async function getSeekerMint(walletAddress) {
  return users.get(walletAddress)?.seeker_mint ?? null;
}

export async function findWalletBySeekerMint(sgtMint) {
  const found = [...users.values()].find((user) => user.seeker_mint === sgtMint);
  return found ? found.wallet_address : null;
}

export async function setSeekerMint(walletAddress, sgtMint) {
  const user = users.get(walletAddress);
  if (!user) return;
  users.set(walletAddress, { ...user, seeker_mint: sgtMint, seeker_linked_at: new Date() });
}

export async function findSeekerWallets(addresses) {
  return addresses.filter((address) => Boolean(users.get(address)?.seeker_mint));
}
