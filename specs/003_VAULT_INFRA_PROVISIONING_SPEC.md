# Vault Infrastructure Auto-Provisioning Specification

## Document Control

- Status: Implemented for MVP
- Owner: Samebase backend/frontend
- Last updated: 2026-07-18
- App and provider resource model: `specs/115_VAULT_APP_RESOURCE_OWNERSHIP_SPEC.md`
- Vault-first source flow: `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
- Cloudflare Workers migration: `specs/101_CLOUDFLARE_WORKERS_SINGLE_STACK_MIGRATION_SPEC.md`
- Manual Convex attachment: `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`

This spec defines the composed create workflow. Spec 115 is the source of truth for app identity,
provider resource ownership, root-directory meaning, Worker-to-Convex dependencies, and provider
deletion boundaries. Older `appRoot`, same-root foreign-key, nested Worker deployment, and global
deploy-key shapes are superseded and are intentionally not repeated here.

## Contract

Creating a Samebase-managed repository starts an asynchronous, resumable workflow:

1. Create and connect the GitHub repository, seed the starter files, and sync the default branch.
2. Create the repository-root app if it does not exist.
3. Create or attach that app's Convex production deployment.
4. Create or attach that app's Cloudflare Worker.
5. Connect Workers Builds to GitHub.
6. Create the explicit Worker-to-Convex dependency, verify the selected Convex production
   deployment, mint dependency-owned production and preview deploy keys, install them on the
   corresponding triggers, and read back the trigger configuration.
7. Start the initial production build only after both trigger secrets are confirmed.
8. Record an available workers.dev URL as the default production domain.

The workflow stores user-selected provider intent before side effects. Immediately before each
provider create request, it writes the provider-specific creation claim defined by spec 115. A retry
resumes from the intent, claim, and attached resource graph. Vault creation remains successful when
downstream infrastructure setup fails, and the failed provider step remains visible and retryable.

Connecting an existing GitHub repository does not automatically create infrastructure. Its apps,
Workers, Convex production deployments, and explicit dependencies are connected through the manual
flows described by specs 105, 106, and 115.

## Durable State

- `vaultInfrastructureTargets` stores create-flow intent for the selected app, selected Convex team
  ID, planned Convex project name, Cloudflare account, and planned Worker name. Its Cloudflare state
  changes from `planned` to `attached` with the stable Samebase Worker row ID, so composed retries
  never rediscover that Worker by mutable name. It does not store provider create responses and is
  not resource inventory.
- `vaultConvexProjectCreationClaims` and `vaultCloudflareWorkerCreationClaims` are the pre-write
  ownership checkpoints. They distinguish an unresolved provider request from a response-confirmed
  stable provider ID and are consumed by successful attachment.
- `vaultInfrastructureOwnership` is the vault-scoped lock and terminal ownership record for the
  active writer run.
- `appProvisioningRuns` and `appProvisioningEvents` record progress, retry state, and user-visible
  failures.
- `vaultApps`, `vaultConvexDeployments`, `vaultCloudflareWorkers`, and
  `vaultWorkerDeploymentDependencies` are the durable resource graph defined by spec 115.
- `vaultDomains` stores the repository-level default URL produced by the composed single-app create
  flow and the legacy branch URL observation used by the branch list. It is not a complete multi-app
  deployment inventory. A monorepo's production URLs come from its individual Worker rows, and
  branch deployment observations are outside this provisioning slice.

No personal Convex development deployment or branch preview deployment is stored as the app's
production deployment. No root string is used as a provider resource foreign key.

## Provider Write Ordering

The composed workflow follows these boundaries:

- Provider target access is validated before triggers are changed or old deploy keys are deleted.
- A Worker build is not deliberately started before both least-privilege Convex secrets are written
  and read back.
- A claim is written before every provider create request. A successful response records its stable
  provider ID before attachment, while an unanswered request remains explicitly unresolved.
- A composed retry takes ownership of matching unresolved provider claims in the same mutation that
  acquires the vault's infrastructure lock.
- The selected Convex team ID is pinned before provisioning starts. A changed Convex connection
  stops the create before any provider write instead of redirecting the project to another team.
- Superseded runs may clean up only deploy-key names that the superseded attempt recorded. Created
  provider resources and their durable claims are never rolled back automatically; they remain for
  retry or explicit provider deletion.
- The composed terminal mutation marks the infrastructure ownership and provisioning run successful
  and records the final event together, but only after both creation claims are consumed, both
  provider resources are present, Workers Builds is connected, and the target Worker is wired to the
  target app's production deployment.
- Ordinary vault deletion never changes retained provider resources. Optional provider deletion is
  governed by the explicit all-listed confirmation in spec 115.

## Public Behavior

- `api.vault.actions.createRepository` returns the new vault ID and starts the create workflow.
- `api.vault.actions.connectRepository` connects source only.
- `api.vault.actions.retryInfrastructureProvisioning` restarts the composed workflow for a failed
  Samebase-managed create flow.
- Manual provider failures reopen the corresponding app-scoped provider dialog instead of using the
  managed create retry.

The dashboard shows provider progress and failure state, the production Worker URL when workers.dev
is confirmed available, and direct links to the attached Worker and Convex production deployment.
Missing, disabled, and unknown provider observations must not be presented as successful resources.

## Runtime Configuration

Provider OAuth requires:

- `PROVIDER_CONVEX_OAUTH_CLIENT_ID`
- `PROVIDER_CONVEX_OAUTH_CLIENT_SECRET`
- `PROVIDER_CONVEX_OAUTH_REDIRECT_URL`
- `PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID`
- `PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET`
- `PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL`

Workers Builds uses the connected vault's stored GitHub default branch. Samebase does not introduce
an `INFRA_DEFAULT_BRANCH` override.

If Cloudflare returns repository authorization error `8000008`, Samebase tells the user that the
Cloudflare Workers and Pages GitHub App is not authorized for the repository and links Cloudflare's
reinstall recovery steps. The recovery requires uninstalling the existing GitHub App installation,
then reconnecting GitHub from Workers and Pages with the repository included.

## Validation

Provider-mocked tests must cover resumable checkpoints, provider target validation before
destructive writes, least-privilege trigger variables, exact partial-failure cleanup, superseded-run
isolation, and the absence of provider writes during ordinary vault deletion.

The live template validation must cover a successful initial production build and a branch preview
using the same explicit dependency and deploy scripts documented by spec 115.

## Deferred

- Branch custom domains and routing automation
- Budget and usage alerting
- Collaborative multi-user access to one provider-resource graph
