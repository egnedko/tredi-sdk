/**
 * Replies & moderation.
 *
 * Reading: `GET /{media}/replies` (top-level) and `GET /{media}/conversation`
 * (flattened thread). Moderation: hide/unhide, plus the reply-approval queue.
 * Publishing a reply reuses the publishing flow with `reply_to_id` set.
 */

import { fieldsParam, type ThreadsRequester } from './base.js'
import type { ContainerRef, Paginated, SuccessResponse, ThreadsReply } from '../types.js'
import type { PublishingResource } from './publishing.js'

const DEFAULT_REPLY_FIELDS = [
  'id',
  'text',
  'username',
  'timestamp',
  'media_type',
  'permalink',
  'has_replies',
  'is_reply',
  'hide_status',
] as const

export interface ListRepliesOptions {
  fields?: string[]
  /** Reverse chronological order. */
  reverse?: boolean
  signal?: AbortSignal
}

export interface ListPendingRepliesOptions {
  fields?: string[]
  reverse?: boolean
  /** Filter by approval state. */
  approvalStatus?: 'pending' | 'ignored'
  signal?: AbortSignal
}

export class RepliesResource {
  constructor(
    private readonly client: ThreadsRequester,
    private readonly publishing: PublishingResource,
  ) {}

  /**
   * Lists the top-level replies to a post.
   * Requires `threads_read_replies` (or `threads_manage_replies`).
   */
  list(mediaId: string, options: ListRepliesOptions = {}): Promise<Paginated<ThreadsReply>> {
    return this.client.request<Paginated<ThreadsReply>>({
      method: 'GET',
      path: `/${mediaId}/replies`,
      params: {
        fields: fieldsParam(options.fields ?? DEFAULT_REPLY_FIELDS),
        reverse: options.reverse,
      },
      signal: options.signal,
    })
  }

  /**
   * Lists the full conversation (all nested replies) under a post.
   * Requires `threads_read_replies` (or `threads_manage_replies`).
   */
  conversation(
    mediaId: string,
    options: ListRepliesOptions = {},
  ): Promise<Paginated<ThreadsReply>> {
    return this.client.request<Paginated<ThreadsReply>>({
      method: 'GET',
      path: `/${mediaId}/conversation`,
      params: {
        fields: fieldsParam(options.fields ?? DEFAULT_REPLY_FIELDS),
        reverse: options.reverse,
      },
      signal: options.signal,
    })
  }

  /**
   * Publishes a reply to an existing post. Requires `threads_content_publish`
   * (and `threads_manage_replies` for replies you don't own).
   */
  publish(
    replyToId: string,
    text: string,
    options: { userId?: string; signal?: AbortSignal } = {},
  ): Promise<ContainerRef> {
    return this.publishing.publishText(text, { replyToId, ...options })
  }

  /** Hides a reply. Requires `threads_manage_replies`. */
  hide(replyId: string, options: { signal?: AbortSignal } = {}): Promise<SuccessResponse> {
    return this.setHidden(replyId, true, options)
  }

  /** Unhides a previously hidden reply. Requires `threads_manage_replies`. */
  unhide(replyId: string, options: { signal?: AbortSignal } = {}): Promise<SuccessResponse> {
    return this.setHidden(replyId, false, options)
  }

  /**
   * Lists replies awaiting approval (when reply approvals are enabled).
   * Requires `threads_manage_replies`.
   */
  listPending(
    mediaId: string,
    options: ListPendingRepliesOptions = {},
  ): Promise<Paginated<ThreadsReply>> {
    return this.client.request<Paginated<ThreadsReply>>({
      method: 'GET',
      path: `/${mediaId}/pending_replies`,
      params: {
        fields: fieldsParam(options.fields ?? DEFAULT_REPLY_FIELDS),
        reverse: options.reverse,
        approval_status: options.approvalStatus,
      },
      signal: options.signal,
    })
  }

  /**
   * Approves or rejects a pending reply. Requires `threads_manage_replies`.
   */
  managePending(
    replyId: string,
    approve: boolean,
    options: { signal?: AbortSignal } = {},
  ): Promise<SuccessResponse> {
    return this.client.request<SuccessResponse>({
      method: 'POST',
      path: `/${replyId}/manage_pending_reply`,
      params: { approve },
      signal: options.signal,
    })
  }

  private setHidden(
    replyId: string,
    hide: boolean,
    options: { signal?: AbortSignal },
  ): Promise<SuccessResponse> {
    return this.client.request<SuccessResponse>({
      method: 'POST',
      path: `/${replyId}/manage_reply`,
      params: { hide },
      signal: options.signal,
    })
  }
}
