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
    if (typeof parsed.token !== 'string' || typeof parsed.walletAddress !== 'string') return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
