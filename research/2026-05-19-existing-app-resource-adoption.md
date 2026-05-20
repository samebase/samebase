# Existing App Resource Adoption Research

## Document Control

- Status: pruned decision research
- Owner: Noter vault source setup and provider resource adoption
- Created: 2026-05-19
- Pruned: 2026-05-20
- Prompt: design the Noter flow for connecting an existing app repo to existing
  or new provider resources, using `github.com/nicu-chiciuc/weight_tsx` as the
  motivating example.
- Related:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
  - `research/2026-05-18-new-app-provider-name-selection.md`

This note was pruned from a longer running notebook. The previous draft also
contained resource rail fixture debugging, recorded provisioning timelines,
dashboard hash-anchor decisions, and exploratory UI alternatives. Those were
removed because they are PR-local history or separate dashboard behavior, not
the source of truth for provider resource adoption.

## Core Decision

The product model is not "Noter-managed vault" versus "existing repo". A vault
has separate resource origins:

- GitHub source repository: Noter-created or user-adopted
- Convex production resource: Noter-created or user-adopted
- Convex preview setup: Noter-created or user-adopted/reused
- Cloudflare Worker: Noter-created or user-adopted
- production domain: Noter-managed, user-adopted, or external/unmanaged

`githubMode` should only describe the GitHub source origin. It should not decide
whether Convex or Cloudflare resources can be configured, displayed, retried, or
deleted.

Provider resource ownership should be recorded per resource:

```ts
type VaultResourceOrigin =
  | "created_by_noter"
  | "connected_existing"
  | "external_observed";
```

Deletion, DNS changes, and data migration should use this per-resource origin,
not the GitHub source mode.

## Current Constraint

Provider credentials are user-scoped in `providerConnections`. They answer "can
this user call the provider API?" They do not say which provider resources
belong to a vault.

Current connected vaults already have provider state fields:

- `convex: not_configured | provisioning | connected | failed`
- `cloudflare: not_configured | provisioning | connected | failed`

But the current "Noter-managed" helper is effectively
`githubMode === "create_repository"`. That makes existing-repository vaults
source-only even though their state shape could represent later Convex and
Cloudflare setup.

Current infrastructure storage is split:

- `vaultInfrastructure` stores Convex production metadata
- `vaultInfrastructureTargets` stores selected names and early provider
  identities before side effects
- Cloudflare Worker identity and production URL live on `vaults.cloudflare`
- `vaultDomains` stores branch-to-URL mappings
- `appProvisioningRuns` and `appProvisioningEvents` store workflow progress

For V1 adoption, do not replace all of this with a new generic registry. The
smaller useful move is to add resource origin and target mode to the existing
provider resource states/targets, then refactor into a registry only when
domains and preview deployments need to become first-class resources.

## V1 User Flow

For an existing repository vault:

1. User connects or already has a GitHub repo attached to the vault.
2. Noter scans simple repo signals:
   - `convex/`
   - package manager lockfile
   - package scripts
   - `wrangler.jsonc` or `wrangler.toml`
   - old host config files
3. User explicitly chooses provider targets:
   - Convex: connect existing production deployment, or create new project
   - Cloudflare: create new Worker, or connect existing Worker
4. Noter records the selected targets before provider side effects.
5. Workflow creates or connects only the approved resources.
6. Dashboard shows the attached resources and production URL when known.
7. DNS stays untouched until a later verified cutover action.

For `weight_tsx`, the recommended first path is:

1. connect `nicu-chiciuc/weight_tsx`
2. connect an existing Convex production deployment by explicit selection
3. create a Cloudflare Worker named `weight-tsx`
4. configure Workers Builds and Convex deploy-key secrets
5. display GitHub, Convex, Cloudflare, and production URL links
6. leave Netlify/old hosting and DNS serving production until Worker
   verification passes

## Provider Scopes

Provider connection UX should be OAuth-first. When this note says "credential"
or "token", it means an internal credential Noter receives through OAuth or a
provider app installation flow. Users should not paste API keys in the standard
path.

V1 scope behavior:

- GitHub: keep using the selected repository owner from the repo connect/create
  flow. GitHub App installation can be a separate follow-up.
- Convex: treat the connected Convex team as the current scope. List production
  deployments inside that team. If the user needs another team, rerun/switch the
  Convex provider connection rather than building multi-team picking now.
- Cloudflare: Workers are account-scoped. If the connected Cloudflare token can
  see multiple accounts, show an account picker before listing Workers. Store
  the selected `accountId` with the vault target.

## Target Model

Targets are the provider resources a run is allowed to touch. Connected resource
state is what is attached after the run succeeds. Keep those separate.

V1 Convex target modes:

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
```

V1 Cloudflare target modes:

```ts
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

Each target mode should record the intended origin:

- create modes become `created_by_noter`
- connect modes become `connected_existing`
- read-only discovered resources can be shown as `external_observed` but should
  not be treated as attached until the user approves

## Discovery Rules

Discovery should make explicit selection easier, not replace it.

Safe repo-derived signals:

- `convex/` means the repo uses Convex
- package scripts reveal build command candidates
- lockfiles suggest `pnpm`, `npm`, or `yarn`
- `wrangler` config may reveal an existing Worker name
- old host config can explain migration context

Unsafe repo-derived signals:

- production Convex deployment identity
- production data ownership
- actual Cloudflare Worker identity when no Worker config exists
- DNS readiness

Good evidence is inspectable by the user:

- committed config files
- provider resource names and trigger metadata
- non-secret environment variable names and public values
- deployed app URLs and public runtime asset references
- provider inventory confirmation

Do not silently adopt resources from fuzzy name matching, encrypted secret
values, build logs, or hidden deploy-key evidence.

Cloudflare can help suggest Convex only when evidence is visible. For example, a
deployed Worker bundle for a Vite app may include a public `*.convex.cloud` URL.
Noter can show that URL and match it against Convex inventory, but the user
still must approve the Convex deployment.

## Dashboard Behavior

Every connected vault should have a compact provider resource surface:

- GitHub repo link
- Convex project/deployment name, with dashboard link only when enough slug data
  exists
- Cloudflare Worker link
- production URL on the default branch row when known

The dashboard should not invent fallback scopes. If the Convex team slug is
unknown but the project slug is known, show the project slug and hide the
external Convex dashboard link.

The main resource surface should stay quiet:

- ready resources render as provider-logo links
- missing resources render as setup actions only when the setup flow exists
- unwired future actions should be disabled or absent
- detailed workflow logs belong in developer tools

## Safety Rules

- Connecting an existing Convex production deployment must never create a fresh
  project unless the target mode is explicitly `create_project`.
- Connecting an existing Convex deployment must never migrate, delete, import,
  export, or copy production data.
- Creating Convex preview infrastructure must not touch production data.
- Connecting an existing Worker must not overwrite build triggers or secrets
  until the user approves Noter to manage deploys for that Worker.
- DNS/domain changes are a separate later action.
- Deletion must skip `connected_existing` resources by default.
- Destructive cleanup should be available only for `created_by_noter` resources,
  with explicit user opt-in.

## Implementation Path

1. Fix visibility.
   - Show known Convex and Cloudflare resource names at vault level.
   - Keep external dashboard links conditional on complete provider slugs/ids.
   - Do not fall back from Convex team slug to team id.

2. Split predicates.
   - Keep `githubMode` as source origin.
   - Replace broad `isNoterManagedVault` gates with narrower helpers such as
     `isNoterCreatedRepositoryVault`, `canConfigureVaultResources`, and
     `canDeleteGitHubRepository`.

3. Extend targets.
   - Add create/connect target modes for Convex and Cloudflare.
   - Store provider scope with the target.
   - Record target origin before provider side effects.

4. Add `configureVaultResources`.
   - Require a connected vault owned by the user.
   - Validate provider connections and selected provider resources.
   - Start a resource provisioning run.
   - Do not include DNS changes.

5. Make deletion origin-aware.
   - Delete only `created_by_noter` resources when explicitly selected.
   - Skip adopted resources by default.
   - Preserve audit events for adopted resources left untouched.

## Open Questions

1. Should Noter create a Convex preview deployment for an adopted production
   project by default, or ask separately?
2. Should adopted Cloudflare Workers start as display-only before Noter manages
   Workers Builds?
3. Should external production domains become a visible row before Noter can
   manage DNS?
4. Should provider resource setup be a modal, expanded card area, or vault
   route?

## Sources

- [link https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
- [link https://developers.cloudflare.com/workers/ci-cd/builds/configuration/](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [link https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [link https://developers.cloudflare.com/api/resources/workers_builds/](https://developers.cloudflare.com/api/resources/workers_builds/)
- [link https://docs.convex.dev/management-api](https://docs.convex.dev/management-api)
- [link https://docs.convex.dev/management-api/create-deploy-key](https://docs.convex.dev/management-api/create-deploy-key)
- [link https://docs.convex.dev/cli/deploy-key-types](https://docs.convex.dev/cli/deploy-key-types)
- [link https://docs.convex.dev/production/hosting/preview-deployments](https://docs.convex.dev/production/hosting/preview-deployments)
- [link https://docs.convex.dev/dashboard/deployments/](https://docs.convex.dev/dashboard/deployments/)
