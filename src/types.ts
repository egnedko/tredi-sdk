/**
 * Public API types. Field names mirror the Threads API exactly (snake_case);
 * all object fields are optional because the API only returns the fields you
 * request via `fields=`. Enum unions list only documented values.
 */

/** `media_type` accepted when creating a publish container. */
export type MediaContainerType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL'

/** `media_type` returned when reading a media object (differs from input). */
export type MediaType =
  | 'TEXT_POST'
  | 'IMAGE'
  | 'VIDEO'
  | 'CAROUSEL_ALBUM'
  | 'AUDIO'
  | 'REPOST_FACADE'

/** Who is allowed to reply to a post. */
export type ReplyControl =
  | 'everyone'
  | 'accounts_you_follow'
  | 'mentioned_only'
  | 'parent_post_author_only'
  | 'followers_only'

/** Lifecycle status of a publish container. */
export type ContainerStatus =
  | 'EXPIRED'
  | 'ERROR'
  | 'FINISHED'
  | 'IN_PROGRESS'
  | 'PUBLISHED'

/** Generic cursor-paginated list response. */
export interface Paginated<T> {
  data: T[]
  paging?: {
    cursors?: { before?: string; after?: string }
    next?: string
    previous?: string
  }
}

/** A Threads user profile. */
export interface ThreadsProfile {
  id?: string
  username?: string
  name?: string
  threads_profile_picture_url?: string
  threads_biography?: string
  is_verified?: boolean
}

/** A Threads media object (post). */
export interface ThreadsMedia {
  id?: string
  media_product_type?: string
  media_type?: MediaType
  media_url?: string
  permalink?: string
  owner?: { id: string }
  username?: string
  text?: string
  /** ISO 8601 timestamp. */
  timestamp?: string
  shortcode?: string
  thumbnail_url?: string
  children?: { data: ThreadsMedia[] }
  is_quote_post?: boolean
  quoted_post?: ThreadsMedia
  reposted_post?: ThreadsMedia
  alt_text?: string
  link_attachment_url?: string
  gif_url?: string
  topic_tag?: string
  is_verified?: boolean
  profile_picture_url?: string
}

/** A reply object. Shares most fields with media plus reply-specific ones. */
export interface ThreadsReply {
  id?: string
  text?: string
  timestamp?: string
  media_product_type?: string
  media_type?: MediaType
  media_url?: string
  shortcode?: string
  thumbnail_url?: string
  children?: { data: ThreadsReply[] }
  has_replies?: boolean
  root_post?: { id: string }
  replied_to?: { id: string }
  is_reply?: boolean
  username?: string
  permalink?: string
  /** Whether the reply is currently hidden. */
  hide_status?: 'NOT_HUSHED' | 'UNHUSHED' | 'HIDDEN' | 'COVERED' | 'BLOCKED' | 'RESTRICTED'
  reply_audience?: string
}

/** One metric value in an insights response. */
export interface InsightMetric {
  name: string
  period?: string
  title?: string
  description?: string
  /** Present for "total value" metrics. */
  total_value?: { value: number }
  /** Present for "time series" metrics. */
  values?: { value: number; end_time?: string }[]
  id?: string
}

export interface InsightsResponse {
  data: InsightMetric[]
  paging?: { previous?: string; next?: string }
}

/** A single quota bucket from the publishing-limit endpoint. */
export interface QuotaBucket {
  quota_usage?: number
  config?: { quota_total?: number; quota_duration?: number }
}

/** Response of `GET /{user}/threads_publishing_limit`. */
export interface PublishingLimit {
  quota_usage?: number
  config?: { quota_total?: number; quota_duration?: number }
  reply_quota_usage?: number
  reply_config?: { quota_total?: number; quota_duration?: number }
  delete_quota_usage?: number
  delete_config?: { quota_total?: number; quota_duration?: number }
  location_search_quota_usage?: number
  location_search_config?: { quota_total?: number; quota_duration?: number }
}

/** Result of creating or publishing a container. */
export interface ContainerRef {
  id: string
}

/** `{ "success": true }` responses from moderation endpoints. */
export interface SuccessResponse {
  success: boolean
}
