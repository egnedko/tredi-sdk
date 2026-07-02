# Tredi (Threads API sdk)

<!-- Replace egnedko once this repo has a real home on GitHub. -->
[![CI](https://github.com/egnedko/tredi-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/egnedko/tredi-sdk/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/tredi-sdk.svg)](https://www.npmjs.com/package/tredi-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A typed, ESM-first SDK for the [Meta Threads API](https://developers.facebook.com/docs/threads).

- **TypeScript-first** — strict types, every endpoint and field modeled from the official docs.
- **Zero runtime dependencies** — uses the platform `fetch` (Node 18+, Bun, Deno, edge).
- **Production-ready** — request timeout, idempotency-safe retries with backoff, typed errors, redacting log hooks.
- **ESM + CJS** — dual output, `sideEffects: false`, tree-shakeable.
- **Security-first** — access tokens and app secrets are never written to logs.

> Scope: this SDK models the documented Threads endpoints — publishing (text, image, video, carousel, polls, deletion), posts, replies & moderation, insights, mentions, keyword search, quota, OAuth. See [Coverage](#coverage).

## Documentation

- [API Reference](./docs/api-reference.md) — every export, signatures, scopes, endpoint mapping
- [Architecture](./docs/architecture.md) — design, request lifecycle, retry model, decisions (with diagrams)
- [Guides](./docs/guides.md) — task recipes: OAuth, publishing, reply automation, analytics, errors
- [Examples](./examples) — runnable scripts

## Install

```bash
pnpm add tredi-sdk
# or: npm i tredi-sdk  /  yarn add tredi-sdk
```

Requires Node 18+ (global `fetch`). On older runtimes, pass a `fetch` implementation in the client config.

## Quick start

```ts
import { ThreadsClient } from 'tredi-sdk'

const threads = new ThreadsClient({ accessToken: process.env.THREADS_TOKEN! })

// Who am I?
const me = await threads.profile.get()
console.log(me.username)

// Publish a text post (create container → publish, handled for you)
const post = await threads.publishing.publishText('Hello, Threads 👋')
console.log('Published:', post.id)
```

## Authentication

Token-exchange helpers are standalone functions (tree-shakeable) and **must run server-side** — they require your app secret.

```ts
import {
  getAuthorizationUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  refreshLongLivedToken,
} from 'tredi-sdk'

// 1. Redirect the user to the authorization window.
const url = getAuthorizationUrl({
  clientId: process.env.THREADS_APP_ID!,
  redirectUri: 'https://app.example.com/auth/threads/callback',
  scopes: ['threads_basic', 'threads_content_publish', 'threads_manage_replies'],
  state: csrfToken, // verify this on the callback
})

// 2. In your callback handler, exchange the code for a short-lived token.
const short = await exchangeCodeForToken({
  clientId: process.env.THREADS_APP_ID!,
  clientSecret: process.env.THREADS_APP_SECRET!,
  code,
  redirectUri: 'https://app.example.com/auth/threads/callback',
})

// 3. Upgrade to a long-lived (~60 day) token and store it.
const long = await exchangeForLongLivedToken({
  clientSecret: process.env.THREADS_APP_SECRET!,
  shortLivedToken: short.access_token,
})

// 4. Before it expires (and at least 24h old), refresh it for another 60 days.
const refreshed = await refreshLongLivedToken({ longLivedToken: long.access_token })
```

**Scopes** (validated against the docs): `threads_basic` (required), `threads_content_publish`, `threads_read_replies`, `threads_manage_replies`, `threads_manage_insights`, `threads_keyword_search`, `threads_delete`, `threads_location_tagging`.

## Usage

### Profile

```ts
await threads.profile.get()                       // the token owner ("me")
await threads.profile.get({ userId: '178...' })   // a specific user
```

### Posts (retrieve & discover)

```ts
const page = await threads.posts.list({ limit: 25 })
for (const post of page.data) console.log(post.text)

// Cursor pagination
const next = await threads.posts.list({ after: page.paging?.cursors?.after })

// A single post
await threads.posts.get('MEDIA_ID', { fields: ['id', 'text', 'permalink'] })
```

### Publishing

```ts
// Text, image, video, carousel — each handles the container→publish flow.
await threads.publishing.publishText('gm ☕')
await threads.publishing.publishImage({ imageUrl: 'https://…/a.jpg', text: 'caption', altText: 'a cat' })
await threads.publishing.publishVideo({ videoUrl: 'https://…/v.mp4' }) // waits for processing
await threads.publishing.publishCarousel({
  items: [{ imageUrl: 'https://…/1.jpg' }, { imageUrl: 'https://…/2.jpg' }],
  text: 'a set',
})
await threads.publishing.publishPoll('Coffee or tea?', { optionA: 'Coffee', optionB: 'Tea' })

// Or drive the two steps manually for full control.
const { id: creationId } = await threads.publishing.createContainer({ mediaType: 'TEXT', text: 'hi' })
await threads.publishing.publishContainer(creationId)

// Delete a published post (requires the `threads_delete` scope).
await threads.publishing.deletePost(post.id)

// Remaining quotas (250 posts / 1000 replies / 100 deletes per 24h).
const limit = await threads.publishing.getPublishingLimit()
```

### Replies & moderation

```ts
const replies = await threads.replies.list('MEDIA_ID')
const thread  = await threads.replies.conversation('MEDIA_ID')

await threads.replies.publish('MEDIA_ID', 'Thanks for reading!')
await threads.replies.hide('REPLY_ID')
await threads.replies.unhide('REPLY_ID')

// Reply-approval queue (when enabled on the post)
const pending = await threads.replies.listPending('MEDIA_ID', { approvalStatus: 'pending' })
await threads.replies.managePending('REPLY_ID', true) // approve
```

### Insights

```ts
await threads.insights.media('MEDIA_ID')                       // views, likes, replies, reposts, quotes, shares
await threads.insights.user({ metrics: ['views', 'followers_count'] })
await threads.insights.user({ metrics: ['follower_demographics'], breakdown: 'country' })
```

### Mentions & keyword search

```ts
const mentions = await threads.mentions.list()
const found = await threads.search.keyword('cold brew', { searchType: 'RECENT', limit: 50 })
```

## Configuration

```ts
new ThreadsClient({
  accessToken: '…',          // required
  userId: 'me',              // default node for user-scoped calls
  baseUrl: 'https://graph.threads.net',
  version: 'v1.0',
  timeoutMs: 30_000,
  retry: { maxRetries: 2, initialDelayMs: 500, maxDelayMs: 8_000, backoffFactor: 2 }, // or `false`
  logger: myLogger,          // optional, see below
  fetch: customFetch,        // optional, for non-standard runtimes/tests
})
```

## Error handling

Every failure is an instance of `ThreadsError`. Narrow with `instanceof`:

| Class | When |
|---|---|
| `ThreadsValidationError` | Bad input — no request was sent |
| `ThreadsTimeoutError` | Request exceeded `timeoutMs` |
| `ThreadsNetworkError` | Connection failed before any response |
| `ThreadsAPIError` | Non-2xx response (`status`, `code`, `subcode`, `type`, `fbtraceId`) |
| `ThreadsAuthError` | Invalid/expired token (HTTP 401 or code 190) |
| `ThreadsRateLimitError` | Throttled (HTTP 429 / throttle code); `retryAfterMs` when known |

```ts
import { ThreadsRateLimitError, ThreadsAuthError } from 'tredi-sdk'

try {
  await threads.publishing.publishText('hi')
} catch (err) {
  if (err instanceof ThreadsAuthError) await refreshAndRetry()
  else if (err instanceof ThreadsRateLimitError) await wait(err.retryAfterMs ?? 60_000)
  else throw err
}
```

## Retries & rate limits

Automatic retries use exponential backoff with equal jitter and honor a server `Retry-After`. Retries are **idempotency-aware** so a publish is never duplicated:

- **GET** retries on network errors, timeouts, `429`, and `5xx`.
- **POST** retries **only** on network errors and `429` (request rejected before processing) — never on `5xx`/timeout, which may have already taken effect.

Disable with `retry: false`, or tune per the [config](#configuration).

## Logging & security

The SDK never writes to the console. Pass a `logger` to receive structured events; **tokens, app secrets, and OAuth codes are always redacted** before they reach it.

```ts
const logger = { log: (level, message, ctx) => console[level]?.(message, ctx) }
new ThreadsClient({ accessToken, logger })
// → debug "threads.request.success" { method, url: "…access_token=REDACTED", attempt, durationMs }
```

Security notes:

- Token-exchange helpers require the app secret — call them **server-side only**.
- Tokens are held in memory on the client instance and sent per request; they are never logged. Use `client.withToken(t)` to scope a token per user without mutating shared config.
- For multi-tenant storage, encrypt tokens at rest (e.g. Supabase Vault).

## ESM / CJS & tree-shaking

Ships both ESM (`import`) and CJS (`require`) with `sideEffects: false`. Import only the OAuth helpers and your bundle won't pull in the client, and vice-versa.

## Escape hatch

Need an endpoint the SDK doesn't model yet? Call any path with full response typing:

```ts
const data = await threads.request<{ data: unknown[] }>({
  method: 'GET',
  path: '/me/threads',
  params: { fields: 'id,text', limit: 5 },
})
```

## Coverage

| Area | Status |
|---|---|
| OAuth (code → short → long → refresh) | ✅ |
| Profile, Posts, Single media | ✅ |
| Publishing (text/image/video/carousel, container status, quota) | ✅ |
| Replies, Conversation, Hide/Unhide, Approval queue | ✅ |
| Insights (media + user, demographics breakdown) | ✅ |
| Mentions, Keyword search | ✅ |
| Post deletion | ✅ |

## Development

```bash
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest (unit + mock-based)
pnpm test:coverage
pnpm lint          # eslint
pnpm build         # tsup → dist (esm + cjs + d.ts)
```

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Please
follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Found a security issue?
See [SECURITY.md](./SECURITY.md) instead of opening a public issue.

## License

MIT — see [LICENSE](./LICENSE).
