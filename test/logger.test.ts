import { describe, expect, it } from 'vitest'
import { redactParams, redactUrl } from '../src/logger.js'

describe('redactUrl', () => {
  it('masks access_token while keeping other params', () => {
    const out = redactUrl('https://graph.threads.net/v1.0/me?fields=id&access_token=SECRET')
    expect(out).toContain('fields=id')
    expect(out).toContain('access_token=REDACTED')
    expect(out).not.toContain('SECRET')
  })

  it('masks client_secret and code', () => {
    const out = redactUrl('https://x/y?client_secret=AAA&code=BBB')
    expect(out).not.toContain('AAA')
    expect(out).not.toContain('BBB')
  })

  it('falls back to regex redaction for unparseable URLs', () => {
    expect(redactUrl('garbage?access_token=SECRET')).toContain('access_token=REDACTED')
  })
})

describe('redactParams', () => {
  it('masks sensitive keys only', () => {
    const out = redactParams({ access_token: 'SECRET', text: 'hello', client_secret: 'X' })
    expect(out).toEqual({ access_token: 'REDACTED', text: 'hello', client_secret: 'REDACTED' })
  })

  it('returns an empty object for undefined input', () => {
    expect(redactParams(undefined)).toEqual({})
  })
})
