# Terminology

This document defines repo terms that should stay consistent in code, comments, specs, PRs, and
agent discussion.

Use the listed term when it exists. Do not invent a nearby synonym in comments or handoffs. When a
term sounds wrong, change this file and the affected identifiers/comments together.

This is intentionally not exhaustive. Add terms when a word or identifier is confusing, overloaded,
or important enough that inconsistent naming would slow down review.

## Route And Search

### Route surface

Code: `NoterRouteSurface`, `routeSurface`

Meaning: the runtime/deployment category for route access: `local`, `preview`, or `production`.

Use:

- `route surface`
- `routeSurface`
- `NoterRouteSurface`

Do not use:

- `surface` by itself when it could mean UI surface, editor surface, page surface, or shell surface
- `route guard surface`
- `environment` when referring to `NoterRouteSurface`

Source:

- `apps/noter/src/lib/routeAvailability.ts`

### Route availability

Code: `NoterRouteAvailability`, `availableOn`, `canAccessNoterRouteAvailability`,
`canAccessNoterRouteMatchesAvailability`

Meaning: deployment-surface gating for routes. A route is available only on the listed route
surfaces; parent route availability is restrictive across the matched route chain.

Use:

- `route availability`
- `availableOn`

Do not use:

- `accepted search keys`
- `search param availability`
- `access` or `permission`

Source:

- `apps/noter/src/lib/routeAvailability.ts`

### Route address

Code: `draftRouteAddress`, `expectedRouteAddress`, `committedRouteAddress`,
`readRouteAddressFromRouteHref`

Meaning: an app-internal address string made from pathname, search, and hash. It starts with `/` and
does not include scheme, host, or origin.

Use:

- `route address`
- exact identifiers such as `draftRouteAddress`

Do not use:

- `URL` when origin/protocol are not included
- `route` when the address string is the important state
- `path` when search or hash are included

Source:

- `apps/noter/src/components/RouteUrlEditor/useRouteEditorVm.ts`
- `apps/noter/src/lib/routeAddress.ts`

### Draft route address

Code: `draftRouteAddress`

Meaning: the editable route address while the route URL editor is focused. It is the text the user
is editing and suggestions stay anchored to it.

Do not use:

- `input route`
- `typed route`
- `draft path`

Source:

- `apps/noter/src/components/RouteUrlEditor/useRouteEditorVm.ts`

### Expected route address

Code: `expectedRouteAddress`

Meaning: the route address the focused route URL editor expects TanStack Router to report. It is
also the restore target when a previewed suggestion is canceled.

Do not use:

- `target route`
- `base route`
- `current route` when the committed browser route is meant

Source:

- `apps/noter/src/components/RouteUrlEditor/useRouteEditorVm.ts`

### Committed route address

Code: `committedRouteAddress`

Meaning: the route address reported by TanStack Router from the actual browser route. Blurred route
URL editor state renders this value instead of storing its own copy.

Do not use:

- `current route` when the focused editor's expected or draft route is meant
- `browser URL` when only the app route address is present

Source:

- `apps/noter/src/components/RouteUrlEditor/useRouteEditorVm.ts`

### Preview route

Code: `previewRoute`, `previewRoute.routeAddress`, `previewRoute.expectedRouteAddress`

Meaning: the currently previewed route URL editor suggestion row. It changes the visible route
address without changing `draftRouteAddress`.

Do not use:

- `hover route` because keyboard and touch previews use the same state
- `suggestion route` when the specific `previewRoute` state is meant

Source:

- `apps/noter/src/components/RouteUrlEditor/useRouteEditorVm.ts`

### Canonical route address

Code: `readCanonicalRouteAddress`, current root helper `readRootRouteRedirectRouteAddress`

Meaning: route address after route-search canonicalization, including reset handling,
root-owned-search cleanup, and removal of search keys not accepted by the matched route chain.

Use:

- `canonical route address`

Do not use:

- `redirect route address`; redirect is only one enforcement mechanism
- `canonical route`
- `canonical URL` when the SEO/head metadata URL is meant

Source:

- `apps/noter/src/lib/rootRouteSearch.ts`
- `apps/noter/src/lib/routeAddress.ts`

### Route search schema

Code: `defineRouteSearchParams`, `RouteSearchSchema_*`

Meaning: schema that defines the query/search keys accepted by a route or route family, how their
values parse, and the metadata that can be derived from them.

Use:

- `route search schema`
- `RouteSearchSchema_*` for schema constants

Do not use:

- `field schema`
- `query schema` when the route ownership matters
- `search stuff`

Source:

- `apps/noter/src/lib/routeSearchParamMetadata.ts`
- `rfcs/086_ROUTE_SEARCH_SCHEMA_NAMING_AND_ACCEPTED_KEYS_PLAN.md`

### Accepted search keys

Code: `acceptedSearchKeys`, `readRouteSearchAcceptedKeys`

Meaning: query keys structurally accepted by the matched route chain. Acceptance is based on schema
membership and is viewer-independent.

Use:

- `accepted search keys`
- `acceptedSearchKeys`

Do not use:

- `available params`; availability is route-surface gating
- `allowed params` unless a local API uses that exact word
- `valid params` when editor exposure or permissions are the real concern

Source:

- `apps/noter/src/lib/routePermissions.ts`
- `apps/noter/src/lib/routeSearchParamMetadata.ts`
- `rfcs/086_ROUTE_SEARCH_SCHEMA_NAMING_AND_ACCEPTED_KEYS_PLAN.md`

### Search param suggestion

Code: `searchParamSuggestions`, `suggestion`, `NoterRouteSearchParamSuggestion`

Meaning: URL-editor exposure metadata for a route search param. A param can be accepted even when it
is not suggested.

Use:

- `search param suggestion`
- `suggestion` when naming the metadata field

Do not use:

- `accepted search key`
- `available param`
- `valid param`

Source:

- `apps/noter/src/lib/routePermissions.ts`
- `apps/noter/src/lib/routeSearchParamMetadata.ts`
- `specs/107_ROUTE_URL_EDITOR_SUGGESTION_MODEL_SPEC.md`

### Root-owned search key

Code: `RootRouteSearch`, `isRootRouteOwnedSearchKey`, `RETAINED_ROOT_SEARCH_KEYS`,
`retainRootSearchParams`

Meaning: search key owned by the root route. Root-owned keys can be accepted across paths because
the root route matches every path.

Use:

- `root-owned search key`

Do not use:

- `global param` unless the key is truly meant as an app-wide URL control
- `retained param` when ownership is the important concept

Source:

- `apps/noter/src/lib/rootRouteSearch.ts`
- `apps/noter/src/routes/root.tsx`

### Route-owned search key

Code: route-specific `RouteSearchSchema_*` definitions and their `*_ROUTE_SEARCH_KEYS` exports

Meaning: search key accepted by a specific route or route family, not by root. For example,
`isoSide` and `isoStyle` are owned by the `/logo/iso` route search schema.

Use:

- `route-owned search key`

Do not use:

- `global param`
- `root param`
- `shared param` unless the key is composed into multiple route schemas

Source:

- `apps/noter/src/lib/logoRouteSearch.ts`
- `rfcs/086_ROUTE_SEARCH_SCHEMA_NAMING_AND_ACCEPTED_KEYS_PLAN.md`

## Access And Auth

### Route permission

Code: `NoterRoutePermission`, `permission`, `canAccessNoterRoutePermission`

Meaning: route/search-param permission metadata such as `public` or `admin`. Route permission gates
exposure decisions; it is not the same as route availability or accepted search keys.

Do not use:

- `role` when referring to `NoterRoutePermission`
- `availability`
- `accepted`

Source:

- `apps/noter/src/lib/routePermissions.ts`
- `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`

### Permission viewer

Code: `NoterRoutePermissionViewer`, `viewer`

Meaning: the viewer shape used when checking route/search-param permission metadata.

Do not use:

- `user` when only permission-check facts are present
- `account`

Source:

- `apps/noter/src/lib/routePermissions.ts`

### Access key

Code: `ACCESS_KEYS`, `access_*`

Meaning: planned shared access-model key for product-area authorization across routes, search
params, Convex functions, and later MCP grants.

Do not use:

- `permission` when referring to the access-model key set
- `scope` when referring to app-user access

Source:

- `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`

### MCP scope

Code: `MCP_V1_SUPPORTED_SCOPES`, `scope`

Meaning: delegated capability requested by an MCP client and stored on MCP OAuth requests, codes,
tokens, and grants.

Do not use:

- `access key`; access keys describe user privilege, while MCP scopes describe delegated client
  capability

Source:

- `apps/noter/convex/mcp/protocol.ts`
- `apps/noter/convex/schema.ts`
- `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`

### Auth return

Code: `auth-return`

Meaning: root search value that records where auth flow should return, currently `dashboard`.

Do not use:

- `redirect target` unless referring to the external OAuth redirect URL
- `returnTo` unless using a function or provider API with that exact name

Source:

- `apps/noter/src/lib/rootRouteSearch.ts`
- `apps/noter/src/lib/googleAuthRedirect.ts`

## Vaults And Providers

### Vault

Code: `vaults`, `VaultDashboard`, `vault`

Meaning: Noter-managed repository workspace shown in the dashboard and backed by Convex `vaults`
state.

Do not use:

- `project` when referring to a Noter vault
- `repo` when the product object includes more than the GitHub repository

Source:

- `apps/noter/convex/schema.ts`
- `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`

### App root

Code: `appRoot`, `ROOT_VAULT_APP_ROOT`

Meaning: repository-relative application root inside a vault. `.` means the repository root app;
folder values such as `apps/noter` represent monorepo app roots.

Use:

- `app root`
- `appRoot`

Do not use:

- `root app` when the field is `appRoot`
- `folder` when `.` is also a valid app root
- `workspace root`

Source:

- `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
- `apps/noter/src/components/vault-dashboard/VaultResourceRail.tsx`

### Provider connection

Code: `providerConnections`, `providerConnection`

Meaning: persisted user connection to an external provider such as GitHub, Convex, or Cloudflare.

Do not use:

- `provider account`
- `integration` when the stored auth connection is meant

Source:

- `apps/noter/convex/schema.ts`
- `apps/noter/convex/providerConnections.ts`

### Connected machine

Code: `connectedMachines`, `ConnectedMachineHeartbeatLogSection`

Meaning: local machine registered with Noter so local sync or machine-backed workflows can run for
the user.

Do not use:

- `local machine link` when referring to the product row
- `machine link` when referring to the durable product entity

Source:

- `apps/noter/convex/schema.ts`
- `apps/noter/src/components/ConnectedMachineHeartbeatLog.tsx`

## Repo Workflow

### Documentation class

Code: `specs/`, `rfcs/`, `research/`, `docs/`, `skills/`, `archive/`

Meaning: repo documentation category. Each folder has a different job and authority level.

Do not use:

- `docs` for every written artifact
- `spec` for routine PR notes

Source:

- `docs/repo-documentation-standard.md`

### Git worktree

Code: `worktree`, `git worktree`

Meaning: isolated checkout used for branch or thread work.

Do not use:

- `clone` unless it is actually a clone
- `workspace` when the git worktree distinction matters

Source:

- `docs/agent-workflows.md`
- `AGENTS.md`

### Primary checkout

Code: `primary_checkout`

Meaning: the main checkout used for production Convex reads and `.env.local` source in the Convex
CLI workflow.

Do not use:

- `main folder`
- `real checkout`
- `local repo`

Source:

- `AGENTS.md`

### Workflow shortcut

Code: `commit`, `push`, `create pr`, `create draft`, `ready`, `wait`, `squash`, `link machine`,
`clean vaults`, `clean`, `status`

Meaning: exact user command phrase that triggers a predefined workflow.

Do not use:

- expanded paraphrases when delegating or executing the shortcut
- alternative spellings unless the workflow doc says they are aliases

Source:

- `docs/agent-workflows.md`
- `AGENTS.md`

### PR version label

Code: `v<N>:`

Meaning: projected app build label prefix required at the start of PR titles.

Do not use:

- `build label` when specifically discussing the PR title prefix
- branch names containing `v<N>`

Source:

- `docs/agent-workflows.md`

### Sub-agent

Code: `sub-agent`, `agent_path`

Meaning: separate delegated agent/thread used for bounded research, implementation, verification, or
process work.

Do not use:

- `worker` by itself unless referring to the delegation skill's Worker lane
- `parallel task` when the delegated agent is the important actor

Source:

- `skills/delegation-orchestrator/SKILL.md`

### Tracked file path

Code: `trackedFilePath(...)`, `noterAppFilePath(...)`

Meaning: typed helper for hard-coded references to tracked repo files in scripts.

Do not use:

- raw string path for tracked repo files when the helper applies

Source:

- `docs/tracked-file-paths.md`
- `AGENTS.md`
