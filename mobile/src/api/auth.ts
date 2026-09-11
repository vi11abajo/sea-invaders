import type { SignInPayload } from '@solana-mobile/mobile-wallet-adapter-protocol';
import { fromUint8Array } from 'js-base64';
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

/** Full SIWS round trip: nonce from the server, signature from the wallet, JWT from the server. */
export async function signInWithWallet(signIn: WalletSignIn): Promise<Session> {
  const payload = await apiFetch<NonceResponse>('/api/auth/siws/nonce', { method: 'POST' });
  const result = await signIn(payload);
  const verified = await apiFetch<VerifyResponse>('/api/auth/siws/verify', {
    method: 'POST',
    body: {
      address: result.account.address.toBase58(),
      signedMessage: fromUint8Array(result.signedMessage),
      signature: fromUint8Array(result.signature),
    },
  });
  const session: Session = { token: verified.token, userId: verified.user.id, walletAddress: verified.user.walletAddress, username: verified.user.username };
  await saveSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  await clearSession();
}
