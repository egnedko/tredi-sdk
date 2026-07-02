/**
 * `ThreadsClient` — the typed entry point. Holds resolved configuration and
 * exposes resource namespaces. One client instance is bound to one access
 * token; create a new instance (or use {@link ThreadsClient.withToken}) per
 * user/token.
 */

import {
  DEFAULT_API_VERSION,
  DEFAULT_BASE_URL,
  DEFAULT_RETRY,
  DEFAULT_TIMEOUT_MS,
} from './constants.js'
import { ThreadsValidationError } from './errors.js'
import { type FetchLike, type RetryConfig, send } from './http.js'
import { type Logger, noopLogger } from './logger.js'
import { type ResourceRequest, type ThreadsRequester } from './resources/base.js'
import { InsightsResource } from './resources/insights.js'
import { MentionsResource } from './resources/mentions.js'
import { PostsResource } from './resources/posts.js'
import { ProfileResource } from './resources/profile.js'
import { PublishingResource } from './resources/publishing.js'
import { RepliesResource } from './resources/replies.js'
import { SearchResource } from './resources/search.js'

export interface ThreadsClientConfig {
  /** A Threads user access token (short- or long-lived). */
  accessToken: string
  /**
   * Default node id for user-scoped endpoints. Defaults to `me`, which resolves
   * to the token's owner.
   */
  userId?: string
  /** Graph host override. Defaults to `https://graph.threads.net`. */
  baseUrl?: string
  /** API version. Defaults to `v1.0`. */
  version?: string
  /** Per-request timeout in ms. Defaults to 30000. */
  timeoutMs?: number
  /**
   * Retry policy for idempotent requests. Pass `false` to disable retries, or a
   * partial object to override individual fields.
   */
  retry?: Partial<RetryConfig> | false
  /** Logging hook. Tokens/secrets are always redacted before logging. */
  logger?: Logger
  /** Custom fetch (for tests or non-standard runtimes). Defaults to global. */
  fetch?: FetchLike
}

interface ResolvedConfig {
  accessToken: string
  userId: string
  baseUrl: string
  version: string
  timeoutMs: number
  retry: RetryConfig | false
  logger: Logger
  fetch: FetchLike
}

function resolveConfig(config: ThreadsClientConfig): ResolvedConfig {
  if (!config.accessToken) {
    throw new ThreadsValidationError('`accessToken` is required to create a ThreadsClient.')
  }
  const fetchImpl = config.fetch ?? (globalThis.fetch as FetchLike | undefined)
  if (!fetchImpl) {
    throw new ThreadsValidationError(
      'No fetch implementation available. Pass `fetch` or run on Node 18+ / a runtime with global fetch.',
    )
  }
  return {
    accessToken: config.accessToken,
    userId: config.userId ?? 'me',
    baseUrl: (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    version: config.version ?? DEFAULT_API_VERSION,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retry: config.retry === false ? false : { ...DEFAULT_RETRY, ...config.retry },
    logger: config.logger ?? noopLogger,
    fetch: fetchImpl,
  }
}

export class ThreadsClient implements ThreadsRequester {
  readonly profile: ProfileResource
  readonly posts: PostsResource
  readonly publishing: PublishingResource
  readonly replies: RepliesResource
  readonly insights: InsightsResource
  readonly mentions: MentionsResource
  readonly search: SearchResource

  private readonly config: ResolvedConfig

  constructor(config: ThreadsClientConfig) {
    this.config = resolveConfig(config)

    this.profile = new ProfileResource(this)
    this.posts = new PostsResource(this)
    this.publishing = new PublishingResource(this)
    this.replies = new RepliesResource(this, this.publishing)
    this.insights = new InsightsResource(this)
    this.mentions = new MentionsResource(this)
    this.search = new SearchResource(this)
  }

  /** Default node id for user-scoped endpoints. */
  get userNode(): string {
    return this.config.userId
  }

  /**
   * Low-level escape hatch: issue a request to any Threads endpoint with full
   * typing of the response. Prefer the resource methods; use this for endpoints
   * the SDK doesn't model yet.
   */
  request<T>(req: ResourceRequest): Promise<T> {
    return send<T>({
      method: req.method,
      url: `${this.config.baseUrl}/${this.config.version}${req.path}`,
      params: req.params,
      accessToken: this.config.accessToken,
      timeoutMs: this.config.timeoutMs,
      retry: this.config.retry,
      logger: this.config.logger,
      fetchImpl: this.config.fetch,
      signal: req.signal,
    })
  }

  /** Returns a new client that shares this config but uses a different token. */
  withToken(accessToken: string): ThreadsClient {
    return new ThreadsClient({ ...this.config, accessToken })
  }
}
