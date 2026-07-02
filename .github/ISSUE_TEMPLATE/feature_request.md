---
name: Feature request
about: An endpoint or capability this SDK doesn't model yet
title: ''
labels: enhancement
---

**What's missing**
Which Threads API endpoint or capability isn't covered?

**Docs link**
Link to the relevant page in the [official Threads API docs](https://developers.facebook.com/docs/threads).
This SDK only models documented, confirmed endpoints — see [CONTRIBUTING.md](../../CONTRIBUTING.md#scope).

**Proposed shape (optional)**
How would you want to call it? e.g.:

```ts
await threads.publishing.somethingNew(...)
```

**Workaround**
Can this be done today via the [escape hatch](../../README.md#escape-hatch)
(`client.request(...)`)? If so, this is a convenience-wrapper request, not a
blocker.
