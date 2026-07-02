# Contributing

Thanks for taking a look at `tredi-sdk`. This is a small, focused package —
contributions that keep it that way are especially welcome.

## Setup

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm test:coverage
pnpm lint        # eslint
pnpm build       # tsup → dist (esm + cjs + d.ts)
```

Node 18+ required (global `fetch`).

## Before opening a PR

- `pnpm typecheck && pnpm lint && pnpm test` all pass.
- New behavior has a test. This SDK is mock-based (no network calls in tests) —
  see `test/helpers.ts` (`mockFetch`) and existing files in `test/` for the
  pattern.
- Public API changes are documented in `docs/api-reference.md` and, if
  user-facing, in the `README.md` usage section.
- An entry is added under `## [Unreleased]` in `CHANGELOG.md`.

## Scope

This SDK models the *documented* Threads Graph API. Endpoints that aren't
confirmed against the official docs shouldn't be added speculatively — open an
issue with a link to the relevant docs page instead.

## Reporting bugs / requesting features

Use the issue templates. For a bug, the most useful thing you can include is a
minimal reproduction (a failing test is ideal).

## Security issues

Do not open a public issue for a security vulnerability — see
[SECURITY.md](./SECURITY.md).
