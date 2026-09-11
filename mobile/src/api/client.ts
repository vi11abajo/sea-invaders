import { API_URL } from './config';
import { loadSession, clearSession } from './session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const TIMEOUT_MS = 15_000;

/** JSON request to the backend. With `auth`, sends the stored JWT and clears it on a 401. */
export async function apiFetch<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.auth) {
    const session = await loadSession();
    if (!session) throw new ApiError(401, 'Not signed in', 'not_signed_in');
    headers.Authorization = `Bearer ${session.token}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiError(0, error instanceof Error && error.name === 'AbortError' ? 'The server did not answer in time' : 'Cannot reach the server', 'network');
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    if (response.status === 401 && init.auth) await clearSession();
    const body = (data ?? {}) as { message?: string; code?: string; error?: string; reason?: string };
    throw new ApiError(response.status, body.message ?? body.reason ?? body.error ?? `HTTP ${response.status}`, body.code ?? body.reason ?? body.error);
  }
  return data as T;
}
