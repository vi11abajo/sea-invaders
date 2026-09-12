// Reads the on-chain configuration (cluster, RPC, program/mint ids, server
// authority keypair) from the environment. Values are re-read from
// `process.env` on every call rather than cached at module load, so tests
// can set `process.env` and call these functions without a fresh import.
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

const CLUSTERS = new Set(['devnet', 'mainnet']);

/** The single default for `SOLANA_CLUSTER` when it is unset — shared by every reader. */
export const DEFAULT_CLUSTER = 'devnet';

/** Resolves `SOLANA_CLUSTER` with the shared default, without validating the rest of the chain config. */
export function currentCluster() {
  return process.env.SOLANA_CLUSTER || DEFAULT_CLUSTER;
}

function requirePublicKey(value, name) {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${name} is not a valid public key: "${value}"`);
  }
}

function requireServerAuthority(secret) {
  if (!secret) {
    throw new Error('SERVER_AUTHORITY_SECRET is not configured');
  }
  let secretKey;
  try {
    secretKey = bs58.decode(secret);
  } catch {
    throw new Error('SERVER_AUTHORITY_SECRET is not valid base58');
  }
  if (secretKey.length !== 64) {
    throw new Error(`SERVER_AUTHORITY_SECRET must decode to a 64-byte secret key, got ${secretKey.length} bytes`);
  }
  try {
    return Keypair.fromSecretKey(secretKey);
  } catch {
    throw new Error('SERVER_AUTHORITY_SECRET is not a valid Ed25519 secret key');
  }
}

/**
 * Builds the chain configuration from environment variables:
 * `SOLANA_CLUSTER`, `SOLANA_RPC_URL`, `PROGRAM_ID`, `SKR_MINT`,
 * `SERVER_AUTHORITY_SECRET` (base58 of the 64-byte secret key).
 * Throws on any missing or invalid value.
 */
export function chainConfig() {
  const cluster = currentCluster();
  if (!CLUSTERS.has(cluster)) {
    throw new Error(`SOLANA_CLUSTER must be "devnet" or "mainnet", got "${cluster}"`);
  }
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error('SOLANA_RPC_URL is not configured');
  }
  const programId = requirePublicKey(process.env.PROGRAM_ID, 'PROGRAM_ID');
  const skrMint = requirePublicKey(process.env.SKR_MINT, 'SKR_MINT');
  const serverAuthority = requireServerAuthority(process.env.SERVER_AUTHORITY_SECRET);

  return { cluster, rpcUrl, programId, skrMint, serverAuthority };
}

/** Throws with a descriptive message if the chain configuration is missing or invalid; logs success otherwise. */
export function validateChainConfig() {
  chainConfig();
  console.log('✅ Chain configuration is valid');
}
