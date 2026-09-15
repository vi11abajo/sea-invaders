import type { PreparedTx } from './chain';
import { apiFetch } from './client';

/** `GET /api/seeker` (spec §3): the signed-in wallet's on-chain Seeker link, mirrored in the backend's database and refreshed at confirm. */
export interface SeekerInfo {
  linked: boolean;
  sgtMint: string | null;
}

/**
 * Reads whether the signed-in wallet already has a Seeker Genesis Token linked. Rejects with
 * `ApiError` 503 `seeker_unavailable` when the backend has no mainnet reader configured
 * (`HELIUS_API_KEY` unset).
 */
export function getSeeker(): Promise<SeekerInfo> {
  return apiFetch<SeekerInfo>('/api/seeker', { auth: true });
}

/**
 * Prepares the server-co-signed `link_seeker` transaction for the Seeker Genesis Token the backend
 * finds on the caller's wallet by its own mainnet read (spec §2-3); the wallet signs and sends it
 * like `submit_daily_best`. Rejects with `ApiError`: 404 `no_seeker_token` (no SGT found on this
 * wallet), 409 `seeker_already_linked` (this player already has a link on chain), 409
 * `seeker_mint_taken` (that mint is already linked to a different wallet), 503
 * `seeker_unavailable`.
 */
export function issueSeekerLink(): Promise<PreparedTx & { sgtMint: string }> {
  return apiFetch('/api/seeker/link', { method: 'POST', auth: true });
}

export interface ConfirmSeekerLinkResult {
  confirmed: boolean;
  /** Present once `confirmed` is true. */
  sgtMint?: string;
}

/**
 * Polls whether a `link_seeker` transaction landed. The backend's two shapes are asymmetric (spec
 * §3): `{ confirmed: false }` (202) while it is not yet visible on chain, `{ linked: true, sgtMint }`
 * (200) once it lands - normalized here to the `{ confirmed, sgtMint }` shape `pollUntilConfirmed`
 * expects, so this is the only place that needs to know about the mismatch.
 */
export async function confirmSeekerLink(signature: string): Promise<ConfirmSeekerLinkResult> {
  const result = await apiFetch<{ linked?: boolean; confirmed?: boolean; sgtMint?: string }>('/api/seeker/confirm', {
    method: 'POST',
    auth: true,
    body: { signature },
  });
  return { confirmed: result.linked === true || result.confirmed === true, sgtMint: result.sgtMint };
}
