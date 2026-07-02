/**
 * The single HTTP engine used by both the client and the OAuth helpers.
 *
 * Responsibilities: build the request, enforce a timeout, send via the injected
 * `fetch`, parse the response, map failures to typed errors, retry idempotent
 * failures with exponential backoff + jitter, and emit redacted logs.
 *
 * Retry safety: non-idempotent (POST) requests are only retried when the server
 * never processed them (HTTP 429) or no response was received (network error).
 * A POST timeout or 5xx is *not* retried — it may have already taken effect
 * (e.g. a published post), and re-sending could duplicate it.
 */

import { DEFAULT_RETRY } from './constants.js'
import {
  ThreadsAPIError,
  ThreadsNetworkError,
  ThreadsRateLimitError,
  ThreadsTimeoutError,
  ThreadsValidationError,
  toApiError,
} from './errors.js'
import { type Logger, noopLogger, redactUrl } from './logger.js'

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export type HttpMethod = 'GET' | 'POST' | 'DELETE'

export interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffFactor: number
}

export interface SendRequest {
  method: HttpMethod
  /** Fully-built URL (without `access_token`). */
  url: string
  /** Becomes the query string (GET) or form body (POST). */
  params?: Record<string, unknown>
  /** Added to the query (GET) or body (POST). Never logged. */
  accessToken?: string
  timeoutMs: number
  retry: RetryConfig | false
  logger?: Logger
  fetchImpl: FetchLike
  /** Optional caller-controlled cancellation, combined with the timeout. */
  signal?: AbortSignal
}

/**
 * Builds a URLSearchParams from a record, skipping `undefined`/`null` and
 * serializing arrays/objects to JSON (matching Graph API conventions).
 */
export function buildQuery(params: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date))) {
      query.set(key, JSON.stringify(value))
    } else if (value instanceof Date) {
      query.set(key, String(Math.floor(value.getTime() / 1000)))
    } else {
      query.set(key, String(value))
    }
  }
  return query
}

/** Joins a base URL with a query string, preserving any existing query. */
function appendQuery(url: string, query: URLSearchParams): string {
  const qs = query.toString()
  if (!qs) return url
  return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`
}

/** True for HTTP statuses worth retrying on idempotent requests. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * Decides whether a failed attempt should be retried, given the request method.
 * See the module doc comment for the idempotency rationale.
 */
export function isRetryable(method: HttpMethod, error: unknown): boolean {
  if (error instanceof ThreadsRateLimitError) return true
  if (error instanceof ThreadsNetworkError) return true
  if (error instanceof ThreadsTimeoutError) return method === 'GET'
  if (error instanceof ThreadsAPIError) {
    return method === 'GET' && error.status != null && error.status >= 500
  }
  return false
}

/**
 * Computes the backoff delay before the next attempt. Honors a server-provided
 * `Retry-After` (capped), otherwise uses exponential backoff with equal jitter.
 */
export function backoffDelayMs(
  attempt: number,
  config: RetryConfig,
  retryAfterMs?: number,
): number {
  if (retryAfterMs != null) return Math.min(retryAfterMs, config.maxDelayMs)
  const exponential = config.initialDelayMs * config.backoffFactor ** attempt
  const capped = Math.min(exponential, config.maxDelayMs)
  // Equal jitter: half fixed, half random — avoids thundering-herd retries.
  return capped / 2 + Math.random() * (capped / 2)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Performs exactly one HTTP attempt (no retries). */
async function sendOnce<T>(req: SendRequest): Promise<T> {
  const { method, url, params = {}, accessToken, timeoutMs, fetchImpl, signal } = req

  const controller = new AbortController()
  let timedOut = false
  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort, { once: true })
  }
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const withToken = accessToken ? { ...params, access_token: accessToken } : params
    let finalUrl = url
    const init: RequestInit = { method, signal: controller.signal }

    if (method === 'GET' || method === 'DELETE') {
      finalUrl = appendQuery(url, buildQuery(withToken))
    } else {
      init.body = buildQuery(withToken)
      init.headers = { 'content-type': 'application/x-www-form-urlencoded' }
    }

    let response: Response
    try {
      response = await fetchImpl(finalUrl, init)
    } catch (cause) {
      if (controller.signal.aborted && timedOut) {
        throw new ThreadsTimeoutError(
          `Threads API request timed out after ${timeoutMs}ms`,
          { cause },
        )
      }
      throw new ThreadsNetworkError('Threads API request failed at the network layer', {
        cause,
      })
    }

    const text = await response.text()
    const body = text ? safeJsonParse(text) : undefined

    if (!response.ok) throw toApiError(response.status, body, response.headers)
    return body as T
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }
}

/**
 * Rejects a URL that already contains a query string, fragment, or whitespace
 * before we've had a chance to append our own query params.
 *
 * Every legitimate call site builds `url` as `{base}/{version}{path}`, where
 * `path` is a template like `/${mediaId}/replies` — never containing `?`/`#`
 * on its own. If one of those interpolated ids came from untrusted input
 * (e.g. a webhook payload passed straight through without validation) and
 * contained `?access_token=...` or similar, it would otherwise smuggle extra
 * query params — or redirect the request to a different path/endpoint
 * entirely — once we append the real query string. Failing closed here turns
 * that into a clear, immediate `ThreadsValidationError` instead of a
 * malformed or hijacked request.
 */
function assertCleanUrl(url: string): void {
  if (/[?#\s]/.test(url)) {
    throw new ThreadsValidationError(
      `Invalid request URL "${url}" — it contains "?", "#", or whitespace before query ` +
        'params were added. This usually means an unvalidated id (e.g. from a webhook ' +
        'payload) was interpolated into a resource path. Validate ids before passing them ' +
        'to the SDK.',
    )
  }
}

/**
 * Sends a request with automatic retries. This is the only function that talks
 * to the network in the SDK.
 */
export async function send<T>(req: SendRequest): Promise<T> {
  assertCleanUrl(req.url)
  const logger = req.logger ?? noopLogger
  const retryConfig: RetryConfig =
    req.retry === false ? { ...DEFAULT_RETRY, maxRetries: 0 } : req.retry

  let attempt = 0
  for (;;) {
    const startedAt = Date.now()
    try {
      const result = await sendOnce<T>(req)
      logger.log('debug', 'threads.request.success', {
        method: req.method,
        url: redactUrl(req.url),
        attempt,
        durationMs: Date.now() - startedAt,
      })
      return result
    } catch (error) {
      const willRetry =
        isRetryable(req.method, error) &&
        attempt < retryConfig.maxRetries &&
        !req.signal?.aborted
      logger.log(willRetry ? 'warn' : 'error', 'threads.request.failure', {
        method: req.method,
        url: redactUrl(req.url),
        attempt,
        durationMs: Date.now() - startedAt,
        willRetry,
        error: error instanceof Error ? error.name : 'Unknown',
      })
      if (!willRetry) throw error

      const retryAfterMs =
        error instanceof ThreadsRateLimitError ? error.retryAfterMs : undefined
      await sleep(backoffDelayMs(attempt, retryConfig, retryAfterMs))
      attempt += 1
    }
  }
}
