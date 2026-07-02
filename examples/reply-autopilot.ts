/**
 * Autopilot reply bot: poll a post's replies, auto-answer new ones, and hide
 * spam. Swap `generateReply` / `isSpam` for your own AI/moderation logic — the
 * SDK supplies every Threads call this loop needs.
 *
 *   THREADS_TOKEN=... node --experimental-strip-types examples/reply-autopilot.ts MEDIA_ID
 */

import { ThreadsClient, type ThreadsReply } from 'tredi-sdk'

const threads = new ThreadsClient({ accessToken: process.env.THREADS_TOKEN! })
const POLL_INTERVAL_MS = 30_000

// Replace these with real implementations (Claude, a classifier, rules, …).
function isSpam(reply: ThreadsReply): boolean {
  return /https?:\/\/|free money|crypto/i.test(reply.text ?? '')
}
async function generateReply(reply: ThreadsReply): Promise<string> {
  return `Thanks for the reply, @${reply.username}! 🙌`
}

async function processNewReplies(mediaId: string, seen: Set<string>) {
  const { data } = await threads.replies.list(mediaId, { reverse: true })

  for (const reply of data) {
    if (!reply.id || seen.has(reply.id) || reply.is_reply === false) continue
    seen.add(reply.id)

    if (isSpam(reply)) {
      await threads.replies.hide(reply.id)
      console.log(`Hid spam reply ${reply.id}`)
      continue
    }

    const text = await generateReply(reply)
    const answer = await threads.replies.publish(mediaId, text)
    console.log(`Replied ${answer.id} → ${reply.id}`)
  }
}

async function main() {
  const mediaId = process.argv[2]
  if (!mediaId) throw new Error('Usage: reply-autopilot.ts <MEDIA_ID>')

  const seen = new Set<string>()
  console.log(`Autopilot watching ${mediaId} every ${POLL_INTERVAL_MS / 1000}s…`)

  for (;;) {
    try {
      await processNewReplies(mediaId, seen)
    } catch (err) {
      // The SDK already retried transient failures; log and keep the loop alive.
      console.error('poll failed:', err instanceof Error ? err.message : err)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
