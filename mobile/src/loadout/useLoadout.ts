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
   * Equips a skin and/or a variant (0 takes it off, back to the base). Shown at once and saved
   * through the backend one save at a time; the latest choice always wins. Resolves when this choice
   * is saved, or at once when a newer choice replaces it before it is. When the backend refuses the
   * latest choice or cannot be reached, the screen returns to what the backend last confirmed and
   * the promise rejects with the error for the caller to show.
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

/** A choice not yet saved: every field changed since the last save, later choices overwriting earlier ones. */
interface Intent {
  wallet: string;
  change: LoadoutChange;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 401/403: the backend is up and no longer accepts this session. */
function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/** No answer at all (offline or timed out): a read right now would fail the same way. */
function isOffline(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
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

/** `loadout` with the selectors `change` sets. */
function withChange(loadout: Loadout, change: LoadoutChange): Loadout {
  return {
    owned: loadout.owned,
    activeSkin: isSkinIndex(change.activeSkin) ? change.activeSkin : loadout.activeSkin,
    activeVariant: isVariantIndex(change.activeVariant) ? change.activeVariant : loadout.activeVariant,
  };
}

/** What is on screen for `wallet`: what is held for it (an answer or a choice), else its offline copy, else the base. */
function pick(wallet: string | null, held: Held | null, mirror: Mirror | null | undefined): { loadout: Loadout; source: Source } {
  if (wallet === null) return { loadout: BASE_LOADOUT, source: 'none' };
  if (held !== null && held.wallet === wallet) return held;
  if (mirror != null && mirror.wallet === wallet) return { loadout: mirror, source: 'mirror' };
  return { loadout: BASE_LOADOUT, source: 'none' };
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
 * (`GET /api/profile/loadout`) and every answer shown is mirrored to AsyncStorage (`loadout.v1`),
 * so the skin still applies offline and at cold start before the network answers. Signed out, it
 * is the base. A cached skin is worn only until the backend answers; a session the backend refuses
 * drops it and the copy.
 *
 * The latest choice wins. Every request takes the next number of one sequence when it is sent.
 * Saves go one at a time; a choice made while one is in flight is folded into the next save rather
 * than racing it. A read is used only if no save was outstanding when it was sent and none has been
 * sent since (the backend may have answered it from before that save), and only if it is newer
 * than the answer on screen; a save's own answer carries the fresh inventory instead. The offline
 * copy is written only with an answer as it goes on screen, so it never holds a state the screen
 * has moved past.
 */
export function useLoadout(session: Session | null, restoring: boolean): LoadoutApi {
  const wallet = restoring ? null : (session?.walletAddress ?? null);
  const [mirror, setMirrorState] = useState<Mirror | null | undefined>(undefined);
  const [held, setHeldState] = useState<Held | null>(null);
  const [error, setError] = useState<{ wallet: string; message: string } | null>(null);
  const [version, setVersion] = useState(0);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const previousWallet = useRef<string | null>(null);
  // Synchronous copies of `held` and `mirror`: a choice made before the next render builds on the latest.
  const heldRef = useRef<Held | null>(null);
  const mirrorRef = useRef<Mirror | null | undefined>(undefined);
  /** The number the last request (read or save) was sent with. */
  const seq = useRef(0);
  /** The number of the newest save sent. */
  const writeSeq = useRef(0);
  /** The number of the answer on screen; an older answer never replaces it. */
  const shownSeq = useRef(0);
  /** The newest unsaved choice (being saved, or waiting for the save in flight); null when none. */
  const pending = useRef<Intent | null>(null);
  /** True while the save loop runs. */
  const writing = useRef(false);
  /**
   * What a failed save returns to: what the backend last confirmed through a save (or what was on
   * screen when the first unsaved choice was made).
   */
  const fallback = useRef<Held | null>(null);

  const putHeld = useCallback((next: Held | null) => {
    heldRef.current = next;
    setHeldState(next);
  }, []);
  const putMirror = useCallback((next: Mirror | null) => {
    mirrorRef.current = next;
    setMirrorState(next);
  }, []);

  /** A backend answer goes on screen as the newest, and into the offline copy with it. */
  const showAnswer = useCallback(
    (w: string, loadout: Loadout, at: number) => {
      shownSeq.current = at;
      putHeld({ wallet: w, loadout, source: 'server' });
      setError(null);
      writeMirror(w, loadout);
    },
    [putHeld],
  );

  /** The backend refused the session: stop wearing the cached skin, and drop the offline copy. */
  const showRefusal = useCallback(
    (w: string, at: number, e: unknown) => {
      shownSeq.current = at;
      fallback.current = { wallet: w, loadout: BASE_LOADOUT, source: 'server' };
      putHeld(fallback.current);
      setError({ wallet: w, message: messageOf(e) });
      clearMirror();
    },
    [putHeld],
  );

  /** The latest choice failed: back to the fallback, with the offline copy matching the screen. */
  const rollBack = useCallback(
    (w: string, at: number) => {
      const back: Held = fallback.current !== null && fallback.current.wallet === w ? fallback.current : { wallet: w, loadout: BASE_LOADOUT, source: 'none' };
      shownSeq.current = at;
      putHeld(back);
      // A 'mirror' or 'none' fallback is what storage already holds; a confirmed one may be newer.
      if (back.source === 'server') writeMirror(w, back.loadout);
    },
    [putHeld],
  );

  useEffect(() => {
    let alive = true;
    void readMirrorWithin(MIRROR_WAIT_MS).then((m) => {
      if (alive) putMirror(m);
    });
    return () => {
      alive = false;
    };
  }, [putMirror]);

  // A choice made for another wallet no longer applies. Signing out also drops the selection and
  // its offline copy along with the session.
  useEffect(() => {
    const stale = pending.current;
    if (stale !== null && stale.wallet !== wallet) {
      pending.current = null;
      stale.resolve();
    }
    if (restoring) return;
    if (wallet === null && previousWallet.current !== null) {
      putHeld(null);
      fallback.current = null;
      setError(null);
      putMirror(null);
      clearMirror();
    }
    previousWallet.current = wallet;
  }, [wallet, restoring, putHeld, putMirror]);

  useEffect(() => {
    if (wallet === null) return undefined;
    let alive = true;
    const at = ++seq.current;
    // Sent while a save was outstanding, the backend may answer it from before that save.
    const clean = !writing.current && pending.current === null;
    const usable = () => alive && clean && writeSeq.current < at && shownSeq.current < at;
    getLoadout()
      .then((info) => {
        if (usable()) showAnswer(wallet, sanitize(info), at);
      })
      .catch((e: unknown) => {
        if (!usable()) return;
        if (isRefusal(e)) showRefusal(wallet, at, e);
        else setError({ wallet, message: messageOf(e) });
      });
    return () => {
      alive = false;
    };
  }, [wallet, version, showAnswer, showRefusal]);

  /** Saves the pending choice, one save at a time, until none is left. */
  const drain = useCallback(async () => {
    if (writing.current) return;
    writing.current = true;
    try {
      for (let intent = pending.current; intent !== null; intent = pending.current) {
        const w = intent.wallet;
        if (walletRef.current !== w) {
          pending.current = null;
          intent.resolve();
          continue;
        }
        const at = ++seq.current;
        writeSeq.current = at;
        let answer: Loadout;
        try {
          answer = sanitize(await putLoadout(intent.change));
        } catch (e) {
          // Replaced by a newer choice, or the wallet changed: whatever is pending now goes next.
          if (pending.current !== intent || walletRef.current !== w) continue;
          pending.current = null;
          if (isRefusal(e)) showRefusal(w, at, e);
          else rollBack(w, at);
          intent.reject(e);
          // A refused choice means this view of the inventory is stale; offline, a read fails too.
          if (!isRefusal(e) && !isOffline(e)) setVersion((v) => v + 1);
          continue;
        }
        if (walletRef.current !== w) continue;
        fallback.current = { wallet: w, loadout: answer, source: 'server' };
        const next = pending.current;
        if (next !== intent) {
          // Replaced while in flight: the newer choice stays on screen, over the inventory this
          // answer read, and is saved next. This answer is not shown, so it is not mirrored either.
          if (next !== null && next.wallet === w) putHeld({ wallet: w, loadout: withChange(answer, next.change), source: 'server' });
          continue;
        }
        pending.current = null;
        showAnswer(w, answer, at);
        intent.resolve();
      }
    } finally {
      writing.current = false;
    }
  }, [putHeld, showAnswer, showRefusal, rollBack]);

  const equip = useCallback(
    (change: LoadoutChange): Promise<void> => {
      const w = walletRef.current;
      if (w === null) return Promise.reject(new Error('Connect a wallet to equip items'));
      return new Promise<void>((resolve, reject) => {
        const previous = pending.current;
        const folds = previous !== null && previous.wallet === w;
        if (!folds || fallback.current === null || fallback.current.wallet !== w) {
          // The first unsaved choice: what is on screen now is what a failure returns to.
          const shown = pick(w, heldRef.current, mirrorRef.current);
          fallback.current = { wallet: w, loadout: shown.loadout, source: shown.source };
        }
        const merged: LoadoutChange = folds ? { ...previous.change, ...change } : { ...change };
        pending.current = { wallet: w, change: merged, resolve, reject };
        // An earlier unsaved choice is folded into this one, so its caller is done.
        previous?.resolve();
        const from = fallback.current;
        putHeld({ wallet: w, loadout: withChange(from.loadout, merged), source: from.source });
        void drain();
      });
    },
    [drain, putHeld],
  );

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const current = pick(wallet, held, mirror);
  const { owned, activeSkin, activeVariant } = current.loadout;
  const source = current.source;
  const errorText = wallet !== null && error !== null && error.wallet === wallet ? error.message : null;
  const ready = mirror !== undefined;
  const loadout = useMemo<LoadoutState>(
    () => ({ owned, activeSkin, activeVariant, source, error: errorText, ready }),
    [owned, activeSkin, activeVariant, source, errorText, ready],
  );

  return { loadout, equip, refresh };
}
