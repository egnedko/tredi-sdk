/** Test doubles for `fetch`. No network, no framework magic. */

import type { FetchLike } from '../src/http.js'

export interface MockResponseSpec {
  status?: number
  body?: unknown
  headers?: Record<string, string>
  /** Reject the fetch with this error (simulates a network failure). */
  throwError?: Error
}

export interface RecordedCall {
  url: string
  init?: RequestInit
}

export interface MockFetch extends FetchLike {
  readonly calls: RecordedCall[]
}

/**
 * Returns a fetch that replays `responses` in order (repeating the last one
 * once exhausted) and records every call.
 */
export function mockFetch(responses: MockResponseSpec[]): MockFetch {
  const calls: RecordedCall[] = []
  let index = 0

  const fn = (async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init })
    const spec = responses[Math.min(index, responses.length - 1)] ?? {}
    index += 1
    if (spec.throwError) throw spec.throwError
    const status = spec.status ?? 200
    const text = spec.body === undefined ? '' : JSON.stringify(spec.body)
    return new Response(text, { status, headers: spec.headers })
  }) as MockFetch

  Object.defineProperty(fn, 'calls', { get: () => calls })
  return fn
}

/** A fetch that never resolves until its request is aborted (for timeout tests). */
export function hangingFetch(): FetchLike {
  return (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return
      signal.addEventListener('abort', () => {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        reject(error)
      })
    })
}

/** Reads a POST form body recorded by {@link mockFetch} into a URLSearchParams. */
export function bodyOf(call: RecordedCall): URLSearchParams {
  const body = call.init?.body
  if (body instanceof URLSearchParams) return body
  return new URLSearchParams(typeof body === 'string' ? body : '')
}
