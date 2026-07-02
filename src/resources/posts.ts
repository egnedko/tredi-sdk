/** Retrieve & discover posts — `GET /{user-id}/threads` and `GET /{media-id}`. */

import { fieldsParam, type ThreadsRequester } from './base.js'
import type { Paginated, ThreadsMedia } from '../types.js'

const DEFAULT_MEDIA_FIELDS = [
  'id',
  'media_product_type',
  'media_type',
  'media_url',
  'permalink',
  'username',
  'text',
  'timestamp',
  'shortcode',
  'thumbnail_url',
  'is_quote_post',
] as const

export interface ListPostsOptions {
  /** User id to list; defaults to the configured user (or `me`). */
  userId?: string
  fields?: string[]
  /** Unix timestamp or `Date` lower bound. */
  since?: number | Date
  /** Unix timestamp or `Date` upper bound. */
  until?: number | Date
  limit?: number
  /** Pagination cursors (from a previous response's `paging`). */
  before?: string
  after?: string
  signal?: AbortSignal
}

export interface GetPostOptions {
  fields?: string[]
  signal?: AbortSignal
}

export class PostsResource {
  constructor(private readonly client: ThreadsRequester) {}

  /**
   * Lists a user's posts, most recent first. Cursor-paginated.
   * Requires the `threads_basic` permission.
   */
  list(options: ListPostsOptions = {}): Promise<Paginated<ThreadsMedia>> {
    const node = options.userId ?? this.client.userNode
    return this.client.request<Paginated<ThreadsMedia>>({
      method: 'GET',
      path: `/${node}/threads`,
      params: {
        fields: fieldsParam(options.fields ?? DEFAULT_MEDIA_FIELDS),
        since: options.since,
        until: options.until,
        limit: options.limit,
        before: options.before,
        after: options.after,
      },
      signal: options.signal,
    })
  }

  /**
   * Reads a single media object (post or reply) by id.
   * Requires the `threads_basic` permission.
   */
  get(mediaId: string, options: GetPostOptions = {}): Promise<ThreadsMedia> {
    return this.client.request<ThreadsMedia>({
      method: 'GET',
      path: `/${mediaId}`,
      params: { fields: fieldsParam(options.fields ?? DEFAULT_MEDIA_FIELDS) },
      signal: options.signal,
    })
  }
}
