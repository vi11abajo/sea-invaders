// Devnet-only helpers. `createApp.js` mounts this router only when `SOLANA_CLUSTER=devnet`.
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { mintTestTokens } from '../chain/txs.js';

const router = express.Router();

const FAUCET_AMOUNT = 100_000_000; // 100 test SKR (6 decimals)
const FAUCET_COOLDOWN_MS = 10 * 60 * 1000;
const lastFaucetAt = new Map(); // wallet -> ms timestamp

router.post('/faucet', authenticateToken, async (req, res, next) => {
  try {
    const wallet = req.user.walletAddress;
    const now = Date.now();
    const last = lastFaucetAt.get(wallet);
    if (last !== undefined && now - last < FAUCET_COOLDOWN_MS) {
      return res.status(429).json({ error: 'TooManyRequests', message: 'The faucet can only be used once every 10 minutes' });
    }
    const { signature } = await mintTestTokens(wallet, FAUCET_AMOUNT);
    lastFaucetAt.set(wallet, now);
    res.json({ signature, amountSkr: 100 });
  } catch (error) {
    next(error);
  }
});

/** Test-only: clears the per-wallet cooldown so tests stay independent. */
export function resetFaucetCooldown() {
  lastFaucetAt.clear();
}

export default router;
