import type { PreparedTx } from './chain';
import { apiFetch } from './client';

/**
 * The Tide's price for the signed-in wallet right now (design doc §1): the backend reads the ladder
 * from the on-chain `Config` and the wallet's `tide`/`tide_at` from its `Player`, ebbed to `now`.
 */
export interface ReviveQuote {
  /** The step (0..7) the wallet's last revive left on chain. */
  tide: number;
  /** The step in effect now, after ebbing one step per full ebb period: the bar fills up to it. */
  effective: number;
  /** What a revive costs now, in SKR. */
  priceSkr: number;
  /** When the price next falls a step, and to what; null at the bottom step. */
  nextStep: { priceSkr: number; inSeconds: number } | null;
}

/** The current revive price (`POST /api/revive/quote`). */
export function quoteRevive(): Promise<ReviveQuote> {
  return apiFetch<ReviveQuote>('/api/revive/quote', { method: 'POST', auth: true });
}

/**
 * Prepares the on-chain `revive` transaction at the current price, with `create_player` in front
 * when the wallet has no player account yet (`createsPlayer`). Rejects with `ApiError` 409
 * `not_enough_skr` (`details.needSkr` / `details.haveSkr`) when the wallet holds less than the price.
 */
export function issueRevive(): Promise<PreparedTx & { priceSkr: number; createsPlayer: boolean }> {
  return apiFetch('/api/revive', { method: 'POST', auth: true });
}

export interface ConfirmReviveResult {
  confirmed: boolean;
  /** The wallet's tide after the revive; present once `confirmed` is true. */
  tide?: number;
  tideAt?: number;
}

/**
 * Whether a revive landed: `{ confirmed: false }` (202) while the transaction is not yet visible,
 * `{ confirmed: true, tide, tideAt }` (200) once it is. Rejects with `ApiError` 409 `revive_failed`
 * when it landed but failed, 400 `invalid_transaction` when it is not our program's `revive` signed
 * by the session wallet.
 */
export function confirmRevive(signature: string): Promise<ConfirmReviveResult> {
  return apiFetch('/api/revive/confirm', { method: 'POST', auth: true, body: { signature } });
}
