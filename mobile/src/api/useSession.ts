import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { useCallback, useEffect, useState } from 'react';
import { signInWithWallet, signOut as apiSignOut } from './auth';
import { ApiError } from './client';
import { loadSession, type Session } from './session';

/** The signed-in player, restored from secure storage and refreshed by sign-in / sign-out. */
export function useSession() {
  const { signIn: walletSignIn, disconnect: forgetWalletAuthorization } = useMobileWallet();
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
      // A wallet re-authorizing a remembered app returns no sign-in result, which the library
      // reports as "Sign in result not retrieved". Forgetting the cached authorization first makes
      // every sign-in a fresh one that carries the signature.
      await forgetWalletAuthorization();
      setSession(await signInWithWallet(walletSignIn));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Wallet sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [walletSignIn, forgetWalletAuthorization]);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setSession(null);
  }, []);

  return { session, loading, signIn, signOut, error };
}
