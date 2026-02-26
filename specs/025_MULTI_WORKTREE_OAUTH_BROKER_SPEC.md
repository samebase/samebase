# 025 Password Auth + API-Key Connection Mode Spec

## Document Control

- Status: Proposed
- Owner: Noter auth + dev workflow
- Last updated: 2026-02-26
- Supersedes: Previous `025 Multi-Worktree OAuth Broker Spec`
- Related specs:
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/015_BYO_CONVEX_OAUTH_AND_WORKTREE_PROVISIONING_SPEC.md`
  - `specs/017_NETLIFY_OAUTH_AND_TEAM_SELECTION_SPEC.md`
  - `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`

## Summary

This spec defines the product behavior for:

1. Password app-login support in development.
2. API-key connection mode for GitHub/Convex/Netlify.
3. Anonymous worktree seed behavior for local development.

Connection data architecture is defined by
`specs/026_PROVIDER_CONNECTIONS_SPEC.md` and is the source of truth for
storage/indexing details.

## Locked Product Decisions

1. App login providers:
   - `prod`: Google only.
   - `dev`: Google + password.
   - GitHub is not an app-login provider.
2. Password seeding uses fixed development credentials in code:
   - Email: `nicu@noter.md`
   - Password: `pass1234`
3. Provider connections support both OAuth and API key methods.
4. Allowlist enforcement remains mandatory for sign-in/sign-up.

## Backend Requirements

### `apps/noter/convex/auth.ts`

1. Enable password provider only on development deployments.
2. Keep Google login provider when configured.
3. Keep allowlist checks in `createOrUpdateUser`.

### `apps/noter/convex/devAuth.ts`

1. `seedPasswordAccount` must seed fixed dev credentials:
   - Email: `nicu@noter.md`
   - Password: `pass1234`
2. `seedPasswordAccount` must also upsert provider API-key connections for the
   seeded user into `providerConnections` (not `users`) when `DEV_SEED_*` inputs
   are present.

### `apps/noter/convex/users.ts`

Provide API-key connect actions with server-side validation:

1. `connectGithubWithApiKey({ token })`
2. `connectConvexWithApiKey({ token })`
3. `connectNetlifyWithApiKey({ token })`

Each action validates the key before upsert in `providerConnections`.

### Make targets

`make anon` / `make anon-once` must run password-account seed during the anon
startup flow.

Flow contract:

1. Initialize local anonymous deployment (`convex dev --once`).
2. Build `apps/noter/.env.anon-seed.local` from cloud dev `DEV_SEED_*` vars.
3. Run `devAuth:seedPasswordAccount` using `--env-file .env.anon-seed.local`.

## Frontend Requirements

### `apps/noter/src/SignInForm.tsx`

1. Show Google login.
2. Show password login UI only in dev.
3. Do not show GitHub app-login button.

### Connections UI

Dashboard/provider controls must expose both:

1. OAuth connect.
2. API-key connect.

## Environment Contract

### Password

1. Password UI: `import.meta.env.DEV`.
2. Password provider: dev deployment only.

### Provider API-key seed (anonymous/local worktree)

Only these env vars are used:

1. `DEV_SEED_GITHUB_API_KEY`
2. `DEV_SEED_CONVEX_MANAGEMENT_API_KEY`
3. `DEV_SEED_CONVEX_TEAM_ID`
4. `DEV_SEED_NETLIFY_API_KEY`
5. `DEV_SEED_NETLIFY_TEAM_ID`

## Notes

The storage model and indexes for provider credentials are intentionally not
duplicated here. See `specs/026_PROVIDER_CONNECTIONS_SPEC.md`.
