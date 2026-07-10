# samebase/app Workers Provisioning Migration Research

## Document Control

- Status: Research with implementation follow-up
- Owner: Samebase app provisioning and template deployment
- Created: 2026-05-15
- Related:
  - `research/2026-05-05-cloudflare-pages-workers-direction.md`
  - `docs/artifacts/samebase-app/README.md`
  - `docs/artifacts/samebase-app/cloudflare-workers-install.md`
  - `docs/artifacts/samebase-app/regeneration-prompt.md`
  - `specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md`
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`

## Prompt

Research how Samebase currently provisions Cloudflare Pages for generated `samebase/app`
repositories, then map what has to change before Samebase can provision Cloudflare Workers Static
Assets through Workers Builds instead.

The immediate product goal is to make the public `samebase/app` template use Cloudflare Workers,
then replace Samebase's automatic Pages provisioning with Workers provisioning. This research
started before implementation; later notes record constraints learned while building the first
Workers provisioning PR.

## Current Finding

Samebase's current app creation path is deeply Cloudflare Pages-shaped. Replacing it with Workers is
feasible, but it is a provider-adapter migration, not a template-only change.

The product should still present one supported stack. Samebase does not yet have external users who
require backwards compatibility, and the operator can remove or rewrite production data before
deploying a breaking migration. Therefore the default implementation should not preserve Cloudflare
Pages support unless doing so is clearly simpler than deleting it. Pages should be treated as the
old stack being replaced, not as a second provider Samebase intends to maintain.

The runtime app creation flow does not clone or preserve the public `samebase/app` commit history.
Samebase exports a selected `samebase/app` branch into
`apps/samebase/convex/starterSeedManifest.generated.ts`, then seeds the user's new GitHub repository
as one starter commit. The pedagogical history stays in `samebase/app`; the generated user
repository receives a snapshot.

Cloudflare Pages provisioning currently depends on Pages-specific API endpoints, build env
semantics, preview comments, URL shapes, domain source values, status reads, log reads, and deletion
behavior.

## Current Template Snapshot

Before the Workers implementation, the generated starter manifest pointed at `samebase/app@main`:

- `sourceRepo`: `https://github.com/samebase/app.git`
- `sourceBranch`: `main`
- `sourceCommit`: `49d0faa1ba17b73138d0a1c4f709c750720b0e9d`
- `version`: `samebase-app-49d0faa1ba17`

The exported package is still Pages-oriented:

```json
{
  "name": "convex-cloudflare-pages-stack",
  "scripts": {
    "build": "tsc && vp build",
    "build:cloudflare": "if [ -n \"$CF_PAGES_BRANCH\" ] && [ \"$CF_PAGES_BRANCH\" != \"main\" ]; then vp run build:cloudflare:preview; else vp run build:cloudflare:production; fi",
    "build:cloudflare:production": "vp exec convex deploy --cmd 'vp run build'",
    "build:cloudflare:preview": "vp exec convex deploy --preview-create \"$CF_PAGES_BRANCH\" --cmd 'vp run build'"
  }
}
```

The Workers artifact currently lives in `samebase/app` branch `v5-tanstack-start-workers`. It uses
Workers Static Assets, a `wrangler.jsonc`, `pnpm run build`, `pnpm run deploy`, and
`pnpm run deploy:preview`.

The first Workers provisioning implementation branch exports:

- `sourceBranch`: `v5-tanstack-start-workers`
- `sourceCommit`: `5df04d0d2a2883b4d480218a716bf9438461f11e`
- `version`: `samebase-app-5df04d0d2a28`

That branch is good enough for auto-provisioning. Commit numbering and template copy can still
improve later without blocking the Samebase implementation.

## Current Samebase Flow

### 1. User Starts App Creation

`apps/samebase/convex/vault/actions.ts:createRepository` creates an initializing Samebase-managed
vault and provisioning run, then starts
`internal.appProvisioningWorkflow.startCreateAppProvisioning`.

The action requires GitHub only at this first boundary. Convex and Cloudflare connections are
checked inside the workflow.

### 2. Convex Workflow Orchestrates Creation

`apps/samebase/convex/appProvisioning/workflow.ts:provisionApp` runs these steps:

1. `validate_connections`
2. `create_github_repo`
3. `connect_github`
4. `seed_starter`
5. `sync_tree`
6. `claim_infra`
7. `validate_infra_connections`
8. `ensure_convex`
9. `ensure_convex_preview`
10. `ensure_cloudflare`
11. `finish`

The existing-repository path intentionally does not auto-provision Convex or Cloudflare.

### 3. Starter Seeding Uses One Snapshot Commit

`scripts/export-samebase-app-manifest.ts` downloads the selected `samebase/app` branch archive from
GitHub, collects all files, computes a content hash, and writes
`apps/samebase/convex/starterSeedManifest.generated.ts`.

`apps/samebase/convex/starterSeed.ts:seedRepositoryWithStarter` creates one GitHub commit with the
manifest tree and no parents. If the target repository is empty, it first creates a temporary
bootstrap commit and then force-updates the default branch to the starter commit.

This means changing the generated template content requires:

```bash
pnpm run template:export -- --branch v5-tanstack-start-workers
```

or whatever final Workers branch replaces it.

### 4. Convex Production And Preview Deployments Are Created First

`apps/samebase/convex/appProvisioning/infrastructure.ts:ensureCloudflareInfrastructure` requires the
production Convex project/deployment to exist before Cloudflare provisioning.

During the Cloudflare step, Samebase also ensures a Convex preview deployment and creates two deploy
keys:

1. production deploy key for the production Convex deployment
2. preview deploy key for the preview Convex deployment

Those keys are then injected into Cloudflare's production and preview build settings.

For the Workers target, Samebase uses the same names the public template and Samebase production
build use: `CONVEX_DEPLOY_KEY` and `PREVIEW_CONVEX_DEPLOY_KEY`. Superseding the original
per-trigger-isolation idea in this research note, Samebase-managed provisioning writes both names
onto every Workers Builds trigger so the Cloudflare dashboard's visible build-variable table shows
the full pair. The build script still chooses the branch-appropriate key from `WORKERS_CI_BRANCH`.

### 5. Pages Project Is Created Or Patched

`apps/samebase/convex/cloudflareResources.ts:ensureCloudflareResources` is the current Pages
adapter. It calls the Cloudflare API through Cloudflare MCP `execute`, using `cloudflare.request`.

Pages endpoints currently used:

1. `GET /accounts/:accountId/pages/projects/:projectName`
2. `POST /accounts/:accountId/pages/projects`
3. `PATCH /accounts/:accountId/pages/projects/:projectName`
4. `POST /accounts/:accountId/pages/projects/:projectName/deployments`
5. `GET /accounts/:accountId/pages/projects/:projectName`

The Pages create/patch payload includes:

```ts
{
  name: projectName,
  production_branch: defaultBranch,
  build_config: {
    build_command: buildConfig.buildCommand,
    root_dir: buildConfig.rootDir,
    destination_dir: buildConfig.destinationDir,
  },
  deployment_configs: {
    production: {
      env_vars: {
        CONVEX_DEPLOY_KEY: { type: "secret_text", value: productionDeployKey },
        VITE_CONVEX_URL: { type: "plain_text", value: productionConvexUrl },
      },
    },
    preview: {
      env_vars: {
        CONVEX_DEPLOY_KEY: { type: "secret_text", value: previewDeployKey },
        VITE_CONVEX_URL: { type: "plain_text", value: previewConvexUrl },
      },
    },
  },
  source: {
    type: "github",
    config: {
      owner,
      repo_name,
      repo_id,
      owner_id,
      production_branch: defaultBranch,
      production_deployments_enabled: true,
      preview_deployment_setting: "all",
    },
  },
}
```

For the current single-package template, Samebase resolves the Pages build config as:

```ts
{
  rootDir: "/",
  buildCommand: "pnpm run build:cloudflare",
  destinationDir: "dist",
}
```

For older monorepo-shaped generated apps, it uses:

```ts
{
  rootDir: "apps/samebase",
  buildCommand: "npx convex deploy --cmd 'pnpm run build'",
  destinationDir: "dist",
}
```

### 6. Samebase Previously Recorded Pages Resource State

Before the Workers migration, Cloudflare state was:

```ts
{
  accountId: string,
  projectName: string,
  subdomain?: string,
  productionUrl?: string,
}
```

After Pages provisioning succeeded, Samebase recorded:

1. `vaultInfrastructure.cloudflare`
2. `vaults.cloudflare`
3. a `vaultDomains` row for the default branch with source `cloudflare_pages_default`

The Workers migration keeps Cloudflare resource state on `vaults.cloudflare`, removes the duplicate
`vaultInfrastructure.cloudflare` copy, and records Worker domain sources instead of Pages domain
sources.

`vaultInfrastructure` should stay a Convex resource record only. Its old `status`, `lastError`,
`provisioningVersion`, and `lastProvisionedAt` fields are separate operational axes that can
contradict the vault provider states, Workflow run state, and ownership row.

### 7. Preview Links Come From GitHub Comments

Samebase does not currently read preview URLs from Cloudflare's API. Instead, branch refresh parses
PR comments from `cloudflare-workers-and-pages[bot]`.

`apps/samebase/convex/cloudflarePreviewComment.ts` expects a Cloudflare Pages comment with table
fields such as:

1. `Preview URL`
2. `Branch Preview URL`
3. `Latest commit`
4. `Status`
5. `View logs`

The parsed values are cached on `vaultRemoteBranches`:

1. `cloudflareBranchPreviewUrl`
2. `cloudflarePreviewPullRequestNumber`
3. `cloudflarePreviewUrl`
4. `cloudflarePreviewCommitSha`
5. `cloudflarePreviewStatus`
6. `cloudflarePreviewLogsUrl`
7. `cloudflarePreviewCommentCreatedAt`

This is the highest-risk migration dependency. If Workers Builds comments differ from Pages
comments, Samebase should move preview metadata to a first-party Cloudflare Builds API read instead
of extending a brittle comment parser.

### 8. Status, Logs, Inventory, And Deletion Were Pages-Specific

Before the Workers migration, Cloudflare read tools used Pages endpoints:

1. status: `GET /accounts/:accountId/pages/projects/:projectName`
2. logs:
   - `GET /accounts/:accountId/pages/projects/:projectName/deployments`
   - `GET /accounts/:accountId/pages/projects/:projectName/deployments/:deploymentId/history/logs`
3. inventory: `GET /accounts/:accountId/pages/projects`

Previous deletion planning deleted the Pages project through:

```text
DELETE /accounts/:accountId/pages/projects/:projectName
```

Workers migration has to replace these paths with Worker script, Workers Builds, deployment, and
build log equivalents.

## Workers Target Shape

Cloudflare Workers Builds is the closest equivalent to Pages Git integration. Current Cloudflare
docs describe Workers Builds as a two-step pipeline:

1. build command
2. deploy command

For non-production branch builds, Workers Builds uses a separate non-production branch deploy
command. The default production deploy command is `npx wrangler deploy`; the default non-production
deploy command is `npx wrangler versions upload`, which creates a preview version without promoting
it to active production traffic.

Workers branch behavior is closer to the model Samebase wants:

1. the production branch runs the build command then deploy command
2. non-production branches can be enabled separately
3. non-production branches run the build command then the non-production deploy command
4. preview URLs and pull request comments require non-production branch builds

Relevant Cloudflare API surface from the Workers Builds docs:

1. `GET /accounts/:accountId/workers/scripts` to find the Worker tag
2. `PUT /accounts/:accountId/builds/repos/connections` to connect a GitHub repo
3. `GET /accounts/:accountId/builds/tokens` to find a build token
4. `POST /accounts/:accountId/builds/triggers` to create production and preview triggers
5. `PATCH /accounts/:accountId/builds/triggers/:triggerUuid/environment_variables` to set
   per-trigger build variables and secrets
6. `POST /accounts/:accountId/builds/triggers/:triggerUuid/builds` to trigger a build
7. `GET /accounts/:accountId/builds/workers/:workerTag/builds` to list builds
8. `GET /accounts/:accountId/builds/builds/:buildUuid/logs` to read logs
9. `GET /accounts/:accountId/workers/scripts/:workerName/deployments` to inspect active Worker
   deployments

Cloudflare's docs state the Builds API requires token-backed credentials for configuration. The
user-facing Samebase flow must still stay web-authenticated through the Cloudflare MCP OAuth
connection, not a manual API-token setup. Local and preview deployments can use operator-seeded
Cloudflare credentials, but those credentials need the equivalent of Workers Scripts edit, Workers
Builds Configuration edit, and Account Settings read.

## Implementation Follow-up

The first Workers auto-provisioning implementation chose this shape:

1. Export `samebase/app@v5-tanstack-start-workers` into `starterSeedManifest.generated.ts`.
2. Keep Cloudflare user authentication on the existing web/MCP OAuth path.
3. Fail closed with reconnect copy when the Cloudflare connection lacks Workers Builds access.
4. Derive deterministic Worker names from owner, repository, and the vault suffix so retries target
   the same Worker without storing a second copy.
5. Create or read the Worker through the Workers API and enable `workers.dev` plus preview URLs.
6. Connect GitHub through Workers Builds repository connections.
7. Verify the current Cloudflare credential, then create or reuse the Workers Builds build token
   tied to that credential.
8. Create or patch production and preview Workers Builds triggers.
9. Configure generated single-repository apps with:
   - build command: `pnpm run build`
   - production deploy command: `pnpm run deploy`
   - preview deploy command: `pnpm run deploy:preview`
10. Keep a temporary monorepo fallback with root `apps/samebase`, `pnpm run build`,
    `pnpm exec wrangler deploy`, and `pnpm exec wrangler versions upload`.
11. Store only `accountId`, `workerName`, `workerTag`, and `productionUrl` on the vault's Cloudflare
    state.
12. Rediscover Workers Builds triggers from `workerTag` before deleting the Worker during vault
    teardown.

The first implementation did not finish the branch-preview metadata migration. The old Cloudflare
Pages PR-comment parser still exists, so preview URLs remain the main follow-up risk.

## Expected Samebase Migration Work

### 1. Template Export

Once `samebase/app` has a final Workers branch or main is updated, refresh the starter manifest from
that source:

```bash
pnpm run template:export -- --branch v5-tanstack-start-workers
```

Expected changes:

1. generated manifest source branch and commit change
2. generated starter files include `wrangler.jsonc`
3. generated starter files include Workers deploy/build scripts
4. starter manifest tests need updated required-file assertions for Workers

This alone does not change automatic Cloudflare provisioning.

### 2. Replace Pages Adapter With Workers Code

Replace the Pages implementation with Workers behavior. The current `cloudflareResources.ts` owns
Pages errors, Pages endpoints, Pages status/log reads, and Pages deletion. If the migration PR can
delete or rewrite those paths directly, prefer that over introducing a long-term Pages/Workers
abstraction.

Only keep a temporary Pages branch if it reduces implementation risk for the first deploy. It should
not become a supported product path unless a real user need appears.

Minimum Workers resource operations:

1. ensure Worker script/project exists
2. enable `workers.dev` and preview URLs if required
3. connect GitHub repository
4. create or patch production trigger
5. create or patch preview trigger
6. set production build env vars
7. set preview build env vars
8. trigger first production build
9. read Worker status
10. read Workers Builds history/logs
11. delete Worker and build triggers/resources

### 3. Replace Cloudflare State Shape

The Workers implementation only needs durable Cloudflare state on the vault:

1. `accountId`
2. `workerName`
3. `workerTag`
4. `productionUrl`

Do not store account subdomain, repo connection IDs, or trigger UUIDs unless a current shipped path
needs them. The provisioning and deletion paths can rediscover trigger UUIDs from `workerTag`.

Because production data can be cleared or migrated manually, this does not need a wide compatibility
union that preserves the old Pages shape indefinitely. Prefer the simplest Workers state that the
new provisioning and deletion paths need.

### 4. Update Domain Sources

`vVaultDomainSource` currently only has:

1. `cloudflare_pages_default`
2. `cloudflare_pages_custom`

Workers provisioning needs new source values, likely:

1. `cloudflare_workers_default`
2. `cloudflare_workers_custom`

If production data is cleared before rollout, the old Pages source values can be removed instead of
preserved. Keep them only if the deployment plan intentionally ships with existing Pages rows still
present.

### 5. Replace Preview Metadata Source

Do not assume the existing Pages comment parser is sufficient. Test Workers Builds PR comments and
check runs before choosing the data source.

Preferred implementation direction:

1. use Workers Builds API for build status/logs where possible
2. parse PR comments only as a compatibility fallback if Workers comments are stable enough
3. keep the dashboard branch preview cache fields if the product shape still matches

### 6. Update Deletion

Deletion should target Workers resources and associated build triggers. If old Pages projects still
need cleanup, handle that as a one-off operational cleanup or a temporary migration path instead of
preserving Pages as a supported deletion action.

### 7. Update User-Facing Copy

Pages-specific copy exists in:

1. landing preview docs
2. dashboard labels
3. provisioning log messages
4. Cloudflare read/approval tool labels
5. tests and visual fixtures

Workers migration should update copy only when the backing behavior changes.

## Implementation Risks

1. **Cloudflare auth scope**

   Workers Builds configuration requires permissions that may differ from the current Pages setup.
   The implementation must fail closed with a clear reconnect/permission message.

2. **Worker name coupling**

   Cloudflare docs warn that when a repo has a Wrangler config, the Worker name in the dashboard
   must match the `name` in Wrangler config. The v5 template intentionally omits a fixed `name` and
   passes the Worker name at deploy time. Samebase provisioning must preserve that property because
   generated app names vary per user.

3. **First deploy behavior**

   Cloudflare docs say `wrangler versions upload` cannot be used for the first Worker upload.
   Production setup must use a real deploy path first; preview branches can use version upload after
   the Worker exists.

4. **Preview parity**

   Pages provides stable branch aliases like `<branch>.<project>.pages.dev`. Workers preview URL
   shape and PR comments need real verification before UI and cache behavior are changed.

5. **Breaking Pages compatibility is acceptable**

   Existing Samebase-managed vaults may already have Pages resources, but Samebase can reset or
   rewrite that production data before rollout. The implementation should optimize for the future
   single Workers stack. The deployment checklist should explicitly say whether old Pages
   rows/projects were removed manually or by a one-off cleanup.

6. **Static asset billing**

   The template should stay client-first and avoid Worker code paths unless needed. The deployment
   should rely on Workers Static Assets serving static files without introducing server function or
   SSR complexity.

## Recommended Implementation Sequence

1. Land the artifact/spec/research PR.
2. Land the Workers auto-provisioning PR with the template export, Workers state shape, Workers
   provisioning, build-trigger reads, and deletion updates.
3. Inspect a real Workers PR preview and replace the remaining Pages preview comment path if Workers
   gives us a better source.
4. Move Samebase production hosting from Pages to Workers.
5. Remove remaining Pages copy, fixtures, tests, and operational cleanup paths once production data
   has been cleared or migrated.

Do not split by adding a permanent Pages/Workers provider matrix unless the implementation proves
that dual support is cheaper than replacement.

## Sources

- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Workers build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Cloudflare Workers Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
- [Cloudflare Workers versions and deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/)
- [Cloudflare Pages preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
