import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { getLoadout, putLoadout, type LoadoutChange } from '../api/profile';
import type { Session } from '../api/session';
import { SKIN_ITEM_IDS, VARIANT_ITEM_IDS, isSkinIndex, isVariantIndex, type SkinIndex, type VariantIndex } from './items';

/** AsyncStorage key of the offline copy: `{ wallet, owned, activeSkin, activeVariant }`. */
const KEY = 'loadout.v1';
/** The app shell waits this long at most for the offline copy before showing Home without it. */
const MIRROR_WAIT_MS = 1000;
/** Item ids fit the on-chain 64-bit inventory mask. */
const MAX_ITEMS = 64;

export interface Loadout {
  /** Catalogue item ids the wallet owns, ascending. */
  owned: readonly number[];
  activeSkin: SkinIndex;
  /** Stored for the campaign's variant picker; runs do not read it yet. */
  activeVariant: VariantIndex;
}

/** Nothing owned, nothing equipped: the base Octopi in its own colours. */
export const BASE_LOADOUT: Loadout = { owned: [], activeSkin: 0, activeVariant: 0 };

type Source = 'none' | 'mirror' | 'server';

export interface LoadoutState extends Loadout {
  /**
   * Where the selection comes from: 'server' once the backend answered for this wallet, 'mirror'
   * while only this wallet's offline copy is known, 'none' when signed out or nothing is known yet.
   */
  source: Source;
  /** The last failed server read for this wallet, until a read succeeds. */
  error: string | null;
  /**
   * False until the offline copy has been read. The app shell waits for it, so a stored skin is on
   * Octopi from the first frame of a cold start instead of flashing the base colours.
   */
  ready: boolean;
}

export interface LoadoutApi {
  loadout: LoadoutState;
  /**
   * Equips a skin and/or a variant (0 takes it off, back to the base). Shown at once, saved through
   * the backend, and rolled back when the backend refuses or cannot be reached; the error is rethrown
   * for the caller to show.
   */
  equip: (change: LoadoutChange) => Promise<void>;
  /** Reads the backend again (the Profile does on open, so a purchase made in the Shop shows up). */
  refresh: () => void;
}

interface Held {
  wallet: string;
  loadout: Loadout;
  source: Source;
}

interface Mirror extends Loadout {
  wallet: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isItemId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < MAX_ITEMS;
}

/**
 * A loadout from the backend or the offline copy, made safe: unknown ids are dropped, and a
 * selector out of range or for an item the wallet does not own falls back to the base, so Octopi
 * never wears something the inventory does not hold.
 */
function sanitize(raw: { owned?: unknown; activeSkin?: unknown; activeVariant?: unknown }): Loadout {
  const owned = Array.isArray(raw.owned) ? [...new Set(raw.owned.filter(isItemId))].sort((a, b) => a - b) : [];
  const owns = (id: number | null) => id === null || owned.includes(id);
  const activeSkin = isSkinIndex(raw.activeSkin) && owns(SKIN_ITEM_IDS[raw.activeSkin]) ? raw.activeSkin : 0;
  const activeVariant = isVariantIndex(raw.activeVariant) && owns(VARIANT_ITEM_IDS[raw.activeVariant]) ? raw.activeVariant : 0;
  return { owned, activeSkin, activeVariant };
}

async function readMirror(): Promise<Mirror | null> {
  try {
    const text = await AsyncStorage.getItem(KEY);
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { wallet } = parsed as { wallet?: unknown };
    if (typeof wallet !== 'string' || wallet.length === 0) return null;
    return { wallet, ...sanitize(parsed) };
  } catch {
    return null;
  }
}

/** `readMirror`, or null when storage has not answered within `ms`. */
function readMirrorWithin(ms: number): Promise<Mirror | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    void readMirror().then((mirror) => {
      clearTimeout(timer);
      resolve(mirror);
    });
  });
}

function writeMirror(wallet: string, loadout: Loadout): void {
  const mirror: Mirror = { wallet, ...loadout };
  AsyncStorage.setItem(KEY, JSON.stringify(mirror)).catch(() => {
    // Only the offline copy is lost; the next backend answer writes it again.
  });
}

function clearMirror(): void {
  AsyncStorage.removeItem(KEY).catch(() => {
    // A leftover copy is keyed by its wallet and replaced by the backend's answer on the next sign-in.
  });
}

/**
 * The equipped skin and variant (design doc §5, Profile). Signed in, the backend is the truth
 * (`GET /api/profile/loadout`) and every answer is mirrored to AsyncStorage (`loadout.v1`), so the
 * skin still applies offline and at cold start before the network answers. Signed out, it is the
 * base. A cached skin is worn only until the backend answers; a session the backend refuses drops
 * it and the copy.
 */
export function useLoadout(session: Session | null, restoring: boolean): LoadoutApi {
  const wallet = restoring ? null : (session?.walletAddress ?? null);
  const [mirror, setMirror] = useState<Mirror | null | undefined>(undefined);
  const [held, setHeld] = useState<Held | null>(null);
  const [error, setError] = useState<{ wallet: string; message: string } | null>(null);
  const [version, setVersion] = useState(0);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const previousWallet = useRef<string | null>(null);
  /** Bumped when an equip starts: a backend read issued before it must not overwrite its answer. */
  const writes = useRef(0);

  useEffect(() => {
    let alive = true;
    void readMirrorWithin(MIRROR_WAIT_MS).then((m) => {
      if (alive) setMirror(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Signing out drops the selection and its offline copy along with the session.
  useEffect(() => {
    if (restoring) return;
    if (wallet === null && previousWallet.current !== null) {
      setHeld(null);
      setError(null);
      setMirror(null);
      clearMirror();
    }
    previousWallet.current = wallet;
  }, [wallet, restoring]);

  useEffect(() => {
    if (wallet === null) return undefined;
    let alive = true;
    const issuedAt = writes.current;
    getLoadout()
      .then((info) => {
        if (!alive || writes.current !== issuedAt) return;
        const loadout = sanitize(info);
        setHeld({ wallet, loadout, source: 'server' });
        setError(null);
        writeMirror(wallet, loadout);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          // The backend is up and no longer accepts this session: stop wearing the cached skin.
          setHeld({ wallet, loadout: BASE_LOADOUT, source: 'server' });
          clearMirror();
        }
        setError({ wallet, message: messageOf(e) });
      });
    return () => {
      alive = false;
    };
  }, [wallet, version]);

  let current: Loadout = BASE_LOADOUT;
  let source: Source = 'none';
  if (wallet !== null) {
    if (held !== null && held.wallet === wallet) {
      current = held.loadout;
      source = held.source;
    } else if (mirror != null && mirror.wallet === wallet) {
      current = mirror;
      source = 'mirror';
    }
  }
  const currentRef = useRef<{ loadout: Loadout; source: Source }>({ loadout: current, source });
  currentRef.current = { loadout: current, source };

  const { owned, activeSkin, activeVariant } = current;
  const errorText = wallet !== null && error !== null && error.wallet === wallet ? error.message : null;
  const ready = mirror !== undefined;
  const loadout = useMemo<LoadoutState>(
    () => ({ owned, activeSkin, activeVariant, source, error: errorText, ready }),
    [owned, activeSkin, activeVariant, source, errorText, ready],
  );

  const equip = useCallback(async (change: LoadoutChange) => {
    const w = walletRef.current;
    if (w === null) throw new Error('Connect a wallet to equip items');
    const before = currentRef.current;
    const next: Loadout = {
      owned: before.loadout.owned,
      activeSkin: isSkinIndex(change.activeSkin) ? change.activeSkin : before.loadout.activeSkin,
      activeVariant: isVariantIndex(change.activeVariant) ? change.activeVariant : before.loadout.activeVariant,
    };
    writes.current += 1;
    setHeld({ wallet: w, loadout: next, source: before.source });
    try {
      const info = await putLoadout(change);
      if (walletRef.current !== w) return;
      const loadout = sanitize(info);
      setHeld({ wallet: w, loadout, source: 'server' });
      setError(null);
      writeMirror(w, loadout);
    } catch (e) {
      if (walletRef.current === w) {
        setHeld({ wallet: w, loadout: before.loadout, source: before.source });
        // A refusal means this view of the inventory is stale; offline, a read would fail the same way.
        if (!(e instanceof ApiError && e.status === 0)) setVersion((v) => v + 1);
      }
      throw e;
    }
  }, []);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { loadout, equip, refresh };
}
