# 026 Provider Connections Refactor Spec

## Document Control

- Status: Proposed
- Owner: Noter auth + platform
- Last updated: 2026-02-26
- Related specs:
  - `specs/025_MULTI_WORKTREE_OAUTH_BROKER_SPEC.md`
  - `specs/015_BYO_CONVEX_OAUTH_AND_WORKTREE_PROVISIONING_SPEC.md`
  - `specs/017_NETLIFY_OAUTH_AND_TEAM_SELECTION_SPEC.md`
  - `specs/009_CODESPACE_PORT_VISIBILITY_SPEC.md`

## Summary

Refactor auth and provider connectivity so app login is separate from provider
connections. Introduce a dedicated `providerConnections` table as the single
source of truth for GitHub, Convex, and Netlify credentials.

## Locked Product Decisions

1. App login:
   - `prod`: Google only.
   - `dev`: Google + password.
   - GitHub is removed from app sign-in.
2. Provider access is explicit connection-only flow for GitHub/Convex/Netlify.
3. One active connection per (`userId`, `kind`), with method `oauth` or
   `api_key`.
4. Use union-based modeling; no sparse generic token object on `users`.
5. Include index support for `kind` + `auth.method`.

## Data Model

`apps/noter/convex/schema.ts` adds `providerConnections` with top-level provider
union and nested auth-method union.

### Auth validators

1. `oauthAuth`:
   - `method: "oauth"`
   - `credential`
   - `refreshCredential?`
   - `credentialExpiresAt?`
2. `apiKeyAuth`:
   - `method: "api_key"`
   - `credential`
   - `credentialExpiresAt?`

### Provider documents

1. GitHub:
   - `kind: "github"`
   - `userId`
   - `auth`
   - `username`
   - `createdAt`, `updatedAt`
2. Convex:
   - `kind: "convex"`
   - `userId`
   - `auth`
   - `teamId`
   - `teamSlug?`
   - `createdAt`, `updatedAt`
3. Netlify:
   - `kind: "netlify"`
   - `userId`
   - `auth`
   - `teamId`
   - `teamSlug?`
   - `createdAt`, `updatedAt`

### Indexes

1. `by_user`: `["userId"]`
2. `by_user_kind`: `["userId", "kind"]`
3. `by_kind_method`: `["kind", "auth.method"]`

## Users Table Changes

Provider credential fields are removed from `users` as source-of-truth. Provider
credentials must be read from `providerConnections`.

## Backend Contract

### New module

`apps/noter/convex/providerConnections.ts`

- Internal upsert/read/remove helpers.
- Upsert semantics enforce one row per (`userId`, `kind`) via `by_user_kind`.

### Connection status queries

`apps/noter/convex/users.ts` exposes:

1. `getGithubConnectionStatus`
2. `getConvexConnectionStatus`
3. `getNetlifyConnectionStatus`

Each status includes:

1. `connected`
2. provider metadata (`username`, `teamId`, `teamSlug` as applicable)
3. `authMethod?: "oauth" | "api_key"`

`viewer` exposes:

1. `hasGithubConnection`
2. `hasConvexConnection`
3. `hasNetlifyConnection`

## OAuth + Login Split

1. `apps/noter/convex/auth.ts`:
   - App login providers are Google (+ password in dev).
   - GitHub removed from app sign-in provider list.
2. Dedicated GitHub provider-connection OAuth:
   - `apps/noter/convex/githubOAuth.ts`
   - `getGithubOAuthUrl`
   - `/oauth/github/start`
   - `/oauth/github/callback`
   - Callback stores `kind: "github"` + `auth.method: "oauth"` in
     `providerConnections`.
3. Convex and Netlify OAuth modules write to `providerConnections` (not
   `users`).

## Runtime Consumer Rule

All runtime flows that need provider credentials must read
`providerConnections`. Missing connection must fail explicitly with:

- `"GitHub is not connected"`
- `"Convex is not connected"`
- `"Netlify is not connected"`

No fallback to app-login provider tokens.

## Frontend Contract

1. `SignInForm` removes GitHub app sign-in.
2. GitHub connection uses dedicated provider OAuth flow (dashboard + add repo).
3. Connection UIs show method labels (`OAuth`, `API key`).
4. Chat/vault surfaces gate behavior using `viewer.hasGithubConnection`.

## Environment Contract

### GitHub OAuth connect

1. `GITHUB_OAUTH_CLIENT_ID`
2. `GITHUB_OAUTH_CLIENT_SECRET`
3. `GITHUB_OAUTH_REDIRECT_URL`

### Dev seed provider API keys

When running anonymous/local worktree seed path:

1. `DEV_SEED_GITHUB_API_KEY`
2. `DEV_SEED_CONVEX_MANAGEMENT_API_KEY`
3. `DEV_SEED_CONVEX_TEAM_ID`
4. `DEV_SEED_NETLIFY_API_KEY`
5. `DEV_SEED_NETLIFY_TEAM_ID`

No shared fallback env names are used for seed inputs.

## Rollout Notes

1. Hard cut architecture; backward compatibility with legacy user token fields
   is out of scope.
2. Target initial rollout on fresh dev deployments.
3. Data backfill/migration for legacy rows is out of scope for this change set.
