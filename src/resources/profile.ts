/** Profile endpoint — `GET /me` / `GET /{user-id}`. */

import { fieldsParam, type ThreadsRequester } from './base.js'
import type { ThreadsProfile } from '../types.js'

/** Fields requested by default when none are specified. */
const DEFAULT_PROFILE_FIELDS = [
  'id',
  'username',
  'name',
  'threads_profile_picture_url',
  'threads_biography',
  'is_verified',
] as const

export interface GetProfileOptions {
  /** User id to read; defaults to the configured user (or `me`). */
  userId?: string
  /** Profile fields to return; defaults to all documented fields. */
  fields?: string[]
  signal?: AbortSignal
}

export class ProfileResource {
  constructor(private readonly client: ThreadsRequester) {}

  /**
   * Returns profile information for a Threads user.
   * Requires the `threads_basic` permission.
   */
  get(options: GetProfileOptions = {}): Promise<ThreadsProfile> {
    const node = options.userId ?? this.client.userNode
    return this.client.request<ThreadsProfile>({
      method: 'GET',
      path: `/${node}`,
      params: { fields: fieldsParam(options.fields ?? DEFAULT_PROFILE_FIELDS) },
      signal: options.signal,
    })
  }
}
