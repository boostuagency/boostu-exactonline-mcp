/**
 * Exact Online REST API types.
 *
 * Reference: https://start.exactonline.nl/docs/HlpRestAPIResources.aspx
 *
 * Two things shape every type below:
 *  - the API is OData v3, so collections come back as { d: { results: [...] } }
 *    and single entities as { d: {...} };
 *  - almost every resource lives under a division (the administration of one
 *    company), so the division is part of the request path rather than the body.
 */

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface ExactAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Region base, e.g. https://start.exactonline.be */
  baseUrl: string;
  accessToken?: string;
  tokenExpiresAt?: number;
  /** Optional: read the latest refresh token from external storage on boot. */
  loadRefreshToken?: () => string | undefined;
  /** Optional: persist each rotated refresh token to external storage. */
  saveRefreshToken?: (token: string) => void;
}

export interface TokenResponse {
  token_type: string;
  /** Exact returns this as a string in some regions. */
  expires_in: number | string;
  access_token: string;
  refresh_token: string;
}

// ─── OData envelopes ─────────────────────────────────────────────────────────

/**
 * A collection response. Exact uses two shapes: with $top in the query it
 * answers `{ "d": [ ...rows ] }` (a bare array, never paged); without $top it
 * answers `{ "d": { "results": [...], "__next": "...$skiptoken=..." } }` and
 * pages server-side. Use collectionRows() and collectionMeta() rather than
 * reading `d` directly.
 */
export interface ODataCollection<T> {
  d:
    | T[]
    | {
        results: T[];
        /** Absolute URL of the next page; carries the $skiptoken. */
        __next?: string;
        __count?: string;
      };
}

/** The rows of a collection response, whichever shape Exact chose. */
export function collectionRows<T>(body: ODataCollection<T> | undefined | null): T[] {
  const d = body?.d;
  if (Array.isArray(d)) return d;
  return d?.results ?? [];
}

/** The paging metadata, present only on the object shape. */
export function collectionMeta<T>(body: ODataCollection<T> | undefined | null): { next?: string; count?: string } {
  const d = body?.d;
  if (!d || Array.isArray(d)) return {};
  return { next: d.__next, count: d.__count };
}

export interface ODataEntity<T> {
  d: T;
}

/** Normalised list result handed back to tools. */
export interface ListResult<T> {
  data: T[];
  /** Total number of matches, present when count was requested. */
  count?: number;
  /** Pass back as `skiptoken` to fetch the next page; absent on the last page. */
  next_skiptoken?: string;
}

// ─── Rate limiting ───────────────────────────────────────────────────────────

/** Values Exact reports in the X-RateLimit-* response headers. */
export interface RateLimitSnapshot {
  limit?: number;
  remaining?: number;
  /** Unix time in milliseconds when the daily window resets. */
  reset?: number;
  minutelyLimit?: number;
  minutelyRemaining?: number;
  minutelyReset?: number;
}

// ─── Divisions ───────────────────────────────────────────────────────────────

export interface Me {
  UserID: string;
  CurrentDivision: number;
  FullName?: string;
  Email?: string;
  Language?: string;
  ThreadId?: number;
  ServerTime?: string;
}

export interface Division {
  Code: number;
  Description?: string;
  Country?: string;
  Currency?: string;
  HID?: number;
  Main?: boolean;
  BlockingStatus?: number;
}
