import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { useCallback, useEffect, useState } from 'react';
import { signInWithWallet, signOut as apiSignOut } from './auth';
import { ApiError } from './client';
import { loadSession, type Session } from './session';

/** The signed-in player, restored from secure storage and refreshed by sign-in / sign-out. */
export function useSession() {
  const { signIn: walletSignIn } = useMobileWallet();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadSession().then((s) => {
      if (alive) {
        setSession(s);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setSession(await signInWithWallet(walletSignIn));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Wallet sign-in was cancelled or failed');
    } finally {
      setLoading(false);
    }
  }, [walletSignIn]);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setSession(null);
  }, []);

  return { session, loading, signIn, signOut, error };
}
