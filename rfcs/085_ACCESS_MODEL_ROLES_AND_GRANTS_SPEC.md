# Access Model: Access Keys, Role Bundles, and Grants (Member MVP)

## Document Control

- Status: Proposed
- Owner: Noter platform
- Date: 2026-06-12
- Last updated: 2026-06-19
- Related specs:
  - `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
  - `rfcs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `rfcs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md`
  - `rfcs/062_MCP_DUAL_ORIGIN_CONSENT_LOGIN_REDIRECT_SPEC.md`
  - `rfcs/063_MCP_PREACCOUNT_ONBOARDING_FLOW_SPEC.md`
  - `research/2026-06-18-workos-authorization-model.md`
  - `docs/code-guardrails.md`

## Summary

Replace the two-value route permission union (`"public" | "admin"`) with an access-first model that
prepares the app for external users:

1. **Access keys** (the checkable primitive; what a route, search param, query, mutation, action, or
   MCP grant demands):
   `access_public | access_user_preferences | access_dashboard | access_provider_connections | access_repo_connect | access_app_create | access_app_refresh | access_files_read | access_files_write | access_machines | access_mcp | access_admin`.
2. **Viewer role bundles** (coarse default grant sources):
   `role_anonymous | role_waitlisted | role_member | role_staff`.
3. **Grants** (which bundles satisfy which keys): one table, additive-only. Backend code resolves a
   role bundle into an effective access-key set before enforcement; frontend and other UI consumers
   receive that projected set and check keys directly.

The two sides deliberately use different prefixed vocabularies so role strings and requirement
strings can never be confused in code, logs, or stored documents, and so the access-key set can grow
(more product areas, finer keys) without inventing new roles.

Access keys are the durable authorization vocabulary. Roles are not equal peers in the product
model; they are a convenient way to assemble default access bundles until Noter needs customer
custom roles, per-user overrides, or delegated resource-specific grants. Code outside role
resolution, role management, audit, or admin/debug surfaces should prefer `access_*` checks.

Member MVP: `role_member` holds `access_public`, `access_user_preferences`, `access_dashboard`,
`access_provider_connections`, `access_repo_connect`, `access_app_refresh`, `access_files_read`, and
`access_files_write`. Members can sign in, persist signed-in app-shell preferences, connect provider
accounts, connect/import their own repositories, monitor/resync app state, and use owned file
surfaces behind per-vault ownership checks. New managed app provisioning, machines, MCP, and admin
surfaces stay staff-only until deliberately opened. Enabling more later is a grant edit plus
route/function reclassification, not a redesign.

This RFC also closes the approval enforcement gap that existed before the backend wrapper rollout:
`users.isApproved` was enforced only by the client-side `ApprovalGate`, so backend enforcement
became structural via access-key function wrappers.

## Goals

1. One shared vocabulary and one access-key check shape for routes, search params, every exported
   public Convex function, and MCP grants. Role-to-access projection happens at the boundary; the
   resulting checks ask whether a viewer has the required `access_*` key.
2. Server-side enforcement that fails closed and cannot be forgotten per function: public Convex
   queries, mutations, and actions must be wrapped with an explicit access key.
3. Member MVP limited to safe account/repo/app-status capabilities, with the path to app creation,
   files, machines, and MCP being grant edits plus targeted reclassification, not a redesign.
4. Keep billing (plan/add-ons) an orthogonal axis: access keys gate who may call; plan gates what
   paid features do (the existing Pro gate on app creation stays).
5. Keep MCP delegation compatible: existing MCP scopes become a delegated subset of the user's own
   access, with a Cloudflare-style checkbox consent planned in a follow-up spec.

## Non-Goals

1. Per-vault sharing / multi-user vaults (future; per-resource ownership checks remain the second
   authorization dimension and are untouched).
2. A persisted `users.role` field or admin UI for role management (staff stays the hardcoded
   `ADMIN_EMAILS` list in `apps/noter/convex/userAccess.ts` until a second staff member exists).
3. Per-resource `resource:action` permission keys for the web app. The key set is product
   capabilities, not individual vault IDs, branch IDs, or OAuth scopes.
4. The MCP checkbox-consent implementation itself (Phase 4 outline here; details in its own spec).

## Current State (verified)

- Previous route permissions used `NoterRoutePermission = "public" | "admin"`. This branch's
  frontend work replaces route and search-param metadata with `access: AccessKey`. The URL editor
  reads `users.currentViewerAccess` and filters route/search suggestions plus path readiness against
  the effective `accessKeys` list. It no longer adapts `isCurrentUserAdmin` into a synthetic
  frontend role, and route UI does not consume `users.currentViewerRole` for authorization.
- `RouteAccessOutlet` enforces matched route `access` metadata in the root app shell and removes
  direct-URL search params whose metadata requires an access key the current viewer does not hold.
  Per-page `AuthenticatedAppRoutePage` → `<Authenticated>` + `ApprovalGate` remains in place during
  the shell migration (`apps/noter/src/components/ApprovalGate.tsx:8`).
- Backend enforcement for exported public queries, mutations, and actions now goes through the
  app-owned builders in `apps/noter/convex/functions.ts`. Public handlers use `ctx.viewer.userId`
  instead of a per-handler auth preamble; remaining direct `getAuthUserId` calls live at wrapper,
  HTTP, OAuth, and internal boundaries where the access facade is not the caller surface. Admin is
  still defined once (`isAdminUser`, `apps/noter/convex/userAccess.ts`), and public admin-only
  surfaces declare `access_admin`.
- `users.isApproved` (`apps/noter/convex/schema.ts:288`) feeds backend viewer-role resolution.
  `users.currentViewerAccess` returns the derived role plus access keys, so `ApprovalGate` can
  render `role_waitlisted` directly while route authorization still checks access keys.
  `devAuth.ts:210-211` seeds `isApproved: true` for local/preview accounts.
- `waitlist.joinWaitlist` (`apps/noter/convex/waitlist.ts:18-39`) exists but has zero frontend
  callers; `ApprovalGate` renders static copy.
- `/vault/$` (`apps/noter/src/routes/vault-file.tsx:29-36`) always renders `FileView` (file
  surface); the vault dashboard is `/home` → `DashboardRoutePage` → `VaultDashboard`. Route-level
  keys can therefore separate dashboard from files; real file authorization stays in Convex
  functions.
- MCP already has a requirement vocabulary:
  `MCP_V1_SUPPORTED_SCOPES = ["vaults.read", "files.read", "files.write", "commits.propose", "prod.read.propose"]`
  (`apps/noter/convex/mcp/protocol.ts:18-24`), enforced per tool via `hasAllScopes`
  (`apps/noter/convex/toolRuntime/policy.ts:30-36`) and via tool-list filtering
  (`apps/noter/convex/mcp/http.ts:676-685`). Consent is all-or-nothing
  (`apps/noter/src/components/McpConsentRoutePage.tsx:89-145`); grants/tokens store one flat scope
  string (`schema.ts:889`, `schema.ts:910`). No scope is intersected with the user's own access.
- Build-time: `dev/publicPrerenderPages.ts:40` now filters `access === "access_public"`.

## Design

### Vocabulary and shared module

One module defines both unions, the grants table, and the decision function; frontend and Convex
import the same file (Convex bundles imports from outside `convex/`):

The shared access model is the only runtime source of truth for role and access-key literals. Convex
validators derive from these arrays instead of restating them.

```ts
export const VIEWER_ROLES = [
  "role_anonymous",
  "role_waitlisted",
  "role_member",
  "role_staff",
] as const;
export type ViewerRole = (typeof VIEWER_ROLES)[number];

export const ACCESS_KEYS = [
  "access_public",
  "access_user_preferences",
  "access_dashboard",
  "access_provider_connections",
  "access_repo_connect",
  "access_app_create",
  "access_app_refresh",
  "access_files_read",
  "access_files_write",
  "access_machines",
  "access_mcp",
  "access_admin",
] as const;
export type AccessKey = (typeof ACCESS_KEYS)[number];

/**
For each viewer role, the access keys it satisfies. Additive-only; staff holds
every key, so new keys are staff-reachable the moment they exist.
*/
export const ROLE_ACCESS_GRANTS: Record<ViewerRole, readonly AccessKey[]> = {
  role_anonymous: ["access_public"],
  role_waitlisted: ["access_public", "access_user_preferences"],
  role_member: [
    "access_public",
    "access_user_preferences",
    "access_dashboard",
    "access_provider_connections",
    "access_repo_connect",
    "access_app_refresh",
    "access_files_read",
    "access_files_write",
  ],
  role_staff: [...ACCESS_KEYS],
};

export function readAccessKeysForRole(role: ViewerRole): readonly AccessKey[] {
  return ROLE_ACCESS_GRANTS[role];
}

export function canAccess(required: AccessKey, accessKeys: readonly AccessKey[]): boolean {
  return accessKeys.includes(required);
}
```

Naming rules locked in by this RFC:

- Role strings (`role_*`) and access keys (`access_*`) are disjoint literal types; neither side ever
  reuses the other's words ("public" is a requirement, "anonymous" is a role — nobody "is" public).
- Application authorization checks consume access keys. Do not pass `role_*` values through UI
  components or app-level affordance helpers unless the code is explicitly rendering role
  management, role audit, or an admin/debug explanation.
- OAuth still calls delegated permissions `scope` at the protocol boundary, but Noter-owned MCP
  scope values use the same `AccessKey` literals. `plan`/`feature` stay reserved for billing.
- `role_anonymous` is reserved for signed-out viewers. Authenticated users whose account exists but
  is not approved resolve to `role_waitlisted`: they hold `access_public` plus
  `access_user_preferences`, and UI surfaces that need account state can render the waitlist branch
  without inferring it from an access-key set.

Capability split locked in by this RFC:

| Access key                    | Product capability                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `access_public`               | Public routes and unauthenticated-friendly helpers.                                                                                    |
| `access_user_preferences`     | Signed-in public app-shell preferences, such as workspace sidebar pane and geometry state.                                             |
| `access_dashboard`            | Signed-in app shell, own app/vault lists, billing status, and low-risk dashboard reads.                                                |
| `access_provider_connections` | Connect, list, refresh, and remove provider credentials or OAuth/API-key connections for the current viewer.                           |
| `access_repo_connect`         | Import/link an existing repository into Noter using the viewer's provider connection.                                                  |
| `access_app_create`           | Provision new Noter-managed app infrastructure or external provider resources. Billing still gates paid execution after access passes. |
| `access_app_refresh`          | Reload/resync app, repository, branch, deployment, and provider-status metadata.                                                       |
| `access_files_read`           | Read file trees, file contents, diffs, staged-change summaries, and review data.                                                       |
| `access_files_write`          | Edit files, stage changes, upload/delete/rename, commit, open PRs, or run AI/file-compute workflows.                                   |
| `access_machines`             | Connected-machine, local-machine, codespace executor, and machine-control flows.                                                       |
| `access_mcp`                  | MCP OAuth consent and MCP-facing tool entry points.                                                                                    |
| `access_admin`                | Internal operator, debug, research, prod-read, test, and unreleased surfaces.                                                          |

Route-level access should gate the shell a user can enter. Button-level affordances and backend
functions still use the more specific key. For example, `/connect-repo` can render for a member who
has `access_repo_connect`, while `/new-app` and the "create managed app" mutation require
`access_app_create`.

### Role resolution and access projection (server-side)

- `role_staff`: `isAdminUser(email)` — hardcoded staff emails (`apps/noter/convex/userAccess.ts`),
  centralized into one `getViewerRole(ctx)` helper.
- `role_member`: authenticated and `users.isApproved === true`.
- `role_waitlisted`: authenticated, user row exists, and `users.isApproved !== true`.
- `role_anonymous`: signed out.

The public authorization query is `users.currentViewerAccess`, returning `{ role, accessKeys }`. It
projects the resolved server-side role bundle into the effective access list and replaces boolean
access queries. Route authorization consumers must check `accessKeys`; UI surfaces that need to
explain account state may read `role`. `users.isCurrentUserAdmin` and `users.isCurrentUserApproved`
have been deleted. `users.currentViewerRole` exists for role visibility, but it is not the route/UI
authorization contract; keep role consumers scoped to role management, audit, display, or
admin/debug explanation surfaces.

### Auth allowlist compatibility

`specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md` now records the revised approval boundary:
Noter may keep authenticated waitlisted accounts, but those accounts resolve to `role_waitlisted`
and project only `access_public` plus `access_user_preferences`. Approving the account is a data
change to `users.isApproved`, which changes the derived role to `role_member`.

### Backend enforcement: app function wrappers

New module `apps/noter/convex/functions.ts` exports app-owned `query`, `mutation`, and `action`
builders. Every exported public Convex query, mutation, and action must use these builders and
declare exactly one policy object. The policy contains the access key and can absorb future standard
app-level controls without stacking multiple nested wrappers. The access key is part of the
definition and greppable:

```ts
export const enqueueManualRepositoryRefresh = mutation({
  access: "access_app_refresh",
  args: { vaultId: v.id("vaults") },
  returns: vEnqueueRepositoryRefreshResult,
  handler: async (ctx, args) => {
    /* unchanged body; ownership filters stay */
  },
});
```

- The wrapper resolves the viewer role once (users doc + GitHub connection lookup; actions resolve
  via one internal query since they lack `ctx.db`), projects that role into `accessKeys`, throws a
  uniform "Access denied" when the required key is absent, and passes a typed `ctx.viewer` to the
  handler so most bodies drop their own auth preamble.
- Rate limiting is intentionally not active in Phase 1. The `@convex-dev/rate-limiter` research
  showed it can fit inside these custom builders later, but this rollout keeps business function
  declarations focused on `access` only.
- `access_public` functions skip no code path — `role_anonymous` and `role_waitlisted` project to
  `access_public`, so unauthenticated-friendly functions (Convex Auth helpers, `users.viewer`,
  `users.getViewerAuthProviders`, `users.currentViewerAccess`, `waitlist.joinWaitlist`,
  `workspaceSidebarState.getWorkspaceSidebarState`, and
  `deploymentProfile.getPublicDeploymentAuthPolicy`) keep their graceful null/false returns.
- `access_user_preferences` covers signed-in app-shell preference writes that must work before
  approval but must not create anonymous database rows.
  `workspaceSidebarState.setWorkspaceSidebarState` uses this key so waitlisted users can leave the
  right sidebar on public routes.
- Enforcement becomes structural once the migration lint lands: the repo-local Oxlint rule
  `noter/no-raw-public-convex-function-builders` bans `query`/`mutation`/`action` imports from
  `_generated/server`. `convex/functions.ts` carries the required file-local disable because it is
  the adapter boundary; the rule does not encode permanent exemptions. Choosing `access_public`
  becomes the loud, deliberate act; forgetting a gate becomes impossible. This flips today's
  fail-open default (any authenticated user) to fail-closed.
- Migration starts conservative: any exported public function whose correct capability is unclear
  becomes `access_admin` first, then moves to the narrower capability in follow-up commits backed by
  route/function evidence. Raw `query`/`mutation`/`action` exports are not an allowed "temporary"
  state.
- Per-resource ownership checks (`vault.userId !== userId` and friends) are the second dimension and
  remain inside handlers, with their current semantics (e.g. `listStagedFiles` returning `[]` for
  non-owners post-v1484 stays as-is).
- The 4 inline `isAdminUser` sites become `access_admin` wrappers; the Pro-billing fallback inside
  `validateCreateAppConnections` is **not** an access check and stays exactly where it is (billing
  axis, see below).

Function-area assignment is represented directly by each public function's `access` field. The
temporary generated inventory and hand-maintained assignment map were deleted before merge so the
wrapper policy remains the only source of truth. The broad assignment rules are:

- `access_provider_connections` for GitHub/Convex/Cloudflare OAuth and API-key connection functions.
- `access_repo_connect` for importing or linking an existing GitHub repository into Noter.
- `access_app_create` for Noter-managed provisioning and provider-resource creation.
- `access_app_refresh` for repository/app/deployment resync and metadata reloads.
- `access_files_read` / `access_files_write` for file surfaces, split by read/write or compute
  behavior.
- `access_admin` for anything unreleased, operator-only, or unclear.

`apps/noter/convex/functions.ts` is the implemented facade for this API shape. It uses
`convex-helpers/server/customFunctions`, and `apps/noter/convex/functions.test.ts` proves:

- Missing `access` fails typecheck.
- Unknown access keys fail typecheck.
- The phase 1 grant matrix stays aligned with the member/staff split.
- Mutation/action handlers receive typed `ctx.viewer` while preserving normal Convex args and return
  validators.

The route/function migration is complete for exported public query/mutation/action functions in the
app Convex tree. Convex Auth generated helpers remain public outside the app facade and are treated
as `access_public`.

The rate-limit research also exposed one implementation constraint: `customFunctions` policy input
receives the static function policy, not the handler's validated args. That is fine for future
viewer/global limits. If a future limit key must derive from ordinary function args, call a focused
rate-limit helper inside the handler after access has passed.

### Convex component research

The closest existing Convex component pattern is `@convex-dev/rate-limiter`:

- It is an application-layer policy component: callers install it with `app.use(...)`, create a
  typed policy object in app code, and call named policies from Convex functions.
- Its useful lessons for access are type-safe policy names, explicit call-site enforcement,
  transactional behavior when used from mutations, and fail-closed defaults.
- Its component shape is useful because rate limiting owns persistent counters, sharding, and
  reservation state in isolated component tables.

Access control should not start as a Convex component in this rollout. Role resolution needs Noter's
app-owned auth, `users`, provider-connection, approval, and staff-list logic. Convex component
functions are isolated behind a component boundary; client-facing access still needs app wrappers
that resolve auth and pass explicit data into the component. Until access owns reusable persistent
state, a shared TypeScript access model plus app-level Convex wrappers is the smaller and more
honest abstraction.

A future component becomes worth considering only if access grows reusable persistent state such as
grant audit logs, per-user override tables, entitlement caches, or cross-app policy management. Even
then, public Noter functions would keep app wrappers as the enforcement boundary.

### WorkOS alignment

WorkOS' current RBAC/FGA model validates the access-first split. WorkOS AuthKit embeds
organization-scoped permissions in session tokens for cheap app checks, while WorkOS FGA uses roles
as assignment bundles on organization memberships and resources. That means Noter's
`users.currentViewerAccess` shape is closer to WorkOS' session-permissions surface than a role-only
authorization API would be.

If Noter adopts WorkOS later, `access_*` remains the app capability vocabulary. Role bundles can map
to WorkOS environment roles, custom roles, or IdP group role assignments. Per-vault or per-resource
sharing should become a separate resource-scoped permission layer only after Noter has an explicit
organization/resource model to map to WorkOS organization memberships and authorization resources.
Do not rename the current coarse route keys to WorkOS-style `resource:action` slugs until that
resource model exists; add a mapping or split the coarse route capability from resource permission
in that adoption spec.

For naming, keep `access_*` for Noter's coarse app capability layer. It describes whether a viewer
can enter a product surface or call a broad function family. Reserve `permission` for either
provider/vendor vocabulary or a future resource-scoped layer with explicit subjects, resources, and
actions. If WorkOS FGA becomes the source of truth later, introduce a mapping boundary such as
`access_files_read -> vault:read` or split the model into `access_*` app capabilities plus
resource-scoped permission slugs. Do not rename the current `AccessKey` type to `PermissionKey`
until the resource model exists; that would make broad route capabilities look more precise than
they are.

### Frontend: route metadata, runtime gate, suggestions

- `NoterRoutePermission` is replaced by `AccessKey`; the staticData field renames `permission` →
  `access` across the 29 route files and `routeAccessMetadata.ts` (mechanical; the field name now
  reads as a requirement).
- Search-param metadata uses the same `access: AccessKey` field. Some access keys do not make sense
  for a particular frontend surface, but the union is intentionally shared rather than mirrored.
  Route-owned schemas derive both editor suggestions and complete `searchParamAccess` lists from the
  same metadata so hidden/manual params keep access cleanup without being suggested.
- Viewer model `{ isAdmin: boolean }` is replaced by `{ role, accessKeys }` from
  `users.currentViewerAccess`; `canAccessNoterRoutePermission` becomes
  `canAccessNoterRouteAccess(access, viewer)`. Frontend route/search decisions do not need the
  viewer's role literal after the access list has been projected.
- New runtime gate: a `RouteAccessOutlet` in the root route (mirroring `RouteAvailabilityOutlet`)
  reads the matched route's `staticData.access` and the reactive viewer access list. `access_public`
  renders immediately (prerendered pages never wait on the query); anything else renders the auth
  redirect / waitlist screen for a signed-out or waitlisted viewer and `notFound` for an
  authenticated approved viewer lacking the key (consistent with availability handling). This
  subsumes per-page `AuthenticatedAppRoutePage` placement over time. Public routes still skip the
  viewer access query unless the current URL contains a known non-public search param. Once viewer
  access loads, the shell uses root search access plus matched route `searchParamAccess` to replace
  the URL with unauthorized params removed before rendering the route outlet.
- Suggestion plumbing: the `=== "admin"` / `=== "public"` equality filters at
  `rootRouteSearch.ts:164-170` become access-list checks
  (`canAccessNoterRouteAccess(suggestion.access, viewer)`), removing the silent-drop hazard. Test
  fixtures `adminViewer`/`publicViewer` become `staffViewer`/`memberViewer`/`anonymousViewer`.
- Prerender: `publicPrerenderPages.ts` filter becomes `access === "access_public"`; behavior for
  non-public keys is unchanged (not prerendered).

### Route assignments (MVP)

| Access key            | Routes                                                                                                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access_public`       | `/`, `/logo`, `/oauth/mcp/consent` (hidden from route path suggestions), `/privacy`, `/terms`, `/visual-fixture` (local-only)                                                                                                                                                                                         |
| `access_dashboard`    | `/home`, `/pricing`                                                                                                                                                                                                                                                                                                   |
| `access_repo_connect` | `/connect-repo` shell for importing/linking an existing repository; specific provider buttons also depend on `access_provider_connections`                                                                                                                                                                            |
| `access_app_create`   | `/new-app` managed app creation shell; managed provisioning actions also keep backend `access_app_create` checks                                                                                                                                                                                                      |
| `access_files_read`   | `/vault/$` read shell                                                                                                                                                                                                                                                                                                 |
| `access_files_write`  | File edit/staging/commit actions inside `/vault/$`; no separate route required at MVP                                                                                                                                                                                                                                 |
| `access_machines`     | `/machines`, `/machines/connect`                                                                                                                                                                                                                                                                                      |
| `access_mcp`          | MCP-facing backend entry points and token-granted tool scopes; the consent URL itself is a public OAuth entrypoint so signed-out users can keep the request ID through sign-in                                                                                                                                        |
| `access_admin`        | `/pitch`, `/pitch/print`, `/pitch/print/mobile`, `/landing-preview`, `/research/codex-app-server`, `/research/codex-app-server/browser`, `/test`, `/indexDB`, `/localStorage`, `/logo/iso`, `/logo/raster`, `/logo/raster-seams`, `/logo/single-cube`, `/logo/svg`, `/logo/transition`, `/logo/transition/transforms` |

With MVP grants, members reach public, dashboard, provider-connection, repo-connect, app-refresh,
file-read, and file-write capabilities; staff reach everything. The ~40 admin-marked search params
reclassify alongside their routes: dashboard/billing params (`delete`, `checkout`) →
`access_dashboard`; provider-connection params (`add-cloudflare`, `add-convex`) →
`access_provider_connections`; repo/app setup params (`add-app-root`, `app-root`, `new-app`) →
`access_repo_connect` unless the triggered backend action is managed provisioning, which requires
`access_app_create`; file-view params (`compare`, `diff`, `review`, `mobileLineNumbers`) →
`access_files_read`; file edit/staging params → `access_files_write`; machine params →
`access_machines`; MCP OAuth entry params (`mcp_consent_request`, `mcp_login_required`) → hidden
`access_public`; public presentation toggles such as logo/landing `dev`, `prod-ui`, and devtools
visibility remain `access_public`; operator-only debug params and landing-preview params →
`access_admin`.

### Billing stays orthogonal

- Access keys gate reachability; plan gates paid capability. `createRepository` (Noter-managed
  provisioning) keeps the existing gate: staff bypass, everyone else needs
  `billingPlan === "pro" && billingStatus === "active"`
  (`appProvisioningWorkflowActions.ts:273-280`) after passing `access_app_create`. Members on the
  free plan can still `connectRepository` (BYO infra — verified unbilled and ungated today) after
  passing `access_repo_connect`.
- The target billing posture is member-facing `access_dashboard`, but this migration keeps
  `billing.getViewerBillingStatus`, `billing.createPolarCheckoutSession`,
  `billing.createPolarCustomerPortalSession`, and `billing.syncViewerBillingFromPolar` under
  `access_admin` until the Polar rollout is ready. `/pricing` route metadata remains
  `access_dashboard`; lowering the billing functions is the explicit enablement step.
- No `pro` role and no `access_pro` key — plan checks never enter the GRANTS table.

### MCP direction (Phase 4, own spec)

MCP uses the same `AccessKey` vocabulary for Noter-owned grants. OAuth request/response fields still
spell this as `scope`, but the scope values are access-key literals such as `access_files_read`, not
a second `files.read` vocabulary. Existing MCP v1 scope strings become compatibility aliases during
migration:

| Legacy MCP scope                 | Access-key scope     |
| -------------------------------- | -------------------- |
| `vaults.read`                    | `access_dashboard`   |
| `files.read`                     | `access_files_read`  |
| `files.write`, `commits.propose` | `access_files_write` |
| `prod.read.propose`              | `access_admin`       |

Constraints this RFC locks in so Phases 1–3 do not paint MCP into a corner:

1. An MCP grant may never exceed the granting user's own access: consent renders only access-key
   scopes the user holds, and every MCP request re-intersects the token's scopes with the user's
   **current** keys (revoking a member's `access_files_write` instantly cuts off write-capable
   agents).
2. Consent becomes checkbox-per-scope with partial grants (`granted ⊆ requested`), following the
   Cloudflare consent page / `workers-oauth-provider` pattern and the MCP 2025-11-25 draft's scope
   selection + `insufficient_scope` step-up flow. The flat `scope` strings on
   `mcpAuthRequests`/`mcpAuthorizationCodes`/`mcpGrants`/`mcpAccessTokens` already encode a granted
   subset; grant matching moves from string equality to subset logic.
3. `scopes_supported` advertises the minimal useful access-key scope set (excludes `access_admin`)
   so generic clients that request everything do not ask for staff powers by default.
4. The `/oauth/mcp/consent` route stays publicly reachable as an OAuth entrypoint so unauthenticated
   users can see the MCP-specific sign-in surface and keep the request ID through login. The consent
   actions, request reads, and MCP tool scopes stay gated by `access_mcp` and the user's current
   access keys.

## Rollout Phases

Each phase is independently shippable; commits split per concern (backend model, UI wiring,
spec/test updates).

**Phase 1 — vocabulary + backend enforcement (closes the approval gap).** Shared access module;
app-owned `query`/`mutation`/`action`; lint rule; migrate every exported public query, mutation, and
action onto an explicit access key. Authenticated-but-unapproved callers resolve to
`role_waitlisted` and lose access to everything beyond public reads and signed-in shell preferences
— that is the point. Sub-split by area for review: auth/public → dashboard → provider connections →
repo connect/app create/app refresh → files read/write → machines → admin/chat → mixed. Anything
unclear starts as `access_admin`. Convex tests gain role fixtures (`t.withIdentity` + seeded
approved/unapproved users); state-axis enumeration test for `ROLE_ACCESS_GRANTS` (e.g. "every key a
member holds, staff holds").

**Phase 2 — frontend runtime gate.** The metadata field rename (`permission` → `access`),
search-param classification, URL-editor `currentViewerAccess` wiring, `RouteAccessOutlet`, and
direct-URL search-param cleanup started in this spike. The remaining frontend work is deletion of
the remaining boolean access queries after their callers move to access keys, and screenshot updates
where shipped UI changes (waitlist/404 paths).

**Phase 3 — member enablement.** Wire the waitlist join form to `waitlist.joinWaitlist` (today it
has zero callers — required for real onboarding). The accepted signup boundary is authenticated
waitlist accounts: unapproved sign-ins may create or reuse a user row, resolve to `role_waitlisted`,
and stay limited to public access until `users.isApproved` becomes true. Verify the member journey
end to end after approval (sign in → `/home` → connect provider → connect/import repo →
refresh/monitor; managed app creation still requires `access_app_create` plus the Pro gate). No code
beyond the join form and chosen signup boundary — membership is data.

**Phase 4 — MCP scoped consent (separate spec).** Checkbox consent with partial access-key grants,
live intersection on every request, step-up via `insufficient_scope`, grant management/editing on a
settings page.

## Risks

1. **Waitlisted-user regressions (Phase 1).** Some `getAuthUserId` call sites intentionally serve
   unauthenticated/waitlisted viewers. Mitigation: the explicit `access_public` function list above,
   plus `access_user_preferences` for signed-in preference writes; convex tests assert each intended
   waitlisted surface stays reachable.
2. **`isApproved` is optional in schema.** `undefined` must read as not-approved (truthiness check,
   per guardrails); no backfill needed because the check fails closed.
3. **Wrapper migration drift.** Public Convex functions span many files; the lint rule lands in the
   same PR as the wrapper module so unmigrated raw builders fail CI from day one. The wrapper
   `access` field is the source of truth; no permanent parallel manifest is maintained.
4. **Action wrappers add one internal query round-trip** for role resolution. Acceptable: actions
   are already provider-bound; queries/mutations resolve the role with two indexed reads.
5. **Setup route split drift.** Repo import lives at `/connect-repo`, while managed app creation
   lives at `/new-app`. Mitigation: keep route metadata aligned with the split
   (`access_repo_connect` vs. `access_app_create`) and enforce the same keys in backend actions.
6. **Per-page `AuthenticatedAppRoutePage` overlap with `RouteAccessOutlet`** during Phase 2: keep
   both briefly, delete the per-page wrapper as routes are confirmed gated (delete-first; no
   long-lived dual system).
7. **MCP consent route discovery.** The consent URL is public for OAuth entry, but it is hidden from
   route-path suggestions. Protected request reads/actions remain behind `access_mcp`, so public
   reachability does not grant MCP capability.

## Resolved Decisions

1. Access keys are the operational primitive. Role strings are coarse bundle sources, not a second
   authorization axis for ordinary app checks.
2. Subject and requirement sides use disjoint prefixed vocabularies (`role_*` / `access_*`).
3. "Member" = authenticated + approved. Authenticated unapproved users resolve to `role_waitlisted`,
   which projects only `access_public` plus `access_user_preferences`.
4. Staff determination stays the hardcoded email list; no persisted role field in this rollout.
5. Authorization consumers use `users.currentViewerAccess.accessKeys` and check `access_*` keys.
   Role consumers may use the access query's `role` or `users.currentViewerRole` only for role
   visibility, not permission decisions. `users.isCurrentUserAdmin` and
   `users.isCurrentUserApproved` have been deleted.
6. One app-owned function facade over per-handler assert calls: enforcement must be structural and
   fail-closed without nested wrapper stacks.
7. Every exported public Convex query, mutation, and action must declare exactly one access key;
   unclear functions start as `access_admin`.
8. Future rate limiting can fit inside the same app function wrapper, but Phase 1 declarations stay
   focused on `access`.
9. Provider connection, repo connect, app creation, app refresh, file read, and file write are
   distinct capabilities.
10. Billing never enters the grants table; the Pro gate on app creation is untouched.
11. Checkout requires approval (`access_dashboard`).
12. MCP uses the same `AccessKey` literals for delegated Noter grants; OAuth calls them scopes at
    the protocol boundary.

## Open Questions

1. Should `/pricing` eventually become `access_public` as a marketing page? (Metadata edit when
   decided; `access_dashboard` for MVP.)
2. Phase 4 timing relative to member onboarding (member MCP demand may pull it forward).

## References

- Convex Components overview and authoring docs: https://docs.convex.dev/components/overview and
  https://docs.convex.dev/components/authoring
- Convex Using Components docs: https://docs.convex.dev/components/using
- Convex Rate Limiter component and source: https://www.convex.dev/components/rate-limiter and
  https://github.com/get-convex/rate-limiter
- Convex Helpers custom functions docs and source: https://stack.convex.dev/custom-functions and
  https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts
- Cloudflare MCP consent and authorization guidance:
  https://developers.cloudflare.com/agents/model-context-protocol/authorization/ and
  https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/
- Cloudflare `workers-oauth-provider` (partial scope grants):
  https://github.com/cloudflare/workers-oauth-provider
- MCP authorization spec (2025-06-18) and draft scope-selection/step-up revision:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization and
  https://modelcontextprotocol.io/specification/draft/basic/authorization
- Google granular consent (checkbox-per-scope, partial grant handling):
  https://developers.google.com/identity/protocols/oauth2/resources/granular-permissions
- Tailscale grants (additive-only mapping vocabulary): https://tailscale.com/kb/1324/grants
- WorkOS authorization research for Noter: `research/2026-06-18-workos-authorization-model.md`
- WorkOS RBAC and AuthKit permissions docs: https://workos.com/docs/rbac/integration and
  https://workos.com/docs/authkit/roles-and-permissions
- WorkOS FGA overview, AuthKit integration, and access checks API: https://workos.com/docs/fga,
  https://workos.com/docs/fga/authkit-integration, and
  https://workos.com/docs/reference/fga/access-check
