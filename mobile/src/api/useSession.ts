import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { hapticError, hapticSuccess } from '../audio/haptics';
import { playSfx } from '../audio/sfx';
import { signInWithWallet, signOut as apiSignOut } from './auth';
import { ApiError } from './client';
import { loadSession, onSessionCleared, type Session } from './session';

/** The one-line reason shown when the server rejects the stored session's token. */
export const SESSION_EXPIRED_NOTICE = 'Session expired — connect your wallet again';

/**
 * The signed-in player, restored from secure storage and refreshed by sign-in / sign-out.
 * `restoring` is true until the stored session has been read; `loading` while a sign-in is in flight.
 * `notice` is set when the server rejected the session's token (it expired): the shell shows it once
 * and calls `dismissNotice`.
 */
export function useSession() {
  const { signIn: walletSignIn, disconnect: forgetWalletAuthorization } = useMobileWallet();
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Mirrors `session` for the listener below, which is subscribed once.
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let alive = true;
    loadSession().then((s) => {
      if (alive) {
        setSession(s);
        setRestoring(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // A request the server refused for the token clears the stored session; drop it here as well, so the
  // screens show the wallet as disconnected instead of failing every wallet call. Several requests can
  // hit the same expired token at once: only the first one, while still signed in, raises the notice.
  useEffect(
    () =>
      onSessionCleared((reason) => {
        if (reason === 'expired' && sessionRef.current !== null) setNotice(SESSION_EXPIRED_NOTICE);
        sessionRef.current = null;
        setSession(null);
      }),
    [],
  );

  const dismissNotice = useCallback(() => setNotice(null), []);

  const signIn = useCallback(async () => {
    setError(null);
    // Connecting again answers an expiry notice not yet shown (e.g. it came while on the Profile).
    setNotice(null);
    setLoading(true);
    try {
      // A wallet re-authorizing a remembered app returns no sign-in result, which the library
      // reports as "Sign in result not retrieved". Forgetting the cached authorization first makes
      // every sign-in a fresh one that carries the signature.
      await forgetWalletAuthorization();
      setSession(await signInWithWallet(walletSignIn));
      playSfx('wallet_connected');
      hapticSuccess();
    } catch (e) {
      // Release builds have no debugger: keep the stack in logcat so a failure on a device is diagnosable.
      console.error('[auth] wallet sign-in failed', e instanceof Error ? (e.stack ?? e.message) : e);
      setError(e instanceof ApiError ? e.message : `Wallet sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
      playSfx('ui_error');
      hapticError();
    } finally {
      setLoading(false);
    }
  }, [walletSignIn, forgetWalletAuthorization]);

  // Disconnect: forget the wallet's cached authorization (local only, no wallet round trip) and the
  // stored session. A failure to forget the authorization never keeps the player signed in.
  const signOut = useCallback(async () => {
    try {
      await forgetWalletAuthorization();
    } catch (e) {
      console.warn('[auth] forgetting the wallet authorization failed', e instanceof Error ? e.message : e);
    }
    try {
      await apiSignOut();
    } catch (e) {
      // SecureStore could not delete the token (rare): the player still asked to disconnect, so drop
      // the session from memory anyway rather than leave the promise rejected and the wallet shown.
      console.warn('[auth] clearing the stored session failed', e instanceof Error ? e.message : e);
    }
    setSession(null);
  }, [forgetWalletAuthorization]);

  return { session, restoring, loading, signIn, signOut, error, notice, dismissNotice };
}
