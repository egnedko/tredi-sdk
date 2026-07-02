# tredi-sdk — API Reference

Complete reference for every public export. For task-oriented walkthroughs see
[guides.md](./guides.md); for internals see [architecture.md](./architecture.md).

All endpoints target the Threads Graph API (`graph.threads.net`, `v1.0`). Every
call requires the `threads_basic` permission in addition to the scope noted per
method.

## Contents

- [ThreadsClient](#threadsclient)
- [Configuration](#configuration)
- [Resource: profile](#resource-profile)
- [Resource: posts](#resource-posts)
- [Resource: publishing](#resource-publishing)
- [Resource: replies](#resource-replies)
- [Resource: insights](#resource-insights)
- [Resource: mentions](#resource-mentions)
- [Resource: search](#resource-search)
- [OAuth helpers](#oauth-helpers)
- [Errors](#errors)
- [Logging](#logging)
- [Constants & scopes](#constants--scopes)
- [Types](#types)

---

## ThreadsClient

```ts
import { ThreadsClient } from 'tredi-sdk'
const threads = new ThreadsClient({ accessToken: process.env.THREADS_TOKEN! })
```

One instance is bound to one access token. It exposes seven resource
namespaces plus a low-level escape hatch.

| Member | Type | Description |
|---|---|---|
| `profile` | `ProfileResource` | Read user profiles |
| `posts` | `PostsResource` | List/read posts |
| `publishing` | `PublishingResource` | Create & publish posts |
| `replies` | `RepliesResource` | Read & moderate replies |
| `insights` | `InsightsResource` | Media & account metrics |
| `mentions` | `MentionsResource` | Posts mentioning the user |
| `search` | `SearchResource` | Keyword/tag search |
| `userNode` | `string` (getter) | The default node id (`me` or configured `userId`) |

### `request<T>(req)`

Low-level escape hatch for endpoints the SDK doesn't model. Returns the parsed
JSON typed as `T`. Goes through the same timeout/retry/error/logging pipeline.

```ts
request<T>(req: {
  method: 'GET' | 'POST'
  path: string                       // appended after the version, e.g. '/me/threads'
  params?: Record<string, unknown>   // query (GET) or form body (POST)
  signal?: AbortSignal
}): Promise<T>
```

### `withToken(accessToken)`

Returns a **new** client that shares this configuration but uses a different
token. Useful for multi-tenant apps — never mutate a shared client's token.

```ts
const scoped = threads.withToken(userToken)
```

---

## Configuration

```ts
new ThreadsClient(config: ThreadsClientConfig)
```

| Field | Type | Default | Description |
|---|---|---|---|
| `accessToken` | `string` | — (**required**) | Threads user access token |
| `userId` | `string` | `'me'` | Default node for user-scoped calls |
| `baseUrl` | `string` | `https://graph.threads.net` | Graph host override |
| `version` | `string` | `v1.0` | API version |
| `timeoutMs` | `number` | `30000` | Per-request timeout |
| `retry` | `Partial<RetryConfig> \| false` | `{maxRetries:2, initialDelayMs:500, maxDelayMs:8000, backoffFactor:2}` | Retry policy, or `false` to disable |
| `logger` | `Logger` | `noopLogger` | Structured log sink (secrets redacted) |
| `fetch` | `FetchLike` | `globalThis.fetch` | Custom fetch (tests/edge runtimes) |

Throws `ThreadsValidationError` if `accessToken` is empty or no `fetch` is available.

---

## Resource: profile

### `profile.get(options?)` → `Promise<ThreadsProfile>`

Scope: `threads_basic`. Endpoint: `GET /{user}`.

| Option | Type | Default |
|---|---|---|
| `userId` | `string` | configured user / `me` |
| `fields` | `string[]` | `id, username, name, threads_profile_picture_url, threads_biography, is_verified` |
| `signal` | `AbortSignal` | — |

```ts
const me = await threads.profile.get()
const other = await threads.profile.get({ userId: '178…', fields: ['id', 'username'] })
```

---

## Resource: posts

### `posts.list(options?)` → `Promise<Paginated<ThreadsMedia>>`

Scope: `threads_basic`. Endpoint: `GET /{user}/threads`. Cursor-paginated.

| Option | Type | Notes |
|---|---|---|
| `userId` | `string` | defaults to configured user / `me` |
| `fields` | `string[]` | defaults to a common subset |
| `since` / `until` | `number \| Date` | range filter (unix seconds or `Date`) |
| `limit` | `number` | page size |
| `before` / `after` | `string` | pagination cursors |
| `signal` | `AbortSignal` | — |

### `posts.get(mediaId, options?)` → `Promise<ThreadsMedia>`

Scope: `threads_basic`. Endpoint: `GET /{media-id}`.

```ts
const page = await threads.posts.list({ limit: 25 })
const post = await threads.posts.get(page.data[0].id!, { fields: ['id', 'text', 'permalink'] })
```

---

## Resource: publishing

Two-step flow: **create container → publish**. Convenience wrappers run both.

### `publishing.createContainer(input)` → `Promise<ContainerRef>`

Scope: `threads_content_publish`. Endpoint: `POST /{user}/threads`.

| Field | Type | Notes |
|---|---|---|
| `mediaType` | `'TEXT' \| 'IMAGE' \| 'VIDEO' \| 'CAROUSEL'` | **required** |
| `text` | `string` | post body |
| `imageUrl` | `string` | required for `IMAGE` |
| `videoUrl` | `string` | required for `VIDEO` |
| `isCarouselItem` | `boolean` | mark as a carousel child |
| `children` | `string[]` | child container ids (for `CAROUSEL`) |
| `replyToId` | `string` | make this a reply |
| `replyControl` | `ReplyControl` | who can reply |
| `altText` | `string` | accessibility text (≤1000 chars) |
| `linkAttachment` | `string` | attached URL |
| `locationId` | `string` | tagged location |
| `quotePostId` | `string` | quoted post |
| `topicTag` | `string` | topic tag |
| `userId` | `string` | publishing user |
| `signal` | `AbortSignal` | — |

### `publishing.publishContainer(creationId, options?)` → `Promise<ContainerRef>`

Scope: `threads_content_publish`. Endpoint: `POST /{user}/threads_publish`.
`options`: `{ userId?, signal? }`.

### `publishing.getContainerStatus(containerId, signal?)` → `Promise<ContainerStatusResult>`

Endpoint: `GET /{container-id}?fields=status,error_message`. Returns
`{ id, status, error_message? }` where `status` is one of
`EXPIRED | ERROR | FINISHED | IN_PROGRESS | PUBLISHED`.

### `publishing.createAndPublish(input, wait?)` → `Promise<ContainerRef>`

Creates, optionally polls until ready, then publishes.

`wait`: `{ waitForReady?: boolean; pollIntervalMs?: number; maxWaitMs?: number }`.
`waitForReady` defaults to `true` for `VIDEO`/`CAROUSEL`, `false` otherwise.
Throws `ThreadsError` if the container reports `ERROR`/`EXPIRED` or doesn't become
ready before `maxWaitMs` (default 60000; poll interval default 2000).

### Convenience wrappers

| Method | Signature |
|---|---|
| `publishText` | `(text, options?) => Promise<ContainerRef>` |
| `publishPoll` | `(text, poll, options?) => Promise<ContainerRef>` |
| `publishImage` | `({ imageUrl, ...opts }) => Promise<ContainerRef>` |
| `publishVideo` | `({ videoUrl, ...opts }) => Promise<ContainerRef>` (waits for processing) |
| `publishCarousel` | `({ items, text?, replyControl?, userId?, signal?, wait? }) => Promise<ContainerRef>` |

`publishCarousel` requires ≥2 items; each item is `{ imageUrl?, videoUrl?, altText? }`.

`publishPoll`'s `poll` argument is `{ optionA, optionB, optionC?, optionD? }` (2–4 options,
TEXT posts only). Serialized as `poll_attachment`, a JSON object with snake_case keys.

### `publishing.getPublishingLimit(options?)` → `Promise<PublishingLimit>`

Endpoint: `GET /{user}/threads_publishing_limit`. Reports remaining quota
(250 posts / 1000 replies / 100 deletes per 24h). `options`: `{ userId?, signal? }`.

### `publishing.deletePost(postId, options?)` → `Promise<{ success: boolean }>`

Scope: `threads_delete`. Endpoint: `DELETE /{post-id}`. `options`: `{ signal? }`.

```ts
const post = await threads.publishing.publishText('gm ☕')
await threads.publishing.publishPoll('Coffee or tea?', { optionA: 'Coffee', optionB: 'Tea' })
await threads.publishing.publishVideo({ videoUrl: 'https://…/v.mp4', text: 'demo' })
await threads.publishing.publishCarousel({ items: [{ imageUrl: 'a' }, { imageUrl: 'b' }] })
await threads.publishing.deletePost(post.id)
```

---

## Resource: replies

### `replies.list(mediaId, options?)` → `Promise<Paginated<ThreadsReply>>`

Scope: `threads_read_replies` (or `threads_manage_replies`).
Endpoint: `GET /{media-id}/replies` (top-level replies).
`options`: `{ fields?, reverse?, signal? }`.

### `replies.conversation(mediaId, options?)` → `Promise<Paginated<ThreadsReply>>`

Endpoint: `GET /{media-id}/conversation` (full nested thread). Same options.

### `replies.publish(replyToId, text, options?)` → `Promise<ContainerRef>`

Scope: `threads_content_publish` (+ `threads_manage_replies` for others' posts).
Creates a reply container with `reply_to_id` and publishes it.
`options`: `{ userId?, signal? }`.

### `replies.hide(replyId, signal?)` / `replies.unhide(replyId, signal?)` → `Promise<SuccessResponse>`

Scope: `threads_manage_replies`. Endpoint: `POST /{reply-id}/manage_reply` with `hide`.

### `replies.listPending(mediaId, options?)` → `Promise<Paginated<ThreadsReply>>`

Scope: `threads_manage_replies`. Endpoint: `GET /{media-id}/pending_replies`.
`options`: `{ fields?, reverse?, approvalStatus?: 'pending' | 'ignored', signal? }`.

### `replies.managePending(replyId, approve, signal?)` → `Promise<SuccessResponse>`

Scope: `threads_manage_replies`. Endpoint: `POST /{reply-id}/manage_pending_reply`
with `approve`.

```ts
const replies = await threads.replies.list('MEDIA_ID')
await threads.replies.publish('MEDIA_ID', 'Thanks!')
await threads.replies.hide('REPLY_ID')
```

---

## Resource: insights

### `insights.media(mediaId, metrics?, signal?)` → `Promise<InsightsResponse>`

Scope: `threads_manage_insights`. Endpoint: `GET /{media-id}/insights`.
`metrics` defaults to `['views','likes','replies','reposts','quotes','shares']`.

`MediaMetric` = `views | likes | replies | reposts | quotes | shares`.

### `insights.user(options?)` → `Promise<InsightsResponse>`

Scope: `threads_manage_insights`. Endpoint: `GET /{user}/threads_insights`.

| Option | Type | Notes |
|---|---|---|
| `userId` | `string` | defaults to configured user / `me` |
| `metrics` | `UserMetric[]` | defaults to `['views','followers_count']` |
| `since` / `until` | `number \| Date` | range |
| `breakdown` | `'country' \| 'city' \| 'age' \| 'gender'` | **required** by the API for `follower_demographics` |
| `signal` | `AbortSignal` | — |

`UserMetric` = `views | likes | replies | reposts | quotes | clicks | followers_count | follower_demographics`.

```ts
await threads.insights.media('MEDIA_ID')
await threads.insights.user({ metrics: ['follower_demographics'], breakdown: 'country' })
```

---

## Resource: mentions

### `mentions.list(options?)` → `Promise<Paginated<ThreadsMedia>>`

Scope: mentions permission (+ `threads_basic`). Endpoint: `GET /{user}/mentions`.
`options`: `{ userId?, fields?, since?, until?, limit?, before?, after?, signal? }`.

---

## Resource: search

### `search.keyword(query, options?)` → `Promise<Paginated<ThreadsMedia>>`

Scope: `threads_keyword_search` (+ `threads_basic`). Endpoint: `GET /keyword_search`.
The `owner` field is never returned for search results.

| Option | Type | Notes |
|---|---|---|
| `searchType` | `'TOP' \| 'RECENT'` | `TOP` = relevance (default), `RECENT` = chronological |
| `searchMode` | `'KEYWORD' \| 'TAG'` | default `KEYWORD` |
| `mediaType` | `'TEXT' \| 'IMAGE' \| 'VIDEO'` | restrict media type |
| `since` / `until` | `number \| Date` | range |
| `limit` | `number` | default 25, max 100 |
| `authorUsername` | `string` | exact author filter |
| `fields` | `string[]` | response fields |
| `signal` | `AbortSignal` | — |

```ts
const found = await threads.search.keyword('cold brew', { searchType: 'RECENT', limit: 50 })
```

---

## OAuth helpers

Standalone, tree-shakeable functions. **Token-exchange calls require the app
secret — run them server-side only.**

### `getAuthorizationUrl(options)` → `string`

| Option | Type | Notes |
|---|---|---|
| `clientId` | `string` | Threads app id |
| `redirectUri` | `string` | must match app config exactly |
| `scopes` | `ThreadsScope[]` | non-empty; include `threads_basic` |
| `state` | `string` | CSRF token (recommended) |
| `baseUrl` | `string` | defaults to `https://threads.net` |

Throws `ThreadsValidationError` if `scopes` is empty.

### `exchangeCodeForToken(options)` → `Promise<ShortLivedTokenResponse>`

`{ clientId, clientSecret, code, redirectUri, fetch?, baseUrl?, timeoutMs?, logger? }`
→ `{ access_token, user_id }`. Endpoint: `POST /oauth/access_token`. No retry
(authorization codes are single-use).

### `exchangeForLongLivedToken(options)` → `Promise<LongLivedTokenResponse>`

`{ clientSecret, shortLivedToken, ...base }` → `{ access_token, token_type, expires_in }`
(~60 days). Endpoint: `GET /access_token?grant_type=th_exchange_token`.

### `refreshLongLivedToken(options)` → `Promise<LongLivedTokenResponse>`

`{ longLivedToken, ...base }` → `{ access_token, token_type, expires_in }`.
Endpoint: `GET /refresh_access_token?grant_type=th_refresh_token`. Token must be
≥24h old and unexpired; tokens not refreshed within 60 days expire permanently.

---

## Errors

Every failure is a `ThreadsError`. Narrow with `instanceof`.

```text
ThreadsError
├─ ThreadsValidationError   bad input — no request sent
├─ ThreadsTimeoutError      exceeded timeoutMs
├─ ThreadsNetworkError      fetch failed before a response
└─ ThreadsAPIError          non-2xx response  (status, code, subcode, type, fbtraceId)
   ├─ ThreadsAuthError      401 / code 190
   └─ ThreadsRateLimitError 429 / throttle code  (retryAfterMs?)
```

`ThreadsAPIError` properties: `status?`, `code?`, `subcode?`, `type?`, `fbtraceId?`
(quote `fbtraceId` when contacting Meta support). `ThreadsRateLimitError` adds
`retryAfterMs?`.

### Id validation (`ThreadsValidationError`)

Every id you pass (`mediaId`, `postId`, `replyId`, `userId`, `containerId`, ...)
is interpolated directly into the request path. The SDK rejects ids
containing `?`, `#`, or whitespace with `ThreadsValidationError` **before**
sending anything — otherwise a value like `"123?access_token=..."` could
smuggle extra query params or redirect the request to an unintended path.
This matters most if an id comes from untrusted input, e.g. a webhook
payload — validate/trust ids from external sources before passing them in.

### Utilities

- `toApiError(status, body, headers?)` → maps a Graph response to the right subtype.
- `parseRetryAfterMs(value)` → parses a `Retry-After` header (seconds or HTTP-date) to ms.

---

## Logging

```ts
interface Logger {
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: LogContext): void
}
```

The SDK emits `threads.request.success` (debug) and `threads.request.failure`
(warn/error). **Tokens, app secrets, and OAuth codes are always redacted.**

- `noopLogger` — discards everything (default).
- `redactUrl(url)` — masks `access_token` / `client_secret` / `code` in a URL.
- `redactParams(params)` — masks the same keys in an object.

---

## Constants & scopes

| Export | Value |
|---|---|
| `DEFAULT_BASE_URL` | `https://graph.threads.net` |
| `AUTHORIZATION_BASE_URL` | `https://threads.net` |
| `DEFAULT_API_VERSION` | `v1.0` |
| `THREADS_SCOPES` | array of the 8 documented scopes |
| `ThreadsScope` | union of known scopes \| `(string & {})` |

Documented scopes: `threads_basic`, `threads_content_publish`,
`threads_read_replies`, `threads_manage_replies`, `threads_manage_insights`,
`threads_keyword_search`, `threads_delete`, `threads_location_tagging`.

---

## Types

Object types model the API response shape. Fields are optional because the API
only returns the fields you request via `fields=`.

| Type | Purpose |
|---|---|
| `ThreadsProfile` | user profile |
| `ThreadsMedia` | a post |
| `ThreadsReply` | a reply (adds `has_replies`, `root_post`, `replied_to`, `is_reply`, `hide_status`) |
| `Paginated<T>` | `{ data: T[]; paging?: { cursors?, next?, previous? } }` |
| `InsightMetric` / `InsightsResponse` | metric values (`total_value` or `values[]`) |
| `PublishingLimit` / `QuotaBucket` | quota usage/config |
| `ContainerRef` | `{ id: string }` |
| `ContainerStatusResult` | `{ id, status, error_message? }` |
| `SuccessResponse` | `{ success: boolean }` |
| `MediaContainerType` | publish input: `TEXT \| IMAGE \| VIDEO \| CAROUSEL` |
| `MediaType` | read output: `TEXT_POST \| IMAGE \| VIDEO \| CAROUSEL_ALBUM \| AUDIO \| REPOST_FACADE` |
| `ReplyControl` | `everyone \| accounts_you_follow \| mentioned_only \| parent_post_author_only \| followers_only` |
| `ContainerStatus` | `EXPIRED \| ERROR \| FINISHED \| IN_PROGRESS \| PUBLISHED` |

Option types are also exported: `GetProfileOptions`, `ListPostsOptions`,
`GetPostOptions`, `CreateContainerInput`, `WaitOptions`, `ListRepliesOptions`,
`ListPendingRepliesOptions`, `UserInsightsOptions`, `ListMentionsOptions`,
`KeywordSearchOptions`, plus `MediaMetric`, `UserMetric`, `DemographicBreakdown`.
