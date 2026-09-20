/** Standard shape for every REST response returned by apps/api. */
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiError {
  /** Stable, machine-readable code, e.g. "not_found", "validation_error". */
  code: string;
  /** Human-readable summary safe to surface in the UI. */
  message: string;
  /** Optional field-level details, typically from schema validation. */
  details?: Record<string, string[]>;
}

/** Envelope for paginated list endpoints. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface HealthStatus {
  status: 'ok';
  service: string;
  timestamp: string;
}
