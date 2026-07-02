/** Mentions — `GET /{user-id}/mentions`. */

import { fieldsParam, type ThreadsRequester } from './base.js'
import type { Paginated, ThreadsMedia } from '../types.js'

const DEFAULT_MENTION_FIELDS = [
  'id',
  'username',
  'text',
  'timestamp',
  'permalink',
  'media_type',
] as const

export interface ListMentionsOptions {
  userId?: string
  fields?: string[]
  since?: number | Date
  until?: number | Date
  limit?: number
  before?: string
  after?: string
  signal?: AbortSignal
}

export class MentionsResource {
  constructor(private readonly client: ThreadsRequester) {}

  /**
   * Lists posts that mention the user. Requires the mentions permission in
   * addition to `threads_basic`.
   */
  list(options: ListMentionsOptions = {}): Promise<Paginated<ThreadsMedia>> {
    const node = options.userId ?? this.client.userNode
    return this.client.request<Paginated<ThreadsMedia>>({
      method: 'GET',
      path: `/${node}/mentions`,
      params: {
        fields: fieldsParam(options.fields ?? DEFAULT_MENTION_FIELDS),
        since: options.since,
        until: options.until,
        limit: options.limit,
        before: options.before,
        after: options.after,
      },
      signal: options.signal,
    })
  }
}
