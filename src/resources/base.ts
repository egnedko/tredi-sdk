/**
 * Shared contract between the client and its resource modules. Resources depend
 * only on this narrow interface (not the concrete `ThreadsClient`), which keeps
 * the dependency graph acyclic and makes resources trivial to unit test.
 */

import type { HttpMethod } from '../http.js'

export interface ResourceRequest {
  method: HttpMethod
  /** Path appended after the version segment, e.g. `/me/threads`. */
  path: string
  params?: Record<string, unknown>
  /** Optional per-call cancellation. */
  signal?: AbortSignal
}

export interface ThreadsRequester {
  /** Default node id for user-scoped endpoints (the configured user, or `me`). */
  readonly userNode: string
  request<T>(req: ResourceRequest): Promise<T>
}

/** Joins requested `fields` into the comma-separated form the API expects. */
export function fieldsParam(fields: readonly string[] | undefined): string | undefined {
  return fields && fields.length > 0 ? fields.join(',') : undefined
}
