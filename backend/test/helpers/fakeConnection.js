import { PublicKey } from '@solana/web3.js';

function toKey(pubkey) {
  return pubkey instanceof PublicKey ? pubkey.toBase58() : new PublicKey(pubkey).toBase58();
}

/**
 * Minimal in-memory stand-in for @solana/web3.js's Connection, covering just
 * the surface chain/*.js touches: a fixed blockhash/slot for building
 * transactions (chain/txs.js), and a settable account store for reading
 * accounts back (chain/readers.js, and @solana/spl-token's getAccount).
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
