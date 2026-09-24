// Devnet faucet: mints test SKR to a wallet, but only while the server authority keeps a SOL
// reserve for the weekly crank and settlement, which it also pays for. `mintTestTokens` itself
// throws on any failure of the underlying create/mint transactions (an unfunded server key, an
// RPC error, ...) - both that case and a balance under the reserve are reported here as a
// `FaucetUnavailableError` the route maps to a 503, instead of a generic 500.
import { chainConfig } from '../chain/config.js';
import { getSolBalance } from '../chain/readers.js';
import { mintTestTokens } from '../chain/txs.js';

export const FAUCET_AMOUNT = 100_000_000; // 100 test SKR (6 decimals)
const DEFAULT_RESERVE_SOL = 0.5;

/** The SOL the server authority keeps for the crank, in lamports: `FAUCET_MIN_SOL` (default 0.5 SOL). */
export function faucetReserveLamports() {
  const sol = Number.parseFloat(process.env.FAUCET_MIN_SOL ?? '');
  return BigInt(Math.round((Number.isFinite(sol) && sol >= 0 ? sol : DEFAULT_RESERVE_SOL) * 1e9));
}

export class FaucetUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FaucetUnavailableError';
  }
}

/** Mints `FAUCET_AMOUNT` test SKR to `wallet`, after checking the server authority stays above its SOL reserve. */
export async function claimFaucet(wallet) {
  const { serverAuthority } = chainConfig();
  const balance = await getSolBalance(serverAuthority.publicKey);
  if (balance < faucetReserveLamports()) {
    throw new FaucetUnavailableError('The server authority is below its SOL reserve; fund it to reopen the faucet');
  }
  try {
    return await mintTestTokens(wallet, FAUCET_AMOUNT);
  } catch {
    throw new FaucetUnavailableError('The faucet transaction did not land; check the server authority balance and the RPC');
  }
}
