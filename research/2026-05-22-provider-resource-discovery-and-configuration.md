# Provider Resource Discovery And Configuration Research

## Document Control

- Status: current-state research
- Owner: Noter provider resources, app creation, and existing repository onboarding
- Created: 2026-05-22
- Prompt: decide whether the next provider-resource step should auto-discover Convex and Cloudflare
  projects from a connected GitHub repository, or keep users explicitly selecting/creating provider
  resources outside the main new-app flow.
- Related:
  - `rfcs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
  - `specs/103_CONVEX_API_VALIDATION_SPEC.md`
  - `specs/104_CLOUDFLARE_MCP_API_VALIDATION_SPEC.md`
  - `research/2026-05-18-new-app-provider-name-selection.md`
  - `research/2026-05-19-existing-app-resource-adoption.md`

## Recommendation

Do not make automatic resource adoption part of the first provider-resource step. The right first
step is explicit provider target selection, with discovery used only to preselect or rank safe
suggestions that the user approves.

Keep the current "New App" path as the one-click full-stack path for the simplest case: create a
GitHub repository, create a Convex project/deployments, create a Cloudflare Worker, wire Workers
Builds, and record all attached resources. That path already has strong typed provider boundaries
and durable provider target rows.

Add the next feature as a vault-level resource configuration flow, not as more branching inside the
New App submit action:

1. Start from a connected GitHub vault, whether the repo was created by Noter or connected from an
   existing repository.
2. Let the user choose Convex target mode:
   - create a new project
   - connect an existing production deployment
   - leave Convex unconfigured
3. Let the user choose Cloudflare target mode:
   - create a new Worker
   - connect an existing Worker
   - leave Cloudflare unconfigured
4. Record the selected target modes before provider side effects.
5. Run provider-specific workflow steps that touch only the selected resources.

Auto-discovery should ship as read-only inventory and suggestion logic after that target model
exists. The app can then safely say "this Worker looks connected to this GitHub repo" or "this
Convex deployment URL appears in this Worker config" without silently mutating a production app.

## Why This Should Not Be Fully Automatic First

There is one strong provider relationship and one weak provider relationship:

1. Cloudflare Workers Builds can link a Worker to a GitHub repository through repository connections
   and build triggers. The trigger response includes a `repo_connection` object, and the connection
   request shape includes `provider_type`, `provider_account_id`, `repo_id`, and `repo_name`.
2. Convex has project and deployment inventory, but no GitHub repository field. A Convex deployment
   can only be connected to a repo indirectly through visible configuration, such as a public
   `VITE_CONVEX_URL` value in Cloudflare build configuration, committed configuration, or a deployed
   public asset that contains the Convex cloud URL.

That means Cloudflare can suggest a GitHub relation with high confidence, but Convex still needs
visible evidence and user approval. Name matching is not enough. Hidden secrets, deploy-key names,
or encrypted provider variables are not enough.

The current data model also cannot yet represent "connected existing Convex deployment" or
"connected existing Cloudflare Worker" as durable target modes. `vaultInfrastructureTargets` stores
planned/created states for Noter-created Convex and Cloudflare resources, but does not store connect
modes or per-resource origin. Adding auto-adoption before that would force the app to overload
Noter-created state with user-owned resources.

## Current Runtime Shape

Provider credentials are user-scoped in `providerConnections`. They answer "can this user call this
provider?" They do not answer "which provider resource belongs to this vault."

Current provider connection facts:

1. GitHub, Convex, and Cloudflare are one active connection per user/provider.
2. Convex stores the connected team ID and optional team slug.
3. Cloudflare stores an optional selected account ID and MCP token health fields.
4. No provider connection stores a vault-specific project, deployment, Worker, repo connection, or
   build-trigger identity.

Vault rows already have separate provider states:

```ts
type VaultConvexState =
  | { state: "not_configured" }
  | { state: "provisioning"; runId: Id<"appProvisioningRuns">; startedAt: number }
  | {
      state: "connected";
      projectId: string;
      projectSlug: string;
      deploymentName: string;
      connectedAt: number;
    }
  | { state: "failed"; runId: Id<"appProvisioningRuns">; failedAt: number };

type VaultCloudflareState =
  | { state: "not_configured" }
  | {
      state: "connected";
      accountId: string;
      workerName: string;
      workerTag: string;
      workersDevUrl?: string;
      origin: "provisioned" | "selected_existing";
      connectedAt: number;
      lastObservedAt: number;
    };
```

This is the right foundation. The remaining missing pieces for auto-adoption are explicit target
mode and an observed-only origin. A connected provider state should distinguish:

1. The product flow provisioned the resource.
2. The user selected an existing resource.
3. The product observed an external resource but is not allowed to manage it.

`research/2026-05-19-existing-app-resource-adoption.md` already captured the right conceptual origin
set. Keep persisted literals brand-neutral:

```ts
type VaultResourceOrigin = "provisioned" | "selected_existing" | "observed_external";
```

The observed-only origin should move from research into schema before any automatic adoption is
allowed to write attached provider state.

## Current New App Flow

The dashboard New App control currently requires all three provider connections before create:

1. GitHub
2. Convex
3. Cloudflare

The UI asks for:

1. GitHub owner
2. GitHub repo name
3. Convex project name
4. Cloudflare Worker name

Convex and Cloudflare names default from the GitHub repository name, but become manual overrides
after editing. The backend revalidates GitHub, Convex, and Cloudflare name availability before the
first external side effect.

The action then inserts a vault/run and stores a `vaultInfrastructureTargets` row with planned
Convex and Cloudflare names. Provisioning later requires that target row and records provider
identity as it creates resources.

This means the New App path is already a full-stack create path, not a GitHub-only path. It should
stay that way until the resource configuration flow can represent partial targets cleanly.

## Current Existing Repository Flow

Connecting an existing repository creates a GitHub-connected vault and leaves:

1. `convex: { state: "not_configured" }`
2. `cloudflare: { state: "not_configured" }`

Dashboard provider setup remains `not_applicable` for existing repositories because the current
query still gates provider setup behind `isNoterManagedVault`, which is defined as
`githubMode === "create_repository"`.

The resource rail already has the product-shaped placeholders for future work: missing Convex and
Cloudflare rows render disabled "Connect" and "Create" actions when the vault is otherwise ready.
Those disabled actions are the correct place to attach the next implementation.

## Provider API Facts

### Cloudflare To GitHub

Cloudflare Workers Builds is the strongest discovery surface.

Cloudflare's generated API subset and docs expose:

1. `PUT /accounts/{account_id}/builds/repos/connections` accepts GitHub `provider_type`,
   `provider_account_id`, `provider_account_name`, `repo_id`, and `repo_name`.
2. `GET /accounts/{account_id}/builds/workers/{external_script_id}/triggers` lists triggers for a
   Worker script.
3. A trigger can include `repo_connection`, which is the durable relation between that trigger and a
   GitHub repository connection.
4. Worker inventory is account-scoped. Noter can list Workers, then list triggers by each Worker
   tag/external script id to find candidate repo links.

Implication: for a connected vault with immutable `ghRepoId`, Noter can look for Cloudflare triggers
whose repository connection has the same GitHub repo id. That is strong enough to present a
preselected Worker candidate, provided the user still approves adoption.

Open issue: Cloudflare may not provide a single "find Workers by GitHub repo id" endpoint in the
current app subset. The likely implementation is account inventory plus per-Worker trigger reads,
with pagination and a scan budget.

### Cloudflare To Convex

Cloudflare can provide visible evidence for a Convex deployment, but this is not a direct ownership
link.

Noter-created Workers Builds triggers currently receive:

1. `CONVEX_DEPLOY_KEY` as a secret
2. `PREVIEW_CONVEX_DEPLOY_KEY` as a secret
3. `VITE_CONVEX_URL` as a non-secret build variable

The non-secret `VITE_CONVEX_URL` value is the useful bridge. If an existing Worker build trigger or
repo config exposes a `*.convex.cloud` URL, Noter can compare it with Convex deployment inventory
from the connected Convex team.

This should be a suggestion, not an automatic attach:

1. A public Convex URL proves a deployed frontend points at that deployment.
2. It does not prove the user wants Noter to manage deploy keys, preview deployments, build env
   vars, or cleanup.
3. It does not prove the matching Convex project is the production data source if the app has
   multiple environments.

### Convex To GitHub

Convex Management API inventory is team/project/deployment scoped. It includes project id, project
slug, team id, team slug, deployment name, deployment URL, deployment type, and deploy-key APIs. It
does not include a GitHub repository id or repository URL.

Convex default environment variables may be useful for app-specific hints, but they are project
configuration, not source-control ownership. The first implementation should not infer GitHub
ownership from Convex project names, deployment names, or deploy-key names.

## Proposed Product Model

Treat provider setup as separate resource targets on a GitHub-connected vault.

V1 target model:

```ts
type ConvexTarget =
  | {
      mode: "create_project";
      origin: "provisioned";
      teamId: string;
      projectName: string;
    }
  | {
      mode: "connect_existing_deployment";
      origin: "selected_existing";
      teamId: string;
      projectId: string;
      projectSlug: string;
      deploymentName: string;
      cloudUrl: string;
      siteUrl: string;
    }
  | {
      mode: "none";
    };

type CloudflareTarget =
  | {
      mode: "create_worker";
      origin: "provisioned";
      accountId: string;
      workerName: string;
    }
  | {
      mode: "connect_existing_worker";
      origin: "selected_existing";
      accountId: string;
      workerName: string;
      workerTag: string;
      workersDevUrl?: string;
    }
  | {
      mode: "none";
    };
```

Resource state should also carry origin after connection so deletion and future management can fail
closed:

```ts
type ConnectedConvexState = {
  state: "connected";
  origin: "provisioned" | "selected_existing";
  projectId: string;
  projectSlug: string;
  deploymentName: string;
  connectedAt: number;
};

type ConnectedCloudflareState = {
  state: "connected";
  origin: "provisioned" | "selected_existing";
  accountId: string;
  workerName: string;
  workerTag: string;
  workersDevUrl?: string;
  connectedAt: number;
};
```

Do not add a generic provider framework in this pass. Extend the existing target table and provider
state first. A generic resource registry can wait until domains, preview deployments, build
triggers, and deploy keys need independent lifecycles.

## Proposed UX

### New App

Keep one default path:

1. User selects GitHub owner.
2. User enters GitHub repo name.
3. Convex and Cloudflare names auto-fill and can be edited.
4. Submit creates the full stack.

Do not add auto-discovered existing resource adoption to this submit path yet. Existing-resource
selection inside New App can come later after the target modes are proven in the resource rail.

### Existing Repository

After GitHub source setup succeeds, the resource rail should offer active actions:

1. Convex missing:
   - Connect
   - Create
2. Cloudflare missing:
   - Connect

The action opens a compact picker for that provider:

1. "Suggested" section from discovery.
2. "All visible resources" section from provider inventory.
3. "Create new" form when supported.

The picker writes target rows before starting a workflow. The workflow only acts on selected
targets. There should be no broad "retry infra" action that tries to infer intent from mutable
provider connection state.

### Partial Creation

Support "create just Convex" before "create just Cloudflare."

Convex can be created or connected independently once a GitHub vault exists. It records backend
resource identity and can stop there.

Cloudflare Workers Builds setup currently depends on Convex URLs and deploy keys in Noter's
generated stack. The first Cloudflare create/connect action should either:

1. require a connected Convex target before wiring Builds for the Noter stack, or
2. explicitly offer a Worker-only attach mode that records the Worker but does not patch build
   triggers, secrets, or deploy commands.

The safer V1 is to require Convex before Noter-managed Workers Builds setup. If the user connects an
existing Worker with an already-working non-Convex app, record it as `selected_existing` but do not
overwrite triggers or env vars until the user approves Noter-managed deploys.

## Discovery Algorithm

### Phase 1: Read-Only Inventory

Convex inventory:

1. List projects for the connected team.
2. For each project, list or read default production deployments.
3. Normalize into stable rows: project id, project slug, team slug, deployment name, deployment URL,
   site URL.
4. Sort deterministically by project name/slug and deployment name.

Cloudflare inventory:

1. Use the selected Cloudflare account id.
2. List Workers.
3. For each Worker, read Worker details and list Workers Builds triggers.
4. Extract trigger repo connection data where present.
5. Extract build commands, deploy commands, root directory, default/preview branch filters, and
   visible environment variable names/values when the API exposes them.
6. Sort deterministically by Worker name and trigger name.

GitHub repo signals:

1. Look for `convex/`.
2. Look for `wrangler.jsonc` or `wrangler.toml`.
3. Read package scripts and lockfiles.
4. Read committed non-secret env examples if present.
5. Do not read hidden provider secrets as evidence.

### Phase 2: Candidate Scoring

Strong Cloudflare candidate:

1. Worker trigger repo connection has `provider_type: "github"`.
2. Repo id equals the vault `ghRepoId`.
3. Trigger branch rules include the default branch or preview pattern Noter understands.

Medium Cloudflare candidate:

1. Worker trigger repo connection matches owner/name but repo id is unavailable.
2. Worker name matches repo config exactly.
3. Build root and commands match committed repo layout.

Weak Cloudflare candidate:

1. Worker name matches repo name.
2. Workers.dev URL name matches repo name.

Strong Convex candidate:

1. A visible Cloudflare build variable or committed public config contains a Convex deployment URL.
2. That URL equals a deployment in the connected Convex team inventory.

Medium Convex candidate:

1. Repo config contains a Convex URL that maps to a deployment in inventory, but environment context
   is unclear.
2. Project name/slug matches repo name and the repo contains `convex/`.

Weak Convex candidate:

1. Project name alone resembles repo name.

Only strong candidates should be preselected. Medium and weak candidates can be shown as sorted
suggestions with evidence labels. None should auto-attach without approval.

## Implementation Sequence

1. Replace `isNoterManagedVault` resource gates with narrower helpers:
   - `isNoterCreatedRepositoryVault`
   - `canConfigureVaultResources`
   - `canDeleteGitHubRepository`
   - `canDeleteProviderResource`
2. Extend `vaultInfrastructureTargets` with Convex and Cloudflare target modes, including `none` and
   `connect_existing_*`.
3. Add `origin` to connected Convex and Cloudflare provider states.
4. Make deletion origin-aware before allowing connected-existing resources.
5. Add `configureVaultResources` for a connected vault. It records targets and starts a resource
   provisioning workflow.
6. Implement Convex create/connect target execution.
7. Implement Cloudflare create/connect target execution, with Worker-only attach separated from
   Noter-managed Builds wiring.
8. Turn resource rail disabled actions into real actions.
9. Add read-only discovery inventory.
10. Add suggestion scoring and preselection.

## Tests To Add

Backend:

1. Existing-repository vault can configure Convex without changing `githubMode`.
2. Existing-repository vault can configure Cloudflare only when target mode is explicit.
3. Connected-existing resources are not deleted by default.
4. Noter-created resources remain eligible for cleanup when selected.
5. `configureVaultResources` rejects missing provider connections and missing account/team scope.
6. Cloudflare discovery matches by GitHub repo id before owner/name.
7. Cloudflare discovery handles multiple Workers for one repo without auto-selecting.
8. Convex discovery matches a visible `VITE_CONVEX_URL` to deployment inventory.
9. Convex name-only matches are suggestions, not attached targets.
10. Provider setup summaries derive from provider states for existing repositories, not from
    `githubMode`.

Frontend:

1. Existing-repository resource rail shows active Convex and Cloudflare setup actions after source
   setup is ready.
2. Resource pickers show suggested resources with visible evidence.
3. Connect-existing resource rows show dashboard links after success.
4. Connected-existing resources do not show destructive cleanup as the default.
5. Running and failed provider setup states stay provider-specific.

Visual:

1. Resource rail with missing resources and active actions.
2. Convex picker with one strong suggestion and multiple inventory rows.
3. Cloudflare picker with one strong GitHub-repo match and one ambiguous name match.
4. Delete dialog with created-by-Noter and connected-existing resources.

## Decision Answer

The first step should not auto-figure out and attach projects. It should create the durable contract
for explicit provider resource targets, then use auto-discovery as a helper.

For New App, keep the main flow focused on creating the complete standard stack. For existing or
partial apps, use a resource configuration flow from the vault/resource rail. That gives users the
escape hatch they need without making the create action carry every combination of GitHub, Convex,
Cloudflare, existing, new, auto-detected, and intentionally absent resources.

The long-term automatic direction is still valid. Cloudflare can often identify the GitHub repo
through Workers Builds triggers. Cloudflare can sometimes identify Convex through visible build
configuration. Convex cannot identify GitHub directly. That evidence model should drive suggestions
and preselection, not silent adoption.

## Sources

- [link Cloudflare Workers Builds docs](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [link Cloudflare Workers Builds API reference](https://developers.cloudflare.com/api/resources/workers_builds/)
- [link Cloudflare Workers API reference](https://developers.cloudflare.com/api/resources/workers/)
- [Convex Management API docs](https://docs.convex.dev/management-api)
- [Convex Management API OpenAPI document](https://api.convex.dev/v1/openapi.json)
- [Current Cloudflare API validation spec](../specs/104_CLOUDFLARE_MCP_API_VALIDATION_SPEC.md)
- [Current Convex API validation spec](../specs/103_CONVEX_API_VALIDATION_SPEC.md)
