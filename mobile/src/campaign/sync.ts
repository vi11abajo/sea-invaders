import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeProgress, type CampaignProgress } from '@sea-invaders/core';
import { getCampaign, putCampaign } from '../api/campaign';
import { ApiError } from '../api/client';
import type { Session } from '../api/session';

const DEBOUNCE_MS = 2_000;

/** Spec §6.2 comparison: `updatedAt` plus the per-level `cleared`/`best` arrays. */
function differs(a: CampaignProgress, b: CampaignProgress): boolean {
  if (a.updatedAt !== b.updatedAt) return true;
  for (let i = 0; i < a.cleared.length; i++) if (a.cleared[i] !== b.cleared[i]) return true;
  for (let i = 0; i < a.best.length; i++) if (a.best[i] !== b.best[i]) return true;
  return false;
}

/**
 * Keeps campaign progress in sync with the server once signed in.
 *
 * State machine:
 * - Signed out (`session === null`): `synced` is false, nothing runs.
 * - On sign-in (a new `session`, once `progress` has loaded): GET the server copy. A 404 with
 *   `code: 'not_found'` means the wallet never synced before — keep the local progress as-is; any
 *   other error (including a 404 with a different code) goes to the failure path. Otherwise
 *   `mergeProgress` the local and server copies (spec §6.2: per-level OR/max, position fields
 *   from the newer `updatedAt`); `replaceProgress` only if the merge differs from local (avoids a
 *   redundant write), then PUT the merged value once so the server has it too.
 * - After that initial round trip (success or failure), every later `progress` change starts a
 *   2 s debounce timer that PUTs the current progress; at most one PUT is in flight at a time. A
 *   change that arrives while one is in flight is not dropped: `sendPut` remembers only the
 *   latest such value and, once the in-flight PUT settles, immediately resends that latest value
 *   instead of waiting for another 2 s or for some unrelated future change to happen to pick it
 *   up. `synced` does not read true off the settled PUT in that case — only the follow-up send's
 *   own outcome decides it.
 * - A successful PUT (with nothing queued behind it) stores the server's returned merge via
 *   `replaceProgress`, but only if it differs from what was sent (avoids an update loop), and
 *   flips `synced` to true. A failed PUT (network or 4xx/5xx) leaves `synced` false; the next
 *   progress change retries.
 * - A PUT that settles after the component has unmounted, or after `session` has changed (a
 *   sign-out, or a different sign-in) from what it was sent for, is treated as stale: it never
 *   calls `replaceProgress`/`setSynced`, and any value queued behind it is dropped rather than
 *   resent for a session that is no longer current.
 */
export function useCampaignSync(
  session: Session | null,
  progress: CampaignProgress | null,
  replaceProgress: (p: CampaignProgress) => Promise<void>,
): { synced: boolean } {
  const [synced, setSynced] = useState(false);

  // The session the initial GET/merge/PUT has already been started for (guards it to run once
  // per sign-in) and the session it has finished for (gates the debounce effect below).
  const startedForRef = useRef<Session | null>(null);
  const readyForRef = useRef<Session | null>(null);
  // The last progress value confirmed with the server, so an update the sync itself just made
  // does not immediately re-trigger the debounced PUT.
  const lastSyncedRef = useRef<CampaignProgress | null>(null);
  const inFlightRef = useRef(false);
  // The latest progress a caller tried to send while a PUT was already in flight; resent as soon
  // as that PUT settles instead of being silently dropped.
  const pendingRef = useRef<CampaignProgress | null>(null);
  // True for the component's whole lifetime; flips false on unmount so a PUT that settles late
  // never touches state afterwards.
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  // Always the latest `session`, kept current every render (not just inside an effect) so a PUT
  // in flight can tell, the moment it settles, whether it is still running for the current
  // session or has been superseded by a sign-out/sign-in that happened while it was pending.
  const sessionRef = useRef<Session | null>(session);
  sessionRef.current = session;

  const sendPut = useCallback(
    async (p: CampaignProgress): Promise<void> => {
      if (inFlightRef.current) {
        pendingRef.current = p;
        return;
      }
      inFlightRef.current = true;
      const forSession = sessionRef.current;
      let success = false;
      try {
        const { progress: merged } = await putCampaign(p);
        if (mountedRef.current && sessionRef.current === forSession) {
          if (differs(merged, p)) await replaceProgress(merged);
          lastSyncedRef.current = merged;
        }
        success = true;
        console.log('[sync] PUT ok', merged.updatedAt);
      } catch (e) {
        console.warn('[sync] PUT failed', e instanceof Error ? e.message : String(e));
      } finally {
        inFlightRef.current = false;
        const pending = pendingRef.current;
        pendingRef.current = null;
        const stale = !mountedRef.current || sessionRef.current !== forSession;
        if (stale) {
          // Unmounted or no longer the same session: drop this outcome and anything queued.
        } else if (pending) {
          // Superseded while this PUT was in flight: resend the latest value right away rather
          // than reporting this PUT's now-outdated success as fully synced.
          void sendPut(pending);
        } else {
          setSynced(success);
        }
      }
    },
    [replaceProgress],
  );

  useEffect(() => {
    if (!session) {
      startedForRef.current = null;
      readyForRef.current = null;
      lastSyncedRef.current = null;
      setSynced(false);
      return;
    }
    if (!progress || startedForRef.current === session) return;
    startedForRef.current = session;
    let cancelled = false;
    (async () => {
      try {
        let server: CampaignProgress | null = null;
        try {
          const res = await getCampaign();
          server = res.progress;
        } catch (e) {
          // A 404 with `not_found` means the wallet never synced before: keep the local progress
          // and PUT it. Any other error (including a 404 with a different code) is a real failure.
          if (!(e instanceof ApiError && e.status === 404 && e.code === 'not_found')) throw e;
        }
        if (cancelled) return;
        const merged = server ? mergeProgress(progress, server) : progress;
        if (differs(merged, progress)) await replaceProgress(merged);
        if (!cancelled) await sendPut(merged);
      } catch (e) {
        if (!cancelled) {
          setSynced(false);
          console.warn('[sync] initial GET failed', e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) readyForRef.current = session;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, progress, replaceProgress, sendPut]);

  useEffect(() => {
    if (!session || !progress) return;
    if (readyForRef.current !== session) return; // the initial sync above has not finished yet
    if (lastSyncedRef.current && !differs(progress, lastSyncedRef.current)) return; // nothing new
    const timer = setTimeout(() => {
      void sendPut(progress);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [session, progress, sendPut]);

  return { synced };
}
