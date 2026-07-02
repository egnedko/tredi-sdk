import { describe, expect, it } from 'vitest'
import { ThreadsClient } from '../src/client.js'
import { ThreadsError } from '../src/errors.js'
import { bodyOf, mockFetch } from './helpers.js'

const TOKEN = 'SECRET-TOKEN'

describe('publishing.createAndPublish (media processing)', () => {
  it('polls container status until FINISHED, then publishes', async () => {
    const fetchImpl = mockFetch([
      { body: { id: 'cont' } }, // createContainer
      { body: { id: 'cont', status: 'IN_PROGRESS' } }, // poll 1
      { body: { id: 'cont', status: 'FINISHED' } }, // poll 2
      { body: { id: 'post' } }, // publishContainer
    ])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const result = await client.publishing.createAndPublish(
      { mediaType: 'VIDEO', videoUrl: 'https://x/v.mp4' },
      { pollIntervalMs: 1, maxWaitMs: 200 },
    )

    expect(result).toEqual({ id: 'post' })
    expect(fetchImpl.calls).toHaveLength(4)
    expect(new URL(fetchImpl.calls[1]!.url).pathname).toBe('/v1.0/cont')
  })

  it('throws when the container reports ERROR (no publish attempted)', async () => {
    const fetchImpl = mockFetch([
      { body: { id: 'cont' } },
      { body: { id: 'cont', status: 'ERROR', error_message: 'FAILED_DOWNLOADING_VIDEO' } },
    ])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await expect(
      client.publishing.createAndPublish(
        { mediaType: 'VIDEO', videoUrl: 'x' },
        { pollIntervalMs: 1 },
      ),
    ).rejects.toThrow(/ERROR/)
    expect(fetchImpl.calls).toHaveLength(2) // create + one status poll, no publish
  })
})

describe('publishing.publishCarousel', () => {
  it('requires at least 2 items', async () => {
    const fetchImpl = mockFetch([{ body: {} }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })
    await expect(
      client.publishing.publishCarousel({ items: [{ imageUrl: 'a' }] }),
    ).rejects.toBeInstanceOf(ThreadsError)
    expect(fetchImpl.calls).toHaveLength(0)
  })

  it('creates child containers then a parent CAROUSEL container', async () => {
    const fetchImpl = mockFetch([
      { body: { id: 'child1' } },
      { body: { id: 'child2' } },
      { body: { id: 'parent' } },
      { body: { id: 'post' } },
    ])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const result = await client.publishing.publishCarousel({
      items: [{ imageUrl: 'a' }, { imageUrl: 'b' }],
      text: 'a set',
      wait: { waitForReady: false },
    })

    expect(result).toEqual({ id: 'post' })
    expect(fetchImpl.calls).toHaveLength(4)
    expect(bodyOf(fetchImpl.calls[0]!).get('is_carousel_item')).toBe('true')

    const parent = bodyOf(fetchImpl.calls[2]!)
    expect(parent.get('media_type')).toBe('CAROUSEL')
    expect(parent.get('children')).toBe('child1,child2')
    expect(parent.get('text')).toBe('a set')
  })
})

describe('replies', () => {
  it('hide posts hide=true to /manage_reply', async () => {
    const fetchImpl = mockFetch([{ body: { success: true } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await client.replies.hide('r1')
    expect(new URL(fetchImpl.calls[0]!.url).pathname).toBe('/v1.0/r1/manage_reply')
    expect(bodyOf(fetchImpl.calls[0]!).get('hide')).toBe('true')
  })

  it('publish creates a reply container with reply_to_id then publishes', async () => {
    const fetchImpl = mockFetch([{ body: { id: 'cont' } }, { body: { id: 'reply-post' } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const result = await client.replies.publish('media1', 'thanks!')
    expect(result).toEqual({ id: 'reply-post' })
    expect(bodyOf(fetchImpl.calls[0]!).get('reply_to_id')).toBe('media1')
    expect(bodyOf(fetchImpl.calls[0]!).get('text')).toBe('thanks!')
  })

  it('listPending sends approval_status filter', async () => {
    const fetchImpl = mockFetch([{ body: { data: [] } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await client.replies.listPending('m1', { approvalStatus: 'pending' })
    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.pathname).toBe('/v1.0/m1/pending_replies')
    expect(url.searchParams.get('approval_status')).toBe('pending')
  })
})
