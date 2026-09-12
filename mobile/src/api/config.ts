/** Public build-time configuration. EXPO_PUBLIC_* values are inlined into the APK, so never put secrets here. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000').replace(/\/+$/, '');
export const RPC_URL = process.env.EXPO_PUBLIC_RPC_URL ?? 'https://api.devnet.solana.com';
export type Cluster = 'devnet' | 'mainnet';
export const CLUSTER: Cluster = process.env.EXPO_PUBLIC_SOLANA_CLUSTER === 'mainnet' ? 'mainnet' : 'devnet';
export const CHAIN = `solana:${CLUSTER}` as const;
/** Shown by the wallet; the uri's domain hosts /.well-known/assetlinks.json for identity verification. */
export const APP_IDENTITY = { name: 'Sea Invaders', uri: 'https://seainvaders.xyz', icon: 'icon.png' } as const;
