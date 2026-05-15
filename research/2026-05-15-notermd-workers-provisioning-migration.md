# notermd/app Workers Provisioning Migration Research

## Document Control

- Status: Draft research
- Owner: Noter app provisioning and template deployment
- Created: 2026-05-15
- Related:
  - `research/2026-05-05-cloudflare-pages-workers-direction.md`
  - `docs/artifacts/notermd-app/README.md`
  - `docs/artifacts/notermd-app/cloudflare-workers-install.md`
  - `docs/artifacts/notermd-app/regeneration-prompt.md`
  - `specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md`
  - `specs/090_CREATE_APP_WORKFLOW_PROVISIONING_SPEC.md`

## Prompt

Research how Noter currently provisions Cloudflare Pages for generated
`notermd/app` repositories, then map what has to change before Noter can
provision Cloudflare Workers Static Assets through Workers Builds instead.

The immediate product goal is to make the public `notermd/app` template use
Cloudflare Workers, then replace Noter's automatic Pages provisioning with
Workers provisioning. This research is intentionally pre-implementation.

## Current Finding

Noter's current app creation path is deeply Cloudflare Pages-shaped. Replacing
it with Workers is feasible, but it is a provider-adapter migration, not a
template-only change.

The runtime app creation flow does not clone or preserve the public
`notermd/app` commit history. Noter exports a selected `notermd/app` branch into
`apps/noter/convex/starterSeedManifest.generated.ts`, then seeds the user's new
GitHub repository as one starter commit. The pedagogical history stays in
`notermd/app`; the generated user repository receives a snapshot.

Cloudflare Pages provisioning currently depends on Pages-specific API endpoints,
build env semantics, preview comments, URL shapes, domain source values, status
reads, log reads, and deletion behavior.

## Current Template Snapshot

The current generated starter manifest points at `notermd/app@main`:

- `sourceRepo`: `https://github.com/notermd/app.git`
- `sourceBranch`: `main`
- `sourceCommit`: `49d0faa1ba17b73138d0a1c4f709c750720b0e9d`
- `version`: `notermd-app-49d0faa1ba17`

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

The experimental Workers artifact currently lives in `notermd/app` branch
`v5-tanstack-start-workers`. It uses Workers Static Assets, a `wrangler.jsonc`,
`pnpm run build`, `pnpm run deploy`, and `pnpm run deploy:preview`. Before it is
exported into Noter, that branch still needs template-language cleanup because
parts of the exploratory history still refer to `app-start-workers`.

## Current Noter Flow

### 1. User Starts App Creation

`apps/noter/convex/vault/actions.ts:createRepository` creates an initializing
Noter-managed vault and provisioning run, then starts
`internal.appProvisioningWorkflow.startCreateAppProvisioning`.

The action requires GitHub only at this first boundary. Convex and Cloudflare
connections are checked inside the workflow.

### 2. Convex Workflow Orchestrates Creation

`apps/noter/convex/appProvisioningWorkflow.ts:provisionApp` runs these steps:

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

The existing-repository path intentionally does not auto-provision Convex or
Cloudflare.

### 3. Starter Seeding Uses One Snapshot Commit

`scripts/export-notermd-app-manifest.ts` downloads the selected `notermd/app`
branch archive from GitHub, collects all files, computes a content hash, and
writes `apps/noter/convex/starterSeedManifest.generated.ts`.

`apps/noter/convex/starterSeed.ts:seedRepositoryWithStarter` creates one GitHub
commit with the manifest tree and no parents. If the target repository is empty,
it first creates a temporary bootstrap commit and then force-updates the default
branch to the starter commit.

This means changing the generated template content requires:

```bash
pnpm run template:export -- --branch v5-tanstack-start-workers
```

or whatever final Workers branch replaces it.

### 4. Convex Production And Preview Deployments Are Created First

`apps/noter/convex/infraProvisioning.ts:ensureCloudflareInfrastructure` requires
the production Convex project/deployment to exist before Cloudflare
provisioning.

During the Cloudflare step, Noter also ensures a Convex preview deployment and
creates two deploy keys:

1. production deploy key for the production Convex deployment
2. preview deploy key for the preview Convex deployment

Those keys are then injected into Cloudflare's production and preview build
settings.

### 5. Pages Project Is Created Or Patched

`apps/noter/convex/cloudflareResources.ts:ensureCloudflareResources` is the
current Pages adapter. It calls the Cloudflare API through Cloudflare MCP
`execute`, using `cloudflare.request`.

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

For the current single-package template, Noter resolves the Pages build config
as:

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
  rootDir: "apps/noter",
  buildCommand: "npx convex deploy --cmd 'pnpm run build'",
  destinationDir: "dist",
}
```

### 6. Noter Records Pages Resource State

Cloudflare state is currently:

```ts
{
  accountId: string,
  projectName: string,
  subdomain?: string,
  productionUrl?: string,
}
```

After provisioning succeeds, Noter records:

1. `vaultInfrastructure.cloudflare`
2. `vaults.cloudflare`
3. a `vaultDomains` row for the default branch with source
   `cloudflare_pages_default`

The schema currently only accepts `cloudflare_pages_default` and
`cloudflare_pages_custom` as vault domain sources.

### 7. Preview Links Come From GitHub Comments

Noter does not currently read preview URLs from Cloudflare's API. Instead,
branch refresh parses PR comments from `cloudflare-workers-and-pages[bot]`.

`apps/noter/convex/cloudflarePreviewComment.ts` expects a Cloudflare Pages
comment with table fields such as:

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

This is the highest-risk migration dependency. If Workers Builds comments differ
from Pages comments, Noter should move preview metadata to a first-party
Cloudflare Builds API read instead of extending a brittle comment parser.

### 8. Status, Logs, Inventory, And Deletion Are Pages-Specific

Current Cloudflare read tools use Pages endpoints:

1. status: `GET /accounts/:accountId/pages/projects/:projectName`
2. logs:
   - `GET /accounts/:accountId/pages/projects/:projectName/deployments`
   - `GET /accounts/:accountId/pages/projects/:projectName/deployments/:deploymentId/history/logs`
3. inventory: `GET /accounts/:accountId/pages/projects`

Current deletion planning uses action `delete_pages_project`, then deletes:

```text
DELETE /accounts/:accountId/pages/projects/:projectName
```

Workers migration has to replace these paths with Worker script, Workers Builds,
deployment, and build log equivalents.

## Workers Target Shape

Cloudflare Workers Builds is the closest equivalent to Pages Git integration.
Current Cloudflare docs describe Workers Builds as a two-step pipeline:

1. build command
2. deploy command

For non-production branch builds, Workers Builds uses a separate non-production
branch deploy command. The default production deploy command is
`npx wrangler deploy`; the default non-production deploy command is
`npx wrangler versions upload`, which creates a preview version without
promoting it to active production traffic.

Workers branch behavior is closer to the model Noter wants:

1. the production branch runs the build command then deploy command
2. non-production branches can be enabled separately
3. non-production branches run the build command then the non-production deploy
   command
4. preview URLs and pull request comments require non-production branch builds

Relevant Cloudflare API surface from the Workers Builds docs:

1. `GET /accounts/:accountId/workers/scripts` to find the Worker tag
2. `PUT /accounts/:accountId/builds/repos/connections` to connect a GitHub repo
3. `GET /accounts/:accountId/builds/tokens` to find a build token
4. `POST /accounts/:accountId/builds/triggers` to create production and preview
   triggers
5. `PATCH /accounts/:accountId/builds/triggers/:triggerUuid/environment_variables`
   to set per-trigger build variables and secrets
6. `POST /accounts/:accountId/builds/triggers/:triggerUuid/builds` to trigger a
   build
7. `GET /accounts/:accountId/builds/workers/:workerTag/builds` to list builds
8. `GET /accounts/:accountId/builds/builds/:buildUuid/logs` to read logs
9. `GET /accounts/:accountId/workers/scripts/:workerName/deployments` to inspect
   active Worker deployments

Cloudflare's docs state the Builds API requires a user-scoped API token for
configuration. This matters because Noter currently authenticates through
Cloudflare MCP OAuth or stored Cloudflare API credentials. The implementation
must verify that the current Cloudflare connection has the required Workers
Builds permissions.

## Expected Noter Migration Work

### 1. Template Export

Once `notermd/app` has a final Workers branch or main is updated, refresh the
starter manifest from that source:

```bash
pnpm run template:export -- --branch v5-tanstack-start-workers
```

Expected changes:

1. generated manifest source branch and commit change
2. generated starter files include `wrangler.jsonc`
3. generated starter files include Workers deploy/build scripts
4. starter manifest tests need updated required-file assertions for Workers

This alone does not change automatic Cloudflare provisioning.

### 2. Replace Pages Adapter With Workers Adapter

Introduce a Workers-specific resource adapter instead of reshaping Pages code in
place. The current `cloudflareResources.ts` owns Pages errors, Pages endpoints,
Pages status/log reads, and Pages deletion. A Workers adapter should make the
resource kind explicit.

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

### 3. Update Cloudflare State Shape

The current state names `projectName`, `subdomain`, and `productionUrl`. Workers
probably need at least:

1. `accountId`
2. `workerName`
3. `workerTag`
4. `productionUrl`
5. `productionTriggerUuid`
6. `previewTriggerUuid`
7. possibly `repoConnectionUuid`

Avoid guessing the final shape until the API implementation proves which IDs are
needed for idempotent updates and deletion.

### 4. Update Domain Sources

`vVaultDomainSource` currently only has:

1. `cloudflare_pages_default`
2. `cloudflare_pages_custom`

Workers provisioning needs new source values, likely:

1. `cloudflare_workers_default`
2. `cloudflare_workers_custom`

Existing Pages vaults should remain representable. Do not rename old values in
place unless a data migration and compatibility plan exists.

### 5. Replace Preview Metadata Source

Do not assume the existing Pages comment parser is sufficient. Test Workers
Builds PR comments and check runs before choosing the data source.

Preferred implementation direction:

1. use Workers Builds API for build status/logs where possible
2. parse PR comments only as a compatibility fallback if Workers comments are
   stable enough
3. keep the dashboard branch preview cache fields if the product shape still
   matches

### 6. Update Deletion

Deletion should branch on Cloudflare resource kind. Existing Pages vaults should
continue deleting Pages projects. New Workers vaults should delete Workers
resources and associated build triggers.

Do not convert `delete_pages_project` into a vague Cloudflare delete action
until the underlying resource model is explicit.

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

   Workers Builds configuration requires permissions that may differ from the
   current Pages setup. The implementation must fail closed with a clear
   reconnect/permission message.

2. **Worker name coupling**

   Cloudflare docs warn that when a repo has a Wrangler config, the Worker name
   in the dashboard must match the `name` in Wrangler config. The v5 template
   intentionally omits a fixed `name` and passes the Worker name at deploy time.
   Noter provisioning must preserve that property because generated app names
   vary per user.

3. **First deploy behavior**

   Cloudflare docs say `wrangler versions upload` cannot be used for the first
   Worker upload. Production setup must use a real deploy path first; preview
   branches can use version upload after the Worker exists.

4. **Preview parity**

   Pages provides stable branch aliases like `<branch>.<project>.pages.dev`.
   Workers preview URL shape and PR comments need real verification before UI
   and cache behavior are changed.

5. **Existing Pages vaults**

   Existing Noter-managed vaults may already have Pages resources. The first
   Workers implementation should support new vaults without breaking existing
   Pages deletion, reads, or dashboard display.

6. **Static asset billing**

   The template should stay client-first and avoid Worker code paths unless
   needed. The deployment should rely on Workers Static Assets serving static
   files without introducing server function or SSR complexity.

## Recommended First PR Sequence

1. Export the finalized Workers template snapshot into
   `starterSeedManifest.generated.ts`.
2. Add explicit Cloudflare resource kind/state support while preserving Pages
   rows.
3. Add a Workers adapter with status/log/build-trigger reads and tests around
   request payloads.
4. Switch new app provisioning to Workers while leaving existing Pages vaults
   supported.
5. Update preview metadata source after a real Workers PR preview is inspected.
6. Update docs, landing preview copy, and dashboard labels.

If this becomes too large, split after step 2. The state-shape change is the
right boundary before introducing provider API behavior.

## Sources

- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Workers build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Cloudflare Workers Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
- [Cloudflare Workers versions and deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/)
- [Cloudflare Pages preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
