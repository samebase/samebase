# 110 Repository Route Surface Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/app shell + repository dashboard
- Last updated: 2026-07-21
- Related specs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/083_TANSTACK_ROUTER_FILE_BASED_MIGRATION_SPEC.md`
  - `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
  - `specs/115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md`

## Current Contract

Repository URLs start at the repository directory. Repository-specific pages live directly under
that repository identity. Branch-scoped product surfaces are named before the encoded branch
segment.

Accepted target routes:

1. Repository directory:
   - `/repo`
2. Repository home:
   - `/repo/:owner/:repository`
3. Repository settings:
   - `/repo/:owner/:repository/settings`
4. Repository filesystem:
   - `/repo/:owner/:repository/fs/:branch`
   - `/repo/:owner/:repository/fs/:branch/:filePath...`
5. Deployment database editor:
   - `/repo/:owner/:repository/db/:branch/project/:convexProjectId`
6. Deployment schema graph:
   - `/repo/:owner/:repository/schema/:branch/project/:convexProjectId`

The old `/vault` route family is not registered. These URLs return Not Found without a redirect.

The `:branch` segment is the exact Git branch name encoded as one path segment with
`encodeURIComponent(...)` and decoded exactly once. Branch names containing `/` therefore stay valid
without route splitting.

The `:filePath...` tail belongs only to the filesystem surface. File path segments are encoded
individually while preserving `/` as the path separator. A file or directory named `db`, `settings`,
or `fs` is addressed through the filesystem surface, such as
`/repo/:owner/:repository/fs/:branch/db`.

Database and Schema routes include the `vaultConvexProjects` attachment ID because the selected
project is part of the resource identity, not an optional view filter. A root path cannot identify a
project because several projects may intentionally use the same Convex code location. The server
verifies that the attachment belongs to the repository before reading provider data.

File compare and commit review remain the `?compare` and `?diff` query params on filesystem routes.
They are view modes for the selected branch/file, not separate route surfaces.

## Naming Rules

1. Use named route surfaces directly after `/repo/:owner/:repository`.
2. Use `fs` for the repository filesystem surface.
3. Use `db` for the deployment database surface.
4. Do not put provider names such as `convex` in the route path for product surfaces.
5. Do not use a generic `/-/` delimiter in the target contract. The old delimiter route shape is
   superseded by named surfaces.

## MVP Database Editor Scope

The first database editor implementation only needs to link and render the production/default
branch. The accepted MVP route is:

```txt
/repo/:owner/:repository/db/:defaultBranch/project/:convexProjectId
```

Preview branch database routes may reuse the same shape later, after Samebase can resolve the
matching Convex preview deployment for a branch. Until that resolver exists, non-default branch
database links should not silently show production data.

When the pull request resource query has already verified one exact Convex preview deployment, the
pull request row may link directly to that deployment's Data page in the Convex dashboard. This does
not make the embedded `/db/` route preview-aware and does not mint Samebase dashboard credentials
for the preview.

The embedded database surface is an editor, not a read-only viewer. OAuth-backed embedded dashboard
credentials use the connected user's normal Convex grant, and must not send request-scoped
`allowedActions` or `expiresAt` options because Convex reuses the OAuth token grant for those deploy
keys. API-key fallback credentials must request the deployment data actions needed for editing,
including both data view and data write access.

On mobile, the database editor route must expose explicit left and right workspace sidebar toggles.
The embedded dashboard runs in a cross-origin iframe, so iframe-owned touch gestures cannot be the
only way to reach Samebase's mobile workspace sidebars.

## Non-Goals

1. This spec does not require a repository settings page to ship before the database route.
2. This spec does not require preview deployment data editing in the MVP.
3. This spec does not preserve internal backward compatibility for superseded repository route
   shapes.
4. This spec does not define every embedded Convex dashboard credential exchange detail; it only
   defines the Samebase browser route shape and route-level access expectations.

## Validation

Route implementation PRs should prove:

1. Route builders emit `/repo/:owner/:repository/fs/:branch`,
   `/repo/:owner/:repository/db/:branch/project/:convexProjectId`, and
   `/repo/:owner/:repository/schema/:branch/project/:convexProjectId`.
2. Branch names containing `/`, spaces, or other special characters round-trip through one encoded
   branch segment.
3. Files named `db`, `settings`, or `fs` resolve under `/fs/:branch/...`, not as repo-level pages.
4. Convex attachment IDs round-trip through one encoded path segment.
5. Dashboard branch links use the accepted route builders.
6. New code does not emit the superseded `/repo/:owner/:repository/-/...` route shape.

## Rollout

1. Replace the current repository file route helper and parser with the `fs` route contract.
2. Update dashboard, editor, auth-return, tests, and route suggestions to use the new helpers.
3. Add the MVP production database editor at
   `/repo/:owner/:repository/db/:branch/project/:convexProjectId`.
4. Add preview database resolution only after the production database editor is working end to end.
