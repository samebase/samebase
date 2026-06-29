# 110 Vault Route Surface Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/app shell + vault dashboard
- Last updated: 2026-06-29
- Related specs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/083_TANSTACK_ROUTER_FILE_BASED_MIGRATION_SPEC.md`
  - `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`

## Current Contract

Vault URLs identify the repository first. Repo-level pages live directly under that repository
identity. Branch-scoped product surfaces are named before the encoded branch segment.

Accepted target routes:

1. Vault home:
   - `/vault/:owner/:repo`
2. Vault settings:
   - `/vault/:owner/:repo/settings`
3. Repository filesystem:
   - `/vault/:owner/:repo/fs/:branch`
   - `/vault/:owner/:repo/fs/:branch/:filePath...`
4. Deployment database editor:
   - `/vault/:owner/:repo/db/:branch/root`
   - `/vault/:owner/:repo/db/:branch/mono/:appRoot...`

The `:branch` segment is the exact Git branch name encoded as one path segment with
`encodeURIComponent(...)` and decoded exactly once. Branch names containing `/` therefore stay valid
without route splitting.

The `:filePath...` tail belongs only to the filesystem surface. File path segments are encoded
individually while preserving `/` as the path separator. A file or directory named `db`, `settings`,
or `fs` is addressed through the filesystem surface, such as `/vault/:owner/:repo/fs/:branch/db`.

The database route target includes the app root in the path because the selected app deployment is
part of the database identity, not an optional view filter. Use `/root` for the repository-root app.
Use `/mono/:appRoot...` for a nested monorepo app root. The `:appRoot...` tail is the repo-relative
app-root path with each path segment encoded individually. A nested app root named `root` is
addressed as `/vault/:owner/:repo/db/:branch/mono/root`.

File compare, diff, and review modes remain query params on filesystem routes. They are view modes
for the selected branch/file, not separate route surfaces.

## Naming Rules

1. Use named route surfaces directly after `/vault/:owner/:repo`.
2. Use `fs` for the repository filesystem surface.
3. Use `db` for the deployment database surface.
4. Do not put provider names such as `convex` in the route path for product surfaces.
5. Do not use a generic `/-/` delimiter in the target contract. The old delimiter route shape is
   superseded by named surfaces.

## MVP Database Editor Scope

The first database editor implementation only needs to link and render the production/default
branch. The accepted MVP route is:

```txt
/vault/:owner/:repo/db/:defaultBranch/root
/vault/:owner/:repo/db/:defaultBranch/mono/apps/web
```

Preview branch database routes may reuse the same shape later, after Samebase can resolve the
matching Convex preview deployment for a branch. Until that resolver exists, non-default branch
database links should not silently show production data.

The embedded database surface is an editor, not a read-only viewer. OAuth-backed embedded dashboard
credentials use the connected user's normal Convex grant, and must not send request-scoped
`allowedActions` or `expiresAt` options because Convex reuses the OAuth token grant for those deploy
keys. API-key fallback credentials must request the deployment data actions needed for editing,
including both data view and data write access.

On mobile, the database editor route must expose explicit left and right workspace sidebar toggles.
The embedded dashboard runs in a cross-origin iframe, so iframe-owned touch gestures cannot be the
only way to reach Samebase's mobile workspace sidebars.

## Non-Goals

1. This spec does not require a vault settings page to ship before the database route.
2. This spec does not require preview deployment data editing in the MVP.
3. This spec does not preserve internal backward compatibility for superseded vault route shapes.
4. This spec does not define every embedded Convex dashboard credential exchange detail; it only
   defines the Samebase browser route shape and route-level access expectations.

## Validation

Route implementation PRs should prove:

1. Route builders emit `/vault/:owner/:repo/fs/:branch`, `/vault/:owner/:repo/db/:branch/root`, and
   `/vault/:owner/:repo/db/:branch/mono/:appRoot...`.
2. Branch names containing `/`, spaces, or other special characters round-trip through one encoded
   branch segment.
3. Files named `db`, `settings`, or `fs` resolve under `/fs/:branch/...`, not as repo-level pages.
4. Nested app roots containing `/`, spaces, or other special characters round-trip through the
   `/mono/:appRoot...` path tail.
5. Dashboard branch links use the accepted route builders.
6. New code does not emit the superseded `/vault/:owner/:repo/-/...` route shape.

## Rollout

1. Replace the current vault file route helper and parser with the `fs` route contract.
2. Update dashboard, editor, auth-return, tests, and route suggestions to use the new helpers.
3. Add the MVP production database editor at `/vault/:owner/:repo/db/:branch/root` and
   `/vault/:owner/:repo/db/:branch/mono/:appRoot...`.
4. Add preview database resolution only after the production database editor is working end to end.
