import { describe, expect, it } from 'vitest'
import {
  backoffDelayMs,
  buildQuery,
  isRetryable,
  isRetryableStatus,
} from '../src/http.js'
import {
  ThreadsAPIError,
  ThreadsNetworkError,
  ThreadsRateLimitError,
  ThreadsTimeoutError,
} from '../src/errors.js'

describe('buildQuery', () => {
  it('skips undefined and null values', () => {
    const q = buildQuery({ a: 1, b: undefined, c: null, d: 'x' })
    expect(q.toString()).toBe('a=1&d=x')
  })

  it('serializes arrays and objects as JSON', () => {
    const q = buildQuery({ children: ['1', '2'], obj: { k: 'v' } })
    expect(q.get('children')).toBe('["1","2"]')
    expect(q.get('obj')).toBe('{"k":"v"}')
  })

  it('converts Date to a unix timestamp (seconds)', () => {
    const q = buildQuery({ since: new Date('2024-01-01T00:00:00Z') })
    expect(q.get('since')).toBe('1704067200')
  })
})

describe('isRetryableStatus', () => {
  it('retries 429 and 5xx, not 4xx', () => {
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(500)).toBe(true)
    expect(isRetryableStatus(503)).toBe(true)
    expect(isRetryableStatus(400)).toBe(false)
    expect(isRetryableStatus(404)).toBe(false)
  })
})

describe('isRetryable (idempotency-aware)', () => {
  const rateLimit = new ThreadsRateLimitError({ message: 'slow down', status: 429 })
  const network = new ThreadsNetworkError('boom')
  const timeout = new ThreadsTimeoutError('slow')
  const serverError = new ThreadsAPIError({ message: 'oops', status: 500 })
  const clientError = new ThreadsAPIError({ message: 'bad', status: 400 })

  it('retries rate-limit and network errors for any method', () => {
    for (const method of ['GET', 'POST'] as const) {
      expect(isRetryable(method, rateLimit)).toBe(true)
      expect(isRetryable(method, network)).toBe(true)
    }
  })

  it('retries timeouts and 5xx only for GET (never duplicates a POST)', () => {
    expect(isRetryable('GET', timeout)).toBe(true)
    expect(isRetryable('POST', timeout)).toBe(false)
    expect(isRetryable('GET', serverError)).toBe(true)
    expect(isRetryable('POST', serverError)).toBe(false)
  })

  it('never retries 4xx client errors', () => {
    expect(isRetryable('GET', clientError)).toBe(false)
    expect(isRetryable('POST', clientError)).toBe(false)
  })
})

describe('backoffDelayMs', () => {
  const config = { maxRetries: 3, initialDelayMs: 100, maxDelayMs: 1000, backoffFactor: 2 }

  it('grows exponentially and stays within [half, full] of the cap', () => {
    for (const attempt of [0, 1, 2]) {
      const expected = Math.min(100 * 2 ** attempt, 1000)
      const delay = backoffDelayMs(attempt, config)
      expect(delay).toBeGreaterThanOrEqual(expected / 2)
      expect(delay).toBeLessThanOrEqual(expected)
    }
  })

  it('never exceeds maxDelayMs', () => {
    expect(backoffDelayMs(10, config)).toBeLessThanOrEqual(1000)
  })

  it('honors Retry-After (capped at maxDelayMs)', () => {
    expect(backoffDelayMs(0, config, 250)).toBe(250)
    expect(backoffDelayMs(0, config, 99999)).toBe(1000)
  })
})
