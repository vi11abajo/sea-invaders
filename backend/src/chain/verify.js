// Verifies a confirmed transaction's instructions actually invoke our program the way a `confirm*`
// endpoint expects, before that endpoint touches its cache or DB - the closed Phase 2B parked item
// for the new shop/tide endpoints (design doc §6, global-constraints.md's Phase 3B additions).
// Deliberately independent of the anchor-lang coder: the discriminator and account order come
// straight from the checked-in IDL, and `purchase`'s two args (`item_id: u8`, `max_price: u64`) are
// simple enough to read off the wire directly.
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
