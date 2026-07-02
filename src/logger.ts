/**
 * Logging hooks. The SDK never writes to the console itself; it calls the
 * injected logger so the host app controls transport and level. The SDK's own
 * log calls (in `http.ts`) only ever include a redacted URL — never raw
 * request params or the access token — via {@link redactUrl}.
 *
 * {@link redactParams} is exported as a standalone utility for host apps that
 * build a custom logger and want to log request params (not just the URL)
 * safely; the SDK itself doesn't need it since it never logs params.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  [key: string]: unknown
}

export interface Logger {
  /**
   * Receives a structured log event. Implementations must be non-throwing and
   * fast; the SDK calls this synchronously on the request path.
   */
  log(level: LogLevel, message: string, context?: LogContext): void
}

/** Discards all logs. Default when no logger is configured. */
export const noopLogger: Logger = { log() {} }

/** Query/body keys whose values must never be logged. */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'access_token',
  'client_secret',
  'code',
])

const REDACTED = 'REDACTED'

/**
 * Returns a copy of `params` with sensitive values masked. Non-sensitive
 * values are preserved so logs stay useful for debugging.
 */
export function redactParams(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!params) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    out[key] = SENSITIVE_KEYS.has(key) ? REDACTED : value
  }
  return out
}

/**
 * Masks sensitive query-string values in a URL. Falsy/relative inputs are
 * returned with a best-effort regex redaction so we never throw on the log
 * path.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url)
    for (const key of SENSITIVE_KEYS) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, REDACTED)
    }
    return parsed.toString()
  } catch {
    return url.replace(
      /(access_token|client_secret|code)=[^&\s]+/gi,
      `$1=${REDACTED}`,
    )
  }
}
