# 115 Vault App Resource Ownership Spec

## Document Control

- Status: Accepted
- Owner: Samebase vault app and infrastructure model
- Last updated: 2026-07-17
- Related docs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/090_ROUTE_SEARCH_PRESENCE_FLAGS_SPEC.md`
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
  - `specs/110_VAULT_ROUTE_SURFACE_SPEC.md`

This spec supersedes those documents wherever they treat a root string as provider identity, assume
same-root Worker and Convex ownership, name the field `appRoot`, expose `add-app-root` or `app-root`
route parameters, address a deployment route by root string, or wire Builds automatically during
Worker attachment. Their provider-specific connection details remain current where they do not
conflict with this model.

## Nouns

- **Vault**: one GitHub repository connected to Samebase for repository observation.
- **App**: a durable Samebase row representing one repository root. It has a stable `appId` and an
  exact `rootDirectory`.
- **Root directory**: the repository path where an app lives. The repository root is exactly `/`. A
  nested root is a relative path without a leading or trailing slash, such as `apps/web` or
  `packages/backend`. Samebase uses Cloudflare's `root_directory` spelling and meaning.
- **Provider resource**: an external resource attached to an app by stable provider identity. Its
  root directory is not its identity.
- **Worker**: a Cloudflare Worker provider resource. Cloudflare Workers is the only hosting resource
  Samebase supports.
- **Convex deployment**: a Convex production deployment provider resource. It belongs to the app
  selected as the Convex project's root.
- **Deployment dependency**: an explicit directed relation saying that one Worker's build pipeline
  deploys one Convex deployment. It does not transfer resource ownership.
- **Build**: evidence that a provider build actually ran. A possible deployment dependency without a
  build is not an empty or failed build.

## Current Contract

### Durable app identity

An app is stored independently from its provider resources. Its stable `appId`, not its root string,
is the foreign-key target for Worker and Convex resource rows. Within one vault, one normalized
`rootDirectory` identifies one app row. Provider-resource identity remains its stable provider ID.
The `/` app may coexist with nested apps in the same vault.

An app remains visible when it has no Worker and no Convex deployment. This is a normal state, not
an incomplete provider record. An Expo app at `apps/mobile`, for example, remains a useful app even
when Samebase does not model its runtime hosting.

Worker and Convex resources each belong to exactly one app. Different resource types can share the
same root without colliding. More than one Worker may also use one root if the provider contains
that configuration. An app owns zero or one Convex production deployment and zero or more Workers.
Samebase never uses `rootDirectory` as a Worker or Convex deployment ID.

Creating an app and attaching a provider resource are separate operations. The repository-root app
may be added before or after nested apps, but it can exist only once. Every other app identifies its
own folder root. The UI asks the user to add an app and treats `rootDirectory` as that app's
location; it does not model "app root" as another entity.

### Resource ownership and display

A shared Convex deployment appears once beneath the app that owns its actual root. Samebase does not
copy it beneath every client that imports its generated API or calls its URL.

For the shared-backend fixture:

| Root directory     | Owned resources                                            |
| ------------------ | ---------------------------------------------------------- |
| `apps/web`         | `shared-convex-monorepo-fixture-web` Worker                |
| `apps/mobile`      | none                                                       |
| `packages/backend` | `shared-convex-monorepo-fixture-backend` Convex deployment |

The UI shows all three apps. It shows the shared Convex deployment only under `packages/backend`.
Deployment-specific schema and database routes address the selected Convex deployment by its stable
Samebase deployment ID. A root directory is display and ownership context, not a deployment route
identifier.

### Explicit deployment dependencies

A Worker-to-Convex deployment dependency is stored only when the Worker build pipeline is intended
to deploy that Convex deployment. The relation references the Worker resource ID and Convex
deployment resource ID, so cross-root wiring does not rely on path equality.

Attaching a Worker records only the Worker resource. It does not infer a Convex dependency, create
Workers Builds triggers, or start a build. Connecting the Worker to its GitHub repository is a
separate explicit operation. If Convex deployments are available, Samebase asks whether this Worker
deploys none of them or one specifically selected deployment.

When reconnecting a Worker that already has a dependency, the chooser shows that dependency
explicitly and allows another Convex deployment to be selected. This slice does not detach an
existing dependency, so it does not present a Worker-only choice that would leave the stored edge
and deploy keys unchanged.

Selecting a Convex deployment claims the explicit dependency, creates or reconciles both Workers
Builds triggers without starting a build, rotates the dependency's two deploy keys, installs and
reads back the least-privilege trigger secrets, and only then starts the initial production build.
The dependency stays `not_wired` until that sequence completes. This prevents a deliberately created
build from starting with missing or partially installed backend credentials.

Importing a Convex API, using a Convex URL, sharing a commit, or living nearby in the repository
does not create a deployment dependency. In particular, `apps/mobile` consumes the shared backend at
runtime but has no Worker build pipeline, so Samebase must not infer a mobile-to-backend deployment
edge.

Each dependency owns the unique Convex deploy-key names minted for that Worker pipeline. A recorded
production key also retains the deployment name it targets; a preview key retains its project ID.
The names and targets do not live as one global pair on the Convex deployment. This permits multiple
Workers to depend on one backend, and lets Samebase revoke an old relationship after the deployment
row is reconnected to a different provider resource. Secret values are passed directly between
provider operations and are never stored in Samebase.

Each wiring attempt mints fresh provider key names. Before asking Convex to create either key,
Samebase records that exact name, provider target, and owning run on the dependency as `creating`.
`creating` means the key may or may not exist at Convex because Samebase might have lost the
provider response. Recovery deletes that exact identity and accepts a provider not-found response as
success before minting a replacement. Only the same active run, name, and target may advance a key
from `creating` to `created`.

Attempts are therefore disjoint: a superseded action can clean up only its own names and cannot
delete a newer action's provider keys. A retry deletes the dependency's recorded prior names before
minting its new pair. Successful provider deletion clears only the exact matching `creating` or
`created` identity. Failed deletion retains the identity for recovery.

Rewiring a Worker to another Convex deployment keeps the same dependency identity and makes the
relationship `not_wired`. Samebase revokes the old target-specific keys before minting replacements.
A failure leaves the relationship visibly `not_wired`. When a shared Convex deployment becomes
unavailable or changes provider identity, every relationship pointing to it reads as `not_wired`.
Samebase derives that state from the stored key targets and current provider identity rather than
rewriting every dependent relationship. The stored key identities remain available for exact
cleanup, and the UI must never report a relationship as wired while its Convex deployment is missing
upstream.

Samebase-managed Cloudflare triggers use least privilege:

- the production trigger stores only `CONVEX_DEPLOY_KEY`, as a secret;
- the preview trigger stores only `PREVIEW_CONVEX_DEPLOY_KEY`, as a secret;
- the production key targets the selected production deployment;
- the preview key targets the selected Convex project and creates or updates branch previews.

Cloudflare returns secret names and `is_secret`, but not their values. Infrastructure verification
proves the expected secret name and classification on each trigger and the absence of the other
trigger's key. It cannot prove the write-only value, so Samebase retains the provider key name on
the dependency and relies on a real provider build to prove end-to-end deployment.

Deleting a vault removes Samebase's local app, resource, and dependency rows. It writes to a
provider only for a resource the user explicitly selected for deletion. A retained Worker keeps its
Builds triggers, variables, repository connection, and builds unchanged. A retained Convex project
or deployment keeps its production and preview deploy keys unchanged. When a Worker is explicitly
selected for deletion, its Builds triggers are subordinate resources and are deleted immediately
before the Worker itself.

Account deletion follows `specs/113_ACCOUNT_DELETION_SPEC.md`: it may revoke Samebase's supported
OAuth grants and removes local provider credentials, but it does not change Workers, Builds
triggers, Convex projects or deployments, or Convex deploy keys. Previously distributed deploy keys
can remain usable until the user revokes Samebase in Convex Authorized Applications.

### Shared-backend fixture trigger contract

The `apps/web` Worker has two triggers connected to the fixture repository. Both use:

- `root_directory: "apps/web"`;
- `build_command: "pnpm run build"`;
- `path_includes`: `apps/web/*`, `.node-version`, `.nvmrc`, `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, and `packages/backend/*`;
- `path_excludes: []`.

The production trigger includes only `main`, runs `pnpm run deploy`, and stores only
`CONVEX_DEPLOY_KEY`. The preview trigger includes `*`, excludes `main`, runs
`pnpm run deploy:preview`, and stores only `PREVIEW_CONVEX_DEPLOY_KEY`.

The repository build script runs Convex from `packages/backend`, then builds `apps/web` with the
selected deployment URL. The Worker's root remains `apps/web`; watching and deploying another root
records a dependency rather than changing ownership.

### Provider-optional GitHub monitoring

Repository inventory, branches, pull requests, comparisons, checks, and filtering require GitHub
access only. A user can monitor a repository without connecting Cloudflare or Convex and without
creating infrastructure resources. Cloudflare and Convex connections enrich explicit app rows but do
not gate ordinary GitHub monitoring.

Samebase supports Cloudflare Workers only as hosting. It does not model Cloudflare Pages, Netlify,
Expo hosting, or another hosting provider. Convex-only and resource-empty apps remain valid.

## Fixture Acceptance Stories

1. Connecting the shared-backend fixture produces three durable apps with different stable IDs.
   Reloading or refreshing the repository does not recreate those app identities.
2. `apps/mobile` remains visible with no provider resource and no deployment dependency.
3. The Worker appears under `apps/web`; the Convex deployment appears once under `packages/backend`;
   the cross-root dependency is visible separately.
4. A mobile-only commit creates no Worker check and no Worker build record.
5. A web-only or backend-only commit creates exactly one web Worker build because both roots are in
   that Worker's trigger paths.
6. A preview build deploys `packages/backend` to the branch-named Convex preview, builds `apps/web`
   with that deployment URL, and publishes one immutable Worker version URL plus one mutable branch
   alias URL.
7. A same-root full-stack app can own both a Worker and a Convex deployment without either resource
   replacing the other.
8. A repository with no Cloudflare or Convex connection still exposes its complete GitHub monitoring
   UI.
9. Attaching a Worker creates no Builds trigger. Choosing "No Convex deployment" connects ordinary
   Worker Builds; choosing a specific deployment creates the explicit dependency and does not start
   its initial build until both trigger secrets have been read back successfully.

## Validation

Provider-mocked tests must prove root-directory normalization, stable app/resource foreign keys,
exact trigger payloads, least-privilege environment-variable payloads, dependency-owned deploy-key
state, idempotent rewiring, drift detection, and cleanup after partial failure. They must also prove
that retained provider resources produce no Cloudflare or Convex calls during vault or account
deletion, while an explicitly selected Worker deletion still removes its triggers and then the
Worker.

Live fixture validation must prove Cloudflare path filtering, root-relative build execution,
write-only secret readback, branch preview creation, deployment URL injection, GitHub check counts,
and the immutable versus branch-alias preview URLs. It must include mobile-only, web-only, and
backend-only commits.

The app dashboard must be checked against the real connected fixture. Unit-only fixture UI is not
sufficient evidence for ownership placement or empty-app visibility.

## Non-Goals

- Inferring runtime dependencies between arbitrary clients and backends.
- Supporting another hosting provider or Cloudflare Pages.
- Copying provider deployment history into Samebase.
- Showing closed pull requests or historical build attempts.

## Rollout

Development and production vault data must be reset before their deployments adopt this schema, then
the fixtures and user vaults can be reconnected. This reset is a merge prerequisite, not a
migration. No legacy root-directory adapter, dual-read path, or data backfill is required. The
implementation replaces the old same-root assumption directly and deletes the obsolete shape.
