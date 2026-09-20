import type { ApiError, ApiResponse } from '@inventory/shared';

export function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function fail(error: ApiError): ApiResponse<never> {
  return { ok: false, error };
}
