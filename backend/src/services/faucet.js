// Devnet faucet: mints test SKR to a wallet, but only after checking the server authority
// has enough SOL to pay for it. `mintTestTokens` itself throws on any failure of the
// underlying create/mint transactions (an unfunded server key, an RPC error, ...) - both
// that case and a too-low balance are reported here as a `FaucetUnavailableError` the route
// maps to a 503, instead of a generic 500.
import { chainConfig } from '../chain/config.js';
import { getSolBalance } from '../chain/readers.js';
import { mintTestTokens } from '../chain/txs.js';

export const FAUCET_AMOUNT = 100_000_000; // 100 test SKR (6 decimals)
export const FAUCET_MIN_LAMPORTS = 10_000_000n; // 0.01 SOL - below this, fees/rent will fail

export class FaucetUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FaucetUnavailableError';
  }
}

/** Mints `FAUCET_AMOUNT` test SKR to `wallet`, after checking the server authority can pay for it. */
export async function claimFaucet(wallet) {
  const { serverAuthority } = chainConfig();
  const balance = await getSolBalance(serverAuthority.publicKey);
  if (balance < FAUCET_MIN_LAMPORTS) {
    throw new FaucetUnavailableError('The faucet key has no SOL for fees; fund the server authority');
  }
  try {
    return await mintTestTokens(wallet, FAUCET_AMOUNT);
  } catch {
    throw new FaucetUnavailableError('The faucet transaction did not land; check the server authority balance and the RPC');
  }
}
