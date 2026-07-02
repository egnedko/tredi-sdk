/** Insights — `GET /{media-id}/insights` and `GET /{user-id}/threads_insights`. */

import type { ThreadsRequester } from './base.js'
import type { InsightsResponse } from '../types.js'

/** Documented media-level metrics. */
export type MediaMetric = 'views' | 'likes' | 'replies' | 'reposts' | 'quotes' | 'shares'

/** Documented user-level metrics. */
export type UserMetric =
  | 'views'
  | 'likes'
  | 'replies'
  | 'reposts'
  | 'quotes'
  | 'clicks'
  | 'followers_count'
  | 'follower_demographics'

/** Breakdown dimension for `follower_demographics`. */
export type DemographicBreakdown = 'country' | 'city' | 'age' | 'gender'

const DEFAULT_MEDIA_METRICS: MediaMetric[] = [
  'views',
  'likes',
  'replies',
  'reposts',
  'quotes',
  'shares',
]

export interface MediaInsightsOptions {
  metrics?: MediaMetric[]
  signal?: AbortSignal
}

export interface UserInsightsOptions {
  userId?: string
  metrics?: UserMetric[]
  since?: number | Date
  until?: number | Date
  /** Required by the API when requesting `follower_demographics`. */
  breakdown?: DemographicBreakdown
  signal?: AbortSignal
}

export class InsightsResource {
  constructor(private readonly client: ThreadsRequester) {}

  /**
   * Returns engagement metrics for a single post.
   * Requires the `threads_manage_insights` permission.
   */
  media(mediaId: string, options: MediaInsightsOptions = {}): Promise<InsightsResponse> {
    const metrics = options.metrics ?? DEFAULT_MEDIA_METRICS
    return this.client.request<InsightsResponse>({
      method: 'GET',
      path: `/${mediaId}/insights`,
      params: { metric: metrics.join(',') },
      signal: options.signal,
    })
  }

  /**
   * Returns account-level metrics for a user.
   * Requires the `threads_manage_insights` permission.
   */
  user(options: UserInsightsOptions = {}): Promise<InsightsResponse> {
    const node = options.userId ?? this.client.userNode
    const metrics = options.metrics ?? ['views', 'followers_count']
    return this.client.request<InsightsResponse>({
      method: 'GET',
      path: `/${node}/threads_insights`,
      params: {
        metric: metrics.join(','),
        since: options.since,
        until: options.until,
        breakdown: options.breakdown,
      },
      signal: options.signal,
    })
  }
}
