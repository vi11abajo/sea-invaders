import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { describe, expect, it } from 'vitest';

// `chain/config.js` exports one shared default for `SOLANA_CLUSTER` ('devnet') as
// `DEFAULT_CLUSTER`/`currentCluster()`, so every other reader in `backend/src` can resolve
// the same value instead of repeating the `|| 'devnet'` fallback. `chain.test.js` covers the
// rest of `chainConfig()`.

const serverAuthority = Keypair.generate();

function setValidChainEnv() {
  process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
  process.env.PROGRAM_ID = Keypair.generate().publicKey.toBase58();
  process.env.SKR_MINT = Keypair.generate().publicKey.toBase58();
  process.env.SERVER_AUTHORITY_SECRET = bs58.encode(serverAuthority.secretKey);
}

describe('DEFAULT_CLUSTER / currentCluster', () => {
  it('DEFAULT_CLUSTER is "devnet"', async () => {
    const { DEFAULT_CLUSTER } = await import('../src/chain/config.js');
    expect(DEFAULT_CLUSTER).toBe('devnet');
  });

  it('currentCluster() falls back to DEFAULT_CLUSTER when SOLANA_CLUSTER is unset', async () => {
    const { currentCluster, DEFAULT_CLUSTER } = await import('../src/chain/config.js');
    const original = process.env.SOLANA_CLUSTER;
    delete process.env.SOLANA_CLUSTER;
    try {
      expect(currentCluster()).toBe(DEFAULT_CLUSTER);
    } finally {
      if (original === undefined) delete process.env.SOLANA_CLUSTER;
      else process.env.SOLANA_CLUSTER = original;
    }
  });

  it('currentCluster() returns the explicit value when SOLANA_CLUSTER is set', async () => {
    const { currentCluster } = await import('../src/chain/config.js');
    const original = process.env.SOLANA_CLUSTER;
    process.env.SOLANA_CLUSTER = 'mainnet';
    try {
      expect(currentCluster()).toBe('mainnet');
    } finally {
      if (original === undefined) delete process.env.SOLANA_CLUSTER;
      else process.env.SOLANA_CLUSTER = original;
    }
  });

  it('chainConfig().cluster agrees with currentCluster() when SOLANA_CLUSTER is unset', async () => {
    const { chainConfig, currentCluster } = await import('../src/chain/config.js');
    const original = process.env.SOLANA_CLUSTER;
    delete process.env.SOLANA_CLUSTER;
    setValidChainEnv();
    try {
      expect(chainConfig().cluster).toBe(currentCluster());
      expect(chainConfig().cluster).toBe('devnet');
    } finally {
      if (original === undefined) delete process.env.SOLANA_CLUSTER;
      else process.env.SOLANA_CLUSTER = original;
    }
  });
});
