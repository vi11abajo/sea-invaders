import { useCallback, useEffect, useRef, useState } from 'react';
import { PollCancelled, PollTimeout, WalletDeclined, pollUntilConfirmed, sendWithBlockhashRetry, useSignAndSend } from '../api/chain';
import { ApiError } from '../api/client';
import type { Session } from '../api/session';
import { confirmSeekerLink, getSeeker, issueSeekerLink } from '../api/seeker';
import { hapticError, hapticSuccess } from '../audio/haptics';
import { playSfx } from '../audio/sfx';
import { DECLINED_TOAST } from '../wallet/usePurchase';

export type SeekerStatus = 'unknown' | 'unlinked' | 'linked' | 'no_token' | 'unavailable';

/**
 * What `link()` is doing right now. `idle` carries a one-shot `message` for the Profile's toast (a
 * decline, or any other failure that leaves `status` unchanged); `signing`/`confirming` drive the
 * Profile's signing sheet. Never persists across a re-read of `message`: callers diff it the way
 * `signInError` already is in `ProfileScreen`.
 */
export type SeekerLinkPhase = { kind: 'idle'; message?: string } | { kind: 'signing' } | { kind: 'confirming' };

export interface SeekerState {
  status: SeekerStatus;
  sgtMint: string | null;
  phase: SeekerLinkPhase;
  /** Starts the link flow: issue the server-co-signed transaction, sign and send it, then poll confirm. No-op when signed out or a link is already running. */
  link: () => void;
  /** Re-reads `GET /api/seeker`. */
  refresh: () => void;
}

/**
 * `describeRecordError`'s pattern (`useRecordScore.ts`), but `PollTimeout`'s own copy is about a
 * purchase, not a Seeker link, so it gets its own wording here - the Profile now really re-reads
 * the status on pull (see `refresh` above), so "pull down to check again" is accurate.
 */
function describeLinkError(error: unknown): string {
  if (error instanceof PollTimeout) return 'Link not confirmed yet — pull down to check again.';
  if (error instanceof ApiError) {
    if (error.code === 'seeker_mint_taken') return 'That Seeker Genesis Token is already linked to another wallet.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/**
 * Reads the wallet's Seeker link status once per signed-in session and runs the link
 * flow: issue the server-co-signed `link_seeker` transaction, have the wallet sign and send it (the
 * record-score path - `sendWithBlockhashRetry` + `useSignAndSend`, `useRecordScore.ts`), then poll
 * confirm. `status`/`sgtMint` drive the Profile's Seeker row and Home's wallet pill; `phase` only
 * the transient signing sheet and the decline/error toast.
 *
 * Signed out (`session` null) always reads as `unknown`; the Profile hides its Seeker row on that,
 * exactly as it hides the wallet card. This hook is owned by the app shell (`Shell` in `App.tsx`),
 * not by the Profile screen that renders its UI, so a link kept running fine if the player backs out
 * of Profile mid-flight - the status simply updates in place once the poll resolves, and the next
 * time Profile (or Home) opens it renders whatever the flow actually settled on.
 */
export function useSeeker(session: Session | null): SeekerState {
  const [status, setStatus] = useState<SeekerStatus>('unknown');
  const [sgtMint, setSgtMint] = useState<string | null>(null);
  const [phase, setPhase] = useState<SeekerLinkPhase>({ kind: 'idle' });
  const signAndSend = useSignAndSend();

  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const walletAddress = session?.walletAddress ?? null;

  const load = useCallback(() => {
    if (walletAddress === null) {
      setStatus('unknown');
      setSgtMint(null);
      return;
    }
    getSeeker()
      .then((info) => {
        if (!alive.current) return;
        setStatus(info.linked ? 'linked' : 'unlinked');
        setSgtMint(info.sgtMint);
      })
      .catch((error: unknown) => {
        if (!alive.current) return;
        // Not verified as linked or unlinked - stays `unknown` (the row hides) rather than guess.
        // A 503 is the one answer specific enough to show its own row state instead.
        setStatus(error instanceof ApiError && error.status === 503 ? 'unavailable' : 'unknown');
        setSgtMint(null);
      });
  }, [walletAddress]);

  // Once per signed-in session: on mount, and again whenever the wallet address itself changes
  // (a disconnect followed by a different wallet's sign-in).
  useEffect(() => {
    load();
  }, [load]);

  // Guards against a second `link()` while one is already running - the pill is disabled for the
  // same reason, this is the belt-and-suspenders backstop.
  const busy = useRef(false);

  const link = useCallback(() => {
    if (walletAddress === null || busy.current) return;
    busy.current = true;
    setPhase({ kind: 'signing' });
    void (async () => {
      let signature: string;
      try {
        ({ signature } = await sendWithBlockhashRetry(issueSeekerLink, signAndSend));
        playSfx('tx_sent');
      } catch (error) {
        busy.current = false;
        if (error instanceof WalletDeclined) {
          if (alive.current) setPhase({ kind: 'idle', message: DECLINED_TOAST });
          playSfx('ui_error');
          hapticError();
          return;
        }
        if (error instanceof ApiError && error.code === 'no_seeker_token') {
          if (alive.current) {
            setStatus('no_token');
            setPhase({ kind: 'idle' });
          }
          return;
        }
        if (error instanceof ApiError && error.code === 'seeker_already_linked') {
          // Someone else's request (or a stale local status) already linked this player - re-read
          // rather than guess `sgtMint`, mirroring `already_recorded` in `useRecordScore`.
          if (alive.current) setPhase({ kind: 'idle' });
          load();
          return;
        }
        if (error instanceof ApiError && error.code === 'seeker_unavailable') {
          if (alive.current) {
            setStatus('unavailable');
            setPhase({ kind: 'idle' });
          }
          return;
        }
        if (alive.current) setPhase({ kind: 'idle', message: describeLinkError(error) });
        playSfx('ui_error');
        hapticError();
        return;
      }
      if (alive.current) setPhase({ kind: 'confirming' });
      try {
        const result = await pollUntilConfirmed(() => confirmSeekerLink(signature), { isCancelled: () => !alive.current });
        busy.current = false;
        if (alive.current) {
          setStatus('linked');
          setSgtMint(result.sgtMint ?? null);
          setPhase({ kind: 'idle' });
        }
        playSfx('tx_confirmed');
        hapticSuccess();
      } catch (error) {
        busy.current = false;
        // Cancelled means the whole shell went away before confirmation was observed - nothing left to report.
        if (error instanceof PollCancelled) return;
        if (alive.current) setPhase({ kind: 'idle', message: describeLinkError(error) });
        playSfx('ui_error');
        hapticError();
      }
    })();
  }, [walletAddress, signAndSend, load]);

  return { status, sgtMint, phase, link, refresh: load };
}
