import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { getLoadout, putLoadout, type LoadoutChange } from '../api/profile';
import type { Session } from '../api/session';
import { NO_SELECTORS, type Selectors } from './allowed';
import { SEEKER_SKIN_CODE, SKIN_ITEM_IDS, VARIANT_ITEM_IDS, isSkinIndex, isVariantIndex, type SkinIndex, type VariantIndex } from './items';

/** AsyncStorage key of the offline copy: `{ wallet, owned, activeSkin, activeVariant, earned, seekerSkin }`. */
const KEY = 'loadout.v1';
/**
 * AsyncStorage key of the wallet-less player's own choice, `{ wallet: null, activeSkin, activeVariant }`
 * (champions and skins design doc §3: an earned award can be worn without a wallet, kept on the phone
 * only). Separate from `KEY`, so signing in or out never mixes it with a wallet's copy.
 */
const LOCAL_KEY = 'loadout.local.v1';
/** The app shell waits this long at most for the offline copy before showing Home without it. */
const MIRROR_WAIT_MS = 1000;
/** Item ids fit the on-chain 64-bit inventory mask. */
const MAX_ITEMS = 64;

export interface Loadout {
  /** Catalogue item ids the wallet owns, ascending. */
  owned: readonly number[];
  activeSkin: SkinIndex;
  /** The campaign octopi: the Level start picker equips it, and campaign runs play with it. */
  activeVariant: VariantIndex;
  /**
   * What the backend derived from the wallet's stored campaign progress (design doc §3): champion
   * indexes and skin codes. Empty signed out, and from an API that does not send it.
   */
  earned: Selectors;
  /** The backend's word that the wallet has a verified Seeker link (the Seeker look, §2); false signed out. */
  seekerSkin: boolean;
}

/** Nothing owned, nothing equipped: the base Octopi in its own colours. */
export const BASE_LOADOUT: Loadout = { owned: [], activeSkin: 0, activeVariant: 0, earned: NO_SELECTORS, seekerSkin: false };

/** The wallet-less player's choice: only the two selectors, and only award ones (`sanitizeLocal`). */
type Local = Pick<Loadout, 'activeSkin' | 'activeVariant'>;

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
   * False until the offline copy and the wallet-less choice have been read. The app shell waits for
   * them, so a stored skin is on Octopi from the first frame of a cold start instead of flashing the
   * base colours.
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
   *
   * Without a wallet only an award selector (no shop item behind it, not the Seeker look) can be
   * equipped: it is kept on this phone (`LOCAL_KEY`) and resolves at once; anything else rejects
   * with "Connect a wallet to equip items". Whether the campaign has earned it is the caller's
   * check (the app shell's allowed selectors), which also takes it off again after a campaign reset.
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

/** `raw` as an ascending list of the values `valid` accepts, each once; empty when it is not a list. */
function listOf(raw: unknown, valid: (value: unknown) => value is number): number[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(valid))].sort((a, b) => a - b) : [];
}

/** The backend's `earned` made safe: selectors out of range are dropped; missing (an older API) reads as nothing earned. */
function sanitizeEarned(raw: unknown): Selectors {
  if (typeof raw !== 'object' || raw === null) return NO_SELECTORS;
  const { variants, skins } = raw as { variants?: unknown; skins?: unknown };
  const earned = { variants: listOf(variants, isVariantIndex), skins: listOf(skins, isSkinIndex) };
  return earned.variants.length === 0 && earned.skins.length === 0 ? NO_SELECTORS : earned;
}

/**
 * A loadout from the backend or the offline copy, made safe: unknown ids are dropped, and a
 * selector out of range or for an item the wallet does not own falls back to the base, so Octopi
 * never wears something the inventory does not hold. A selector with no item behind it (an award,
 * the Seeker look) is the backend's to judge: it answers 0 for one the wallet may no longer wear.
 */
function sanitize(raw: { owned?: unknown; activeSkin?: unknown; activeVariant?: unknown; earned?: unknown; seekerSkin?: unknown }): Loadout {
  const owned = listOf(raw.owned, isItemId);
  const owns = (id: number | null) => id === null || owned.includes(id);
  const activeSkin = isSkinIndex(raw.activeSkin) && owns(SKIN_ITEM_IDS[raw.activeSkin]) ? raw.activeSkin : 0;
  const activeVariant = isVariantIndex(raw.activeVariant) && owns(VARIANT_ITEM_IDS[raw.activeVariant]) ? raw.activeVariant : 0;
  return { owned, activeSkin, activeVariant, earned: sanitizeEarned(raw.earned), seekerSkin: raw.seekerSkin === true };
}

/**
 * The wallet-less choice made safe (design doc §3): only a selector with no shop item behind it
 * and other than the Seeker look (which needs a wallet's link) survives; anything else is the base.
 * An award still has to be earned to show — the app shell checks that against the campaign.
 */
function sanitizeLocal(raw: { activeSkin?: unknown; activeVariant?: unknown }): Local {
  const activeSkin = isSkinIndex(raw.activeSkin) && SKIN_ITEM_IDS[raw.activeSkin] === null && raw.activeSkin !== SEEKER_SKIN_CODE ? raw.activeSkin : 0;
  const activeVariant = isVariantIndex(raw.activeVariant) && VARIANT_ITEM_IDS[raw.activeVariant] === null ? raw.activeVariant : 0;
  return { activeSkin, activeVariant };
}

/** `local` with the selectors `change` sets, or null when `change` asks for one a wallet-less player cannot wear. */
function localWithChange(local: Local | null | undefined, change: LoadoutChange): Local | null {
  const next: Local = {
    activeSkin: change.activeSkin ?? local?.activeSkin ?? 0,
    activeVariant: change.activeVariant ?? local?.activeVariant ?? 0,
  };
  const safe = sanitizeLocal(next);
  return safe.activeSkin === next.activeSkin && safe.activeVariant === next.activeVariant ? safe : null;
}

/** `loadout` with the selectors `change` sets. */
function withChange(loadout: Loadout, change: LoadoutChange): Loadout {
  return {
    ...loadout,
    activeSkin: isSkinIndex(change.activeSkin) ? change.activeSkin : loadout.activeSkin,
    activeVariant: isVariantIndex(change.activeVariant) ? change.activeVariant : loadout.activeVariant,
  };
}

/**
 * What is on screen for `wallet`: what is held for it (an answer or a choice), else its offline copy,
 * else the base. Without a wallet: the phone's own award choice over the base, owning nothing.
 */
function pick(
  wallet: string | null, held: Held | null, mirror: Mirror | null | undefined, local: Local | null | undefined,
): { loadout: Loadout; source: Source } {
  if (wallet === null) return { loadout: local == null ? BASE_LOADOUT : { ...BASE_LOADOUT, ...local }, source: 'none' };
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

async function readLocal(): Promise<Local | null> {
  try {
    const text = await AsyncStorage.getItem(LOCAL_KEY);
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return sanitizeLocal(parsed);
  } catch {
    return null;
  }
}

/** What `read` finds, or null when storage has not answered within `ms`. */
function within<T>(read: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    void read.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function writeMirror(wallet: string, loadout: Loadout): void {
  const mirror: Mirror = { wallet, ...loadout };
  AsyncStorage.setItem(KEY, JSON.stringify(mirror)).catch(() => {
    // Only the offline copy is lost; the next backend answer writes it again.
  });
}

function writeLocal(local: Local): void {
  AsyncStorage.setItem(LOCAL_KEY, JSON.stringify({ wallet: null, ...local })).catch(() => {
    // Only this phone's copy is lost: the choice stays on until the app is closed.
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
 * is the base, or the award the player picked on this phone (`loadout.local.v1`, champions and skins
 * design doc §3); signing in or out leaves that choice where it is. A cached skin is worn only until
 * the backend answers; a session the backend refuses drops it and the copy.
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
  /** The wallet-less choice: undefined until read, null when none is stored. */
  const [local, setLocalState] = useState<Local | null | undefined>(undefined);
  const [held, setHeldState] = useState<Held | null>(null);
  const [error, setError] = useState<{ wallet: string; message: string } | null>(null);
  const [version, setVersion] = useState(0);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const previousWallet = useRef<string | null>(null);
  // Synchronous copies of `held`, `mirror` and `local`: a choice made before the next render builds on the latest.
  const heldRef = useRef<Held | null>(null);
  const mirrorRef = useRef<Mirror | null | undefined>(undefined);
  const localRef = useRef<Local | null | undefined>(undefined);
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
  const putLocal = useCallback((next: Local | null) => {
    localRef.current = next;
    setLocalState(next);
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
    void within(readMirror(), MIRROR_WAIT_MS).then((m) => {
      if (alive) putMirror(m);
    });
    void within(readLocal(), MIRROR_WAIT_MS).then((l) => {
      if (alive) putLocal(l);
    });
    return () => {
      alive = false;
    };
  }, [putMirror, putLocal]);

  // A choice made for another wallet no longer applies. Signing out also drops the selection and
  // its offline copy along with the session (the wallet-less choice stays: it was never the wallet's).
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
      if (w === null) {
        // Wallet-less: an award selector is kept on this phone; nothing goes to the backend.
        const next = localWithChange(localRef.current, change);
        if (next === null) return Promise.reject(new Error('Connect a wallet to equip items'));
        putLocal(next);
        writeLocal(next);
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        const previous = pending.current;
        const folds = previous !== null && previous.wallet === w;
        if (!folds || fallback.current === null || fallback.current.wallet !== w) {
          // The first unsaved choice: what is on screen now is what a failure returns to.
          const shown = pick(w, heldRef.current, mirrorRef.current, localRef.current);
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
    [drain, putHeld, putLocal],
  );

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const current = pick(wallet, held, mirror, local);
  const { owned, activeSkin, activeVariant, earned, seekerSkin } = current.loadout;
  const source = current.source;
  const errorText = wallet !== null && error !== null && error.wallet === wallet ? error.message : null;
  const ready = mirror !== undefined && local !== undefined;
  const loadout = useMemo<LoadoutState>(
    () => ({ owned, activeSkin, activeVariant, earned, seekerSkin, source, error: errorText, ready }),
    [owned, activeSkin, activeVariant, earned, seekerSkin, source, errorText, ready],
  );

  return { loadout, equip, refresh };
}
