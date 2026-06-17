# Access Model: Viewer Roles, Access Keys, and Grants (Member MVP)

## Document Control

- Status: Proposed
- Owner: Noter platform
- Date: 2026-06-12
- Related specs:
  - `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
  - `rfcs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `rfcs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md`
  - `rfcs/062_MCP_DUAL_ORIGIN_CONSENT_LOGIN_REDIRECT_SPEC.md`
  - `rfcs/063_MCP_PREACCOUNT_ONBOARDING_FLOW_SPEC.md`
  - `docs/code-guardrails.md`

## Summary

Replace the two-value route permission union (`"public" | "admin"`) with a two-sided access model
that prepares the app for external users:

1. **Viewer roles** (what a caller is): `role_anonymous | role_member | role_staff`.
2. **Access keys** (what a route, query, mutation, or action demands):
   `access_public | access_dashboard | access_provider_connections | access_repo_connect | access_app_create | access_app_refresh | access_files_read | access_files_write | access_machines | access_mcp | access_admin`.
3. **Grants** (which roles satisfy which keys): one table, additive-only, with one `canAccess`
   decision function shared by frontend and backend.

The two sides deliberately use different prefixed vocabularies so role strings and requirement
strings can never be confused in code, logs, or stored documents, and so the access-key set can grow
(more product areas, finer keys) without inventing new roles.

Member MVP: `role_member` holds `access_public`, `access_dashboard`, `access_provider_connections`,
`access_repo_connect`, and `access_app_refresh`. Members can sign in, connect provider accounts,
connect/import their own repositories, and monitor/resync app state. New managed app provisioning,
file editing, machines, MCP, and admin surfaces stay staff-only until deliberately opened. Enabling
more later is a grant edit plus route/function reclassification, not a redesign.

This RFC also closes a real security gap: `users.isApproved` is currently enforced only by the
client-side `ApprovalGate`; every authenticated-but-waitlisted user can call all ~139 public Convex
functions today. Backend enforcement becomes structural via access-key function wrappers.

## Goals

1. One shared vocabulary and one decision chokepoint (`canAccess`) for routes, search params, every
   exported public Convex function, and (later) MCP grants.
2. Server-side enforcement that fails closed and cannot be forgotten per function: public Convex
   queries, mutations, and actions must be wrapped with an explicit access key.
3. Member MVP limited to safe account/repo/app-status capabilities, with the path to app creation,
   files, machines, and MCP being grant edits plus targeted reclassification, not a redesign.
4. Keep billing (plan/add-ons) an orthogonal axis: role gates who may call; plan gates what paid
   features do (the existing Pro gate on app creation stays).
5. Keep MCP delegation compatible: existing MCP scopes become a delegated subset of the user's own
   access, with a Cloudflare-style checkbox consent planned in a follow-up spec.

## Non-Goals

1. Per-vault sharing / multi-user vaults (future; per-resource ownership checks remain the second
   authorization dimension and are untouched).
2. A persisted `users.role` field or admin UI for role management (staff stays the hardcoded
   `ADMIN_USERNAMES`/`ADMIN_EMAILS` lists in `apps/noter/convex/userAccess.ts` until a second staff
   member exists).
3. Per-resource `resource:action` permission keys for the web app. The key set is product
   capabilities, not individual vault IDs, branch IDs, or OAuth scopes.
4. The MCP checkbox-consent implementation itself (Phase 4 outline here; details in its own spec).

## Current State (verified)

- Route permissions: `NoterRoutePermission = "public" | "admin"` at
  `apps/noter/src/lib/routePermissions.ts:7`; 29 routes in
  `apps/noter/src/routeAccessMetadata.ts:12-42` (5 public, 24 admin); ~67 search-param suggestions
  across 9 `apps/noter/src/lib/*RouteSearch.ts` files carry `permission` values.
- The only frontend decision function, `canAccessNoterRoutePermission`
  (`routePermissions.ts:90-102`), gates URL-editor suggestions only. Navigation is gated by
  availability (`apps/noter/src/routes/root.tsx:86-89`) and by the per-page
  `AuthenticatedAppRoutePage` → `<Authenticated>` + `ApprovalGate` pair
  (`apps/noter/src/components/ApprovalGate.tsx:8`). Route `permission` values are metadata, not
  locks.
- Backend baseline: ~85 `getUserId(ctx)` (`apps/noter/convex/common.ts:4-10`, throws when
  unauthenticated) + ~62 raw `getAuthUserId(ctx)` call sites across 139 public functions. This
  branch now contains the first app-owned wrapper spike in `apps/noter/convex/functions.ts`, while
  the wider function inventory is still raw. Admin is defined once (`isAdminUser`,
  `apps/noter/convex/userAccess.ts`) but enforced inline at only 4 sites (`chat/prodAccess.ts:37`,
  `chat/index.ts:461,515`, `appProvisioningWorkflowActions.ts:273-280` — the last with the
  Pro-billing fallback for non-admins).
- `users.isApproved` (`apps/noter/convex/schema.ts:288`) is read by exactly one backend function
  (`users.isCurrentUserApproved`, `users.ts:365-379`) consumed by `ApprovalGate`. No mutation/query
  checks it before doing work. `devAuth.ts:210-211` seeds `isApproved: true` for local/preview
  accounts.
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
- Build-time: `dev/publicPrerenderPages.ts:40` filters `permission === "public"`; silent hazard at
  `apps/noter/src/lib/rootRouteSearch.ts:164-170` where suggestions are split by `=== "admin"` /
  `=== "public"` equality (a third value would vanish from both lists).

## Design

### Vocabulary and shared module

One module defines both unions, the grants table, and the decision function; frontend and Convex
import the same file (Convex bundles imports from outside `convex/`):

```ts
export const VIEWER_ROLES = ["role_anonymous", "role_member", "role_staff"] as const;
export type ViewerRole = (typeof VIEWER_ROLES)[number];

export const ACCESS_KEYS = [
  "access_public",
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
const GRANTS: Record<ViewerRole, readonly AccessKey[]> = {
  role_anonymous: ["access_public"],
  role_member: [
    "access_public",
    "access_dashboard",
    "access_provider_connections",
    "access_repo_connect",
    "access_app_refresh",
  ],
  role_staff: [...ACCESS_KEYS],
};

export function canAccess(required: AccessKey, viewer: ViewerRole): boolean {
  return GRANTS[viewer].includes(required);
}
```

Naming rules locked in by this RFC:

- Role strings (`role_*`) and access keys (`access_*`) are disjoint literal types; neither side ever
  reuses the other's words ("public" is a requirement, "anonymous" is a role — nobody "is" public).
- `scope` stays reserved for OAuth delegation (MCP). `plan`/`feature` stay reserved for billing.
- Non-allowlisted users denied during auth callback never get a viewer role. During the current
  post-login waitlist implementation only, an authenticated but unapproved user resolves to
  `role_anonymous` for access purposes: they hold only `access_public`. The UI distinguishes that
  temporary state from signed-out users via Convex Auth state, not via a fourth role.

Capability split locked in by this RFC:

| Access key                    | Product capability                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `access_public`               | Public routes and unauthenticated-friendly helpers.                                                                                    |
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
functions still use the more specific key. For example, `/add` can render for a member who has
`access_repo_connect`, while the "create managed app" mutation still requires `access_app_create`.

### Role resolution (server-side)

- `role_staff`: `isAdminUser(githubUsername, email)` — unchanged hardcoded lists
  (`apps/noter/convex/userAccess.ts`), including the GitHub-connection lookup currently copy-pasted
  at the inline admin sites, centralized into one `getViewerRole(ctx)` helper.
- `role_member`: authenticated and `users.isApproved === true`.
- `role_anonymous`: signed out. During the current post-login waitlist implementation only, signed
  in but unapproved also resolves to `role_anonymous` until the pre-login allowlist boundary from
  `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md` is enforced.

One new public query `users.currentViewerRole` returns the `ViewerRole` literal and replaces
`isCurrentUserAdmin` + `isCurrentUserApproved` consumers over time (delete-first; `ApprovalGate`
becomes `<Authenticated>` + `role === "role_anonymous"` → waitlist screen).

### Auth allowlist compatibility

This RFC does not supersede `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`. The accepted
target remains: non-allowlisted users are denied during auth callback, no `users` row is inserted,
and no authenticated session is issued. In that target state, waitlisted candidates interact with
public routes and public Convex functions only; they do not resolve a server-side viewer role.

The `role_anonymous` fallback for authenticated but unapproved users exists to close the current
post-login gating gap while that implementation still exists. If the product chooses to keep
authenticated waitlist accounts long term, update or replace spec 018 before implementing that path.

### Backend enforcement: app function wrappers

New module `apps/noter/convex/functions.ts` exports one app-owned function facade:
`appFunction.query`, `appFunction.mutation`, and `appFunction.action`. Every exported public Convex
query, mutation, and action must use this facade and declare exactly one policy object. The policy
contains the access key and any standard app-level controls such as rate limiting, so call sites do
not stack multiple nested wrappers. The access key is part of the definition and greppable:

```ts
export const enqueueManualRepositoryRefresh = appFunction.mutation({
  access: "access_app_refresh",
  rateLimit: { mode: "consume", name: "manualRepositoryRefresh", target: "viewer" },
  args: { vaultId: v.id("vaults") },
  returns: vEnqueueRepositoryRefreshResult,
  handler: async (ctx, args) => {
    /* unchanged body; ownership filters stay */
  },
});
```

- The wrapper resolves the viewer role once (users doc + GitHub connection lookup; actions resolve
  via one internal query since they lack `ctx.db`), throws a uniform "Access denied" when
  `!canAccess(access, role)`, and passes a typed `ctx.viewer` to the handler so most bodies drop
  their own `getUserId` preamble.
- Rate limits are named in one central `RATE_LIMITS` inventory. Query policies can only use
  `{ mode: "check" }`, because queries cannot transactionally consume rate-limit state. Mutation and
  action policies can use `{ mode: "consume" }`, backed by `@convex-dev/rate-limiter` through
  `ctx.runMutation` from actions and direct mutation calls from mutations.
- `access_public` functions skip no code path — `canAccess("access_public", role_anonymous)` is
  true, so personalization-friendly functions (`users.viewer`, `users.currentViewerRole`,
  `billing.getViewerBillingStatus`, `users.getGithubConnectionStatus`, `waitlist.joinWaitlist`,
  `deploymentProfile`) register as `access_public` and keep their graceful null/false returns.
- Enforcement is structural: an ESLint `no-restricted-imports` rule bans `query`/`mutation`/`action`
  imports from `_generated/server` outside `convex/functions.ts` and test files (`internalQuery`
  etc. stay free). Choosing `access_public` becomes the loud, deliberate act; forgetting a gate
  becomes impossible. This flips today's fail-open default (any authenticated user) to fail-closed.
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

Function-area assignment (139 public functions; inventory from the implementation research):
dashboard 14, files 26, machines 27, mcp 3, admin 15, auth/public 18, mixed 35 — the mixed group
(vault actions, github, oauth flows) is assigned during migration, defaulting to:

- `access_provider_connections` for GitHub/Convex/Cloudflare OAuth and API-key connection functions.
- `access_repo_connect` for importing or linking an existing GitHub repository into Noter.
- `access_app_create` for Noter-managed provisioning and provider-resource creation.
- `access_app_refresh` for repository/app/deployment resync and metadata reloads.
- `access_files_read` / `access_files_write` for file surfaces, split by read/write or compute
  behavior.
- `access_admin` for anything unreleased, operator-only, or unclear.

`apps/noter/convex/functions.ts` is the working spike for this API shape. It uses
`convex-helpers/server/customFunctions` plus the real `@convex-dev/rate-limiter` component, and
`apps/noter/convex/functions.test.ts` proves:

- Missing `access` fails typecheck.
- Rate-limit names come from a central literal inventory.
- Query functions cannot use consuming rate-limit policies.
- Mutation/action handlers receive typed `ctx.viewer` while preserving normal Convex args and return
  validators.

The first end-to-end migrations are intentionally representative rather than broad:

- `users.getGithubConnectionStatus` uses `access_public` and keeps the existing graceful
  `{ connected: false }` behavior for anonymous or unapproved callers.
- `repositoryRefresh.enqueueManualRepositoryRefresh` uses `access_app_refresh` and consumes the
  `manualRepositoryRefresh` rate limit through the registered component. Existing React
  `useMutation(api.repositoryRefresh.enqueueManualRepositoryRefresh)` call sites stay unchanged.

The spike also exposed one implementation constraint: `customFunctions` policy input receives the
static function policy, not the handler's validated args. That is fine for viewer/global rate
limits, which cover the first rollout. If a future limit key must derive from ordinary function
args, use a small hand-rolled wrapper for that function kind or call a focused rate-limit helper
inside the handler after access has passed.

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

### Frontend: route metadata, runtime gate, suggestions

- `NoterRoutePermission` is replaced by `AccessKey`; the staticData field renames `permission` →
  `access` across the 29 route files and `routeAccessMetadata.ts` (mechanical; the field name now
  reads as a requirement).
- Viewer model `{ isAdmin: boolean }` is replaced by the `ViewerRole` from
  `users.currentViewerRole`; `canAccessNoterRoutePermission` becomes a call into the shared
  `canAccess`.
- New runtime gate: a `RouteAccessOutlet` in the root route (mirroring `RouteAvailabilityOutlet`)
  reads the matched route's `staticData.access` and the reactive viewer role. `access_public`
  renders immediately (prerendered pages never wait on the query); anything else renders the auth
  redirect / waitlist screen for `role_anonymous` and `notFound` for an authenticated role lacking
  the key (consistent with availability handling). This subsumes per-page
  `AuthenticatedAppRoutePage` placement over time.
- Suggestion plumbing: the `=== "admin"` / `=== "public"` equality filters at
  `rootRouteSearch.ts:164-170` become grant-based (`canAccess(suggestion.access, role)`), removing
  the silent-drop hazard. Test fixtures `adminViewer`/`publicViewer` become
  `staffViewer`/`memberViewer`/`anonymousViewer`.
- Prerender: `publicPrerenderPages.ts` filter becomes `access === "access_public"`; behavior for
  non-public keys is unchanged (not prerendered).

### Route assignments (MVP)

| Access key            | Routes                                                                                                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access_public`       | `/`, `/logo`, `/privacy`, `/terms`, `/visual-fixture` (local-only)                                                                                                                                                                                                                                                    |
| `access_dashboard`    | `/home`, `/pricing`                                                                                                                                                                                                                                                                                                   |
| `access_repo_connect` | `/add` shell for importing/linking an existing repository; specific provider buttons also depend on `access_provider_connections`, and managed provisioning actions depend on `access_app_create`                                                                                                                     |
| `access_files_read`   | `/vault/$` read shell                                                                                                                                                                                                                                                                                                 |
| `access_files_write`  | File edit/staging/commit actions inside `/vault/$`; no separate route required at MVP                                                                                                                                                                                                                                 |
| `access_machines`     | `/machines`, `/machines/connect`                                                                                                                                                                                                                                                                                      |
| `access_mcp`          | `/oauth/mcp/consent`                                                                                                                                                                                                                                                                                                  |
| `access_admin`        | `/pitch`, `/pitch/print`, `/pitch/print/mobile`, `/landing-preview`, `/research/codex-app-server`, `/research/codex-app-server/browser`, `/test`, `/indexDB`, `/localStorage`, `/logo/iso`, `/logo/raster`, `/logo/raster-seams`, `/logo/single-cube`, `/logo/svg`, `/logo/transition`, `/logo/transition/transforms` |

With MVP grants, members reach public, dashboard, provider-connection, repo-connect, and app-refresh
capabilities; staff reach everything. The ~40 admin-marked search params reclassify alongside their
routes: dashboard/billing params (`delete`, `checkout`) → `access_dashboard`; provider-connection
params (`add-cloudflare`, `add-convex`) → `access_provider_connections`; repo/app setup params
(`add-app-root`, `app-root`, `new-app`) → `access_repo_connect` unless the triggered backend action
is managed provisioning, which requires `access_app_create`; file-view params (`compare`, `diff`,
`review`, `mobileLineNumbers`) → `access_files_read`; file edit/staging params →
`access_files_write`; machines/MCP params → `access_machines` / `access_mcp`; dev toggles and
landing-preview params → `access_admin`.

### Billing stays orthogonal

- Role gates reachability; plan gates paid capability. `createRepository` (Noter-managed
  provisioning) keeps the existing gate: staff bypass, everyone else needs
  `billingPlan === "pro" && billingStatus === "active"`
  (`appProvisioningWorkflowActions.ts:273-280`) after passing `access_app_create`. Members on the
  free plan can still `connectRepository` (BYO infra — verified unbilled and ungated today) after
  passing `access_repo_connect`.
- `/pricing`, `createPolarCheckoutSession`, `createPolarCustomerPortalSession` are
  `access_dashboard`: waitlisted users cannot pay before approval.
- No `pro` role and no `access_pro` key — plan checks never enter the GRANTS table.

### MCP direction (Phase 4, own spec)

The existing MCP scopes stay the delegation vocabulary; access keys are the user-privilege
vocabulary. The bridge is a static mapping, enforced by intersection:

| MCP scope                        | Required access key  |
| -------------------------------- | -------------------- |
| `vaults.read`                    | `access_dashboard`   |
| `files.read`                     | `access_files_read`  |
| `files.write`, `commits.propose` | `access_files_write` |
| `prod.read.propose`              | `access_admin`       |

Constraints this RFC locks in so Phases 1–3 do not paint MCP into a corner:

1. An MCP grant may never exceed the granting user's own access: consent renders only scopes whose
   required key the user holds, and every MCP request re-intersects the token's scopes with the
   user's **current** keys (revoking a member's `access_files_write` instantly cuts off
   write-capable agents).
2. Consent becomes checkbox-per-scope with partial grants (`granted ⊆ requested`), following the
   Cloudflare consent page / `workers-oauth-provider` pattern and the MCP 2025-11-25 draft's scope
   selection + `insufficient_scope` step-up flow. The flat `scope` strings on
   `mcpAuthRequests`/`mcpAuthorizationCodes`/`mcpGrants`/`mcpAccessTokens` already encode a granted
   subset; grant matching moves from string equality to subset logic.
3. `scopes_supported` advertises the minimal useful set (excludes `prod.read.propose`) so generic
   clients that request everything do not ask for staff powers by default.
4. The `/oauth/mcp/consent` route key relaxes from staff-only to member-reachable in the same change
   that grants members any MCP scope — until then `access_mcp` is granted to staff only.

## Rollout Phases

Each phase is independently shippable; commits split per concern (backend model, UI wiring,
spec/test updates).

**Phase 1 — vocabulary + backend enforcement (closes the approval gap).** Shared access module;
`getViewerRole(ctx)`; `users.currentViewerRole`; `appFunction.query/mutation/action`; install and
configure `@convex-dev/rate-limiter`; lint rule; migrate all 139 public functions so every exported
public query, mutation, and action declares an access key. While the current post-login waitlist
implementation exists, authenticated-but-unapproved callers lose access to everything beyond the
`access_public` set — that is the point. If spec 018's auth-callback denial is enforced first, those
tests move to the auth callback boundary instead. Sub-split by area for review: auth/public →
dashboard → provider connections → repo connect/app create/app refresh → files read/write → machines
→ admin/chat → mixed. Anything unclear starts as `access_admin`. Convex tests gain role fixtures
(`t.withIdentity` + seeded approved/unapproved users while transition compatibility exists);
state-axis enumeration test for `GRANTS` (e.g. "every key a member holds, staff holds").

**Phase 2 — frontend rename + runtime gate.** Union/field rename (`permission` → `access`, 29
routes + 9 search files + metadata map + tests); viewer role wiring; `RouteAccessOutlet`; suggestion
filter rework (`rootRouteSearch.ts:164-170`); prerender filter update; fixture renames; screenshot
updates where shipped UI changes (waitlist/404 paths).

**Phase 3 — member enablement.** Wire the waitlist join form to `waitlist.joinWaitlist` (today it
has zero callers — required for real onboarding). Before first cohort launch, choose the accepted
signup boundary: implement spec 018 by approving candidates before sign-in, or explicitly replace
spec 018 with an authenticated waitlist-account contract. For the spec 018 path, approve the first
cohort before sign-in, then verify the member journey end to end (sign in → `/home` → connect
provider → connect/import repo → refresh/monitor; managed app creation still requires
`access_app_create` plus the Pro gate). No code beyond the join form and chosen signup boundary —
membership is data.

**Phase 4 — MCP scoped consent (separate spec).** Checkbox consent with partial grants, scope↔key
intersection live on every request, step-up via `insufficient_scope`, grant management/editing on a
settings page.

## Risks

1. **Unapproved-user regressions (Phase 1).** Some `getAuthUserId` call sites intentionally serve
   unauthenticated/unapproved viewers. Mitigation: the explicit `access_public` function list above;
   convex tests assert each stays reachable for an unapproved identity.
2. **`isApproved` is optional in schema.** `undefined` must read as not-approved (truthiness check,
   per guardrails); no backfill needed because the check fails closed.
3. **Wrapper migration drift.** 139 functions across many files; the lint rule lands in the same PR
   as the wrapper module so unmigrated raw builders fail CI from day one.
4. **Action wrappers add one internal query round-trip** for role resolution. Acceptable: actions
   are already provider-bound; queries/mutations resolve the role with two indexed reads.
5. **Over-classifying `/add`.** The route contains repo connect, provider connection, and managed
   app creation controls. Mitigation: gate the route shell by the lowest useful access
   (`access_repo_connect`) and enforce stricter keys in backend actions.
6. **Per-page `AuthenticatedAppRoutePage` overlap with `RouteAccessOutlet`** during Phase 2: keep
   both briefly, delete the per-page wrapper as routes are confirmed gated (delete-first; no
   long-lived dual system).
7. **MCP consent route over-gating.** `access_mcp` staff-only until member MCP ships; an approved
   member hitting a consent link sees 404 rather than a broken consent flow. Documented behavior
   until Phase 4.

## Resolved Decisions

1. Subject and requirement sides use disjoint prefixed vocabularies (`role_*` / `access_*`).
2. "Member" = authenticated + approved; non-allowlisted users are denied before role resolution per
   spec 018. During the current post-login waitlist transition, authenticated unapproved users
   resolve to `role_anonymous` for access.
3. Staff determination stays the hardcoded list; no persisted role field in this rollout.
4. One app-owned function facade over per-handler assert calls: enforcement must be structural and
   fail-closed without nested wrapper stacks.
5. Every exported public Convex query, mutation, and action must declare exactly one access key;
   unclear functions start as `access_admin`.
6. Rate limiting belongs in the same app function policy object: queries may only check limits;
   mutations and actions may consume them.
7. Provider connection, repo connect, app creation, app refresh, file read, and file write are
   distinct capabilities.
8. Billing never enters the grants table; the Pro gate on app creation is untouched.
9. Checkout requires approval (`access_dashboard`).
10. MCP scopes remain the delegation vocabulary, bridged to access keys by intersection.

## Open Questions

1. Should `/pricing` eventually become `access_public` as a marketing page? (Metadata edit when
   decided; `access_dashboard` for MVP.)
2. Does the first member cohort get `access_files_read` on their own vaults soon after MVP? If so,
   the per-vault sharing/ownership model should get its own spec before the grant flips.
3. Phase 4 timing relative to member onboarding (member MCP demand may pull it forward).

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
