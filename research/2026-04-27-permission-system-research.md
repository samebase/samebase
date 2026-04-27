# Permission System Research

## Problem Statement

Noter has a broad authenticated app gate today, but it does not yet distinguish
between approved starter users and operator-only or abuse-prone file-operation
surfaces. The immediate example is that `/machines` and `/machines/connect`
should be admin-only. The broader direction is to hide or deny high-complexity
surfaces such as dashboard Developer tools and FileView paths for people who are
just starting out.

The permission system needs to protect both UX entrypoints and Convex backend
functions. Hiding links is useful, but it is not an authorization boundary.

## External Guidance

- Convex authentication docs say deployment endpoints are internet-facing and
  authorization should be checked in backend code before serving each public
  request. They explicitly frame Convex apps as a three-tier architecture where
  requests can be checked in server functions: https://docs.convex.dev/auth
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

- `apps/noter/convex/schema.ts:297` defines the Convex Auth `users` table with
  `isApproved` as the only product access field.
- `apps/noter/convex/users.ts:29` has hardcoded admin identities, and
  `apps/noter/convex/users.ts:154` exposes `isAdminUser`.
- `apps/noter/convex/users.ts:171` treats `users.isApproved` or admin identity
  as broad app access via `hasAppAccess`.
- `apps/noter/convex/users.ts:456` exposes `isCurrentUserApproved`.
- `apps/noter/src/components/ApprovalGate.tsx:7` uses that query to block the
  authenticated app with the waitlist page.
- `apps/noter/src/components/AuthenticatedAppRoutePage.tsx:12` wraps routes in
  the authenticated shell and approval gate, but it has no permission parameter.
- `/machines` and `/machines/connect` are explicit TanStack routes at
  `apps/noter/src/routes/machines.tsx:17` and
  `apps/noter/src/routes/machine-connect.tsx:17`. They require authentication
  and approval, but not admin status.
- The machine backend functions protect authentication and ownership, but not
  admin-only access. Examples: `apps/noter/convex/connectedMachines.ts:117`,
  `apps/noter/convex/connectedMachines.ts:139`,
  `apps/noter/convex/connectedMachines.ts:177`, and
  `apps/noter/convex/connectedMachineControl.ts:19`.
- FileView is already lazily loaded at `apps/noter/src/routes/vault-file.tsx:6`,
  which is good. A permission gate around that route can prevent the heavy
  editor bundle from loading for denied users.
- Dashboard Developer tools are rendered by ready vault cards at
  `apps/noter/src/components/VaultDashboard.tsx:1045`, and FileView Developer
  tools are rendered at `apps/noter/src/components/FileView/FileView.tsx:2753`.

One source conflict: `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`
describes pre-login allowlist enforcement, but the current code still has a
post-login approval gate. For this research, code is the source of truth.

## Recommendation

Add a small typed capability layer on top of the existing `users` row.

Do not introduce full RBAC tables yet. The current product question is not team
membership, role editing, delegated admin, or per-resource ACLs. It is a small
set of app-owned capabilities:

```ts
const userPermissionValidator = union(
  literal("machines.access"),
  literal("developerTools.view"),
  literal("fileView.access"),
  literal("fileOperations.use"),
);
type UserPermission = Infer<typeof userPermissionValidator>;
```

Store explicit grants on the existing user row:

```ts
users: defineTable({
  ...
  isApproved: optional(boolean()),
  permissionGrants: optional(array(userPermissionValidator)),
})
```

Then derive effective access in one backend module:

- Admin users, using the existing `isAdminUser` logic, receive every permission.
- `isApproved` continues to mean base app access only.
- `permissionGrants` opt a non-admin user into specific advanced surfaces.
- Missing `permissionGrants` means starter access, so no data migration or
  backfill is required for the schema change itself.

This gives us a clear path:

- Admin-only route: require `machines.access`.
- Dashboard/FileView Developer tools: show only with `developerTools.view`.
- FileView paths: require `fileView.access` before rendering the lazy editor
  stack and before serving the key FileView backend operations.
- Expensive GitHub-backed file operations: require `fileOperations.use` before
  downloading repository files, holding editable content in memory, or saving
  staged operations back to Convex/GitHub.

## Implementation Sketch

### 1. Backend Permission Model

Create `apps/noter/convex/permissions.ts`:

- Define the permission validator and derived `UserPermission` type.
- Define a deterministic permission order for returned lists.
- Add `readUserAccess(ctx, userId)` for query/mutation contexts. It should load
  the user row, optionally load the GitHub connection for the existing admin
  username fallback, and return `{ isApproved, isAdmin, permissions }`.
- Add `requireUserPermission(ctx, permission)` for queries and mutations.
- Add an internal query like `getUserAccessById` so actions can call
  `getAuthUserId(ctx)` first, then
  `ctx.runQuery(internal.permissions.getUserAccessById, { userId })`.

Actions cannot directly read `ctx.db`, so they need the internal-query shape. Do
not trust a client-supplied user id for public functions.

### 2. Frontend Permission Gate

Create a small route/content gate, either:

- Extend `AuthenticatedAppRoutePage` with `requiredPermission?: UserPermission`,
  or
- Add `PermissionGate` inside authenticated route components.

The gate should call one Convex query, return `null` while loading, and render a
not-found or unavailable route state when permission is missing. It must not
render children before the permission is known.

For `/machines` and `/machines/connect`, also lazy-load the page components so
non-admin users do not load the machine workspace bundle.

### 3. First Backend Enforcement Target

For the immediate admin-only machine routes, add `machines.access` checks to:

- `connectedMachines.listConnectedMachines`
- `connectedMachines.getMachineRegistrationRequestForBrowser`
- `connectedMachines.approveMachineRegistrationRequest`
- `connectedMachineControl.issueMachineControlToken`

For read-style functions that can reveal whether a request id exists, prefer
returning the existing not-found/sign-in style result over exposing "you are not
admin" details. For mutations that perform actions, throw `Unauthorized`.

The connector heartbeat/introspection path can remain credential-based in the
first slice, because registration and browser control are the human surfaces. If
permissions are later revocable at runtime, token introspection should also fail
closed when the owner no longer has `machines.access`.

### 4. Developer Tools And File Operations

Use the same permission query to hide:

- Dashboard `developerToolsSection`.
- FileView `FileViewDeveloperTools`.
- Sidebar machine links in `AppSidebarMetaSection`.

Keep "create new app" and similarly efficient onboarding/provisioning paths out
of this paid/advanced bucket. The product concern here is not generic compute;
it is specifically the expensive and abusable path where Noter downloads GitHub
file contents, keeps editable state around, and persists file operations.

Backend file operations should require `fileOperations.use`. The likely target
families are FileView file staging queries, mutations, and actions that fetch
repository file contents, persist staged blobs/content, or save file-operation
state. This can be rolled out after the machine route gate because it touches
more callsites.

### 5. FileView Paths

For a starter-focused rollout, guard `/vault/$` with `fileView.access` before
the lazy `FileView` element renders.

This should eventually be backed by server checks on the FileView-owned Convex
functions too. Route gating prevents accidental use and avoids loading the heavy
editor path, but direct Convex calls still need backend denial. Prioritize:

- file staging mutations and actions
- commit/PR actions
- operations that download GitHub file contents into editable state
- vault file/tree queries that are exclusive to FileView

If existing approved users should keep FileView while brand-new users do not,
grant `fileView.access` to current approved rows before turning the route gate
on. If only the operator should keep it initially, leave grants empty and rely
on implicit admin access.

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

## Phased Rollout

1. Add the schema field, permission validator/helpers, and frontend permission
   query. Keep behavior unchanged except admins resolving all permissions.
2. Gate `/machines` and `/machines/connect` with `machines.access`, lazy-load
   both pages, and protect the machine browser/control Convex functions.
3. Hide dashboard/FileView Developer tools for users without
   `developerTools.view`, then add `fileOperations.use` checks to expensive
   GitHub file download, staging, and save paths.
4. Decide the FileView default policy:
   - Admin-only first: no data migration.
   - Existing approved users keep access: backfill approved rows with
     `fileView.access`, then make new users starter-only.
5. Gate `/vault/$` and the FileView backend functions with `fileView.access`.
6. Revisit full RBAC only when Noter needs teams, org-owned vaults, delegated
   admins, or user-manageable roles.

## Validation Plan

- Unit tests for the permission resolver: admin by email, admin by GitHub
  username, approved starter, explicitly granted non-admin, duplicate grants,
  and stable returned order.
- Convex tests for machine functions: non-admin approved user is denied, admin
  is allowed, signed-out behavior stays compatible with current UI.
- Router/component tests: `/machines` and `/machines/connect` do not render
  their pages for unauthorized users, and the lazy page modules are not loaded
  before the gate passes.
- UI tests for hiding Developer tools in dashboard and FileView.
- FileView rollout tests once enabled: denied users do not load the editor route
  and cannot call representative file download/staging/save functions directly.
