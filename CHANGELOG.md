# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!--
Add entries under the relevant heading as you work. Move them into a new
versioned section on release.

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security
-->

### Security

- Every request now rejects an id (`mediaId`, `postId`, `replyId`, `userId`,
  `containerId`, ...) that contains `?`, `#`, or whitespace before it's
  interpolated into the request path, throwing `ThreadsValidationError`
  instead of silently building a request with smuggled query params or an
  unintended path. This matters most when an id comes from untrusted input
  (e.g. an inbound webhook payload) and was never validated by the caller.
- Added regression tests pinning down that OAuth secrets (`client_secret`,
  the one-time `code`) and access tokens never reach a configured `logger`,
  including for `exchangeForLongLivedToken` (a GET request where
  `client_secret` is genuinely part of the URL sent to Meta, though never
  part of what the SDK logs) and for failed requests.

## [0.1.0] - 2026-06-20

### Added

- Initial release.
- `ThreadsClient` with resource namespaces: `profile`, `posts`, `publishing`,
  `replies`, `insights`, `mentions`, `search`.
- Standalone OAuth helpers: `getAuthorizationUrl`, `exchangeCodeForToken`,
  `exchangeForLongLivedToken`, `refreshLongLivedToken`.
- Core HTTP engine: per-request timeout, idempotency-aware retries with
  exponential backoff + jitter, `Retry-After` support.
- Typed error hierarchy (`ThreadsError` and subtypes) with Graph error mapping.
- Redacting logging hooks — access tokens, app secrets, and OAuth codes are
  never logged.
- Dual ESM/CJS build with type declarations; `sideEffects: false`.
- Post deletion (`publishing.deletePost`) and polls (`publishing.publishPoll`).

<!-- Replace egnedko once this repo has a real home on GitHub. -->
[Unreleased]: https://github.com/egnedko/tredi-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/egnedko/tredi-sdk/releases/tag/v0.1.0
