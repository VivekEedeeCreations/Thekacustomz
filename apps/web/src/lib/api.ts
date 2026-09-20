import type { ApiResponse } from '@inventory/shared';

import { env } from './env';
import { supabase } from './supabase';

class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Typed fetch wrapper for the backend REST API. Attaches the current Supabase
 * access token (when signed in) and unwraps the standard response envelope.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!env.VITE_API_URL) {
    throw new ApiRequestError('not_configured', 'VITE_API_URL is not set', 0);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const res = await fetch(`${env.VITE_API_URL}${path}`, { ...init, headers });

  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiRequestError(
      'invalid_response',
      'The server returned an invalid response',
      res.status,
    );
  }

  if (!res.ok || !body.ok) {
    const error = body.ok ? undefined : body.error;
    throw new ApiRequestError(
      error?.code ?? 'request_failed',
      error?.message ?? 'Request failed',
      res.status,
    );
  }

  return body.data;
}

export { ApiRequestError };
