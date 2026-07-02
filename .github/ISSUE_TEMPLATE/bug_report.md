---
name: Bug report
about: Something in the SDK doesn't behave as documented
title: ''
labels: bug
---

**Describe the bug**
What happened, and what did you expect instead?

**Minimal reproduction**
A short code snippet (or, even better, a failing test) that reproduces it.

```ts
import { ThreadsClient } from 'tredi-sdk'
// ...
```

**Environment**
- `tredi-sdk` version:
- Node version:
- Runtime (Node / Bun / Deno / edge):

**Additional context**
Relevant Graph API error response (`ThreadsAPIError` fields: `status`, `code`,
`subcode`, `type`, `fbtraceId`), if any. Redact your access token.
