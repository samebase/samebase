# WorkOS Authorization Model Research

Date: 2026-06-18

## Sources

- WorkOS FGA overview: https://workos.com/docs/fga
- WorkOS FGA quick start: https://workos.com/docs/fga/quick-start
- WorkOS FGA AuthKit integration: https://workos.com/docs/fga/authkit-integration
- WorkOS FGA access checks API: https://workos.com/docs/reference/fga/access-check
- WorkOS FGA role assignment API: https://workos.com/docs/reference/fga/role-assignment
- WorkOS RBAC integration: https://workos.com/docs/rbac/integration
- WorkOS RBAC configuration: https://workos.com/docs/rbac/configuration
- WorkOS AuthKit roles and permissions: https://workos.com/docs/authkit/roles-and-permissions
- WorkOS custom roles: https://workos.com/docs/rbac/custom-roles
- WorkOS permission API: https://workos.com/docs/reference/roles/permission

## What WorkOS Models

WorkOS has two related authorization layers:

1. RBAC for organization-level access. Users belong to organizations through organization
   memberships. Each membership has one or more roles, and roles bundle permissions. AuthKit can put
   organization-scoped roles and permissions directly in the session token, so app code can do cheap
   org-wide permission checks without an API call.
2. FGA for resource-level access. Resource types describe the product hierarchy, resources are
   instances in that hierarchy, and role assignments connect an organization membership to a role on
   a specific resource. Permissions can be inherited from parent resources to descendants.

The docs consistently treat permissions as the checkable atoms and roles as assignment/bundling
objects:

- Permissions are individual access rights with unique slugs.
- Roles bundle permissions.
- Multiple roles, when enabled, grant the union of their permissions.
- Custom roles are organization-scoped role bundles for customers that need different permission
  sets without changing other organizations.
- IdP role assignment maps customer identity-provider groups to roles; SCIM/Directory Sync is the
  real-time path, while SSO group changes generally apply on the next authentication.

For FGA, the check API answers whether an organization membership has a permission on a resource. It
considers direct assignments, permissions inherited from parent resources, and organization-level
roles. WorkOS also exposes discovery APIs for "which resources can this membership access?", "who
can access this resource?", and "which effective permissions does this membership have here?".

## Fit With Noter

The current Noter direction matches WorkOS' shape:

- `access_*` maps to the permission/capability layer. It should stay the app's authorization atom.
- `role_*` maps to role bundles. It is useful for default grants, IdP/group mapping, audit, and
  admin surfaces, but it should not be the ordinary UI decision input.
- `users.currentViewerAccess` is analogous to reading effective org-wide permissions from an AuthKit
  session token. The route URL editor should check that list, not a role literal or boolean such as
  `isAdmin`.
- Per-vault ownership remains the second dimension today. If it becomes customer-managed sharing, it
  looks more like WorkOS FGA than like more global `access_*` keys.

The main mismatch is subject and resource shape. WorkOS FGA role assignments are scoped to
organization memberships, not bare user IDs. Noter currently has mostly personal user-owned vaults,
so an adoption path needs an explicit organization model, an org-per-person model, or a clear
mapping from Noter account/workspace to WorkOS organization membership before FGA can become the
source of truth.

Convex also matters. Noter's hot authorization boundary is inside Convex queries and mutations via
the app-owned function wrappers. Resource-level WorkOS FGA checks are external API calls, which do
not fit directly inside every query/mutation path. Viable shapes are:

1. Use AuthKit/JWT org-wide permissions for coarse `access_*` checks in Convex.
2. Mirror WorkOS resource assignments into Convex via webhooks/events and use Convex-local reads for
   query/mutation authorization.
3. For action/HTTP-only flows, call WorkOS FGA at the boundary, then call internal Convex functions
   after authorization passes.

Option 2 is the most likely fit for file/vault reads if those become WorkOS-managed, because route
and file queries need authorization checks on the critical read path.

## Recommended Noter Posture

Keep `access_*` as the product authorization vocabulary and treat `role_*` as a bundle source. This
is compatible with WorkOS because WorkOS itself exposes effective permissions in sessions for
org-wide checks and uses roles to assign those permissions.

Do not add `users.currentViewerRole` for route/search UI. The stable query should be
`users.currentViewerAccess`. If role exposure is needed later, scope it to admin, role management,
or audit surfaces.

Do not rename current route keys to WorkOS-style `{resource_type}:{action}` slugs yet. WorkOS
recommends that pattern for FGA resource permissions, but Noter's current `access_*` values are
coarse product capabilities. If WorkOS FGA is adopted, add an explicit mapping such as
`access_files_read -> vault:read` or split the route-level capability from resource-level permission
only after the resource model is chosen.

Before adopting WorkOS FGA, answer these design questions:

1. What is the WorkOS organization for a personal Noter user?
2. Which Noter entities become FGA resources: vault, repository, branch, machine, or app?
3. Which checks must be local Convex reads for latency/subscription correctness?
4. How do staff/operator powers sit outside customer organizations?
5. Which WorkOS events must be mirrored to Convex to keep revocation fast enough?

## Immediate Impact On RFC 085

The WorkOS research supports the access-first decision:

- Keep roles as coarse default bundles.
- Project effective access keys into UI-facing APIs.
- Defer per-resource FGA until Noter has a tenant/resource model that can be represented as WorkOS
  organizations, organization memberships, and authorization resources.
