import { randomBytes } from 'node:crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { parseSignInMessageText } from '@solana/wallet-standard-util';

// Sign-In-With-Solana: the server issues a nonce, the wallet signs the standard SIWS text, the server
// parses that text back, checks the fields it issued, and verifies the ed25519 signature.

export const NONCE_TTL_MS = 10 * 60 * 1000;
const STATEMENT = 'Sign in to Sea Invaders';

/** One process serves the API, so an in-memory map is enough for short-lived nonces. */
const nonces = new Map();

export function authDomain() {
  return process.env.AUTH_DOMAIN || 'seainvaders.xyz';
}

export function authUri() {
  return process.env.AUTH_URI || 'https://seainvaders.xyz';
}

export function issueNonce(now = Date.now()) {
  for (const [key, entry] of nonces) {
    if (entry.expiresAt <= now) nonces.delete(key);
  }
  const nonce = randomBytes(16).toString('hex');
  const issuedAt = new Date(now).toISOString();
  nonces.set(nonce, { issuedAt, expiresAt: now + NONCE_TTL_MS });
  return { nonce, issuedAt };
}

/** The fields the app passes to the wallet unchanged. `address` is added by the wallet. */
export function signInPayload(nonce, issuedAt) {
  return { domain: authDomain(), uri: authUri(), statement: STATEMENT, version: '1', nonce, issuedAt };
}

function decodeBase64(value, maxBytes) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxBytes * 2) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length > 0 && bytes.length <= maxBytes ? new Uint8Array(bytes) : null;
}

/**
 * Verifies a wallet's sign-in result. Consumes the nonce on success and on a bad signature, so a
 * message can only be tried once.
 */
export function verifySignIn(body, now = Date.now()) {
  const address = typeof body?.address === 'string' ? body.address : '';
  const signedMessage = decodeBase64(body?.signedMessage, 4096);
  const signature = decodeBase64(body?.signature, 64);
  let publicKey;
  try {
    publicKey = bs58.decode(address);
  } catch {
    return { ok: false, reason: 'bad_address' };
  }
  if (publicKey.length !== 32 || !signedMessage || !signature || signature.length !== 64) {
    return { ok: false, reason: 'bad_request' };
  }
  const parsed = parseSignInMessageText(new TextDecoder().decode(signedMessage));
  if (!parsed) return { ok: false, reason: 'unparseable_message' };
  if (parsed.domain !== authDomain()) return { ok: false, reason: 'domain_mismatch' };
  if (parsed.uri !== authUri()) return { ok: false, reason: 'uri_mismatch' };
  if (parsed.statement !== STATEMENT) return { ok: false, reason: 'statement_mismatch' };
  if (parsed.address !== address) return { ok: false, reason: 'address_mismatch' };
  const entry = parsed.nonce ? nonces.get(parsed.nonce) : undefined;
  if (!entry || entry.expiresAt <= now || entry.issuedAt !== parsed.issuedAt) {
    return { ok: false, reason: 'unknown_nonce' };
  }
  nonces.delete(parsed.nonce);
  if (!nacl.sign.detached.verify(signedMessage, signature, publicKey)) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true, address };
}
