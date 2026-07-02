# Security Policy

`tredi-sdk` handles Threads API access tokens and, in the OAuth helpers, app
secrets. Treat vulnerabilities in this package (token/secret leakage via logs,
SSRF via unvalidated URLs, retry logic that could duplicate authenticated
requests, etc.) seriously.

## Reporting a vulnerability

**Do not open a public GitHub issue.**

Email **egnedko+tredisdk@gmail.com** with:

- A description of the vulnerability and its impact.
- Steps to reproduce (a minimal repro is ideal).
- The affected version(s).

You should get an acknowledgment within a few days. Once a fix is available,
we'll coordinate on disclosure timing and credit (if wanted) in the release
notes.

## Supported versions

Pre-1.0: only the latest published `0.x` version is supported. There is no
long-term-support branch yet.

## Scope notes

- Token-exchange helpers (`exchangeCodeForToken`, `exchangeForLongLivedToken`,
  `refreshLongLivedToken`) require the app secret and are meant to run
  server-side only — misuse of these client-side is an application-level
  issue, not an SDK vulnerability, but let us know if the SDK makes that
  misuse easy to fall into.
- The SDK never logs tokens, secrets, or OAuth codes (see `src/logger.ts`
  redaction). If you find a path where a secret reaches a log line, that's a
  security bug — please report it privately.
