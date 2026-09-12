// Devnet-only helpers. `createApp.js` mounts this router only when `SOLANA_CLUSTER=devnet`.
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { FaucetUnavailableError, claimFaucet } from '../services/faucet.js';

const router = express.Router();

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
    const { signature } = await claimFaucet(wallet);
    lastFaucetAt.set(wallet, now);
    res.json({ signature, amountSkr: 100 });
  } catch (error) {
    if (error instanceof FaucetUnavailableError) {
      return res.status(503).json({ error: 'FaucetUnavailable', message: error.message });
    }
    next(error);
  }
});

/** Test-only: clears the per-wallet cooldown so tests stay independent. */
export function resetFaucetCooldown() {
  lastFaucetAt.clear();
}

export default router;
