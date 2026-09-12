// Ticket purchase confirmation. Kept separate from `records.js` since it only needs the
// player-cache invalidation and the attempts recompute, not the record/week machinery.
import * as db from '../db/rankedRuns.js';
import { getTransactionStatus } from '../chain/readers.js';
import { dayOf } from './dailySeed.js';
import { RankedRunError, attemptsBoughtToday, clearPlayerCache, freeAttempts, getCachedPlayer } from './rankedRuns.js';

/**
 * Confirms a `buy_ticket` (+ optional `create_player`) transaction. Once it lands, the cached
 * player account is stale (it still shows the old `attemptsBought`), so the cache is cleared
 * before recomputing `attemptsLeft` the same way `todayInfo` does.
 */
export async function confirmTicket({ userId, wallet, signature, now }) {
  const status = await getTransactionStatus(signature);
  if (status === 'failed') throw new RankedRunError('ticket_failed', 'The ticket transaction failed on chain');
  if (status !== 'confirmed') return { confirmed: false };

  clearPlayerCache(wallet);
  const day = dayOf(now);
  const [player, used] = await Promise.all([getCachedPlayer(wallet), db.countRunsForDay(userId, day)]);
  const attemptsAllowed = freeAttempts() + attemptsBoughtToday(player, day);
  return { confirmed: true, attemptsLeft: Math.max(0, attemptsAllowed - used) };
}
