/**
 * OAuth 2.0 helpers for the Threads authorization-code flow.
 *
 * These are standalone functions (not methods on the client) so a host app that
 * only handles the auth handshake can import them without pulling in the rest
 * of the SDK. Token-exchange calls must run server-side: they require the app
 * secret, which must never reach a browser.
 */

import {
  AUTHORIZATION_BASE_URL,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  type ThreadsScope,
} from './constants.js'
import { ThreadsValidationError } from './errors.js'
import { buildQuery, type FetchLike, send } from './http.js'
import type { Logger } from './logger.js'

/** Options shared by the server-side token-exchange calls. */
interface ExchangeBaseOptions {
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike
  /** Graph host override (defaults to `https://graph.threads.net`). */
  baseUrl?: string
  /** Per-request timeout in ms. */
  timeoutMs?: number
  /** Optional logging hook (token values are always redacted). */
  logger?: Logger
}

export interface AuthorizationUrlOptions {
  clientId: string
  redirectUri: string
  /** Requested scopes. `threads_basic` is required by the API. */
  scopes: ThreadsScope[]
  /** Opaque CSRF token echoed back to your redirect URI. Strongly recommended. */
  state?: string
  /** Authorization host override (defaults to `https://threads.net`). */
  baseUrl?: string
}

export interface ShortLivedTokenResponse {
  access_token: string
  user_id: string
}

export interface LongLivedTokenResponse {
  access_token: string
  token_type: string
  /** Seconds until expiry (~60 days). */
  expires_in: number
}

function resolveFetch(fetchImpl?: FetchLike): FetchLike {
  const impl = fetchImpl ?? (globalThis.fetch as FetchLike | undefined)
  if (!impl) {
    throw new ThreadsValidationError(
      'No fetch implementation available. Pass `fetch` explicitly or run on a runtime with global fetch (Node 18+).',
    )
  }
  return impl
}

/**
 * Builds the URL to redirect a user to in order to grant your app access.
 *
 * @example
 * ```ts
 * const url = getAuthorizationUrl({
 *   clientId: process.env.THREADS_APP_ID!,
 *   redirectUri: 'https://app.example.com/auth/callback',
 *   scopes: ['threads_basic', 'threads_content_publish'],
 *   state: csrfToken,
 * })
 * ```
 */
export function getAuthorizationUrl(options: AuthorizationUrlOptions): string {
  if (options.scopes.length === 0) {
    throw new ThreadsValidationError('At least one scope is required (threads_basic).')
  }
  const base = options.baseUrl ?? AUTHORIZATION_BASE_URL
  const query = buildQuery({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: options.scopes.join(','),
    state: options.state,
  })
  return `${base}/oauth/authorize?${query.toString()}`
}

/**
 * Exchanges an authorization `code` for a short-lived access token. Server-side
 * only (requires the app secret).
 */
export async function exchangeCodeForToken(
  options: ExchangeBaseOptions & {
    clientId: string
    clientSecret: string
    code: string
    redirectUri: string
  },
): Promise<ShortLivedTokenResponse> {
  const base = options.baseUrl ?? DEFAULT_BASE_URL
  return send<ShortLivedTokenResponse>({
    method: 'POST',
    url: `${base}/oauth/access_token`,
    params: {
      client_id: options.clientId,
      client_secret: options.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: options.redirectUri,
      code: options.code,
    },
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retry: false, // code is single-use; never replay it
    logger: options.logger,
    fetchImpl: resolveFetch(options.fetch),
  })
}

/**
 * Exchanges a short-lived token for a long-lived (~60 day) token. Server-side
 * only (requires the app secret).
 */
export async function exchangeForLongLivedToken(
  options: ExchangeBaseOptions & {
    clientSecret: string
    shortLivedToken: string
  },
): Promise<LongLivedTokenResponse> {
  const base = options.baseUrl ?? DEFAULT_BASE_URL
  return send<LongLivedTokenResponse>({
    method: 'GET',
    url: `${base}/access_token`,
    params: {
      grant_type: 'th_exchange_token',
      client_secret: options.clientSecret,
    },
    accessToken: options.shortLivedToken,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retry: false,
    logger: options.logger,
    fetchImpl: resolveFetch(options.fetch),
  })
}

/**
 * Refreshes a long-lived token, extending it ~60 days. The token must be at
 * least 24 hours old and unexpired. No app secret required.
 */
export async function refreshLongLivedToken(
  options: ExchangeBaseOptions & {
    longLivedToken: string
  },
): Promise<LongLivedTokenResponse> {
  const base = options.baseUrl ?? DEFAULT_BASE_URL
  return send<LongLivedTokenResponse>({
    method: 'GET',
    url: `${base}/refresh_access_token`,
    params: { grant_type: 'th_refresh_token' },
    accessToken: options.longLivedToken,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retry: false,
    logger: options.logger,
    fetchImpl: resolveFetch(options.fetch),
  })
}
