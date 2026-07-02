# tredi-sdk — Guides

Task-based recipes. Each is self-contained. For exhaustive signatures see the
[API reference](./api-reference.md); runnable versions of several recipes live in
[`../examples`](../examples).

- [1. Server-side OAuth](#1-server-side-oauth)
- [2. Storing & refreshing tokens](#2-storing--refreshing-tokens)
- [3. Publishing posts](#3-publishing-posts)
- [4. Automating replies](#4-automating-replies)
- [5. Reading analytics](#5-reading-analytics)
- [6. Monitoring keywords & mentions](#6-monitoring-keywords--mentions)
- [7. Errors & rate limits](#7-errors--rate-limits)
- [8. Pagination](#8-pagination)
- [9. Custom runtime / injecting fetch](#9-custom-runtime--injecting-fetch)
- [10. Logging](#10-logging)

---

## 1. Server-side OAuth

The full handshake. Token exchanges require the app secret — keep them on the
server. A complete version is in [`examples/oauth-flow.ts`](../examples/oauth-flow.ts).

```ts
import {
  getAuthorizationUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
} from 'tredi-sdk'

// Route: GET /auth/threads/login
export function login(req, res) {
  const state = crypto.randomUUID()
  saveState(req.session, state) // verify on callback (CSRF)
  res.redirect(
    getAuthorizationUrl({
      clientId: process.env.THREADS_APP_ID!,
      redirectUri: process.env.THREADS_REDIRECT_URI!,
      scopes: ['threads_basic', 'threads_content_publish', 'threads_manage_replies'],
      state,
    }),
  )
}

// Route: GET /auth/threads/callback?code=...&state=...
export async function callback(req, res) {
  if (req.query.state !== readState(req.session)) return res.status(403).end()

  const short = await exchangeCodeForToken({
    clientId: process.env.THREADS_APP_ID!,
    clientSecret: process.env.THREADS_APP_SECRET!,
    code: req.query.code,
    redirectUri: process.env.THREADS_REDIRECT_URI!,
  })

  const long = await exchangeForLongLivedToken({
    clientSecret: process.env.THREADS_APP_SECRET!,
    shortLivedToken: short.access_token,
  })

  await saveToken(short.user_id, long.access_token, long.expires_in) // encrypt at rest
  res.redirect('/dashboard')
}
```

---

## 2. Storing & refreshing tokens

Long-lived tokens last ~60 days and must be refreshed while still valid (and at
least 24h old). Run a daily job over tokens nearing expiry.

```ts
import { refreshLongLivedToken } from 'tredi-sdk'

async function refreshExpiringTokens() {
  const soon = await db.tokens.dueForRefresh() // e.g. expiring within 7 days
  for (const row of soon) {
    try {
      const { access_token, expires_in } = await refreshLongLivedToken({
        longLivedToken: row.token,
      })
      await db.tokens.update(row.userId, { token: access_token, expiresIn: expires_in })
    } catch (err) {
      // A token not refreshed within 60 days expires permanently — re-auth the user.
      await notifyReauthNeeded(row.userId)
    }
  }
}
```

> Store tokens encrypted (e.g. Supabase Vault). The SDK keeps them in memory only.

---

## 3. Publishing posts

The convenience methods run the create-container → publish flow for you.

```ts
import { ThreadsClient } from 'tredi-sdk'
const threads = new ThreadsClient({ accessToken: token })

// Text
await threads.publishing.publishText('gm ☕')

// Image (with alt text for accessibility)
await threads.publishing.publishImage({
  imageUrl: 'https://cdn.example.com/a.jpg',
  text: 'Morning shot',
  altText: 'A latte on a wooden table',
})

// Video — waits for server-side processing before publishing
await threads.publishing.publishVideo({ videoUrl: 'https://cdn.example.com/v.mp4' })

// Carousel — ≥2 items
await threads.publishing.publishCarousel({
  items: [{ imageUrl: 'https://…/1.jpg' }, { imageUrl: 'https://…/2.jpg' }],
  text: 'A set',
})
```

Need control over timing (e.g. publish a video later)? Drive the steps yourself:

```ts
const { id: creationId } = await threads.publishing.createContainer({
  mediaType: 'VIDEO',
  videoUrl: 'https://…/v.mp4',
})

// Poll until ready, then publish when you choose.
let status = await threads.publishing.getContainerStatus(creationId)
while (status.status === 'IN_PROGRESS') {
  await new Promise((r) => setTimeout(r, 3000))
  status = await threads.publishing.getContainerStatus(creationId)
}
if (status.status === 'FINISHED') await threads.publishing.publishContainer(creationId)
```

Check quota before bulk publishing:

```ts
const limit = await threads.publishing.getPublishingLimit()
console.log(`${limit.quota_usage}/${limit.config?.quota_total} posts used (24h)`)
```

---

## 4. Automating replies

Poll a post, auto-answer new replies, and hide spam. Full version in
[`examples/reply-autopilot.ts`](../examples/reply-autopilot.ts).

```ts
const seen = new Set<string>()

async function tick(mediaId: string) {
  const { data } = await threads.replies.list(mediaId, { reverse: true })
  for (const reply of data) {
    if (!reply.id || seen.has(reply.id)) continue
    seen.add(reply.id)

    if (isSpam(reply)) {
      await threads.replies.hide(reply.id)
      continue
    }
    const text = await generateReply(reply) // your AI / rules
    await threads.replies.publish(mediaId, text)
  }
}
```

If reply approvals are enabled on the post, work the queue instead:

```ts
const pending = await threads.replies.listPending(mediaId, { approvalStatus: 'pending' })
for (const r of pending.data) {
  await threads.replies.managePending(r.id!, !isSpam(r)) // approve or reject
}
```

---

## 5. Reading analytics

```ts
// Account level
const account = await threads.insights.user({
  metrics: ['views', 'likes', 'followers_count'],
})
for (const m of account.data) {
  const value = m.total_value?.value ?? m.values?.at(-1)?.value
  console.log(m.name, value)
}

// Follower demographics (breakdown is required by the API)
await threads.insights.user({ metrics: ['follower_demographics'], breakdown: 'country' })

// Per-post
const post = await threads.insights.media('MEDIA_ID', ['views', 'likes', 'replies'])
```

---

## 6. Monitoring keywords & mentions

```ts
// Keyword search (needs threads_keyword_search)
const recent = await threads.search.keyword('cold brew', {
  searchType: 'RECENT',
  mediaType: 'TEXT',
  limit: 50,
})

// Mentions of the authenticated user
const mentions = await threads.mentions.list({ limit: 25 })
```

---

## 7. Errors & rate limits

Catch broadly with `ThreadsError`, or narrow to act on specific failures.

```ts
import {
  ThreadsAuthError,
  ThreadsRateLimitError,
  ThreadsValidationError,
  ThreadsError,
} from 'tredi-sdk'

try {
  await threads.publishing.publishText('hi')
} catch (err) {
  if (err instanceof ThreadsAuthError) {
    await refreshTokenAndRetry()             // token expired/invalid
  } else if (err instanceof ThreadsRateLimitError) {
    await wait(err.retryAfterMs ?? 60_000)   // throttled
  } else if (err instanceof ThreadsValidationError) {
    throw err                                // bug in your input — fix it
  } else if (err instanceof ThreadsError) {
    report(err)                              // ThreadsAPIError / Network / Timeout
  }
}
```

The SDK already retries transient failures (network, 429, and 5xx/timeouts on
GETs) with backoff. Tune or disable it:

```ts
new ThreadsClient({ accessToken, retry: { maxRetries: 4, maxDelayMs: 15_000 } })
new ThreadsClient({ accessToken, retry: false }) // handle retries yourself
```

Writes (POST) are **not** retried on 5xx/timeout to avoid duplicate posts — see
[architecture.md](./architecture.md#retry--idempotency-model).

---

## 8. Pagination

List endpoints return `{ data, paging: { cursors: { after } } }`. Loop with the
`after` cursor:

```ts
async function* allPosts(threads: ThreadsClient) {
  let after: string | undefined
  do {
    const page = await threads.posts.list({ limit: 50, after })
    yield* page.data
    after = page.paging?.cursors?.after
  } while (after)
}

for await (const post of allPosts(threads)) {
  console.log(post.id, post.text)
}
```

The same pattern works for `replies.list`, `mentions.list`, and `search.keyword`.

---

## 9. Custom runtime / injecting fetch

On runtimes without global `fetch`, or in tests, pass your own:

```ts
import { ThreadsClient } from 'tredi-sdk'

const threads = new ThreadsClient({
  accessToken: token,
  fetch: myFetch,        // any (url, init) => Promise<Response>
  baseUrl: 'https://graph.threads.net',
  timeoutMs: 15_000,
})
```

In unit tests, a fake `fetch` lets you assert request shape without a network —
see [`test/helpers.ts`](../test/helpers.ts).

---

## 10. Logging

Wire the logger to your stack. Secrets are redacted before they reach you.

```ts
import pino from 'pino'
const log = pino()

const threads = new ThreadsClient({
  accessToken: token,
  logger: { log: (level, msg, ctx) => log[level]({ ...ctx }, msg) },
})
// emits: threads.request.success { method, url: "…access_token=REDACTED", attempt, durationMs }
```

Pass nothing to stay silent (the default `noopLogger`).
