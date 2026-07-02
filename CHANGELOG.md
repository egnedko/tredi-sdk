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

### Notes

- Post deletion is intentionally not implemented yet (exact method/path not
  confirmed against the official docs in this release).

[Unreleased]: https://example.com/compare/v0.1.0...HEAD
[0.1.0]: https://example.com/releases/tag/v0.1.0
