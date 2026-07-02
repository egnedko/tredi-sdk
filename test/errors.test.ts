import { describe, expect, it } from 'vitest'
import {
  ThreadsAPIError,
  ThreadsAuthError,
  ThreadsRateLimitError,
  parseRetryAfterMs,
  toApiError,
} from '../src/errors.js'

const graphError = (code: number, message = 'err') => ({
  error: { message, code, error_subcode: 99, type: 'OAuthException', fbtrace_id: 'abc' },
})

describe('toApiError', () => {
  it('maps 401 to ThreadsAuthError', () => {
    const err = toApiError(401, graphError(190, 'bad token'))
    expect(err).toBeInstanceOf(ThreadsAuthError)
    expect(err.message).toBe('bad token')
    expect(err.code).toBe(190)
    expect(err.fbtraceId).toBe('abc')
  })

  it('maps code 190 to ThreadsAuthError even on a 400', () => {
    expect(toApiError(400, graphError(190))).toBeInstanceOf(ThreadsAuthError)
  })

  it('maps 429 to ThreadsRateLimitError with retryAfterMs', () => {
    const err = toApiError(429, graphError(4), { get: () => '2' })
    expect(err).toBeInstanceOf(ThreadsRateLimitError)
    expect((err as ThreadsRateLimitError).retryAfterMs).toBe(2000)
  })

  it('maps known throttle codes to ThreadsRateLimitError', () => {
    expect(toApiError(400, graphError(32))).toBeInstanceOf(ThreadsRateLimitError)
  })

  it('falls back to ThreadsAPIError for generic failures', () => {
    const err = toApiError(500, undefined)
    expect(err).toBeInstanceOf(ThreadsAPIError)
    expect(err).not.toBeInstanceOf(ThreadsAuthError)
    expect(err.status).toBe(500)
    expect(err.message).toContain('500')
  })

  it('preserves the prototype chain (instanceof works after throw)', () => {
    try {
      throw toApiError(401, graphError(190))
    } catch (e) {
      expect(e instanceof ThreadsAuthError).toBe(true)
      expect(e instanceof ThreadsAPIError).toBe(true)
      expect(e instanceof Error).toBe(true)
    }
  })
})

describe('parseRetryAfterMs', () => {
  it('parses seconds', () => {
    expect(parseRetryAfterMs('5')).toBe(5000)
  })

  it('returns undefined for missing or garbage values', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined()
    expect(parseRetryAfterMs('not-a-date')).toBeUndefined()
  })
})
