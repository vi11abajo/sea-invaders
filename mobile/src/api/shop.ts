import type { PreparedPayment } from './chain';
import { apiFetch } from './client';

/** 'variant' = a campaign octopi (Harpoon, Anchor, Trident); 'skin' = a cosmetic recolour of Octopi. */
export type ShopItemKind = 'variant' | 'skin';

/** One catalogue entry. Its name and price come from the backend, which reads them from the on-chain `Catalog`. */
export interface ShopItem {
  id: number;
  kind: ShopItemKind;
  name: string;
  /** The on-chain price in SKR (SKR has 6 decimals, so this can be fractional). */
  priceSkr: number;
  /** `priceSkr` converted to SOL by the backend's cached Jupiter quote; null off mainnet or when that quote failed - the price then only shows in SKR. */
  priceSol: number | null;
  /** The most lamports a swap for this item would take (slippage ceiling plus the temporary wSOL account's rent); null alongside `priceSol`. */
  maxInLamports: number | null;
  owned: boolean;
}

export interface ShopInfo {
  /** Active items plus inactive ones the wallet already owns, in catalogue order. */
  items: ShopItem[];
  /** The wallet's SKR balance, read from the chain. */
  balanceSkr: number;
  /** Whether SOL -> SKR swap quotes exist on this cluster (mainnet only). */
  swap: { available: boolean };
}

/** The catalogue with the caller's ownership flags and SKR balance. */
export function getShop(): Promise<ShopInfo> {
  return apiFetch<ShopInfo>('/api/shop', { auth: true });
}

/**
 * Prepares the on-chain `purchase` transaction for `item` at the current catalogue price, with
 * `create_player` in front when the wallet has no player account yet (`createsPlayer`). Rejects with
 * `ApiError`: 409 `not_enough_skr` (`details.needSkr` / `details.haveSkr`), 409 `already_owned`,
 * 409 `item_inactive`, 404 `unknown_item`.
 *
 * `swap` offers to pay a short SKR balance in SOL. The backend only takes the offer when the wallet
 * really is short and the cluster has a Jupiter to swap through (mainnet); anywhere else this
 * changes nothing and a short balance is still `not_enough_skr`.
 *
 * `priceSkr` is the catalogue price this transaction was actually built at, exactly as `issueRevive`
 * already reports it - `usePurchase`'s `withPrepared` uses it to correct the signing sheet if an
 * admin re-price landed after the Shop's list was fetched.
 */
export function buyItem(item: number, swap = false): Promise<PreparedPayment & { priceSkr: number; createsPlayer: boolean }> {
  return apiFetch('/api/shop/buy', { method: 'POST', auth: true, body: { item, swap } });
}

export interface ConfirmPurchaseResult {
  confirmed: boolean;
  /** Every item id the wallet owns once the purchase is confirmed. */
  owned?: number[];
}

/**
 * Polls whether a purchase landed: `{ confirmed: false }` (202) while the transaction is not yet
 * visible, `{ confirmed: true, owned }` (200) once it is. Rejects with `ApiError` 409
 * `purchase_failed` when it landed but failed, 400 `invalid_transaction` when it is not our
 * program's `purchase` of `item` signed by the session wallet.
 */
export function confirmPurchase(signature: string, item: number): Promise<ConfirmPurchaseResult> {
  return apiFetch('/api/shop/confirm', { method: 'POST', auth: true, body: { signature, item } });
}
