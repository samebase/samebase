# Existing App Resource Adoption Research

## Document Control

- Status: Current-state research
- Owner: Noter vault source setup and provider resource adoption
- Created: 2026-05-19
- Prompt: design the Noter flow for connecting an existing app repo to existing
  or new provider resources, using `github.com/nicu-chiciuc/weight_tsx` as the
  motivating example.
- Related:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
  - `research/2026-05-18-new-app-provider-name-selection.md`

## Summary

The clean product model is not "Noter-managed vault" versus "existing repo". It
is:

1. source repository origin: Noter-created or user-adopted GitHub repo
2. Convex production resource: Noter-created or user-adopted project/deployment
3. Convex preview resource: Noter-created or user-adopted/reused preview setup
4. Cloudflare Worker: Noter-created or user-adopted Worker
5. production domain: Noter-created/managed, user-adopted, or external/unmanaged

The current code has the first axis only. `githubMode === "create_repository"`
means both "Noter created the GitHub repo" and "provider infrastructure may be
managed by Noter". That is now the wrong boundary. Existing GitHub repo vaults
are intentionally source-only today, but they should be allowed to add provider
resources after source setup.

The safest next model is a vault-scoped resource registry that records each
provider resource with a per-resource origin:

- `created_by_noter`
- `connected_existing`
- `external_observed`

Deletion, DNS changes, and data migration should be driven by that origin per
resource, not by the GitHub source mode.

Resource discovery should stay simple and inspectable. When Noter thinks two
resources are connected, the dashboard should be able to show the evidence in
plain terms, such as "this Worker is connected to this GitHub repo by a
Cloudflare Builds trigger" or "this deployed app bundle references this public
Convex URL." Avoid hidden heuristic chains that force operators to dig through
logs or trust a fuzzy match.

Provider connection UX should be OAuth-first. When this note says "token", it
means the internal credential Noter receives and stores after an OAuth or app
installation flow. Users should not need to paste API keys for the standard
path. API keys can remain a fallback while the integration is maturing, but the
main adoption design should assume provider OAuth or provider app installation.

## Current Runtime Model

### Provider Credentials

Provider credentials are user-scoped in `providerConnections`:

- GitHub: OAuth or API key, optional username
- Convex: OAuth or API key, team id, optional team slug
- Cloudflare: MCP OAuth or API key, optional account id, token health metadata

These rows answer "can this Noter user call the provider API?" They do not say
which provider resources belong to a vault.

Terminology note: `auth.credential` is an internal stored provider credential.
It should usually come from OAuth. Avoid designing V1 language or UI around
users pasting provider API keys.

Current source files:

- `apps/noter/convex/schema.ts`
- `apps/noter/convex/providerConnections.ts`
- `apps/noter/convex/users.ts`
- `apps/noter/convex/convexOAuth.ts`

### Vault Source State

`vaults` is the durable app container. Connected vaults record GitHub identity
and source mode:

- `githubMode: "create_repository"` for Noter-created repos
- `githubMode: "connect_existing_repository"` for adopted repos

Both connected variants have provider state fields:

- `convex: not_configured | provisioning | connected | failed`
- `cloudflare: not_configured | provisioning | connected | failed`

But the helper type narrows "Noter-managed" to
`githubMode === "create_repository"`. That helper is used by infrastructure
provisioning, dashboard provider setup summaries, and deletion planning. This
blocks existing-repository vaults from using infrastructure setup even though
their provider state shape could represent it.

Current source files:

- `apps/noter/convex/vault/model.ts`
- `apps/noter/convex/vault/state.ts`
- `apps/noter/convex/vault/records.ts`

### Infrastructure Records

Current infrastructure tables:

- `vaultInfrastructure`: Convex production resource metadata
- `vaultInfrastructureTargets`: selected provider names and early identities
- `vaultInfrastructureOwnership`: active/succeeded/failed writer run
- `vaultDomains`: branch to URL mappings
- `appProvisioningRuns` and `appProvisioningEvents`: workflow progress and logs

`vaultInfrastructure` is Convex-only after the Workers migration. Cloudflare
Worker identity lives on `vaults.cloudflare.connected`, and production URL also
lives there. `vaultDomains` tracks URLs by branch.

Current source files:

- `apps/noter/convex/schema.ts`
- `apps/noter/convex/infraProvisioning.ts`
- `apps/noter/convex/cloudflareResources.ts`
- `apps/noter/convex/vault/dashboard.ts`

### Current Create Flow

New app creation:

1. UI requires GitHub, Convex, and Cloudflare provider connections.
2. UI collects GitHub repo name, selected GitHub owner, Convex project name, and
   Cloudflare Worker name.
3. Backend inserts an initializing vault and `vaultInfrastructureTargets`.
4. Workflow creates GitHub repo, connects source, seeds starter, syncs tree.
5. Workflow claims infra ownership.
6. Workflow ensures Convex production deployment.
7. Workflow ensures Convex preview deployment.
8. Workflow ensures Cloudflare Worker, repo connection, build triggers, build
   secrets, and first build.
9. Workflow records production URL and domain row.

Important behavior: the create path validates provider resource names before any
provider side effect.

Current source files:

- `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
- `apps/noter/convex/vault/actions.ts`
- `apps/noter/convex/appProvisioningWorkflow.ts`
- `apps/noter/convex/appProvisioningWorkflowActions.ts`
- `apps/noter/convex/infraProvisioning.ts`

### Current Existing Repository Flow

Existing repo connection is source-only by design:

1. `/add` lists GitHub repositories.
2. User clicks connect.
3. Backend inserts an initializing vault and run.
4. Workflow validates GitHub, fetches repo identity/default branch, connects the
   vault to GitHub, syncs the initial tree, marks setup complete.
5. Existing repo vault is connected with:
   - `convex: { state: "not_configured" }`
   - `cloudflare: { state: "not_configured" }`

Provider setup remains `not_applicable` because `isNoterManagedVault` is false
for `githubMode: "connect_existing_repository"`.

Current source files:

- `apps/noter/src/components/AddRepository.tsx`
- `apps/noter/convex/vault/actions.ts`
- `apps/noter/convex/appProvisioningWorkflow.ts`
- `apps/noter/convex/appProvisioningWorkflowActions.ts`
- `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`

## Concrete Example: `weight_tsx`

Repository metadata from GitHub:

- repository: `nicu-chiciuc/weight_tsx`
- default branch: `main`
- visibility: private
- repo shape: Vite + React + Convex
- package scripts:
  - `build`: `tsc -b && vite build`
  - `dev:backend`: `convex dev`
  - no committed Wrangler config
  - no committed Netlify config found at the repo root
  - `vercel.json` exists and rewrites all routes to `index.html`

The repo includes a `convex/` directory, so Noter can infer that it is a Convex
app. Noter cannot infer the existing production Convex project/deployment from
Git alone unless deployment metadata is committed or discoverable through a
provider-side inventory match. Local `.env.local` and Convex CLI selection state
are normally not in Git, and production data safety means Noter must not guess a
deployment if multiple plausible matches exist.

Likely default setup proposals for this example:

- GitHub repo: `nicu-chiciuc/weight_tsx` (connected existing)
- Convex: connect existing production deployment selected from Convex inventory
- Cloudflare Worker: create `weight-tsx` unless an exact existing Worker is
  selected
- root directory: `/`
- build command: `pnpm run build` only if the repo is converted to pnpm; current
  package file suggests `npm run build` is safer unless Noter also commits pnpm
  lock/tooling
- production branch: `main`
- deploy command: should come from the Worker template migration, usually
  `pnpm run deploy` or `npx wrangler deploy` depending on the committed app
  scripts
- preview deploy command: `pnpm run deploy:preview` or
  `npx wrangler versions upload`
- production Convex deploy key secret: current Noter code uses
  `PROD_CONVEX_DEPLOY_KEY`
- preview Convex deploy key secret: current Noter code uses
  `PREVIEW_CONVEX_DEPLOY_KEY`

## External Provider Constraints

### Cloudflare Workers Builds

Current Cloudflare docs describe Workers Builds as a build command followed by a
deploy command. Non-production branch builds can use a different preview deploy
command. Trigger configuration includes build command, deploy command, root
directory, branch include/exclude patterns, path include/exclude patterns, a
build token UUID, and environment variables.

Important constraints from the docs:

- The Builds API uses Worker tags, exposed as `external_script_id`, rather than
  only the Worker name.
- Each Worker has production and preview trigger concepts.
- Environment variables are configured per trigger, so production and preview
  Convex deploy keys can differ.
- The API token used to call Workers Builds is separate from the build token
  used by the build system.
- A one-time GitHub App connection is required in Cloudflare before the API can
  fully connect a repo.

Sources:

- <https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>
- <https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/>
- <https://developers.cloudflare.com/api/resources/workers_builds/>

### Convex Management And Deploy Keys

Current Convex docs describe:

- Management API endpoints for listing projects, creating projects, listing
  deployments, creating deployments, and creating deploy keys.
- Deploy keys can target production, preview, project, team, dev, or admin
  capabilities.
- CI/hosting providers commonly use `CONVEX_DEPLOY_KEY`.
- Preview deploy keys are project-scoped and let `npx convex deploy` create or
  target branch preview deployments.
- Convex preview deployments are separate from production data and may be
  temporary.

Sources:

- <https://docs.convex.dev/management-api>
- <https://docs.convex.dev/management-api/create-deploy-key>
- <https://docs.convex.dev/cli/deploy-key-types>
- <https://docs.convex.dev/production/hosting/preview-deployments>
- <https://docs.convex.dev/dashboard/deployments/>

## Likely Convex Deployment Visibility Bug

There are two likely reasons "the Convex deployment never appears" for new apps.

### 1. Dashboard Link Requires `teamSlug`

`getUserVaults` builds Convex dashboard links only when it has:

- team slug from the Convex provider connection
- project slug from `vault.convex.connected`
- deployment name from `vault.convex.connected`

Local anonymous seed has `DEV_SEED_CONVEX_TEAM_ID`, but not
`DEV_SEED_CONVEX_TEAM_SLUG`. In that state, a new app can have a connected
Convex project and deployment in the database while the dashboard hides the
Convex deployment link because it cannot build the dashboard URL.

This is probably a display bug, not an infrastructure provisioning bug.

Clean fix direction:

1. display stored Convex resource names and URLs even when dashboard slugs are
   incomplete
2. keep the external Convex dashboard link hidden until slugs are known
3. backfill or lazily resolve `teamSlug` from the Convex provider token details
   when possible

### 2. Production Deployment Link Is Attached To The Default Branch Row

The current UI renders the production Convex deployment link inside the default
branch row. If `vaultRemoteBranches` has not been refreshed yet, the repository
card can show provider setup as ready while no branch row exists to carry the
production deployment link.

Clean fix direction:

1. show a vault-level resource summary that does not depend on remote branch
   rows
2. keep the branch-row `Production deploy` link as a useful secondary shortcut
3. source the resource summary from `vaults` + `vaultInfrastructure` +
   `vaultDomains`

## Product Flow Proposal

### Principle

Treat provider setup as a separate resource plan after source setup. The source
repo flow answers "what code is this vault attached to?" The resource setup flow
answers "which production infrastructure should this vault use?"

### Dashboard Card

Every connected vault should have a compact resource rail in the header. This
rail should replace the current scattered provider links as the first thing that
explains what the vault is connected to.

- GitHub repository
- Convex production deployment
- Cloudflare Worker
- production domain
- preview/deploy status

The core V1 rail can stay to three provider rows:

```text
[green] GitHub       nicu-chiciuc/weight_tsx
[plus]  Convex       Connect
[empty] Cloudflare   Connect / Create Worker
```

The dot is the status surface:

- spinning/current: provisioning this resource
- green: connected or created successfully
- gray with plus/action: not configured
- red: failed and retryable

Each row should show only what helps the user decide or act:

- state: missing, selected, connected, provisioning, failed
- origin: Noter-created or connected existing
- stable provider name/id when known
- URL when known
- action: connect existing, create new, retry, open provider
- current status/error text only for running or failed rows

Avoid rendering every durable workflow event as a first-class row. The visible
rail should group the workflow by durable resource: GitHub, Convex, Cloudflare.
The row can show the current provider operation or known failure reason below
the main line; detailed workflow events and logs can remain available in the
expanded details or developer surface.

For the first implementation, keep the actions narrow:

- existing repo + no Convex: `Connect Convex`
- existing repo + no Cloudflare: `Connect Worker` or `Create Worker`
- connected provider rows: display only
- failed provider rows: retry with the same selected target

### Resource Setup Flow

For a connected repo with no provider resources:

1. User opens provider setup for the vault.
2. Noter scans repo shape:
   - `convex/` directory
   - package manager files
   - package scripts
   - `wrangler.jsonc` or `wrangler.toml`
   - old host config files
3. Noter proposes setup defaults.
4. User chooses per provider:
   - Convex: connect existing production deployment, or create new project
   - Cloudflare: create new Worker, or connect existing Worker
   - domain: leave external for now, or connect later
5. Noter records the resource target before side effects.
6. Workflow executes only approved side effects.
7. Dashboard shows the resource rows as they move to connected.

For `weight_tsx`, the default proposal should be:

1. adopt existing Convex production deployment
2. create Cloudflare Worker `weight-tsx`
3. leave DNS/domain untouched until Worker deploy is verified

### Version 1: Explicit Selection

The first adoption version should not require automatic discovery to be smart.
It can list provider inventory and let the user choose any resource they are
allowed to see:

- any Convex production deployment from the connected Convex account/team
- any Cloudflare Worker from the connected Cloudflare account

Noter should still show simple hints when it has them, such as "repo has
`convex/`", "Worker name matches repo name", or "deployed app references this
Convex URL", but those hints should not block selection. The user's explicit
choice is the source of truth for V1.

This keeps the first version debuggable and avoids over-investing in discovery
before the core adoption data model exists. Smarter Cloudflare-to-Convex proof
chains can come later as recommendations layered on top of the same manual
selector.

### Version 1: Scope Pickers

GitHub already needs an owner picker because repositories can live under the
viewer account or organizations. Provider adoption needs the same idea, but the
provider hierarchies are different.

Convex resources are organized by team, then project, then deployment. The
current Noter Convex connection stores one `teamId` and optional `teamSlug`, and
the Management API project list is team-scoped. For V1, treat the connected
Convex team as the current scope and list production deployments inside it. Show
the team name/slug near the picker. If the user needs a different team, the V1
action can be "Reconnect or switch Convex team" rather than building a
multi-team picker up front.

Cloudflare Workers are account-scoped. The current Noter connection stores an
optional `accountId`, and Noter already has an account inventory read. For V1,
show a Cloudflare account picker when the connected token can see multiple
accounts, then list Workers for the selected account. Auto-select the account
only when exactly one account is visible.

Store the chosen provider scope with the resource target. A global
`providerConnections.cloudflare.accountId` is useful as a default, but the vault
resource target should still carry its own `accountId` because different vaults
can reasonably adopt Workers from different Cloudflare accounts.

### Provider Auth Model Follow-Up

The provider scope picker question is tied to the provider connection model, so
it needs a separate implementation decision before Noter grows beyond V1.

GitHub currently uses an OAuth App-style flow with broad scopes. That may be
acceptable for early onboarding, but it should be compared with a GitHub App
installation model before adoption is generalized. GitHub Apps are generally
preferred by GitHub for integrations because they support fine-grained
permissions, explicit repository installation, organization-level approval, and
short-lived installation tokens. A likely long-term shape is GitHub App
installation for repository access and automation, with OAuth/user identity only
where Noter must act directly as the user.

Convex already has an OAuth application flow. The team authorization endpoint
lets the user pick a team during the provider-owned OAuth screen, and Convex
also exposes a project authorization endpoint. That means the first "team
picker" may not need to be a Noter-owned dropdown at all. V1 can keep a single
connected Convex team in `providerConnections`; switching teams can re-run the
Convex OAuth flow. A later version should investigate whether project-scoped
Convex OAuth is safer for adopting an existing production project, and whether
Noter should store multiple Convex team/project connections per user.

Cloudflare is already closest to the desired model because MCP OAuth gives Noter
a provider-owned OAuth flow and the Cloudflare API can list visible accounts for
an account picker.

Open investigation:

1. Should GitHub move from OAuth App scopes to a GitHub App installation model?
2. Should Convex adoption use team-scoped OAuth, project-scoped OAuth, or both?
3. Should `providerConnections` stay one row per user/provider, or become one
   row per provider scope such as GitHub installation, Convex team/project, and
   Cloudflare account?
4. Which API-key fallback buttons should remain visible once OAuth is stable?

## Data Model Proposal

### Replace The Overloaded Managed Predicate

Keep `githubMode` strictly about GitHub source origin.

Add resource-level origin. Do not use `isNoterManagedVault` to decide whether
Convex or Cloudflare setup is allowed.

Possible shape:

```ts
type VaultResourceOrigin =
  | "created_by_noter"
  | "connected_existing"
  | "external_observed";

type VaultProviderResourceState =
  | { state: "not_configured" }
  | {
      state: "selected";
      origin: VaultResourceOrigin;
      runId: Id<"appProvisioningRuns">;
      selectedAt: number;
    }
  | {
      state: "provisioning";
      origin: VaultResourceOrigin;
      runId: Id<"appProvisioningRuns">;
      startedAt: number;
    }
  | {
      state: "connected";
      origin: VaultResourceOrigin;
      connectedAt: number;
      // provider-specific identity fields
    }
  | {
      state: "failed";
      origin: VaultResourceOrigin;
      runId: Id<"appProvisioningRuns">;
      failedAt: number;
    };
```

This preserves the current small state machine while adding ownership.

### Add A Vault Resource Registry

The current `vaultInfrastructure` and `vaults.cloudflare` split works for the
MVP but makes adoption awkward. A registry table would make the dashboard,
deletion, and audit model clearer.

Possible table:

```ts
vaultProviderResources: {
  vaultId: Id<"vaults">;
  provider: "github" | "convex" | "cloudflare" | "domain";
  kind:
    | "github_repository"
    | "convex_project"
    | "convex_deployment"
    | "convex_preview_deployment"
    | "cloudflare_worker"
    | "production_domain";
  origin: "created_by_noter" | "connected_existing" | "external_observed";
  state: "selected" | "provisioning" | "connected" | "failed" | "detached";
  identifiers: object; // use provider-specific closed validators, not JSON
  urls: object; // use provider-specific closed validators, not JSON
  createdByRunId?: Id<"appProvisioningRuns">;
  connectedByRunId?: Id<"appProvisioningRuns">;
  createdAt: number;
  updatedAt: number;
}
```

Implementation note: do not use a loose `object` or JSON blob in real schema.
Use a discriminated union with closed provider-specific validators so impossible
resource rows are unrepresentable.

Minimal alternative:

- add `origin` to `vault.convex.connected`
- add `origin` to `vault.cloudflare.connected`
- add `resourceOrigin` fields to `vaultInfrastructure`
- add deletion checks against those origins

That is smaller but will likely need another refactor once domains and preview
deployments become first-class.

### Keep Targets Separate From Connected Resources

`vaultInfrastructureTargets` is already useful. It records chosen names and
early provider identities before side effects finish.

Extend the target concept to support adoption:

```ts
type ConvexTarget =
  | {
      mode: "create_project";
      teamId: string;
      projectName: string;
    }
  | {
      mode: "connect_existing_deployment";
      teamId: string;
      projectId: string;
      projectSlug: string;
      deploymentName: string;
      cloudUrl: string;
      siteUrl: string;
    };

type CloudflareTarget =
  | {
      mode: "create_worker";
      accountId: string;
      workerName: string;
    }
  | {
      mode: "connect_existing_worker";
      accountId: string;
      workerName: string;
      workerTag: string;
      productionUrl: string;
    };
```

Targets are "what this run is allowed to touch." Connected resource rows are
"what is now attached to this vault."

## Adoption Discovery

### Repo-Based Detection

Safe repo-derived signals:

- `convex/` directory means the app uses Convex
- `package.json` scripts reveal build command candidates
- package manager lockfile picks `pnpm`, `npm`, or `yarn`
- `wrangler.jsonc` or `wrangler.toml` can reveal an existing Worker name
- old host config can be shown as migration context

Unsafe repo-derived signals:

- production Convex deployment identity
- production domain ownership
- actual Cloudflare Worker identity if no Worker config exists
- DNS readiness

### Inspectable Discovery Principle

Prefer evidence that a user can verify without understanding Noter internals:

1. committed config files
2. provider resource names and trigger metadata
3. non-secret environment variable names and values
4. deployed app URLs and public runtime asset references
5. provider inventory confirmation

Avoid relying on opaque or hard-to-debug evidence:

- encrypted secret values
- deploy-key decoding that requires reading a hidden secret
- build logs as the primary proof path
- fuzzy name matching as an automatic adoption decision

The ideal adoption UI should show a short proof chain before asking for
approval. For example:

```text
GitHub repo nicu-chiciuc/weight_tsx
  -> Cloudflare Builds trigger for Worker weight-tsx
  -> deployed app bundle references https://...convex.cloud
  -> Convex inventory confirms deployment ...
```

This keeps failures understandable. If a link is missing, the user can inspect
the same few visible facts that Noter uses.

### Convex Inventory Matching

With Convex connected, Noter can list projects and deployments. Suggested
matching order:

1. exact deployment name typed/selected by the user
2. exact project slug/name selected by the user
3. exact project slug/name match against normalized repo name, shown as a
   suggestion only
4. no automatic match if multiple candidates exist

For production data safety, Noter should require explicit user selection before
attaching a Convex production deployment.

### Cloudflare Inventory Matching

With Cloudflare connected, Noter can list Workers in the account. Suggested
matching order:

1. exact Worker selected by the user
2. exact Worker name match from `wrangler` config, shown as a strong suggestion
3. exact Worker name match from normalized repo name, shown as a suggestion
4. no automatic match if multiple candidates exist

Cloudflare adoption can be safer than Convex data adoption because a Worker is
mostly deployment/config state, but Noter still should not patch build triggers,
secrets, or domains until the user approves.

### Cloudflare-To-Convex Discovery

For migrated apps, Cloudflare may be the best bridge from GitHub to Convex:

1. GitHub connects to Cloudflare through a Cloudflare Builds repo connection.
2. Cloudflare build trigger metadata identifies the Worker, branch, root
   directory, build command, deploy command, and environment variable names.
3. Build-time variables can prove the app is Convex-deployed when names such as
   `CONVEX_DEPLOY_KEY`, `PROD_CONVEX_DEPLOY_KEY`, `PREVIEW_CONVEX_DEPLOY_KEY`,
   `CONVEX_DEPLOYMENT`, or `VITE_CONVEX_URL` are present.
4. Secret values should not be used as evidence because Cloudflare hides them
   after creation. For Workers Builds, secret variable values are returned as
   `null`.
5. The deployed app bundle is often the simplest public proof. Vite/React apps
   commonly embed the public Convex URL, so Noter can fetch the Worker URL,
   inspect JavaScript assets or observed requests, find a `*.convex.cloud` URL,
   then match that URL against Convex inventory when Convex is connected.

This should be a "found likely connection" flow, not a silent adoption flow. If
Noter discovers the public Convex URL through the deployed app, it can show that
URL and ask the user to approve adopting the matching Convex deployment.

### Domain/DNS Detection

Do not change DNS during initial provider adoption.

Possible future read-only checks:

- read Cloudflare zones and custom domains if the Cloudflare account owns them
- record external production URL from user input
- verify Worker deployment first
- only then offer a domain cutover flow

The migration must allow Netlify or any old host to keep serving production
until the Worker URL is deployed and verified.

## Workflow Changes

### Split Source Setup From Resource Setup

Keep existing repo connect source-only. Add a second action:

```ts
api.vault.actions.configureVaultResources({
  vaultId,
  convexTarget,
  cloudflareTarget,
});
```

This action should:

1. require a connected, live vault owned by the user
2. validate provider connections needed by the selected targets
3. validate target identity and availability
4. insert or update target rows
5. create an `appProvisioningRuns` row with a new trigger, likely
   `"configure_resources"`
6. start a resource provisioning Workflow

### Resource Workflow

The Workflow should branch by target mode:

1. claim resource setup ownership
2. validate provider connections
3. connect or create Convex production deployment
4. create or connect Convex preview setup only after production is selected
5. create deploy keys only for deployments Noter is approved to deploy
6. create or connect Cloudflare Worker
7. configure Workers Builds triggers and env vars only after approval
8. trigger initial production build only for Noter-managed Cloudflare setup
9. record domain URL from Workers default URL
10. finish

### Important Safety Rules

- Connecting an existing Convex production deployment must never create a fresh
  project unless the target mode is explicitly `create_project`.
- Connecting an existing Convex deployment must never migrate, delete, import,
  export, or copy data.
- Creating Convex preview infrastructure must not touch production data.
- Connecting an existing Worker must not overwrite build triggers or secrets
  until the user approves Noter to manage deploys for that Worker.
- DNS/domain changes are a separate later action.
- Deletion must skip `connected_existing` resources by default.
- Destructive cleanup should be available only for `created_by_noter` resources,
  with explicit user opt-in.

## Dashboard Changes

### Current Gap

The current dashboard does not show a complete resource inventory. It shows:

- GitHub title/link
- Cloudflare Worker dashboard link when connected
- Convex project settings link when `teamSlug` and project slug are known
- Convex production deployment link only on the default branch row
- production URL in developer tools only when Cloudflare URL exists

That is why the new product need feels sharp now: there is no vault-level
resource ledger.

### Proposed Resource Area

Add a compact resource rail to each ready vault card/header:

```text
[green] GitHub       nicu-chiciuc/weight_tsx
[green] Convex       weight-tsx/production
[green] Cloudflare   weight-tsx
```

Keep copy minimal and use provider icons when they reduce ambiguity. The row
should exist even when the external dashboard link is unavailable. Production
domain and preview status should become their own compact rows or status
surfaces once they are first-class independent resources.

### Header Density Reconsideration

The row model is useful, but a full three-row resource rail with reserved
per-row status text is too tall for the sticky vault header. The header needs to
answer one question quickly: "is this vault connected and is anything blocking
me?" It does not need to show every current provider sentence all the time.

Good compact options:

1. **Resource strip**

   Show one inline strip after the vault title:

   ```text
   GitHub ok    Convex working    Cloudflare waiting
   ```

   Each segment has the provider mark, status dot, and provider resource name
   when known. Running/error text is inline only for the active or failed
   segment, such as `Convex tmp-my-new-app · Creating project`. Ready segments
   stay quiet. This keeps all three providers visible without adding a second
   text line per row.

   Best use: always-visible header state for normal ready/provisioning vaults.

2. **Resource summary plus popover**

   Show only three status marks and a short summary in the header:

   ```text
   GitHub ok · Convex action needed · Cloudflare not set up
   ```

   Clicking the summary opens the full three-row detail view with provider
   names, resource names, actions, current loading text, and exact error text.
   This is closest to the current rail state model while keeping the sticky
   header small.

   Best use: existing repo adoption, where Connect/Create choices can grow wider
   than the header.

3. **Attention row below the header**

   Keep the header compact and render one extra row only when there is an active
   operation, action required, or error:

   ```text
   Convex: Creating project.
   Cloudflare: Multiple Cloudflare accounts are available. Select an account.
   ```

   The normal ready state does not reserve this space. Layout movement is
   acceptable here because the extra row appears only for a real blocking or
   transient state, not as part of every steady header.

   Best use: transparent loading and errors without making every vault card
   permanently taller.

4. **Single resource action**

   For missing resources, avoid per-provider buttons in the header. Show one
   action such as `Set up resources` or `Finish setup`, then open the detailed
   resource selector. The detailed panel can still expose `Connect Convex`,
   `Create Convex`, `Connect Worker`, and `Create Worker`.

   Best use: narrow headers and mobile, where multiple Connect/Create buttons
   quickly dominate the title area.

5. **Details as setup section, not repository links**

   Keep the three-row component as the setup/details surface under the header,
   not as the always-visible header link area. In the header, show only a
   compact status strip or one setup action. In the body/setup section, show the
   row-level status text and exact provider actions.

   Best use: preserves the useful row state model while avoiding a tall sticky
   header.

Fixture follow-up: the split projection idea makes the mental model feel more
complex than it needs to be. Prefer one resource-links component with one
contract:

- always exactly three provider items in GitHub, Convex, Cloudflare order
- ready items are just provider-logo links to the concrete provider resource
- non-ready items keep the same provider logo and replace the link with the
  relevant action or in-progress value
- loading/error detail appears as a single compact message area for the whole
  component, not as reserved text below every provider item

This gives one mental model: the vault owns three provider resource slots. A
slot can be a link, an action, pending, running, or failed. The component can
stay compact enough for the header without inventing a separate detail
projection.

### Provider Setup CTA

For existing repo vaults:

- if no provider resources: show "Set up resources"
- if Convex missing: show "Connect Convex"
- if Cloudflare missing: show "Set up Cloudflare"
- if failed: show retry and log

For new apps:

- keep automatic create path
- show the same resource rows once connected

## Implementation Slices

### Slice 1: Fix Visibility

1. Show Convex resource names/URLs from `vaults.convex` and
   `vaultInfrastructure` even without `teamSlug`.
2. Move or duplicate production Convex deployment display into a vault-level
   resource area.
3. Keep dashboard links conditional on complete slugs.
4. Add dashboard query and component tests for:
   - connected Convex with missing team slug still displays deployment name
   - no remote branches yet still displays production deployment resource

### Slice 2: Rename The Predicate

1. Replace broad `isNoterManagedVault` infra gates with narrower helpers:
   - `isNoterCreatedRepositoryVault`
   - `canConfigureVaultResources`
   - `canDeleteGitHubRepository`
2. Leave GitHub deletion gated to Noter-created repos.
3. Allow provider setup for connected existing repos once source setup is ready.

### Slice 3: Add Resource Targets

1. Extend `vaultInfrastructureTargets` or add a new target table.
2. Support Convex target modes:
   - create project
   - connect existing deployment
3. Support Cloudflare target modes:
   - create Worker
   - connect existing Worker
4. Include provider scope in targets:
   - Convex `teamId`
   - Cloudflare `accountId`
5. Record target origin before provider side effects.
6. For V1, allow explicit selection from all visible provider resources instead
   of requiring automatic matching.

### Slice 4: Add Resource Configuration Action

1. Add `configureVaultResources`.
2. Add provider inventory reads for selectors.
3. Add validation tests for ambiguous or missing targets.
4. Do not add DNS changes.

### Slice 5: Adoption-Aware Deletion

1. Update deletion plan to use resource origins.
2. Default skip connected-existing Convex and Cloudflare resources.
3. Allow deleting only resources with `origin: "created_by_noter"`.
4. Preserve audit events for adopted resources left untouched.

## Open Questions

1. Should Noter create a Convex preview deployment for an adopted production
   project by default, or ask separately?
2. Should adopted Cloudflare Workers be "display only" first, with a second
   action to let Noter manage Workers Builds?
3. Should Noter support an external production domain row before it can manage
   DNS?
4. Should resource setup be a modal, an inline expanded card area, or a route
   under the vault?
5. Should the resource registry land now, or should we do the smaller origin
   fields first?

## Recommendation

Do the visibility fix first, because it is small and will make every later
resource model easier to inspect.

Then split the overloaded managed predicate before adding adoption. The core
schema decision should be resource-origin based; otherwise every later feature
will keep fighting the mistaken assumption that GitHub source origin determines
Convex and Cloudflare ownership.

For `weight_tsx`, the first useful shipped path is:

1. connect GitHub repo
2. connect existing Convex production deployment by explicit selection from all
   visible Convex deployments
3. create a new Cloudflare Worker named `weight-tsx`
4. configure Workers Builds and Convex deploy keys
5. display all linked resources
6. leave DNS and old hosting untouched until Worker verification passes
