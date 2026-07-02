/**
 * Publish a post and read back its insights.
 *
 *   THREADS_TOKEN=... node --experimental-strip-types examples/publish-text.ts "Hello, Threads"
 */

import { ThreadsClient, ThreadsRateLimitError } from 'tredi-sdk'

const threads = new ThreadsClient({
  accessToken: process.env.THREADS_TOKEN!,
  logger: { log: (level, message, ctx) => console[level === 'debug' ? 'log' : level](message, ctx ?? '') },
})

async function main() {
  const text = process.argv[2] ?? 'Posted via tredi-sdk'

  // Check quota before publishing.
  const limit = await threads.publishing.getPublishingLimit()
  console.log('Posts used in last 24h:', limit.quota_usage, '/', limit.config?.quota_total)

  try {
    const post = await threads.publishing.publishText(text)
    console.log('Published post id:', post.id)

    const insights = await threads.insights.media(post.id, { metrics: ['views', 'likes'] })
    console.log('Insights:', insights.data.map((m) => `${m.name}=${m.total_value?.value ?? 0}`))
  } catch (err) {
    if (err instanceof ThreadsRateLimitError) {
      console.error(`Rate limited. Retry after ~${(err.retryAfterMs ?? 60_000) / 1000}s`)
    } else {
      throw err
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
