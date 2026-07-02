import { describe, expect, it, vi } from 'vitest'
import { ThreadsClient } from '../src/client.js'
import {
  ThreadsAPIError,
  ThreadsNetworkError,
  ThreadsTimeoutError,
  ThreadsValidationError,
} from '../src/errors.js'
import type { LogContext, Logger, LogLevel } from '../src/logger.js'
import { bodyOf, hangingFetch, mockFetch } from './helpers.js'

const TOKEN = 'SECRET-TOKEN'

/** Fast retry config so tests don't wait on real backoff. */
const FAST_RETRY = { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 2, backoffFactor: 2 }

describe('request shaping', () => {
  it('profile.get hits GET /v1.0/me with fields and token', async () => {
    const fetchImpl = mockFetch([{ body: { id: '1', username: 'u' } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const profile = await client.profile.get()
    expect(profile.username).toBe('u')

    const url = new URL(fetchImpl.calls[0]!.url)
    expect(fetchImpl.calls[0]!.init?.method).toBe('GET')
    expect(url.pathname).toBe('/v1.0/me')
    expect(url.searchParams.get('fields')).toContain('username')
    expect(url.searchParams.get('access_token')).toBe(TOKEN)
  })

  it('search.keyword hits the top-level /keyword_search edge', async () => {
    const fetchImpl = mockFetch([{ body: { data: [] } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await client.search.keyword('coffee', { searchType: 'RECENT' })
    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.pathname).toBe('/v1.0/keyword_search')
    expect(url.searchParams.get('q')).toBe('coffee')
    expect(url.searchParams.get('search_type')).toBe('RECENT')
  })

  it('insights.media sends the metric list', async () => {
    const fetchImpl = mockFetch([{ body: { data: [] } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await client.insights.media('m1', { metrics: ['views', 'likes'] })
    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.pathname).toBe('/v1.0/m1/insights')
    expect(url.searchParams.get('metric')).toBe('views,likes')
  })

  it('uses a configured userId instead of "me"', async () => {
    const fetchImpl = mockFetch([{ body: { id: '1' } }])
    const client = new ThreadsClient({ accessToken: TOKEN, userId: '999', fetch: fetchImpl })
    await client.profile.get()
    expect(new URL(fetchImpl.calls[0]!.url).pathname).toBe('/v1.0/999')
  })
})

describe('publishing flow', () => {
  it('publishText creates a container then publishes it', async () => {
    const fetchImpl = mockFetch([{ body: { id: 'container-1' } }, { body: { id: 'post-1' } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const result = await client.publishing.publishText('hello world')
    expect(result).toEqual({ id: 'post-1' })
    expect(fetchImpl.calls).toHaveLength(2)

    const createBody = bodyOf(fetchImpl.calls[0]!)
    expect(new URL(fetchImpl.calls[0]!.url).pathname).toBe('/v1.0/me/threads')
    expect(createBody.get('media_type')).toBe('TEXT')
    expect(createBody.get('text')).toBe('hello world')

    const publishBody = bodyOf(fetchImpl.calls[1]!)
    expect(new URL(fetchImpl.calls[1]!.url).pathname).toBe('/v1.0/me/threads_publish')
    expect(publishBody.get('creation_id')).toBe('container-1')
  })
})

describe('retry behavior', () => {
  it('retries a GET on 5xx and succeeds', async () => {
    const fetchImpl = mockFetch([
      { status: 500, body: { error: { message: 'boom' } } },
      { status: 200, body: { id: '1', username: 'u' } },
    ])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl, retry: FAST_RETRY })

    const profile = await client.profile.get()
    expect(profile.username).toBe('u')
    expect(fetchImpl.calls).toHaveLength(2)
  })

  it('does NOT retry a POST on 5xx (avoids double-publish)', async () => {
    const fetchImpl = mockFetch([{ status: 500, body: { error: { message: 'boom' } } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl, retry: FAST_RETRY })

    await expect(client.publishing.publishContainer('c1')).rejects.toBeInstanceOf(ThreadsAPIError)
    expect(fetchImpl.calls).toHaveLength(1)
  })

  it('retries a POST on 429 (request was rejected, not processed)', async () => {
    const fetchImpl = mockFetch([
      { status: 429, headers: { 'retry-after': '0' }, body: { error: { message: 'slow' } } },
      { status: 200, body: { id: 'post-1' } },
    ])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl, retry: FAST_RETRY })

    const result = await client.publishing.publishContainer('c1')
    expect(result).toEqual({ id: 'post-1' })
    expect(fetchImpl.calls).toHaveLength(2)
  })

  it('exhausts all retries and throws after maxRetries + 1 attempts', async () => {
    // mockFetch repeats the last response, so all 3 attempts get 500
    const fetchImpl = mockFetch([{ status: 500, body: { error: { message: 'boom' } } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl, retry: FAST_RETRY })

    await expect(client.profile.get()).rejects.toBeInstanceOf(ThreadsAPIError)
    expect(fetchImpl.calls).toHaveLength(3) // attempt 0 + 2 retries = maxRetries + 1
  })
})

describe('network errors', () => {
  it('wraps a low-level network failure as ThreadsNetworkError', async () => {
    const fetchImpl = mockFetch([{ throwError: new Error('ECONNRESET') }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl, retry: false })
    await expect(client.profile.get()).rejects.toBeInstanceOf(ThreadsNetworkError)
  })
})

describe('timeout', () => {
  it('throws ThreadsTimeoutError when the request exceeds the timeout', async () => {
    const client = new ThreadsClient({
      accessToken: TOKEN,
      fetch: hangingFetch(),
      timeoutMs: 10,
      retry: false,
    })
    await expect(client.profile.get()).rejects.toBeInstanceOf(ThreadsTimeoutError)
  })
})

describe('AbortSignal', () => {
  it('rejects immediately and does not retry when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    // mockFetch records the call; throwError simulates what fetch does with an aborted signal
    const fetchImpl = mockFetch([
      { throwError: Object.assign(new Error('aborted'), { name: 'AbortError' }) },
    ])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl, retry: FAST_RETRY })

    await expect(
      client.publishing.getContainerStatus('c1', { signal: controller.signal }),
    ).rejects.toBeInstanceOf(ThreadsNetworkError)
    expect(fetchImpl.calls).toHaveLength(1)
  })

  it('cancels a mid-flight request and does not retry', async () => {
    const controller = new AbortController()
    let calls = 0
    const abortableFetch = (_url: string, init?: RequestInit) => {
      calls++
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    }
    const client = new ThreadsClient({
      accessToken: TOKEN,
      fetch: abortableFetch,
      retry: FAST_RETRY,
      timeoutMs: 5_000,
    })
    const promise = client.publishing.getContainerStatus('c1', { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toBeInstanceOf(ThreadsNetworkError)
    expect(calls).toBe(1)
  })
})

describe('security: logging never leaks the token', () => {
  it('redacts the access token from GET log output', async () => {
    const entries: { level: LogLevel; message: string; context?: LogContext }[] = []
    const logger: Logger = { log: (level, message, context) => entries.push({ level, message, context }) }
    const fetchImpl = mockFetch([{ body: { id: '1' } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl, logger })

    await client.profile.get()

    expect(entries.length).toBeGreaterThan(0)
    expect(JSON.stringify(entries)).not.toContain(TOKEN)
  })

  it('redacts the access token from POST log output (token is in the body, never logged)', async () => {
    const entries: { level: LogLevel; message: string; context?: LogContext }[] = []
    const logger: Logger = { log: (level, message, context) => entries.push({ level, message, context }) }
    const fetchImpl = mockFetch([{ body: { id: 'cont' } }, { body: { id: 'post' } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl, logger })

    await client.publishing.publishText('hi')

    expect(entries.length).toBeGreaterThan(0)
    expect(JSON.stringify(entries)).not.toContain(TOKEN)
  })

  it('never logs the raw token even when a request fails', async () => {
    const entries: { level: LogLevel; message: string; context?: LogContext }[] = []
    const logger: Logger = { log: (level, message, context) => entries.push({ level, message, context }) }
    const fetchImpl = mockFetch([{ status: 401, body: { error: { message: 'bad token', code: 190 } } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl, logger, retry: false })

    await expect(client.profile.get()).rejects.toThrow()

    expect(entries.length).toBeGreaterThan(0)
    expect(JSON.stringify(entries)).not.toContain(TOKEN)
  })
})

describe('security: path injection via unvalidated ids', () => {
  it('rejects an id containing "?" instead of silently smuggling query params', async () => {
    const fetchImpl = mockFetch([{ body: { success: true } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    // Simulates an id sourced from untrusted input (e.g. a webhook payload)
    // that was never validated before being handed to the SDK.
    await expect(
      client.publishing.deletePost('123?access_token=attacker-controlled'),
    ).rejects.toThrow(ThreadsValidationError)
    expect(fetchImpl.calls).toHaveLength(0) // no request was ever sent
  })

  it('rejects ids containing "#" or whitespace', async () => {
    const fetchImpl = mockFetch([{ body: {} }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await expect(client.posts.get('123#frag')).rejects.toThrow(ThreadsValidationError)
    await expect(client.posts.get('123 456')).rejects.toThrow(ThreadsValidationError)
  })

  it('still accepts normal Threads ids (numeric, "me", underscores/hyphens)', async () => {
    const fetchImpl = mockFetch([{ body: { id: '1' } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await expect(client.posts.get('17895948570123456')).resolves.toBeDefined()
    await expect(client.profile.get({ userId: 'me' })).resolves.toBeDefined()
  })
})

describe('withToken', () => {
  it('returns a new client that uses the new token', async () => {
    const fetchImpl = mockFetch([{ body: { id: '1' } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })
    const scoped = client.withToken('OTHER-TOKEN')

    await scoped.profile.get()
    expect(new URL(fetchImpl.calls[0]!.url).searchParams.get('access_token')).toBe('OTHER-TOKEN')
  })
})

describe('config validation', () => {
  it('throws when accessToken is missing', () => {
    expect(() => new ThreadsClient({ accessToken: '', fetch: vi.fn() })).toThrow()
  })
})
