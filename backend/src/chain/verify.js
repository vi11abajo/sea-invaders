// Verifies a confirmed transaction's instructions actually invoke our program the way a `confirm*`
// endpoint expects, before that endpoint touches its cache or DB - the closed Phase 2B parked item
// for the new shop/tide endpoints (design doc §6, global-constraints.md's Phase 3B additions).
// Deliberately independent of the anchor-lang coder: the discriminator and account order come
// straight from the checked-in IDL, and `purchase`'s two args (`item_id: u8`, `max_price: u64`) are
// simple enough to read off the wire directly.
import { PublicKey } from '@solana/web3.js';
import { rawIdl } from './program.js';
import { chainConfig } from './config.js';

function instructionDef(name) {
  const def = rawIdl.instructions.find((ix) => ix.name === name);
  if (!def) throw new Error(`Unknown instruction "${name}" in the IDL`);
  return def;
}

function accountIndex(name, accountName) {
  const idx = instructionDef(name).accounts.findIndex((a) => a.name === accountName);
  if (idx === -1) throw new Error(`Unknown account "${accountName}" on instruction "${name}"`);
  return idx;
}

/** Every instruction in `instructions` (as returned by `getConfirmedInstructions`) that invokes our program with `name`'s discriminator - a transaction can legitimately carry more than one (e.g. two purchases), so callers must check all of them, not just the first. */
function matchingInstructions(instructions, name) {
  const { programId } = chainConfig();
  const programIdStr = programId.toBase58();
  const discriminator = Buffer.from(instructionDef(name).discriminator);
  return instructions.filter((ix) => ix.programId === programIdStr && ix.data.length >= 8 && ix.data.subarray(0, 8).equals(discriminator));
}

/** True when `instructions` contains a `purchase` of our program, signed by `wallet`, for `itemId` - checking every matching instruction, so a tx with two purchases (say items 3 and 4) still confirms either one. */
export function hasPurchase(instructions, { wallet, itemId }) {
  const walletIdx = accountIndex('purchase', 'wallet');
  return matchingInstructions(instructions, 'purchase').some((ix) => (
    ix.accountKeys[walletIdx] === wallet
    // Layout after the 8-byte discriminator: item_id (u8), max_price (u64 LE) - only item_id matters here.
    && ix.data.length >= 9 && ix.data.readUInt8(8) === itemId
  ));
}

/** True when `instructions` contains a `revive` of our program, signed by `wallet`. */
export function hasRevive(instructions, { wallet }) {
  const walletIdx = accountIndex('revive', 'wallet');
  return matchingInstructions(instructions, 'revive').some((ix) => ix.accountKeys[walletIdx] === wallet);
}

/**
 * The `sgt_mint` a `link_seeker` of our program linked (base58), or `null` when `instructions`
 * carries no such link with `wallet` in the `wallet` slot AND `serverAuthority` in the
 * `server_authority` slot. Both signers are required: the wallet's is the player's consent, the
 * server's is the attestation that the mainnet Seeker Genesis Token check passed (design doc §2/§3),
 * and a link attested by anybody else is not one we issued.
 *
 * The mint is read off the verified instruction itself - layout after the 8-byte discriminator:
 * sgt_mint (pubkey, 32 bytes) - so `confirm` mirrors what the chain actually ran, never what a
 * client claimed.
 */
export function linkedSeekerMint(instructions, { wallet, serverAuthority }) {
  const walletIdx = accountIndex('link_seeker', 'wallet');
  const serverIdx = accountIndex('link_seeker', 'server_authority');
  const match = matchingInstructions(instructions, 'link_seeker').find((ix) => (
    ix.accountKeys[walletIdx] === wallet && ix.accountKeys[serverIdx] === serverAuthority && ix.data.length >= 40
  ));
  return match ? new PublicKey(match.data.subarray(8, 40)).toBase58() : null;
}
