import { AddressLookupTableAccount, PublicKey } from '@solana/web3.js';

function toKey(pubkey) {
  return pubkey instanceof PublicKey ? pubkey.toBase58() : new PublicKey(pubkey).toBase58();
}

/** A lookup table that never deactivates, as `Connection#getAddressLookupTable` would return it. */
const ACTIVE_TABLE = 2n ** 64n - 1n;

/**
 * Minimal in-memory stand-in for @solana/web3.js's Connection, covering just
 * the surface chain/*.js touches: a fixed blockhash/slot for building
 * transactions (chain/txs.js), a settable account store for reading accounts
 * back (chain/readers.js, and @solana/spl-token's getAccount), and the address
 * lookup tables a swap-composed transaction resolves (chain/jupiter.js).
 */
export class FakeConnection {
  constructor({
    blockhash = '9BFbBLgQ5FLdTsg3D96oXTQmuGaEjkCJVAeDN9nWzPqi',
    lastValidBlockHeight = 5678,
    slot = 1234,
  } = {}) {
    this.blockhash = blockhash;
    this.lastValidBlockHeight = lastValidBlockHeight;
    this.slot = slot;
    this.accounts = new Map();
    this.lookupTables = new Map();
  }

  /** Seeds an address lookup table: `address` holds `addresses` (base58 strings or `PublicKey`s). */
  setLookupTable(address, addresses) {
    this.lookupTables.set(toKey(address), addresses.map((a) => new PublicKey(toKey(a))));
  }

  async getAddressLookupTable(address) {
    const addresses = this.lookupTables.get(toKey(address));
    const value = addresses === undefined
      ? null
      : new AddressLookupTableAccount({
        key: new PublicKey(toKey(address)),
        state: { deactivationSlot: ACTIVE_TABLE, lastExtendedSlot: this.slot, lastExtendedSlotStartIndex: 0, addresses },
      });
    return { context: { slot: this.slot }, value };
  }

  /** Seeds the fake account store. `info` is `{ data: Buffer, owner: PublicKey, lamports?, executable?, rentEpoch? }`. */
  setAccount(pubkey, info) {
    this.accounts.set(toKey(pubkey), {
      lamports: 1,
      executable: false,
      rentEpoch: 0,
      ...info,
    });
  }

  async getLatestBlockhashAndContext() {
    return {
      context: { slot: this.slot },
      value: { blockhash: this.blockhash, lastValidBlockHeight: this.lastValidBlockHeight },
    };
  }

  async getAccountInfo(pubkey) {
    return this.accounts.get(toKey(pubkey)) ?? null;
  }

  async getAccountInfoAndContext(pubkey) {
    return { context: { slot: this.slot }, value: await this.getAccountInfo(pubkey) };
  }
}
