import { Connection } from '@solana/web3.js';
import { chainConfig } from './config.js';

/** A fresh RPC connection for `chainConfig().rpcUrl`. Every chain/*.js function accepts an override for tests. */
export function connection() {
  return new Connection(chainConfig().rpcUrl, 'confirmed');
}
