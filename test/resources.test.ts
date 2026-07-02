import { describe, expect, it } from 'vitest'
import { ThreadsClient } from '../src/client.js'
import { ThreadsError } from '../src/errors.js'
import { fieldsParam } from '../src/resources/base.js'
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

  it('list reads top-level replies with default fields', async () => {
    const fetchImpl = mockFetch([{ body: { data: [{ id: 'r1' }] } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const page = await client.replies.list('media1')

    expect(page.data).toHaveLength(1)
    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.pathname).toBe('/v1.0/media1/replies')
    expect(url.searchParams.get('fields')).toContain('hide_status')
  })

  it('conversation reads the flattened thread', async () => {
    const fetchImpl = mockFetch([{ body: { data: [] } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await client.replies.conversation('media1', { reverse: true })

    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.pathname).toBe('/v1.0/media1/conversation')
    expect(url.searchParams.get('reverse')).toBe('true')
  })

  it('unhide posts hide=false to /manage_reply', async () => {
    const fetchImpl = mockFetch([{ body: { success: true } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await client.replies.unhide('r1')

    expect(new URL(fetchImpl.calls[0]!.url).pathname).toBe('/v1.0/r1/manage_reply')
    expect(bodyOf(fetchImpl.calls[0]!).get('hide')).toBe('false')
  })

  it('managePending approves a pending reply', async () => {
    const fetchImpl = mockFetch([{ body: { success: true } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await client.replies.managePending('r1', true)

    expect(new URL(fetchImpl.calls[0]!.url).pathname).toBe('/v1.0/r1/manage_pending_reply')
    expect(bodyOf(fetchImpl.calls[0]!).get('approve')).toBe('true')
  })

  it('managePending rejects a pending reply', async () => {
    const fetchImpl = mockFetch([{ body: { success: true } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await client.replies.managePending('r1', false)

    expect(bodyOf(fetchImpl.calls[0]!).get('approve')).toBe('false')
  })
})

describe('publishing.deletePost', () => {
  it('sends DELETE to /{postId}', async () => {
    const fetchImpl = mockFetch([{ body: { success: true } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const result = await client.publishing.deletePost('post123')

    expect(result).toEqual({ success: true })
    expect(fetchImpl.calls).toHaveLength(1)
    expect(new URL(fetchImpl.calls[0]!.url).pathname).toBe('/v1.0/post123')
    expect(fetchImpl.calls[0]!.init?.method).toBe('DELETE')
  })
})

describe('publishing.getPublishingLimit', () => {
  it('reads quota fields for the configured user', async () => {
    const fetchImpl = mockFetch([{ body: { quota_usage: 3, config: { quota_total: 250 } } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const limit = await client.publishing.getPublishingLimit()

    expect(limit.quota_usage).toBe(3)
    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.pathname).toBe('/v1.0/me/threads_publishing_limit')
    expect(url.searchParams.get('fields')).toContain('quota_usage')
  })
})

describe('publishing.publishPoll', () => {
  it('serializes the poll as a JSON string with snake_case keys', async () => {
    const fetchImpl = mockFetch([{ body: { id: 'cont' } }, { body: { id: 'post' } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await client.publishing.publishPoll('Pick one', { optionA: 'Cats', optionB: 'Dogs' })

    const poll = JSON.parse(bodyOf(fetchImpl.calls[0]!).get('poll_attachment')!)
    expect(poll).toEqual({
      option_a: 'Cats',
      option_b: 'Dogs',
      option_c: undefined,
      option_d: undefined,
    })
  })
})

describe('publishing.publishImage / publishVideo', () => {
  it('publishImage sends mediaType IMAGE and skips the status poll', async () => {
    const fetchImpl = mockFetch([{ body: { id: 'cont' } }, { body: { id: 'post' } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const result = await client.publishing.publishImage({ imageUrl: 'https://x/a.jpg' })

    expect(result).toEqual({ id: 'post' })
    expect(fetchImpl.calls).toHaveLength(2) // create + publish, no status poll
    expect(bodyOf(fetchImpl.calls[0]!).get('media_type')).toBe('IMAGE')
  })

  it('publishVideo waits for the container to finish before publishing', async () => {
    const fetchImpl = mockFetch([
      { body: { id: 'cont' } },
      { body: { id: 'cont', status: 'FINISHED' } },
      { body: { id: 'post' } },
    ])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const result = await client.publishing.publishVideo({ videoUrl: 'https://x/v.mp4' })

    expect(result).toEqual({ id: 'post' })
    expect(fetchImpl.calls).toHaveLength(3)
  })
})

describe('publishing.createAndPublish (timeout)', () => {
  it('throws when the container never finishes within maxWaitMs', async () => {
    const fetchImpl = mockFetch([
      { body: { id: 'cont' } },
      { body: { id: 'cont', status: 'IN_PROGRESS' } },
    ])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await expect(
      client.publishing.createAndPublish(
        { mediaType: 'VIDEO', videoUrl: 'x' },
        { pollIntervalMs: 50, maxWaitMs: 1 },
      ),
    ).rejects.toThrow(/not ready after/)
  })
})

describe('mentions.list', () => {
  it('reads mentions with default fields and pagination', async () => {
    const fetchImpl = mockFetch([
      { body: { data: [{ id: 'm1' }], paging: { cursors: { after: 'c1' } } } },
    ])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const page = await client.mentions.list({ limit: 10 })

    expect(page.data).toHaveLength(1)
    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.pathname).toBe('/v1.0/me/mentions')
    expect(url.searchParams.get('limit')).toBe('10')
  })
})

describe('posts', () => {
  it('list reads a user\'s posts, cursor-paginated', async () => {
    const fetchImpl = mockFetch([
      { body: { data: [{ id: 'p1' }], paging: { cursors: { after: 'c1' } } } },
    ])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const page = await client.posts.list({ after: 'prev-cursor' })

    expect(page.data).toHaveLength(1)
    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.pathname).toBe('/v1.0/me/threads')
    expect(url.searchParams.get('after')).toBe('prev-cursor')
  })

  it('get reads a single media object by id', async () => {
    const fetchImpl = mockFetch([{ body: { id: 'p1', text: 'hi' } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const post = await client.posts.get('p1', { fields: ['id', 'text'] })

    expect(post.text).toBe('hi')
    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.pathname).toBe('/v1.0/p1')
    expect(url.searchParams.get('fields')).toBe('id,text')
  })
})

describe('insights', () => {
  it('media reads engagement metrics with the default set', async () => {
    const fetchImpl = mockFetch([
      { body: { data: [{ name: 'views', total_value: { value: 42 } }] } },
    ])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    const result = await client.insights.media('media1')

    expect(result.data[0]!.name).toBe('views')
    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.pathname).toBe('/v1.0/media1/insights')
    expect(url.searchParams.get('metric')).toContain('views')
  })

  it('user reads account metrics with a demographic breakdown', async () => {
    const fetchImpl = mockFetch([{ body: { data: [] } }])
    const client = new ThreadsClient({ accessToken: TOKEN, fetch: fetchImpl })

    await client.insights.user({ metrics: ['follower_demographics'], breakdown: 'country' })

    const url = new URL(fetchImpl.calls[0]!.url)
    expect(url.pathname).toBe('/v1.0/me/threads_insights')
    expect(url.searchParams.get('metric')).toBe('follower_demographics')
    expect(url.searchParams.get('breakdown')).toBe('country')
  })
})

describe('fieldsParam', () => {
  it('returns undefined for empty or missing field lists', () => {
    expect(fieldsParam(undefined)).toBeUndefined()
    expect(fieldsParam([])).toBeUndefined()
  })

  it('joins fields with a comma', () => {
    expect(fieldsParam(['id', 'text'])).toBe('id,text')
  })
})
