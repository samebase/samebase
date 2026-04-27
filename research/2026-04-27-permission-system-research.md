# Permission System Research

## Problem Statement

Noter has a broad authenticated app gate today, but it does not yet distinguish
between approved starter users and operator-only or advanced product surfaces.
The immediate examples are:

- `/machines` and `/machines/connect` should be operator-only.
- FileView paths should not be available to starter users.
- Dashboard Developer tools and FileView Developer tools should be hidden unless
  explicitly granted.
- Dashboard monitoring should be separately gated because it hydrates project,
  branch, PR, and Cloudflare preview state.

The permission system needs to protect both UX entrypoints and Convex backend
functions. Hiding links is useful, but it is not an authorization boundary.

## External Guidance

- Convex authentication docs say deployment endpoints are internet-facing and
  authorization should be checked in backend code before serving each public
  request. They frame Convex apps as a three-tier architecture where requests
  can be checked in server functions: https://docs.convex.dev/auth
- Convex Auth already stores user documents in the Convex database, so this app
  does not need a parallel user table just to add authorization metadata:
  https://docs.convex.dev/auth/database-auth
- Convex function auth docs support checking the current caller with
  `ctx.auth.getUserIdentity()`, while Convex Auth's authorization docs recommend
  `getAuthUserId` for the currently signed-in user:
  https://docs.convex.dev/auth/functions-auth and
  https://labs.convex.dev/auth/authz
- Convex's best-practices docs recommend helper functions for common checks such
  as team membership or admin status, and note that some apps choose RLS while
  others check access in each function:
  https://docs.convex.dev/understanding/best-practices
- Convex's authorization article is the most useful practical guidance here:
  client-side gating is friendly UX but not security, and the best early-stage
  shape is to co-locate authorization with the endpoint's user intent while
  adding shared helpers for repeated checks:
  https://stack.convex.dev/authorization
- TanStack Router recommends `beforeLoad` for route guards, especially to avoid
  protected-content flashes. In this app, Convex auth state currently lives in
  React via `ConvexAuthProvider`, so a component gate is the smallest compatible
  step; a router-context guard can come later if route loading becomes a
  problem:
  https://tanstack.com/router/v1/docs/framework/react/guide/authenticated-routes

## Current App State

- `apps/noter/convex/schema.ts` defines the Convex Auth `users` table with
  `isApproved` as the base product access field.
- `apps/noter/convex/users.ts` exposes `isCurrentUserApproved`, and
  `apps/noter/src/components/ApprovalGate.tsx` uses it to block the
  authenticated app with the waitlist page.
- `apps/noter/src/components/AuthenticatedAppRoutePage.tsx` is the shared app
  route wrapper, so it is the smallest place to add route-level permission
  checks.
- `/machines`, `/machines/connect`, and `/vault/$` are explicit TanStack routes
  and can be gated before their heavy page modules render.
- Dashboard monitoring reads and refreshes vault, branch, PR, staging summary,
  and Cloudflare preview state. It needs its own permission separate from
  FileView.
- Dashboard Developer tools and FileView Developer tools are UI surfaces that
  can be hidden with a shared current-user access query.

One source conflict: `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`
describes pre-login allowlist enforcement, but the current code still has a
post-login approval gate. For this research, code is the source of truth.

## Recommendation

Add a small typed capability layer on top of the existing `users` row.

Do not introduce full RBAC tables yet. The current product question is not team
membership, role editing, delegated admin, or per-resource ACLs. It is a small
set of app-owned capabilities:

```ts
type UserPermission =
  | "dashboard.monitoring.view"
  | "fileView.access"
  | "developerTools.view"
  | "machines.access";
```

Store explicit grants on the existing user row:

```ts
users: defineTable({
  ...
  isApproved: optional(boolean()),
  permissionGrants: optional(array(userPermissionValidator)),
})
```

Derive effective access in one backend module:

- Admin users, using the existing admin identity logic, receive every
  permission.
- `isApproved` continues to mean base app access.
- Non-admin users only receive explicit permission grants after they are
  approved.
- Missing `permissionGrants` means starter access, so no backfill is required
  for the schema change itself.

## Permission Surfaces

### `dashboard.monitoring.view`

Allows the dashboard to list vaults/projects with monitoring state: branch
filters, staged branch summaries, PR metadata, manual dashboard refresh, auto
dashboard refresh, and Cloudflare preview hydration.

The add/create app path should remain outside this gate and use a lightweight
connected-repository-name query instead of the full dashboard vault query.

### `fileView.access`

Allows `/vault/$` routes and the FileView-owned backend path: loading vault file
state, GitHub file/media reads, staging changes, uploads, commits, draft PRs,
compare previews, and rebase/conflict previews.

### `developerTools.view`

Shows dashboard Developer tools and FileView Developer tools. This should not
grant FileView or dashboard monitoring by itself.

### `machines.access`

Allows `/machines`, `/machines/connect`, machine registration approval, machine
registration request lookup, connected machine listing, and browser control
token issuance.

## Implementation Shape

### 1. Shared Permission Model

Create a shared ordered permission list and derive the TypeScript union from it.
Convex validators should use the same list, so route props, UI helpers, schema
validators, and backend checks stay in sync.

### 2. Backend Permission Helpers

Create `apps/noter/convex/permissions.ts`:

- `readUserAccess(ctx, userId)` for query/mutation contexts.
- `currentUserAccess` public query for UI gates.
- `requireCurrentUserPermission(ctx, permission)` for queries and mutations.
- `requireCurrentUserPermissionForAction(ctx, permission)` for actions.
- Internal `getUserAccessByUserId` so actions can authorize after
  `getAuthUserId(ctx)`.

Actions cannot directly read `ctx.db`, so they need the internal-query shape. Do
not trust a client-supplied user id for public functions.

### 3. Frontend Permission Gate

Extend `AuthenticatedAppRoutePage` with `requiredPermission?: UserPermission`.

The gate should:

- call `api.permissions.currentUserAccess`
- return `null` while loading
- render a not-found state when the permission is missing
- render children only after the permission is confirmed

For `/machines`, `/machines/connect`, and `/vault/$`, lazy-load the page modules
inside the gate so denied users do not load those route surfaces.

### 4. Backend Enforcement Targets

Protect representative backend functions with matching permissions:

- `machines.access`: human-facing machine list, registration request, approval,
  and browser control token functions.
- `dashboard.monitoring.view`: dashboard vault list, branch filters, branch
  staging summaries, dashboard-triggered repository tree refreshes.
- `fileView.access`: FileView vault reads, remote branch reads, GitHub file and
  media reads, file staging mutations, file staging actions, commit/PR actions,
  compare previews, and rebase/conflict previews.
- `developerTools.view`: backend developer tool reads such as vault
  infrastructure details.

For read-style functions that can reveal whether a request id exists, prefer
returning the existing not-found/sign-in-style result over exposing missing
permission details. For mutations and actions that perform work, throw
`Unauthorized`.

## Rejected Options

- Client-only feature flags: good for polish, not security. A crafted client can
  still call Convex functions.
- A full RBAC schema now: roles, role-permission joins, and admin UI are more
  surface than the current need.
- RLS now: useful as a later fallback for broad table-level protection, but the
  current checks are endpoint-intent checks. Convex guidance suggests starting
  with explicit backend checks and helper functions.
- Hardcoding every route in React: quick for `/machines`, but it would repeat
  the same decision in UI, Convex queries, mutations, and actions.
- Environment-variable allowlists: acceptable for emergency admin bootstrap, but
  not enough for per-user product capabilities because grants need to be
  observable by subscribed UI and editable without redeploying.

## Validation Plan

- Unit tests for the permission resolver: admin by email, admin by GitHub
  username, unapproved non-admin, explicitly granted approved non-admin,
  duplicate grants, and stable returned order.
- Router/component tests: gated routes carry the required permission, and the
  permission gate returns a not-found state for users without that permission.
- Typecheck/codegen coverage for Convex schema, generated APIs, route props, and
  action helper typing.
- Follow-up route-level or backend tests can cover individual dashboard,
  FileView, and machine Convex functions as those surfaces get more granular
  test harnesses.
