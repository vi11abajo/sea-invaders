import type { SignInPayload } from '@solana-mobile/mobile-wallet-adapter-protocol';
import { fromUint8Array, isValid as isBase64 } from 'js-base64';
import { apiFetch } from './client';
import { saveSession, clearSession, type Session } from './session';

export type WalletSignIn = (payload: SignInPayload) => Promise<{
  account: { address: { toBase58(): string } };
  signedMessage: Uint8Array;
  signature: Uint8Array;
}>;

interface NonceResponse {
  domain: string;
  uri: string;
  statement: string;
  version: string;
  nonce: string;
  issuedAt: string;
}

interface VerifyResponse {
  token: string;
  user: { id: number; walletAddress: string; username: string };
}

/**
 * The server wants base64. @wallet-ui/react-native-web3js 4.3 returns the wallet's base64 text UTF-8-encoded
 * instead of decoded, so bytes that are entirely base64 characters are that text and are passed through;
 * real bytes (a 64-byte signature, the SIWS message with spaces and newlines) are encoded here.
 */
export function toBase64(bytes: Uint8Array): string {
  // Hermes has no TextDecoder; base64 text is ASCII, so a byte-to-char loop is exact.
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return isBase64(text) ? text : fromUint8Array(bytes);
}

/** Full SIWS round trip: nonce from the server, signature from the wallet, JWT from the server. */
export async function signInWithWallet(signIn: WalletSignIn): Promise<Session> {
  const payload = await apiFetch<NonceResponse>('/api/auth/siws/nonce', { method: 'POST' });
  const result = await signIn(payload);
  const verified = await apiFetch<VerifyResponse>('/api/auth/siws/verify', {
    method: 'POST',
    body: {
      address: result.account.address.toBase58(),
      signedMessage: toBase64(result.signedMessage),
      signature: toBase64(result.signature),
    },
  });
  const session: Session = { token: verified.token, userId: verified.user.id, walletAddress: verified.user.walletAddress, username: verified.user.username };
  await saveSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  await clearSession();
}
