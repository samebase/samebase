# 017 Netlify OAuth and Team Selection Spec

## Document Control
- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-02-18
- Related specs:
- `/Users/nicu/dev/my/noter/specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
- `/Users/nicu/dev/my/noter/specs/016_FRONTEND_HOSTING_PROVIDER_SELECTION_SPEC.md`

## Summary
Noter uses **Netlify OAuth** to connect a user's Netlify account for BYO hosting. The flow uses Netlify's authorization endpoint to return an authorization code, then Noter exchanges that code server-side for an access token and **auto-selects the default/first Netlify team** for provisioning. This keeps onboarding minimal and removes the need for operator tokens.

## Goals
1. Single-click Netlify connect from the dashboard.
2. Auto-select a team without a picker.
3. Store Netlify tokens server-side only (Convex).
4. Keep the flow compatible with Netlify's OAuth authorize endpoint.

## Non-Goals
1. Manual team selection UI.
2. Token refresh/rotation automation.
3. Netlify operator-token fallback.

## OAuth Flow
1. User clicks **Connect Netlify**.
2. Noter calls `netlifyOAuth.getNetlifyOAuthUrl` to create OAuth state and generate the authorize URL.
3. User authorizes at Netlify.
4. Netlify redirects to `NETLIFY_OAUTH_REDIRECT_URL` with `code` + `state` query params.
5. The callback handler calls `netlifyOAuth.finishNetlifyOAuth` to exchange the code for tokens.
6. Noter fetches the user's Netlify account + teams, selects the default/first team, and stores tokens + team metadata on `users`.

## Team Selection Rules
1. Prefer the account marked as default (`is_default` / `default`).
2. Otherwise prefer the first team account if present.
3. Fallback: first account in the list.

## Data Model Changes
### Users table
- `netlifyAccessToken: string`
- `netlifyRefreshToken?: string` (not expected in the initial flow)
- `netlifyExpiresAt?: number`
- `netlifyUserId?: string`
- `netlifyTeamId?: string`
- `netlifyTeamSlug?: string`

### OAuth state
Uses the shared `oauthStates` table with provider `netlify` and a stored `state` value for CSRF protection.

## Configuration
Required env vars:
- `NETLIFY_OAUTH_CLIENT_ID`
- `NETLIFY_OAUTH_CLIENT_SECRET`
- `NETLIFY_OAUTH_REDIRECT_URL` (points to `/oauth/netlify/callback`)

## Security Notes
- Tokens are stored only in Convex (never in client state).
- The callback page clears the URL fragment immediately after parsing.
- If the OAuth state is missing/expired, the flow fails with a clear error.

## Acceptance Criteria
- A signed-in user can connect Netlify and see connection status in the dashboard.
- Netlify tokens + team metadata are stored on `users`.
- No Cloudflare connection flow exists in the UI or backend.
