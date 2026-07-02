/**
 * Pull account + recent-post analytics.
 *
 *   THREADS_TOKEN=... node --experimental-strip-types examples/fetch-insights.ts
 */

import { ThreadsClient } from 'tredi-sdk'

const threads = new ThreadsClient({ accessToken: process.env.THREADS_TOKEN! })

async function main() {
  const me = await threads.profile.get()
  console.log(`@${me.username} (${me.id})`)

  const account = await threads.insights.user({ metrics: ['views', 'likes', 'followers_count'] })
  for (const metric of account.data) {
    const value = metric.total_value?.value ?? metric.values?.at(-1)?.value
    console.log(`  ${metric.name}: ${value ?? 'n/a'}`)
  }

  const posts = await threads.posts.list({ limit: 5 })
  for (const post of posts.data) {
    const stats = await threads.insights.media(post.id!, { metrics: ['views', 'likes', 'replies'] })
    const summary = stats.data.map((m) => `${m.name}=${m.total_value?.value ?? 0}`).join(' ')
    console.log(`  ${post.id} → ${summary}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
