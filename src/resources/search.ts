/** Keyword search — `GET /keyword_search`. */

import { fieldsParam, type ThreadsRequester } from './base.js'
import type { MediaContainerType, Paginated, ThreadsMedia } from '../types.js'

const DEFAULT_SEARCH_FIELDS = [
  'id',
  'username',
  'text',
  'timestamp',
  'permalink',
  'media_type',
  'has_replies',
  'is_quote_post',
  'is_reply',
] as const

export interface KeywordSearchOptions {
  /** `TOP` (default) ranks by relevance; `RECENT` is reverse-chronological. */
  searchType?: 'TOP' | 'RECENT'
  /** `KEYWORD` (default) or `TAG`. */
  searchMode?: 'KEYWORD' | 'TAG'
  /** Restrict to a media type. */
  mediaType?: Extract<MediaContainerType, 'TEXT' | 'IMAGE' | 'VIDEO'>
  since?: number | Date
  until?: number | Date
  /** Default 25, max 100. */
  limit?: number
  /** Exact username to filter results by author. */
  authorUsername?: string
  fields?: string[]
  signal?: AbortSignal
}

export class SearchResource {
  constructor(private readonly client: ThreadsRequester) {}

  /**
   * Searches public Threads posts by keyword or tag. The `owner` field is never
   * returned for search results. Requires the `threads_keyword_search`
   * permission (plus `threads_basic`).
   */
  keyword(query: string, options: KeywordSearchOptions = {}): Promise<Paginated<ThreadsMedia>> {
    return this.client.request<Paginated<ThreadsMedia>>({
      method: 'GET',
      path: '/keyword_search',
      params: {
        q: query,
        search_type: options.searchType,
        search_mode: options.searchMode,
        media_type: options.mediaType,
        since: options.since,
        until: options.until,
        limit: options.limit,
        author_username: options.authorUsername,
        fields: fieldsParam(options.fields ?? DEFAULT_SEARCH_FIELDS),
      },
      signal: options.signal,
    })
  }
}
