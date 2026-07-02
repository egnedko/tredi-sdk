/**
 * Typed error hierarchy. Every failure the SDK surfaces is an instance of
 * {@link ThreadsError}, so callers can `catch` broadly or narrow with
 * `instanceof` to a specific subtype.
 *
 * ```text
 * ThreadsError
 * ├─ ThreadsValidationError   client-side input was invalid (no request sent)
 * ├─ ThreadsTimeoutError      request exceeded the configured timeout
 * ├─ ThreadsNetworkError      fetch failed before a response was received
 * └─ ThreadsAPIError          the API returned a non-2xx response
 *    ├─ ThreadsAuthError      invalid/expired token or auth failure (401 / code 190)
 *    └─ ThreadsRateLimitError throttled (HTTP 429 or a known throttle code)
 * ```
 */

import { INVALID_TOKEN_ERROR_CODE, RATE_LIMIT_ERROR_CODES } from './constants.js'

export interface ApiErrorDetails {
  message: string
  /** HTTP status code of the response. */
  status?: number
  /** Graph API `error.code`. */
  code?: number
  /** Graph API `error.error_subcode`. */
  subcode?: number
  /** Graph API `error.type`. */
  type?: string
  /** Graph API `error.fbtrace_id` — quote this when contacting Meta support. */
  fbtraceId?: string
}

/** Base class for every error thrown by the SDK. */
export class ThreadsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = new.target.name
    // Preserve the prototype chain so `instanceof` works across the compiled
    // (downleveled) output, not just in the original TS.
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** Thrown when caller input fails validation before any request is made. */
export class ThreadsValidationError extends ThreadsError {}

/** Thrown when a request exceeds the configured timeout. */
export class ThreadsTimeoutError extends ThreadsError {}

/** Thrown when the request fails at the network layer (no HTTP response). */
export class ThreadsNetworkError extends ThreadsError {}

/** Thrown for any non-2xx API response. */
export class ThreadsAPIError extends ThreadsError {
  readonly status?: number
  readonly code?: number
  readonly subcode?: number
  readonly type?: string
  readonly fbtraceId?: string

  constructor(details: ApiErrorDetails, options?: { cause?: unknown }) {
    super(details.message, options)
    this.status = details.status
    this.code = details.code
    this.subcode = details.subcode
    this.type = details.type
    this.fbtraceId = details.fbtraceId
  }
}

/** Invalid or expired access token / authorization failure. */
export class ThreadsAuthError extends ThreadsAPIError {}

/** Request was throttled. {@link retryAfterMs} is set when the API tells us. */
export class ThreadsRateLimitError extends ThreadsAPIError {
  readonly retryAfterMs?: number

  constructor(
    details: ApiErrorDetails & { retryAfterMs?: number },
    options?: { cause?: unknown },
  ) {
    super(details, options)
    this.retryAfterMs = details.retryAfterMs
  }
}

/** Minimal shape of a Graph API error envelope. */
interface GraphErrorBody {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

/** A `Headers`-like object (only `get` is needed). */
interface HeadersLike {
  get(name: string): string | null
}

/**
 * Parses a `Retry-After` header (seconds or HTTP-date) into milliseconds.
 * Returns `undefined` when absent or unparseable.
 */
export function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - Date.now())
}

/**
 * Maps a non-2xx HTTP response into the most specific error subtype.
 *
 * @param status - HTTP status code.
 * @param body - Parsed JSON body (may be undefined for empty/non-JSON bodies).
 * @param headers - Response headers, used to read `Retry-After`.
 */
export function toApiError(
  status: number,
  body: unknown,
  headers?: HeadersLike,
): ThreadsAPIError {
  const error = (body as GraphErrorBody | undefined)?.error
  const details: ApiErrorDetails = {
    message: error?.message ?? `Threads API request failed with HTTP ${status}`,
    status,
    code: error?.code,
    subcode: error?.error_subcode,
    type: error?.type,
    fbtraceId: error?.fbtrace_id,
  }

  if (status === 401 || details.code === INVALID_TOKEN_ERROR_CODE) {
    return new ThreadsAuthError(details)
  }

  if (status === 429 || (details.code != null && RATE_LIMIT_ERROR_CODES.has(details.code))) {
    return new ThreadsRateLimitError({
      ...details,
      retryAfterMs: parseRetryAfterMs(headers?.get('retry-after') ?? null),
    })
  }

  return new ThreadsAPIError(details)
}
