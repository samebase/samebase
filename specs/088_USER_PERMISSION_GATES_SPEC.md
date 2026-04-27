# User Permission Gates Spec

## Document Control

- Status: Accepted
- Owner: Noter app auth and product surfaces
- Last updated: 2026-04-27
- Related files:
  - `apps/noter/shared/userPermissions.ts`
  - `apps/noter/convex/permissionsModel.ts`
  - `apps/noter/convex/permissions.ts`
  - `apps/noter/convex/schema.ts`
  - `apps/noter/src/components/PermissionGate.tsx`
  - `apps/noter/src/components/AuthenticatedAppRoutePage.tsx`
  - `research/2026-04-27-permission-system-research.md`

## Summary

Noter uses explicit user permissions for advanced app surfaces on top of the
existing approved-user gate. The permission model is deliberately small and
surface-named.

## Permissions

```ts
type UserPermission =
  | "dashboard.monitoring.view"
  | "fileView.access"
  | "developerTools.view"
  | "machines.access";
```

## Access Rules

- `users.isApproved` or admin identity grants base app access.
- Admin users receive every permission implicitly.
- Non-admin users only receive explicit `users.permissionGrants` after base app
  access is active.
- Missing `permissionGrants` means no advanced permissions.
- UI gates are not authorization boundaries. Every protected surface also needs
  a Convex-side permission check.
- Denied app routes render a not-found state rather than explaining the
  permission boundary.

## Surface Contracts

### Dashboard Monitoring

`dashboard.monitoring.view` gates the dashboard's project/vault monitoring
surface: vault list, branch filters, branch summaries, PR links, Cloudflare
preview hydration, and dashboard-triggered tree refresh.

The add/create app flow remains a base approved-user surface. It may use a
lightweight connected-repository-name query, but it must not depend on the full
dashboard vault query.

### FileView

`fileView.access` gates `/vault/$` routes and FileView backend operations:
repository file/media reads, staging reads and writes, uploads, commits, draft
PRs, compare previews, and rebase/conflict previews.

### Developer Tools

`developerTools.view` only controls Developer tools visibility and matching
developer-tool backend reads. It does not imply dashboard monitoring, FileView,
or machines access.

### Machines

`machines.access` gates `/machines`, `/machines/connect`, human-facing machine
registration functions, connected machine list reads, and browser control token
issuance.

## Implementation Contract

- Permission keys live in one shared ordered list.
- Convex validators, frontend route props, and UI helpers derive from that list.
- Queries and mutations use direct permission helpers.
- Actions use `getAuthUserId(ctx)` plus an internal access query before doing
  protected work.
- Route components lazy-load gated heavy pages only inside the permission gate.

## Validation

- Permission resolver tests cover admin access, explicit grants, duplicate grant
  ordering, and unapproved non-admin behavior.
- Route/component tests cover required route metadata and not-found rendering.
- `convex codegen` and TypeScript must pass after permission schema changes.
