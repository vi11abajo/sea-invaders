// Jupiter hands `POST /swap/v1/swap-instructions` back as JSON, not as a compiled transaction:
// every instruction is `{ programId, accounts: [{ pubkey, isSigner, isWritable }], data: <base64> }`
// and the route's address lookup tables come as bare addresses (verified 2026-09-14 against
// Jupiter's own `toInstruction` helper and the /swap-instructions -> /build response mapping on
// developers.jup.ag). This module turns both into what `chain/txs.js` needs to compile ONE v0
// message that carries Jupiter's swap and our own payment instruction.
import { PublicKey, TransactionInstruction } from '@solana/web3.js';

/** One Jupiter instruction as a web3.js instruction. `accounts` is absent on some (the compute-budget ones carry none). */
export function toInstruction(ix) {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: (ix.accounts ?? []).map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    data: Buffer.from(ix.data, 'base64'),
  });
}

/**
 * The address lookup tables `addresses` names, read from the chain in the order Jupiter listed them -
 * `compileToV0Message` needs the tables themselves, not their addresses, to compress the route's
 * accounts and leave room for our instruction under the 1232-byte packet limit. A table Jupiter
 * named but the RPC cannot see means the composed transaction would be built against a route that
 * no longer resolves, so it throws rather than silently compiling an oversized message.
 */
export async function lookupTableAccounts(connection, addresses = []) {
  return Promise.all(addresses.map(async (address) => {
    const { value } = await connection.getAddressLookupTable(new PublicKey(address));
    if (!value) throw new Error(`Address lookup table ${address} is not on chain`);
    return value;
  }));
}
