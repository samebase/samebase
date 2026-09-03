# 017 Netlify OAuth and Team Selection Spec

## Document Control

- Status: Superseded
- Owner: Noter platform
- Last updated: 2026-08-07
- Superseded by: `archive/062_NETLIFY_REMOVAL_AND_CLOUDFLARE_ONLY_HOSTING_SPEC.md`
- Related specs:
  - `specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md`
  - `rfcs/016_FRONTEND_HOSTING_PROVIDER_SELECTION_SPEC.md`
  - `archive/026_PROVIDER_CONNECTIONS_SPEC.md`

## Summary

Noter uses Netlify OAuth to connect a user’s Netlify account for BYO hosting. OAuth callback
exchanges the code server-side and stores the connection in `providerConnections`
(`kind = "netlify"`).

## Goals

1. Single-click Netlify connect from dashboard.
2. Auto-select default/first team account.
3. Keep credentials server-side only.

## Non-Goals

1. Manual team picker UI.
2. Token rotation automation.
3. Operator-token fallback.

## OAuth Flow

1. User clicks `Connect Netlify`.
2. Backend generates URL + oauth state.
3. Netlify redirects back with `code` + `state`.
4. Backend exchanges code for credential.
5. Backend fetches user accounts and selects team.
6. Backend upserts `providerConnections` row:
   - `kind: "netlify"`
   - `auth.method: "oauth"`
   - `auth.credential`
   - optional refresh/expiry
   - `teamId`
   - optional `teamSlug`

## Team Selection Rules

1. Prefer default account (`is_default` / `default`).
2. Else prefer first team account.
3. Else first account.

## Data Model

Uses `providerConnections` from spec 026. No provider token fields on `users` are source-of-truth.

## Configuration

Required env vars:

1. `PROVIDER_NETLIFY_OAUTH_CLIENT_ID`
2. `PROVIDER_NETLIFY_OAUTH_CLIENT_SECRET`
3. `PROVIDER_NETLIFY_OAUTH_REDIRECT_URL`

## Security

1. Credentials are server-side only.
2. OAuth state validation is required.
3. Missing/expired state fails the flow clearly.

## Acceptance Criteria

1. Signed-in user can connect Netlify and see connected status.
2. Netlify provider connection row includes team metadata.
3. Disconnect removes Netlify provider connection and blocks dependent actions.
