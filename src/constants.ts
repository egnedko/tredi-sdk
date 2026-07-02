/**
 * Static configuration for the Threads API.
 *
 * Values here mirror the official documentation
 * (https://developers.facebook.com/docs/threads). Hosts and the API version
 * are the only "magic strings" in the SDK and live in one place so they are
 * easy to audit against the docs.
 */

/** Graph host for all data/publishing calls. */
export const DEFAULT_BASE_URL = 'https://graph.threads.net'

/** Host that serves the OAuth authorization window (user-facing redirect). */
export const AUTHORIZATION_BASE_URL = 'https://threads.net'

/** Current Threads Graph API version. */
export const DEFAULT_API_VERSION = 'v1.0'

/** Default per-request timeout. */
export const DEFAULT_TIMEOUT_MS = 30_000

/** Default automatic-retry policy applied to idempotent requests. */
export const DEFAULT_RETRY = {
  maxRetries: 2,
  initialDelayMs: 500,
  maxDelayMs: 8_000,
  backoffFactor: 2,
} as const

/**
 * Graph error codes that indicate throttling. Used only as a secondary signal;
 * the primary rate-limit signal is HTTP 429. Kept intentionally small — only
 * widely-documented throttle codes are listed.
 */
export const RATE_LIMIT_ERROR_CODES: ReadonlySet<number> = new Set([4, 17, 32, 613])

/** Graph error code for an invalid/expired access token. */
export const INVALID_TOKEN_ERROR_CODE = 190

/**
 * OAuth permission scopes supported by the Threads API, as documented.
 * `threads_basic` is required for every call.
 */
export const THREADS_SCOPES = [
  'threads_basic',
  'threads_content_publish',
  'threads_read_replies',
  'threads_manage_replies',
  'threads_manage_insights',
  'threads_keyword_search',
  'threads_delete',
  'threads_location_tagging',
] as const

/**
 * A documented Threads scope, or any other scope string the API may accept.
 * The string fallback keeps autocomplete for known scopes without hardcoding
 * scope names that aren't verified against the docs.
 */
export type ThreadsScope = (typeof THREADS_SCOPES)[number] | (string & {})
