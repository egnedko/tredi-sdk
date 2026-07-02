/**
 * OAuth flow (server-side). Shows the four steps end to end.
 * Run pieces of this inside your web framework's route handlers.
 *
 *   THREADS_APP_ID=... THREADS_APP_SECRET=... node --experimental-strip-types examples/oauth-flow.ts
 */

import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getAuthorizationUrl,
  refreshLongLivedToken,
} from 'tredi-sdk'

const APP_ID = process.env.THREADS_APP_ID!
const APP_SECRET = process.env.THREADS_APP_SECRET!
const REDIRECT_URI = 'https://app.example.com/auth/threads/callback'

// Step 1 — send the user here (store `state` to verify on return).
export function loginUrl(state: string): string {
  return getAuthorizationUrl({
    clientId: APP_ID,
    redirectUri: REDIRECT_URI,
    scopes: ['threads_basic', 'threads_content_publish', 'threads_manage_replies'],
    state,
  })
}

// Steps 2–3 — handle the redirect: code → short token → long-lived token.
export async function handleCallback(code: string) {
  const short = await exchangeCodeForToken({
    clientId: APP_ID,
    clientSecret: APP_SECRET,
    code,
    redirectUri: REDIRECT_URI,
  })

  const long = await exchangeForLongLivedToken({
    clientSecret: APP_SECRET,
    shortLivedToken: short.access_token,
  })

  // Persist long.access_token + expiry against short.user_id (encrypted at rest).
  return { userId: short.user_id, token: long.access_token, expiresIn: long.expires_in }
}

// Step 4 — run on a schedule before the 60-day expiry (token must be ≥24h old).
export async function refresh(token: string) {
  const refreshed = await refreshLongLivedToken({ longLivedToken: token })
  return { token: refreshed.access_token, expiresIn: refreshed.expires_in }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Authorize URL:\n', loginUrl('demo-state'))
}
