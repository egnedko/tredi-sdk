/**
 * tredi-sdk — a typed, ESM-first client for the Meta Threads API.
 *
 * Quick start:
 * ```ts
 * import { ThreadsClient } from 'tredi-sdk'
 * const threads = new ThreadsClient({ accessToken: process.env.THREADS_TOKEN! })
 * await threads.publishing.publishText('Hello, Threads 👋')
 * ```
 */

// --- Client ---
export { ThreadsClient, type ThreadsClientConfig } from './client.js'

// --- OAuth (standalone, tree-shakeable) ---
export {
  getAuthorizationUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  refreshLongLivedToken,
  type AuthorizationUrlOptions,
  type ShortLivedTokenResponse,
  type LongLivedTokenResponse,
} from './oauth.js'

// --- Errors ---
export {
  ThreadsError,
  ThreadsValidationError,
  ThreadsTimeoutError,
  ThreadsNetworkError,
  ThreadsAPIError,
  ThreadsAuthError,
  ThreadsRateLimitError,
  toApiError,
  parseRetryAfterMs,
  type ApiErrorDetails,
} from './errors.js'

// --- Logging ---
export {
  noopLogger,
  redactUrl,
  redactParams,
  type Logger,
  type LogLevel,
  type LogContext,
} from './logger.js'

// --- Constants & scopes ---
export {
  THREADS_SCOPES,
  type ThreadsScope,
  DEFAULT_BASE_URL,
  DEFAULT_API_VERSION,
  AUTHORIZATION_BASE_URL,
} from './constants.js'

// --- HTTP types (for advanced/custom usage) ---
export type { FetchLike, HttpMethod, RetryConfig } from './http.js'

// --- Resource request types (for escape hatch + custom resources) ---
export type { ResourceRequest, ThreadsRequester } from './resources/base.js'

// --- Resource option/return types ---
export type { GetProfileOptions } from './resources/profile.js'
export type { ListPostsOptions, GetPostOptions } from './resources/posts.js'
export type {
  CreateContainerInput,
  ContainerStatusResult,
  WaitOptions,
  PublishImageInput,
  PublishVideoInput,
  PublishCarouselInput,
} from './resources/publishing.js'
export type { ListRepliesOptions, ListPendingRepliesOptions } from './resources/replies.js'
export type {
  MediaMetric,
  MediaInsightsOptions,
  UserMetric,
  DemographicBreakdown,
  UserInsightsOptions,
} from './resources/insights.js'
export type { ListMentionsOptions } from './resources/mentions.js'
export type { KeywordSearchOptions } from './resources/search.js'

// --- API object types ---
export type {
  MediaContainerType,
  MediaType,
  ReplyControl,
  ContainerStatus,
  Paginated,
  ThreadsProfile,
  ThreadsMedia,
  ThreadsReply,
  InsightMetric,
  InsightsResponse,
  PublishingLimit,
  QuotaBucket,
  ContainerRef,
  SuccessResponse,
} from './types.js'
