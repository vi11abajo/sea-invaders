import * as SecureStore from 'expo-secure-store';

export interface Session {
  token: string;
  userId: number;
  walletAddress: string;
  username: string;
}

const KEY = 'sea-invaders.session';

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.token !== 'string' || typeof parsed.walletAddress !== 'string' || typeof parsed.username !== 'string' || typeof parsed.userId !== 'number' || !Number.isInteger(parsed.userId)) return null;
    return { token: parsed.token, userId: parsed.userId, walletAddress: parsed.walletAddress, username: parsed.username };
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

/** Why the stored session went away: the player disconnected, or the server rejected its token. */
export type SessionClearReason = 'signed-out' | 'expired';

type SessionClearedListener = (reason: SessionClearReason) => void;
const listeners = new Set<SessionClearedListener>();

/** Calls `listener` after every `clearSession`; returns the unsubscribe. */
export function onSessionCleared(listener: SessionClearedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function clearSession(reason: SessionClearReason = 'signed-out'): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
  for (const listener of [...listeners]) listener(reason);
}
