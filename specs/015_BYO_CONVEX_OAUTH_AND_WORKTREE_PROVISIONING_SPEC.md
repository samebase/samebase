# 015 BYO Convex OAuth (Web UI) Spec

## Document Control

- Status: Proposed
- Owner: Noter platform + dev tooling
- Last updated: 2026-02-26
- Supersedes: `specs/014_WORKTREE_CLOUD_PROVISIONING_AND_CLI_AUTH_SPEC.md`
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/012_DEV_ENV_ORIGIN_SITE_URL_SYNC_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`

## Summary

Ship Bring Your Own Convex with explicit provider connections. App login remains
separate from provider connectivity:

1. App login: Google (and password in dev).
2. GitHub connection: explicit provider connect flow.
3. Convex connection: explicit provider connect flow.

Provisioning must use user-scoped provider credentials stored in
`providerConnections`.

## Goals

1. Users can connect Convex from UI and provision in their own account.
2. Project creation is gated on required provider connections.
3. Infra provisioning uses user-scoped Convex credential from
   `providerConnections`.

## Non-Goals

1. Operator-token fallback architecture.
2. Worktree CLI provisioning details.
3. Changes to starter seed behavior.

## Product Requirements

1. Convex OAuth connect writes `kind = "convex"` row into `providerConnections`.
2. Stored metadata includes:
   - auth method (`oauth` or `api_key`)
   - credential
   - `teamId`
   - optional `teamSlug`
3. Provisioning fails with explicit error when Convex is not connected.

## Backend API

1. `convexOAuth.getConvexOAuthUrl`
2. `convexOAuth.startConvexOAuth` / callback flow
3. `users.getConvexConnectionStatus`
4. `users.disconnectConvex`

All connection reads/writes must use `providerConnections` (see spec 026).

## Frontend UX

1. Dashboard shows Convex connection status.
2. Connect/disconnect controls for Convex.
3. "Create project" is disabled until required provider connections are present.

## Configuration

Required env vars:

1. `CONVEX_OAUTH_CLIENT_ID`
2. `CONVEX_OAUTH_CLIENT_SECRET`
3. `CONVEX_OAUTH_REDIRECT_URL`

## Security

1. Credentials never returned to client.
2. Credentials are redacted in logs.
3. Missing connection produces explicit failure; no hidden fallback.

## Acceptance Criteria

1. User connects Convex and sees connected status + team metadata.
2. Provisioning uses the connected user’s Convex credential.
3. Disconnect removes Convex provider connection and blocks dependent actions.
