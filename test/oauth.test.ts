import { describe, expect, it } from 'vitest'
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAuthorizationUrl,
  refreshLongLivedToken,
} from '../src/oauth.js'
import { ThreadsValidationError } from '../src/errors.js'
import { bodyOf, mockFetch } from './helpers.js'

describe('getAuthorizationUrl', () => {
  it('builds the authorize URL with all required params', () => {
    const url = new URL(
      getAuthorizationUrl({
        clientId: 'app-123',
        redirectUri: 'https://app.example.com/cb',
        scopes: ['threads_basic', 'threads_content_publish'],
        state: 'csrf-xyz',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://threads.net/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('app-123')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/cb')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('threads_basic,threads_content_publish')
    expect(url.searchParams.get('state')).toBe('csrf-xyz')
  })

  it('throws when no scopes are provided', () => {
    expect(() =>
      getAuthorizationUrl({ clientId: 'a', redirectUri: 'b', scopes: [] }),
    ).toThrow(ThreadsValidationError)
  })
})

describe('exchangeCodeForToken', () => {
  it('POSTs the code and returns the short-lived token', async () => {
    const fetchImpl = mockFetch([{ body: { access_token: 'short-tok', user_id: '42' } }])
    const result = await exchangeCodeForToken({
      clientId: 'app-123',
      clientSecret: 'shh',
      code: 'auth-code',
      redirectUri: 'https://app.example.com/cb',
      fetch: fetchImpl,
    })

    expect(result).toEqual({ access_token: 'short-tok', user_id: '42' })

    const call = fetchImpl.calls[0]!
    expect(call.url).toBe('https://graph.threads.net/oauth/access_token')
    expect(call.init?.method).toBe('POST')
    const body = bodyOf(call)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('auth-code')
    expect(body.get('client_secret')).toBe('shh')
    // Secret must be in the body, never the URL.
    expect(call.url).not.toContain('shh')
  })
})

describe('exchangeForLongLivedToken', () => {
  it('GETs with th_exchange_token and the short token', async () => {
    const fetchImpl = mockFetch([
      { body: { access_token: 'long-tok', token_type: 'bearer', expires_in: 5184000 } },
    ])
    const result = await exchangeForLongLivedToken({
      clientSecret: 'shh',
      shortLivedToken: 'short-tok',
      fetch: fetchImpl,
    })
    expect(result.access_token).toBe('long-tok')

    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.origin + url.pathname).toBe('https://graph.threads.net/access_token')
    expect(url.searchParams.get('grant_type')).toBe('th_exchange_token')
    expect(url.searchParams.get('access_token')).toBe('short-tok')
  })
})

describe('refreshLongLivedToken', () => {
  it('GETs with th_refresh_token and the long token', async () => {
    const fetchImpl = mockFetch([
      { body: { access_token: 'refreshed', token_type: 'bearer', expires_in: 5184000 } },
    ])
    await refreshLongLivedToken({ longLivedToken: 'long-tok', fetch: fetchImpl })

    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.origin + url.pathname).toBe('https://graph.threads.net/refresh_access_token')
    expect(url.searchParams.get('grant_type')).toBe('th_refresh_token')
    expect(url.searchParams.get('access_token')).toBe('long-tok')
  })
})
