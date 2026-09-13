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
 * - On sign-in (a new `session`, once `progress` has loaded): GET the server copy. A 404 means
 *   the wallet never synced before — keep the local progress as-is. Otherwise `mergeProgress`
 *   the local and server copies (spec §6.2: per-level OR/max, position fields from the newer
 *   `updatedAt`); `replaceProgress` only if the merge differs from local (avoids a redundant
 *   write), then PUT the merged value once so the server has it too.
 * - After that initial round trip (success or failure), every later `progress` change starts a
 *   2 s debounce timer that PUTs the current progress; at most one PUT is in flight at a time,
 *   and a change that arrives while one is in flight is picked up by its own later debounce.
 * - A successful PUT stores the server's returned merge via `replaceProgress`, but only if it
 *   differs from what was sent (avoids an update loop), and flips `synced` to true. A failed PUT
 *   (network or 4xx/5xx) leaves `synced` false; the next progress change retries.
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

  const sendPut = useCallback(
    async (p: CampaignProgress): Promise<void> => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const { progress: merged } = await putCampaign(p);
        if (differs(merged, p)) await replaceProgress(merged);
        lastSyncedRef.current = merged;
        setSynced(true);
        console.log('[sync] PUT ok', merged.updatedAt);
      } catch (e) {
        setSynced(false);
        console.warn('[sync] PUT failed', e instanceof Error ? e.message : String(e));
      } finally {
        inFlightRef.current = false;
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
          // A 404 means the wallet never synced before: keep the local progress and PUT it.
          if (!(e instanceof ApiError && e.status === 404)) throw e;
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
