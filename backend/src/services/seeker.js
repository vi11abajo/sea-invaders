// The Seeker Genesis Token link (design doc §3): a mainnet read proves the token, the wallet's
// signature proves consent, and the server's co-signature on `link_seeker` attests that the read
// passed. The link itself lives on chain (`Player.seeker` + the `SeekerLink` PDA); `db/users.js`
// only mirrors which mint it was, so the leaderboards can render the badge in one query.
//
// The badge changes nothing else: no scores, no prices, no attempts.
import { chainConfig, heliusAvailable } from '../chain/config.js';
import { findSeekerGenesisToken } from '../chain/helius.js';
import { getConfirmedInstructions, getPlayer, getSeekerLink } from '../chain/readers.js';
import { buildLinkSeekerTx } from '../chain/txs.js';
import { linkedSeekerMint } from '../chain/verify.js';
import * as usersDb from '../db/users.js';
import { clearPlayerCache } from './rankedRuns.js';

const STATUS = {
  seeker_unavailable: 503, no_seeker_token: 404, seeker_already_linked: 409,
  seeker_mint_taken: 409, link_failed: 409, invalid_transaction: 400,
};

export class SeekerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SeekerError';
    this.code = code;
    this.status = STATUS[code];
  }
}

/**
 * A wallet's link status: `{ linked, sgtMint }`. The chain decides `linked` (`Player.seeker`); the
 * mirror only remembers the mint, so a player linked on chain whose mirror row was never written
 * still reports `linked: true` with a `null` mint - and a mirror row the chain does not back grants
 * nothing at all.
 */
export async function readSeeker(wallet) {
  const [player, sgtMint] = await Promise.all([getPlayer(wallet), usersDb.getSeekerMint(wallet)]);
  const linked = Boolean(player?.seeker);
  return { linked, sgtMint: linked ? sgtMint ?? null : null };
}

/**
 * Finds the wallet's Genesis Token on mainnet and builds the `link_seeker` transaction for it,
 * partially signed by the server authority (`create_player` first when the wallet has no `Player`
 * PDA yet, exactly as the ticket and purchase builders do). Throws `seeker_unavailable` without a
 * Helius key, `seeker_already_linked` for a player the chain already links, `no_seeker_token` for a
 * wallet holding none, and `seeker_mint_taken` for a token already spoken for.
 *
 * The chain is asked before mainnet is: an already-linked player never costs a Helius call.
 */
export async function issueSeekerLink({ wallet }) {
  if (!heliusAvailable()) throw new SeekerError('seeker_unavailable', 'The Seeker check is not available right now');

  const player = await getPlayer(wallet);
  if (player?.seeker) throw new SeekerError('seeker_already_linked', 'This player already has a Seeker Genesis Token linked');

  const sgtMint = await findSeekerGenesisToken(wallet);
  if (!sgtMint) throw new SeekerError('no_seeker_token', 'No Seeker Genesis Token found on this wallet');

  // One token, one player. The chain enforces it at `init` (the PDA's seeds are the mint), which is
  // the rule that counts; the mirror is checked too so a player is told now rather than after paying
  // a transaction fee to be refused on chain.
  const [link, mirrorWallet] = await Promise.all([getSeekerLink(sgtMint), usersDb.findWalletBySeekerMint(sgtMint)]);
  if (link || (mirrorWallet && mirrorWallet !== wallet)) {
    throw new SeekerError('seeker_mint_taken', 'This Seeker Genesis Token is already linked to another player');
  }

  const envelope = await buildLinkSeekerTx(wallet, { sgtMint, createPlayer: !player });
  return { ...envelope, sgtMint };
}

/**
 * Confirms a submitted `link_seeker` transaction: it must invoke our program's `link_seeker` with
 * the session wallet as `wallet` and our own server authority as `server_authority` (global-constraints:
 * every confirm endpoint verifies program id + instruction + payer) before the mirror is written.
 * The mint recorded is the one the verified instruction itself carries, never one a client named.
 * Re-callable while the transaction is not yet visible (`confirmed: false`).
 */
export async function confirmSeekerLink({ wallet, signature }) {
  const parsed = await getConfirmedInstructions(signature);
  if (parsed.status === 'missing') return { confirmed: false };
  if (parsed.status === 'failed') throw new SeekerError('link_failed', 'The Seeker link transaction failed on chain');

  const { serverAuthority } = chainConfig();
  const sgtMint = linkedSeekerMint(parsed.instructions, { wallet, serverAuthority: serverAuthority.publicKey.toBase58() });
  if (!sgtMint) throw new SeekerError('invalid_transaction', 'Transaction does not match a Seeker link for this wallet');

  // The cached `Player` still says `seeker: false` until it expires, and `GET /api/daily/today` reads
  // it - the same invalidation `services/tickets.js` does after its own chain write.
  clearPlayerCache(wallet);
  await usersDb.setSeekerMint(wallet, sgtMint);
  return { linked: true, sgtMint };
}
