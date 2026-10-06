# Alchemy as Samebase's source of truth for `repository_actions` apps

Date: October 7, 2026. Status: research with a proposed RFC section at the end. It informs PR C of
RFC 126 and a later retirement of the `samebase` mode's provider workflows. It does not define
product behavior.

- Base: `origin/main` at `ab60312a3` (v2101). RFC 126 is read from its branch
  `rfc-repository-actions-provisioning` at `bef37f673`.
- Packages read: `alchemy@2.0.0-beta.80` (installed copy in `~/dev/my/score-four-alchemy`),
  `@samebase/alchemy-cloudflare-workers-builds@0.5.0` and `@samebase/alchemy-convex@0.3.0` (local
  clones, the versions `templates/base-actions/package.json` pins).
- GitHub REST facts come from `@octokit/openapi-types@27.0.0` (installed in the primary checkout)
  and the GitHub docs linked in Sources. Cloudflare and Convex facts come from the OpenAPI subsets
  in `apps/samebase/convex/cloudflareApi/openApi.generated.json` and
  `apps/samebase/convex/convexManagementApi/openApi.generated.json`, and from the Samebase code that
  already calls them.
- Paths without a prefix are in this repository. `alchemy/` means
  `~/dev/my/score-four-alchemy/node_modules/alchemy/src/`, `wb/` means
  `~/dev/samebase/alchemy-cloudflare-workers-builds/src/`, `cx/` means
  `~/dev/samebase/alchemy-convex/src/`.

## Summary

1. Samebase knows an app through two attachment rows, `repositoryCloudflareWorkers` and
   `repositoryConvexProjects`. Every screen and MCP tool reads live provider facts keyed by those
   rows. A `repository_actions` app has no rows today, so it shows nothing. Write the two rows with
   verified identities, and every existing observer works unchanged: production build, previews,
   Convex deployments, deploy-key access, URLs. "Source of truth" therefore means two things: who
   supplies the identity in those rows, and who supplies the setup status.
2. Alchemy's state holds every identity Samebase needs (account, Worker tag and name, the Builds
   link with GitHub ids, Convex team and project ids, deployment name and URL). It also holds the
   deploy keys in clear on the wire, behind one account-wide read-and-write bearer token.
3. Recommendation: the setup run publishes a versioned, secret-free output block as a run artifact;
   Samebase reads it from the newest successful `alchemy` run on the default branch, verifies every
   identity claim with the organization's provider connections (the reads the manual attach flows
   already make), and writes the two attachment rows with a new origin, `setup_stack`. Live status
   stays with the existing observers. Samebase never reads the state store.
4. Deciding reason: the block is the only option that gives exact ids without an account-wide Worker
   scan, needs no new credential or permission, carries no secret, and does not depend on Alchemy's
   internal state format. Its weakness (a repository writer can publish any block) is closed by the
   verification, which makes it as strong as the manual attach flow.
5. Two corrections to RFC 126's PR C sketch. (a) The `alchemy` workflow is path-filtered, so the
   default branch head usually has no `alchemy` check; the setup status is the newest completed
   `alchemy` run on the default branch. (b) GitHub deletes workflow runs, check runs, and artifacts
   after the retention period (90 days by default, as low as 1 day by setting), so Samebase reads
   the block soon after the run and keeps the result in its own rows.
6. Removing the Convex workflows becomes concrete: the four provider steps of the `samebase` mode
   (`attach_convex`, `attach_worker`, `configure_workers_builds_for_github`,
   `rotate_convex_deploy_keys_for_workers_builds`) each have a stack equivalent, and Samebase keeps
   only a read phase. That retirement is a separate decision with its own gate, so it belongs in RFC
   127, not in RFC 126.

## 1. What Samebase knows about an app today

### The two attachment rows

Samebase persists only identity and approved coordinates. Specs 003 and 115 forbid persisting URLs,
triggers, build status, token data, deploy keys, or a Worker-to-project edge
(`specs/115_REPOSITORY_RESOURCE_ATTACHMENT_MODEL_SPEC.md:222-232`,
`specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md:194-216`). Everything else is read live.

| Field                                              | Type                                   | Written by                                                                                                                                                                                                                       | Read by                                                                                                                                                                                                                                                                                                                                                               | Needed for                                                                                                               |
| -------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Worker `repositoryId`, `organizationId`            | ids                                    | `insertWorker`, `apps/samebase/convex/repository/cloudflareMutations.ts:218-265`, from the repository row                                                                                                                        | `readRepositoryProviderObservationContext`, `apps/samebase/convex/repository/providerObservationQueries.ts:199-268` (throws if the organization or account differs from the repository, 221-228)                                                                                                                                                                      | Every observation, pull request resources, status                                                                        |
| Worker `accountId`                                 | string                                 | Same; must equal `repository.cloudflareAccountId` (`cloudflareMutations.ts:231`)                                                                                                                                                 | Every Cloudflare call; pull request proof match `proof.accountId === worker.accountId` (`apps/samebase/convex/repository/pullRequestResources.ts:656-658`)                                                                                                                                                                                                            | Overview, Settings, pull request rows, MCP `repository_getStatus`                                                        |
| Worker `workerTag`                                 | string                                 | Managed create: `POST /accounts/{a}/workers/workers` response (`apps/samebase/convex/repository/cloudflare.ts:605-749`, `cloudflareResources.ts:743-775`). Manual attach: `GET /workers/workers/{tag}` (`cloudflare.ts:518-603`) | Worker observation by tag (`providerObservations.ts:130-189`), Builds observation and production build match (`providerObservations.ts:224-371`, `cloudflareBuildMatching.ts:143-190`), deploy-key access (`providerObservations.ts:388-456`), native preview fallback (`cloudflareResources.ts:1155-1225`), deletion (`deletion/runs.ts:117-165`), exclusivity index | Overview production row, Settings, deletion, MCP `repository_getStatus`                                                  |
| Worker `workerName`                                | string                                 | Managed: plan name. Manual: live name. Patched only by `updateWorkerName` after a live re-read (`cloudflareMutations.ts:331-394`)                                                                                                | Pull request proof match by exact account and name (`pullRequestResources.ts:645-699`, spec 116), MCP name resolution (`toolRuntime/mcpResolution.ts:55-68`), labels                                                                                                                                                                                                  | Pull request build and preview rows, MCP `repository_list`, `repository_getStatus`                                       |
| Worker `rootDirectory`                             | string                                 | Managed: plan root `/`. Manual attach: live `production_settings.root_directory`. Patched only by `updateWorkerRootDirectory` (`cloudflareMutations.ts:396-451`)                                                                 | Resource grouping (spec 115 lines 121-132), Builds match (`cloudflareBuildMatching.ts:98-107`), Configure Builds                                                                                                                                                                                                                                                      | Overview tree, Settings drift warning                                                                                    |
| Worker `origin`                                    | `"provisioned" \| "selected_existing"` | `"provisioned"` for Samebase creates, `"selected_existing"` for attach and connect (`apps/samebase/convex/repository/model.ts:42-45`)                                                                                            | `canRemoveCloudflareProvision` (`apps/samebase/convex/repository/dashboard.ts:783-788`), deletion plan deletes only `provisioned` Workers (`deletion/runs.ts:117-165`, `deletion/providerActions.ts:71-125`)                                                                                                                                                          | Remove dialog "Also delete the Worker"                                                                                   |
| Convex `teamId`                                    | decimal string                         | Connection `teamId` (from `GET /token_details`), must equal `repository.convexTeamId` (`convexMutations.ts:139`)                                                                                                                 | Credential selection per project (`pullRequestResources.ts:1307-1333`), Data screen (`database.ts:69-101`)                                                                                                                                                                                                                                                            | Every Convex read                                                                                                        |
| Convex `projectId`                                 | decimal string                         | Managed: `POST /teams/{team_id}/create_project` response (`apps/samebase/convex/repository/convex.ts:759-877`). Manual attach: user choice verified by `GET /projects/{id}` (`convex.ts:327-339`)                                | Production deployment (`convexProjectResources.ts:52-69`), preview list (`convexProjectResources.ts:71-103`), Data, Schema, deploy-key rotation, deletion, exclusivity (`by_project`, `convexMutations.ts:108-124`)                                                                                                                                                   | Overview Convex row, pull request Convex preview, Data and Schema screens, MCP `repository_getStatus`, `repository_list` |
| Convex `convexConfigPath` or `convexDirectoryPath` | string                                 | Managed: plan path `convex.json` (`apps/samebase/convex/repository/records.ts:726`). Manual: verified against the default-branch tree (`convex.ts:211-241`)                                                                      | Resource grouping, code-location observation (`providerObservations.ts:470-627`)                                                                                                                                                                                                                                                                                      | Overview tree, Settings source warning                                                                                   |
| Convex `origin`                                    | same union                             | Same rule                                                                                                                                                                                                                        | `canRemoveConvexProvision` (`dashboard.ts:783-788`), deletion deletes only `provisioned` projects (`deletion/providerActions.ts:126-174`)                                                                                                                                                                                                                             | Remove dialog                                                                                                            |

The repository row adds `convexTeamId`, `cloudflareAccountId` (the fixed destinations),
`githubRepositoryDatabaseId`, and `defaultBranch`
(`apps/samebase/convex/repository/model.ts:162-189`).

Ids: Convex team and project ids are int64 numbers in the Management API and decimal strings in
Samebase. The generator rewrites them to strings
(`scripts/generate-convex-management-api.ts:34-41`), and the client parses responses with
`lossless-json` (`apps/samebase/convex/convexManagementApi/client.ts:100-128`). Alchemy keeps
numbers (`cx/Project.ts:40-47`), and the template reads `CONVEX_TEAM_ID` with `Config.Int`
(`templates/base-actions/alchemy.run.ts:142`). Names disagree too: Samebase's `workerTag` is
Alchemy's `workerId` (`wb/Worker.ts:68-69`) and Workers Builds' `script_tag`.

### What is read live, from where, and for which screen

| Fact                                               | Source call                                                                                                                                                                                                                                                                            | Screen or tool                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Worker exists, live name, domains, workers.dev URL | `GET /accounts/{a}/workers/workers/{tag}` (`providerObservations.ts:130-189`)                                                                                                                                                                                                          | Overview production row, Settings, `repository_getStatus` `apps[].urls`      |
| Builds link, root, previews, token UUIDs           | `GET /accounts/{a}/builds/workers/{tag}`, classified by `classifyCloudflareWorkerRepositoryDiscovery` (`cloudflareResources.ts:581-620`)                                                                                                                                               | Settings, attention items (`repositoryStatus.ts:209-331`)                    |
| Production build state and logs                    | `GET /accounts/{a}/builds/workers/{tag}/builds`, newest build whose metadata branch is GitHub's live default branch (`cloudflareBuildMatching.ts:143-190`)                                                                                                                             | Overview production row, `repository_getStatus` `productionBuild`            |
| Deploy-key access and Convex target                | Builds environment variables: `SAMEBASE_CONVEX_PROJECT` (plain, production) and secret `CONVEX_DEPLOY_KEY` on production and previews (`cloudflareResources.ts:1076-1112`)                                                                                                             | Settings, attention items                                                    |
| Pull request build, preview URL                    | Cloudflare GitHub App check runs named `Workers Builds: <name>`, matched by account and Worker name (`pullRequestCloudflareWorkerChecks.ts:19-20, 294-297`; `pullRequestResources.ts:645-699`); fallback to native Previews by the `branch` field (`cloudflareResources.ts:1155-1225`) | Pull request list, `repository_getStatus` `pullRequests[].apps`              |
| Convex production deployment and region            | `GET /projects/{id}/deployment?defaultProd=true` (`convexProjectResources.ts:52-69`)                                                                                                                                                                                                   | Overview Convex row, Data, Schema                                            |
| Convex preview deployment                          | `GET /projects/{id}/list_deployments` filtered by `previewIdentifier === head branch` (`pullRequestResources.ts:618-643`)                                                                                                                                                              | Pull request list (not in the MCP projection, `repositoryStatus.ts:467-500`) |

### Discovery, the provisioning plan, and the workflows

- Manual Worker discovery lists the account's whole Worker inventory and reads the Builds settings
  of every Worker (`cloudflareResources.ts:544-579, 622-650, 708-741`), then keeps the Workers whose
  Builds `repo_id` equals the repository's GitHub id. The cost grows with the account, not the app.
- The Convex "Used by" evidence reads `SAMEBASE_CONVEX_PROJECT` from Workers connected to the
  repository (`convex.ts:380-461`). No code creates a row from the marker; spec 115 line 103: "An
  observation must not create a resource row."
- The plan (`apps/samebase/convex/repository/provisioningModel.ts:142-237`) has two variants. The
  `samebase` variant carries the Convex and Cloudflare checkpoints (`planned`, `creating`, `created`
  with `projectId` or `workerTag`). The `repository_actions` variant carries only `ciSecrets` and
  `seed` checkpoints (`provisioningModel.ts:193-226`).
- Workflows: `provisionApp` (`apps/samebase/convex/repositoryProvisioningWorkflow.ts:1066-1154`)
  runs `runComposedInfrastructure` (`:841-954`) for `samebase` and `runRepositoryActionsSetup`
  (`:963-1023`) for `repository_actions`. Section 5 maps every step.
- Mode handling today: provider setup reports `github` (`dashboard.ts:396-402`); MCP attention
  short-circuits to "deployment runs in GitHub Actions" (`repositoryStatus.ts:124-147, 184-187`),
  which would also hide Builds and deploy-key items once rows exist; manual provider writes refuse
  the mode (`apps/samebase/convex/repository/infrastructureOperation.ts:306-308`); attach and detach
  do not; Settings ignores the mode for its block reason
  (`apps/samebase/src/repository/dashboard/repositorySettingsState.ts:110-127, 1109`).
- "2/4 pending" on the first production app is the GitHub checks summary of the default branch
  (`apps/samebase/src/repository/dashboard/repositoryChecks.ts:12`), not a setup counter.

How this touches the rest: the attachment rows are the single join point between the provisioning
side (plan, workflows) and the observation side (dashboard, pull requests, MCP). Any design that
fills those rows for a `repository_actions` app inherits the whole observation side for free; any
design that does not must duplicate it.

## 2. What Alchemy holds after a deploy of the template's stack

### The state format

- One row per resource and action, keyed by `(stack, stage, fqn)`. A resource row
  (`alchemy/State/ResourceState.ts:30-150`) has `resourceType`, `fqn`, `logicalId`, `instanceId`,
  `providerVersion`, `status` (`creating`, `created`, `updating`, `updated`, `deleting`,
  `replacing`, `replaced`), `props`, `attr`, `removalPolicy`, `downstream`, `bindings`, and on
  updates and replacements an `old` copy. An action row (`alchemy/State/ActionState.ts:13-51`) has
  `input`, `inputHash`, and `output`.
- The stage output is a separate record, written only at the end of a full successful apply.
  `alchemy/Apply.ts:332-344` skips it when the deploy selected resources (`--include`), and a
  converged destroy deletes it (`alchemy/Apply.ts:304-310`).
- `Redacted` values are stored as their inner value under `__redacted__`
  (`alchemy/State/StateEncoding.ts:78-91`). The state store encrypts rows at rest with AES-CTR
  (`alchemy/Cloudflare/StateStore/Store.ts:39-79`) and decrypts them server-side for every
  bearer-token holder. So the HTTP API returns deploy keys in clear. `alchemy state read` prints
  them as `<redacted>` because it revives the marker and `JSON.stringify` uses `Redacted.toJSON`
  (`alchemy/Cli/commands/state.ts:124-148`, `alchemy/State/HttpStateStore.ts:184`, effect
  `Redacted.ts:204-209`).
- The store is the `alchemy-state-store` Worker with one Durable Object per stack plus a root index
  (`alchemy/Cloudflare/StateStore/Api.ts:24, 102-325`; `Store.ts:258-264`). Routes: `/state/stacks`,
  `/state/stacks/:stack/stages`, `.../stages/:stage/resources[/:fqn]`, `.../replaced-resources`,
  `.../output`, and `DELETE /state/stacks/:stack` (`alchemy/State/HttpStateApi.ts:89-175`). Every
  route takes the same bearer token, reads and writes alike (`HttpStateApi.ts:203-214`). `/version`
  is unauthenticated (`HttpStateApi.ts:199-201`). There are two version numbers: the HTTP contract,
  `STATE_STORE_VERSION = 5` (`HttpStateApi.ts:186`), and the deployed Worker,
  `STATE_STORE_VERSION = 7` (`alchemy/Cloudflare/StateStore/Api.ts:35`).

### Per resource of `templates/base-actions/alchemy.run.ts`

| Resource (fqn)                                   | Attributes in `attr`                                                                                                                                                                                                                                                                                                                                                                            | Source                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `Worker` (`WorkersBuilds.Worker`, lines 138-140) | `workerId` (the tag), `name`, `url` (workers.dev or undefined), `accountId`; settings only when the props declare them, and the template declares only `name`. Stables: `workerId`, `name`, `accountId`.                                                                                                                                                                                        | `wb/Worker.ts:67-78, 244, 342-358`               |
| `Project` (`Convex.Project`, 141-144)            | `projectId`, `slug`, `name`, `teamId` (numbers for the ids), `prodDeploymentName`, `prodDeploymentUrl`. No region. Stables: `projectId`, `slug`, `teamId`.                                                                                                                                                                                                                                      | `cx/Project.ts:40-47, 183-193, 276`              |
| `DeployKey` (149-165)                            | `uniqueName` (`workers-builds-<12 hex of sha256(fqn:instanceId)>`), `keyId`, `deployment`, `deployKey` (Redacted secret).                                                                                                                                                                                                                                                                       | `cx/DeployKey.ts:84-85, 220-228`                 |
| `PreviewDeployKey` (166-169)                     | `uniqueName`, `keyId`, `projectId`, `previewDeployKey` (Redacted secret).                                                                                                                                                                                                                                                                                                                       | `cx/PreviewDeployKey.ts:42-49`                   |
| `Builds` (`WorkersBuilds.Repository`, 173-186)   | `scriptTag`, `repoConnectionId`, `triggerIds` (sorted), `previewsEnabled`, `accountId`, `repository` {`owner`, `name`, `branch`, `ownerId`, `repositoryId`}, `production` and `preview` build settings (commands, root, path filters, caching, `buildToken` UUID, `variables` as names with `secret` or `plain`, never values). The props keep the variable values, the deploy keys among them. | `wb/Repository.ts:147-186, 762-789`              |
| `FirstBuild` (action, 52-113, 188-192)           | `input` {`accountId`, `scriptTag`, `branch`}, `output` {`triggerUuid`}. The build UUID is discarded.                                                                                                                                                                                                                                                                                            | `alchemy.run.ts:107-111`, `ActionState.ts:47-51` |
| stage output (194)                               | `{ workerUrl, convexUrl }` today.                                                                                                                                                                                                                                                                                                                                                               | `alchemy.run.ts:194`                             |

Other resources of `@samebase/alchemy-convex`, not used by the template: `Deployment` (`projectId`,
`type`, `name`, `reference`, `previewName`, `url`, `siteUrl`; `cx/Deployment.ts:61-74`), `Code`
(`deploymentName`, `url`, `siteUrl`, `deployedAt`, `envNames`; `cx/Code.ts:85-96`),
`EnvironmentVariable` (`deployment`, `name`, the deploy key; `cx/EnvironmentVariable.ts:146-151`),
`DefaultEnvironmentVariable` (`projectId`, `name`, `deploymentType`;
`cx/DefaultEnvironmentVariable.ts:142-146`).

### Gap table against section 1

| Samebase field or fact                                | In the state?                                                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker `accountId`, `workerTag`, `workerName`         | Yes: `Worker.attr`                                                        | Name is the stack's; the live name can differ after a dashboard rename (drift).                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Worker `rootDirectory`                                | Yes: `Builds.attr.production.rootDirectory`                               | Always `/` in the template (no `rootDirectory` prop).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Builds link to this repository                        | Yes: `Builds.attr.repository.repositoryId`                                | A claim. Samebase must read it live anyway to verify.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Convex `teamId`, `projectId`                          | Yes: `Project.attr`                                                       | Numbers; Samebase stores decimal strings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Convex `convexConfigPath`                             | No                                                                        | The stack has no notion of a code location. The template's is `convex.json` at the root. The block must declare it, and Samebase verifies it against the tree as the manual flow does.                                                                                                                                                                                                                                                                                                                                                         |
| `origin`                                              | No                                                                        | Samebase's own provenance. Needs a new value (section 6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Production and preview deployment names, URLs, region | Partly: `prodDeploymentName`, `prodDeploymentUrl`; no region, no previews | Samebase reads these live and must not persist them (spec 115).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Build state, preview URLs, check runs                 | No                                                                        | Workers Builds and GitHub own them. Live reads stay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Deploy-key access                                     | Names only (`Builds.attr.*.variables`)                                    | Live Builds read stays (`cloudflareResources.ts:1090-1112`). The template writes `CONVEX_DEPLOY_KEY` on production and previews and the marker as plain text, which the observation reads as `configured`. Spec 003 (`specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md:223-224`) still names a `PREVIEW_CONVEX_DEPLOY_KEY` and a marker on both triggers; the code writes the marker on production only and `CONVEX_DEPLOY_KEY` on both (`cloudflareResources.ts:170-187`), as the template does. The code is the authority; the spec is stale. |
| Setup run, commit, outcome                            | No                                                                        | GitHub Actions owns it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Deploy-key names                                      | Yes, but different from Samebase's                                        | Stack: `workers-builds-<hash>`. Samebase: `samebase-workers-builds-v2-<repositoryId>-<workerId>-production                                                                                                                                                                                                                                                                                                                                                                                                                                     | preview` (`workersBuildsConvexDeployKeyNames.ts:16-26`). Samebase stores neither. |

How this touches the rest: everything the attachment rows need is in the state except the code
location and the origin. Everything else the dashboard shows is either in the state but forbidden to
persist (URLs, deployments) or not in the state at all (build state, previews). So the state is a
source of identity, not of status, which matches the 2026-10-07 decision in RFC 126.

## 3. How Samebase could read it: the options, compared

### (a) A versioned output block, published by the setup run as a run artifact

What it reads: one small JSON file that the deploy job uploads after `alchemy deploy`, read through
`GET /repos/{o}/{r}/actions/runs/{run_id}/artifacts?name=...` and
`GET /repos/{o}/{r}/actions/artifacts/{id}/zip` (a redirect valid for one minute; Octokit
`types.d.ts:4379-4416, 4838-4848`).

- Permissions: the Samebase GitHub App's Actions read, already granted on both App instances (RFC
  126 status, 2026-10-06). No Cloudflare or Convex credential is involved in the read.
- Provenance: each artifact carries `workflow_run` {`id`, `repository_id`, `head_repository_id`,
  `head_branch`, `head_sha`} and a SHA-256 `digest` (Octokit `types.d.ts:21924-21968`), and the run
  carries `path`, `event`, `head_branch`, `conclusion` (`types.d.ts:22320-22470`). The spike reader
  below checks that the artifact is bound to the run, the repository, and the commit, using only
  these fields.
- Failure modes: expired (90 days by default; the repository can set 1 to 90 days for public and 1
  to 400 for private repositories, GitHub docs); missing (the publish step failed or the run
  predates the contract); stale (a laptop deploy changed the stack after the last run, or a failed
  deploy left the previous block as the newest); forged (any writer can change the workflow on the
  default branch; section 4).
- Latency: the artifact is available as soon as the upload step finishes (upload-artifact v4), so
  the read is seconds after the run.
- Cost of change on Alchemy upgrades: the block shape is owned by the template, so Samebase is
  insulated. The publish step depends on `alchemy state read` printing its log lines before the JSON
  on stdout (observed in the spike artifact: three log lines, then the object). The template pins
  Alchemy, so that coupling lives in the template.
- Reruns: `alchemy deploy --detect-drift` is idempotent and republishes the same ids. A rerun of an
  older run deploys the branch head (`alchemy.yml:122-129`) and publishes a newer artifact on the
  older run, so the reader orders artifacts by their own `created_at`, not runs by creation.
- Drift repair: a recreated Worker or project gets a new id; the next block carries it.
- Destroy: `alchemy destroy` deletes the stage output (`alchemy/Apply.ts:304-310`), so the destroy
  job must publish its own block, `{ version: 1, state: "destroyed" }`.
- Confirmed destroy: same, published by the `destroy-app` job after `scripts/destroy-app.ts`
  exits 0.
- Extra cost: the publish step runs a second `alchemy state read`, which repeats the edge-preview
  login (in CI the CLI caches nothing, `alchemy/Cloudflare/StateStore/State.ts:838-856`). A flake
  there fails the step after a good deploy. The reader then sees a failed run without a block and
  keeps the last attachment; a rerun publishes.

### (b) A direct read of the state store from Samebase

What it reads: `GET <alchemy-state-store>.workers.dev/state/stacks/<stack>/stages/prod/output` and
resource rows, with the store's bearer token.

- Getting the token: the token is the Secrets Store secret `AlchemyStateStoreToken`
  (`alchemy/Cloudflare/StateStore/Token.ts:11-39`). The Cloudflare REST API never returns secret
  values, so the CLI uploads a throwaway probe as an edge preview of the `alchemy-state-store`
  script with a Secrets Store binding and calls it (`State.ts:1024-1106`). That uses two endpoints
  Cloudflare does not document for this purpose: `GET /accounts/{a}/workers/subdomain/edge-preview`
  and `POST /accounts/{a}/workers/scripts/{name}/edge-preview` (distilled client
  `services/workers.ts:9937, 12512`; `alchemy/Cloudflare/EdgeSession.ts:62-107`). Alchemy's own
  comment: "Edge-preview reads are flaky in ways that clear up on their own" (`State.ts:1132`), with
  up to 15 retries (`State.ts:813-826`) and a temporary body dump (`State.ts:1079-1085`).
- Permissions: Samebase's Cloudflare OAuth scopes have no Secrets Store scope
  (`apps/samebase/convex/cloudflareOAuth.ts:97-106`). Samebase would have to use the pasted CI token
  server-side, which today exists only to be written into the repository.
- What Samebase would then hold: one bearer token that reads and writes every stack of the account,
  including stacks Samebase has nothing to do with (Mail and Score Four keep their state the same
  way in their account), and that returns every deploy key in clear.
- Failure modes: the edge-preview flakes; a store version change (`/version` 7) breaks the reader; a
  decryption failure returns `undefined` for a row (`Store.ts:68-77`); the state shape is internal
  (`ResourceState`, `providerVersion`).
- Latency: one edge-preview round trip plus the reads, seconds, with retries up to about 30 seconds.
- Cost of change: every Alchemy beta can change the row shape, the store version, or the login.
- Reruns and drift repair: always current, which is the one advantage. Destroy and confirmed
  destroy: the output and the rows are gone, which reads the same as "never deployed".

### (c) An upstream change in Alchemy, or a GitHub Deployment written by the stack

- A read-only token or an outputs-only endpoint on the state store would remove the write power and
  the secrets from (b). It would not remove the edge-preview problem (the token still lives in the
  Secrets Store), the declared-shape problem (outputs are still whatever the stack returns), or the
  forgery problem (a writer still controls the stack). It is a later improvement of (a), not a
  replacement.
- A small, clear upstream ask now: `alchemy state read` should print its log lines on stderr, or
  take `--json`, so the publish step needs no parsing.
- A GitHub Deployment with a `payload` never expires and shows in the repository's Environments. But
  Samebase's App would need the Deployments read permission (a new permission request that every
  installation must accept), and any writer can create a deployment through the API without a
  workflow run, so provenance is weaker than an artifact's run binding. Not recommended.

### (d) Workers Builds variables, as today

`SAMEBASE_CONVEX_PROJECT` (`version=1&teamId=...&projectId=...`,
`cloudflareResources.ts:87-88, 189-220`) plus the Worker found by the Builds scan. This needs no
template change and worked on `samebase/tmp-alchemy-v2` (RFC 126 status, 2026-10-06: Nicu attached
both by hand through the Add dialogs). Limits: the scan reads every Worker of the account; the
marker carries only the team and project ids (no code location, no Worker identity); several Workers
connected to the repository (for example a user's own second Worker) make the choice ambiguous;
there is no link to a setup run and no destroyed state. It stays what it is today: the manual Add
path and the evidence shown in it.

### (e) Other options considered

| Option                                                                     | Why not                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The run pushes the block to Samebase, authenticated by a GitHub OIDC token | Strong provenance (`workflow_ref`, `repository_id`, `sha` claims), no expiry, no polling. But it adds an inbound endpoint, makes the app's workflow depend on Samebase being up, and is a trigger across the Samebase and repository boundary, which RFC 126 rules out by decision. Worth revisiting if polling becomes a cost. |
| The run commits the block into the repository                              | Commits from CI on the default branch, loops with the push trigger, protected branches.                                                                                                                                                                                                                                         |
| The run writes a repository variable                                       | `GITHUB_TOKEN` has no permission key for variables (GitHub docs, workflow syntax `permissions`).                                                                                                                                                                                                                                |
| Samebase hosts the state store                                             | Samebase would hold every secret of every stack, and apps would stop deploying when Samebase is gone, against the promise that apps keep working after a Samebase account is deleted.                                                                                                                                           |
| Samebase guesses by name                                                   | Names are not identities; spec 115 makes `workerTag` and `projectId` the identities.                                                                                                                                                                                                                                            |

### Comparison

| Criterion                      | (a) artifact block               | (b) state store               | (c) upstream token                 | (d) Builds variables + scan |
| ------------------------------ | -------------------------------- | ----------------------------- | ---------------------------------- | --------------------------- |
| New credential or permission   | None                             | CI token used server-side     | Read token, still in Secrets Store | None                        |
| Secrets exposed to Samebase    | None by contract                 | Every deploy key, every stack | Outputs only                       | None                        |
| Exact ids without a scan       | Yes                              | Yes                           | Yes                                | No                          |
| Code location                  | Declared                         | No                            | Declared                           | No                          |
| Coupling to Alchemy internals  | Template only                    | High                          | Medium                             | None                        |
| Expiry                         | 90 days default                  | None                          | None                               | None                        |
| Forgery by a repository writer | Possible, closed by verification | Possible, same                | Possible, same                     | Possible, same              |
| Setup run link                 | Yes                              | No                            | No                                 | No                          |
| Works today                    | After a template step            | Fragile                       | No                                 | Yes                         |

### Recommendation

(a) for identity, verified as in section 4, plus the existing live observers for status, plus (d)
unchanged as the manual path. Deciding reason: (a) is the only option that is exact,
credential-free, secret-free, and insulated from Alchemy's internals at once; its two weaknesses are
bounded, because forgery is closed by verification and expiry is closed by reading within minutes
and keeping the result in the attachment rows. (b) is rejected for the bearer token alone: Samebase
would hold a credential that can rewrite every stack's state in the account and reads every deploy
key.

### Spike: the reader against the real artifact

A prototype reader, kept out of the repository (scratchpad `reader-spike/read-setup-output.ts`), ran
on 2026-10-07 against `samebase/tmp-alchemy-v2` with the `gh` login standing in for the App token.
It listed the two `alchemy` runs on `main`, both `push` and `success`; found the spike artifact
`alchemy-output` (403 bytes zipped, `expires_at` set, `digest` set); verified that the artifact's
`workflow_run` id, repository id, head repository id, and head SHA equal the run's; and refused the
block because the file is not one JSON document: three log lines precede the object. Under the
contract name `samebase-setup-output` it refused with "no successful setup run published the block".
Both refusals are the intended behavior.

A second spike, the identity checks of section 4 against Cloudflare and Convex, is written but was
not run. It is a one-off workflow on a temporary branch of `samebase/tmp-alchemy-v2` (the CI tokens
exist only in that repository's secrets) that reads the stack's state rows into files, assembles the
version 1 block from `Worker.attr`, `Builds.attr`, and `Project.attr`, and checks 27 claims (Worker
by tag, Builds `repo_id` against `github.repository_id`, roots, the marker against the project ids,
deploy-key variables secret on both settings, the Convex project's team, no deploy key in any
printed state shape), printing booleans and timings only. Creating the branch was refused by this
session's permission check, so the checks in section 4 rest on the provider sources and on
Samebase's existing calls to the same endpoints, not on a live run. A branch push also starts a
Workers Builds preview build (the Builds link builds every branch), which creates a Convex preview
deployment and a Worker Preview that the branch deletion must clean up.

How this touches the rest: the artifact read is a GitHub read like the pull request reads (spec
116), runs with the installation token Samebase already uses, and feeds the same attach mutations
the dialogs use. Nothing in the template's deploy path changes; only two steps are added after the
deploy and one after the destroy.

## 4. Trust

What the block proves by itself: that some run of `.github/workflows/alchemy.yml` on the default
branch of this repository, at a given commit, uploaded these bytes. It does not prove that the
workflow or the stack is the template's. Anyone with write access to the default branch can change
`alchemy.run.ts`, the workflow, or the publish step, and publish any block. Fork pull requests
cannot: their runs have another `head_repository_id`, get no secrets, and the `plan` job skips forks
(`alchemy.yml:63`).

So every identity claim is checked against the providers before Samebase attaches it, with the
organization's provider connections (OAuth or API key), not the pasted CI tokens. Reason: the
connection is what every later observation uses, so a resource the connection cannot read must not
be attached; and the CI tokens exist only to be written into the repository.

| Claim                                  | Verification before attach                                                                                                                                                                                                      | Existing code                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `cloudflare.accountId`                 | Equals `repository.cloudflareAccountId`. Otherwise refuse.                                                                                                                                                                      | `cloudflareMutations.ts:231`                                                    |
| Worker `tag` exists and has `name`     | `GET /accounts/{a}/workers/workers/{tag}`; the live name becomes `workerName`, and a different claimed name is refused as a mismatch.                                                                                           | `readCloudflareWorkerIdentityByTag`, `cloudflareResources.ts:483`               |
| The Worker builds from this repository | `GET /accounts/{a}/builds/workers/{tag}` classified with `expectedRepoId = repository.githubRepositoryDatabaseId` and the live default branch: must be `ready`; the live root becomes `rootDirectory` and must equal the claim. | `classifyCloudflareWorkerRepositoryDiscovery`, `cloudflareResources.ts:581-620` |
| The Worker is not attached elsewhere   | `by_account_and_worker_tag` and `by_account_and_worker`.                                                                                                                                                                        | `readMatchingWorker`, `cloudflareMutations.ts:175-216`                          |
| `convex.teamId`                        | Equals `repository.convexTeamId`.                                                                                                                                                                                               | `convexMutations.ts:139`                                                        |
| Project exists in the team             | `GET /projects/{id}`: `id` and `teamId` match.                                                                                                                                                                                  | `convex.ts:327-339`                                                             |
| The project is not attached elsewhere  | `by_project` unique.                                                                                                                                                                                                            | `convexMutations.ts:108-124`                                                    |
| `configPath`                           | A regular file on the default-branch tree.                                                                                                                                                                                      | `convex.ts:211-241`                                                             |

What Samebase cannot verify: that the project was created by this stack, or that it belongs to this
repository in any provider-enforced sense. Convex has no repository link, and the marker is
user-controlled configuration (`specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md:220-229`). The worst
case is a writer who points the block at another project of the same team that no Samebase
repository has attached: Samebase attaches it. That grants nothing an organization member cannot
already do through the Add dialog, Samebase never deletes a `setup_stack` resource (section 6), and
the exclusivity indexes stop the block from taking a resource another repository attached. The cost
is a wrong label and a Data screen on the wrong project until someone removes it. Accepted and
written down, the same way the marker is today.

Comparison with the current mode: the `samebase` mode trusts identities it created itself. It
records the id from its own create response as a checkpoint and the attachment in the same
transaction (`convexMutations.ts:302-377`, `cloudflareMutations.ts:539-613`), so there is nothing to
verify. The manual attach trusts the member's selection and re-reads the providers. The setup-stack
attach is the manual attach with the selection coming from the repository instead of a person; its
authority is the plan (an organization member chose this mode at creation), and its evidence is the
block plus the same re-reads.

The block must hold nothing secret: on a public repository every reader of the repository can
download artifacts (Octokit `types.d.ts:4379-4396`: "Anyone with read access to the repository can
use this endpoint"). The contract has no field for a secret, and the reader rejects unknown fields
in version 1 so that a later template cannot add one by accident without a version change that
Samebase reviews.

How this touches the rest: verification reuses the dialogs' reads, so the attach in this mode and
the manual attach cannot drift apart; the deletion workflow is protected by the new origin; MCP
tools see the same rows and need no change beyond the attention items.

## 5. The mapping to the current workflows

### Step by step

| `samebase` mode step                                                                                  | What it does                                                                                                                                                                                                                                 | Stack equivalent in `templates/base-actions/alchemy.run.ts`                                                                                                                                      | Samebase keeps                                                                                                                |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `validate_connections` (`repositoryProvisioningWorkflowActions.ts:300`)                               | Credentials match the destinations                                                                                                                                                                                                           | None; the stack fails with a permission error                                                                                                                                                    | Stays, both modes                                                                                                             |
| `create_github_repository`, `connect_github_repository`, `seed_starter`, `sync_tree`                  | GitHub source                                                                                                                                                                                                                                | None                                                                                                                                                                                             | Stays, both modes                                                                                                             |
| `write_actions_secrets` (`repositoryProvisioningWorkflowActions.ts:875`)                              | The three secrets and the variable                                                                                                                                                                                                           | None                                                                                                                                                                                             | Stays, `repository_actions` only                                                                                              |
| `claim_infra` (`repositoryProvisioningWorkflow.ts:549-591`)                                           | Takes the write lock                                                                                                                                                                                                                         | The workflow concurrency group `alchemy`, queued (`alchemy.yml:48-51`)                                                                                                                           | The lock is held through the read phase, so a member's manual attach cannot race the read                                     |
| `attach_convex` (`repositoryProvisioningWorkflow.ts:707`, `convex.ts:759-877`)                        | `POST /teams/{t}/create_project` with region; `creating` checkpoint before, `created` plus attachment after                                                                                                                                  | `Convex.Project` (141-144), retained; an existing same-name project stops the deploy with `OwnedBySomeoneElse` unless `--adopt` (`cx/Project.ts:328-342`)                                        | Read: verify and attach with origin `setup_stack`                                                                             |
| `attach_worker` (`repositoryProvisioningWorkflow.ts:742`, `cloudflare.ts:605-749`)                    | `POST /accounts/{a}/workers/workers` with Preview URLs on; checkpoint plus attachment                                                                                                                                                        | `WorkersBuilds.Worker` (138-140), retained; `Unowned` without `--adopt` (`wb/Worker.ts:257-268`)                                                                                                 | Read: verify and attach                                                                                                       |
| `configure_workers_builds_for_github` (`cloudflare.ts:2280`, `cloudflareResources.ts:1241-1401`)      | `POST /builds/workers` with the member-selected build token, commands from `repository/model.ts:59-83`, previews on                                                                                                                          | `WorkersBuilds.Repository` (173-186): same commands and previews; build token explicit, else the account's first, else the CI token registered as `alchemy-<stack>` (`wb/Repository.ts:796-849`) | Observation only (existing Builds observation)                                                                                |
| `rotate_convex_deploy_keys_for_workers_builds` (`cloudflare.ts:2331`, `infraProvisioning.ts:191-317`) | Delete and recreate the two keys by Samebase's names, PATCH `CONVEX_DEPLOY_KEY` on production and previews and the marker on production, then `POST /builds/triggers/{uuid}/builds` with the exact commit (`cloudflareResources.ts:900-951`) | `Convex.DeployKey`, `Convex.PreviewDeployKey`, `Builds` variables, `FirstBuild` (149-192). `FirstBuild` builds the branch head, once per Worker and branch                                       | Observation only (existing build-access observation). Key rotation becomes a stack change (a new key `name` replaces the key) |
| `finish` (`repositoryProvisioningWorkflow.ts:605-634`)                                                | Lock `succeeded`                                                                                                                                                                                                                             | The run's conclusion                                                                                                                                                                             | The setup status read                                                                                                         |

Differences to keep in mind:

- Region: the `samebase` plan carries `deploymentRegion`; the template passes none, so Convex uses
  the team default (`cx/Project.ts:34-35`). RFC 126 lists this as a template follow-up.
- First build: Samebase pins the commit it seeded and filters the production trigger by repository
  id, root, and branch (`cloudflareResources.ts:905-951`); `FirstBuild` filters only by branch and
  builds the branch head (`alchemy.run.ts:92-110`). Both post no GitHub check run, and both are
  visible through the Builds observation, which matches builds by branch
  (`cloudflareBuildMatching.ts:143-190`). So the "no check run for an API build" finding of
  2026-10-06 affects only the default-branch checks summary, in both modes alike.
- Interrupted create: Samebase stops with "exists after an interrupted create. Delete it in the
  Convex dashboard, then retry" (`convex.ts:804-807`); the stack stops with `OwnedBySomeoneElse` and
  offers the `adopt` dispatch (`cx/Adoption.ts:20-30`).
- Build token: Samebase lets the member pick one and records the last used one; the stack may
  register the pasted CI token as a build token, which Settings then shows as `alchemy-<stack>`.
- Names: Samebase's `sanitizeAppResourceName` (`apps/samebase/shared/appResourceNames.ts:29-49`) and
  the template's `deployNames` (`templates/base-actions/scripts/deploy-names.ts:39-65`) give the
  same result for GitHub repository names. Samebase computes it from the requested name after
  `toSafeGitHubRepositoryName`, the template from `GITHUB_REPOSITORY`; the attach must take the
  names from the block, never recompute them.

### What "remove the existing Convex workflows and rely on Alchemy" means

Goes, once no `samebase` plan needs a retry:

- The four provider steps and their managed paths: `runComposedInfrastructure` and its step wrappers
  (`repositoryProvisioningWorkflow.ts:700-954`), `readComposedInfrastructureState` (`:188-283`),
  `createProjectForManagedWorkflow` (`convex.ts:759-877`), `createWorkerForManagedWorkflow`
  (`cloudflare.ts:605-749`), the managed checkpoint mutations (`convexMutations.ts:229-377`,
  `cloudflareMutations.ts:453-613`), the `*ForWorkflow` actions (`cloudflare.ts:2257-2372`,
  `convex.ts:937`), and the `samebase` plan variant (`provisioningModel.ts:142-186`).
- The plan projection rows in Settings (`repositorySettingsState.ts:994-1038`) and the pending
  Cloudflare setup in MCP (`mcpResolution.ts:76-107`).

Stays, as reads or as manual building blocks:

- The attachment tables, every observer, pull request resources, Data, Schema.
- The manual attach and detach (spec 105 and 106 reads), used by connected existing repositories,
  which have no plan in either mode.
- The manual provider writes (create Worker, connect Worker, configure Builds, rotate keys, create
  project) for connected existing repositories and for `samebase` apps created before the change.
  Retiring them is a separate question: a connected existing repository has no stack.
- The deletion workflow, for `provisioned` resources of older apps.

Connection fields that need a new source: none of the fields themselves. The source of their values
changes from "Samebase's create response" to "the verified block", and `origin` gains a value.

Order without a hard cut: the phases in the proposed RFC text below. Each phase ships alone and
leaves both modes working.

How this touches the rest: the retirement removes writes, not reads, so the dashboard, pull
requests, and MCP are untouched by it. What changes for users is where repairs happen: in the
repository's stack and its `alchemy` workflow instead of Samebase's Repair buttons.

## 6. Schema delta

Following `docs/data-modeling-vocabulary.md`: the attachment rows are concrete product facts
(unprefixed tables), the plan is `workflow_` (retry input and a temporary projection), and live
reads are not persisted.

1. `origin` on both attachment tables gains `"setup_stack"`: the repository's Alchemy setup stack
   created or adopted the resource; the repository's confirmed destroy deletes it; Samebase never
   deletes it. This is the source discriminator; no second field. Effects: `canRemove*Provision` and
   the deletion plan already filter on `provisioned` (`dashboard.ts:783-788`,
   `deletion/runs.ts:117-165`), so they need no change; Settings and MCP use the value to say
   "Managed by the setup stack in `alchemy.run.ts`" instead of offering repairs.
2. The `repository_actions` plan variant gains a required `setup` checkpoint: `{ state: "waiting" }`
   | `{ state: "attached", runId, headSha, outputVersion, attachedAt }` |
   `{ state: "destroyed", runId, headSha, readAt }`. `runId` and `headSha` name the GitHub run whose
   block Samebase applied; they keep the history readable after GitHub deletes the run, and let the
   status say "the newest setup run reports a different Worker" by comparison.
3. Considered and dropped: the artifact id and digest (no consumer after the read; the run id is
   enough to find the run while it exists), verification timestamps (verification is a live read;
   spec 115 forbids persisting observations), Worker and Convex URLs (spec 115 non-goals), the stack
   name (no consumer).
4. Unrepresentable today, and fine to leave so: an attachment whose identity changes in place. A
   drift repair that recreates a Worker gets a new tag, which is a new attachment; the old row stays
   as "Needs attention: missing" until a member removes it, as spec 115 requires.

RFC 090's policy: provider mirrors are reshaped by delete and recreate, never by migration, and spec
003 makes empty plan tables a deploy precondition
(`specs/003_REPOSITORY_INFRA_PROVISIONING_SPEC.md:181-185`). The new `origin` literal is additive
and needs nothing. The required `setup` field is a narrowing for existing `repository_actions`
plans. Today those are the `tmp-` dogfood apps; the precondition is that the production table has no
`repository_actions` plan rows (remove those apps first). If a real app exists by then, the fallback
is one widen-migrate-narrow with `{ state: "waiting" }`, which the next read resolves.

How this touches the rest: the origin value drives three existing consumers (Remove dialog, deletion
plan, Settings repairs) without new branches in the first two; the plan checkpoint is read by the
provisioning workflow, the retry admission, and the status projection.

## 7. Edge cases

| Case                                                                 | What happens with the recommendation                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rerun                                                                | Same ids, newer artifact. Attach is idempotent (`insertWorker` returns the existing row; `cloudflareMutations.ts:239-249`).                                                                                                                                                                                        |
| `--adopt` dispatch                                                   | The block names the adopted Worker and project. Verification passes if they are in the right account and team and the Worker builds from this repository. If another Samebase repository attached them, the exclusivity check refuses with a message naming the conflict, not the other repository.                |
| Drift repair changes an id                                           | New block, new id. The status read compares the newest block with the attachments and says so; the member, or an agent through `repository_retryProviderSetup`, runs the read phase, which attaches the new id. The old row stays until removed (spec 115). No automatic detach.                                   |
| Confirmed destroy                                                    | The `destroy-app` job publishes `{ version: 1, state: "destroyed" }`. Samebase records `setup.destroyed`, shows "Destroyed by the `alchemy` run N", keeps the rows (observations show them missing), and offers Remove from Samebase. Nothing is deleted by Samebase.                                              |
| Failed or partial destroy                                            | No destroyed block. The newest run is failed; the newest block is the last deploy's; observations show what is missing.                                                                                                                                                                                            |
| A second Worker in the same repository                               | A member's own Worker is attached by hand with `selected_existing`; the reader touches only `setup_stack` rows. A second Worker in the stack appears as a second entry of the block's list.                                                                                                                        |
| A monorepo with two Convex projects                                  | Two entries in `convex.projects`, each with its `configPath`, verified against the tree. Spec 115 already allows several projects per repository and shared code locations.                                                                                                                                        |
| A fork                                                               | A fork's runs carry another repository id and never match. A fork added to Samebase by "connect existing" has no plan and no reader. `WorkersBuilds.Repository` refuses to move the original's Builds link to a fork clone (`wb/Repository.ts:605-610`).                                                           |
| The default branch renamed                                           | The workflow's push trigger names `main` (`alchemy.yml:23-24`), so pushes stop running it until the trigger is edited. The reader uses GitHub's live default branch, like the production build observation. Documented in the template README as unsupported, like repository renames.                             |
| Artifact expired before Samebase read it                             | "No setup output: run the `alchemy` workflow on the default branch to publish it." A dispatch deploy is a no-op that republishes. The attachments, once written, do not depend on the artifact.                                                                                                                    |
| Two setup runs racing                                                | The concurrency group serializes runs in the repository (`alchemy.yml:48-51`). The reader takes the newest artifact by `created_at`, which covers a rerun of an older run. A laptop deploy is not serialized and publishes nothing; it is visible as drift until the next run.                                     |
| Publish step fails after a good deploy                               | Run failed, no block. The status shows the failed run; the attachments stay. A rerun publishes.                                                                                                                                                                                                                    |
| First green run detection                                            | Not a check run on the head: the workflow is path-filtered, check runs are per job, and runs and checks expire. The reader lists `GET /actions/workflows/alchemy.yml/runs?branch=<default>` and filters `path`, `event` in `push` or `workflow_dispatch`, and the repository ids (Octokit `types.d.ts:5153-5165`). |
| The Workers Build that `FirstBuild` starts                           | Posts no check run (API-started, same as the `samebase` mode's first build). Once the Worker is attached, the production build observation shows it, because it matches builds by branch, not by check.                                                                                                            |
| A block that names resources the organization connection cannot read | Refused, with the provider error; the status says which claim failed. The member can still attach by hand if the connection is fixed later.                                                                                                                                                                        |

## 8. Open questions for Nicu

1. **Which credential verifies the claims.** Recommendation: the organization's provider connection,
   because it is what every later observation uses. The pasted CI tokens stay write-only from
   Samebase's point of view.
2. **When the reader runs.** Recommendation: a bounded wait inside the provisioning workflow after
   `sync_tree` (the first run takes about two minutes; wait up to 20 minutes with backoff), then
   only on the existing retry entry point. No write from a status read, and no webhook.
3. **A destroyed block.** Recommendation: yes, published by the `destroy-app` job, so Samebase can
   say what happened instead of showing two missing resources.
4. **Detach of a `setup_stack` row.** Recommendation: allowed, as for any row; the reader never
   re-attaches on its own after a detach, only on an explicit retry.
5. **Strict unknown fields in version 1.** Recommendation: reject, so no field can enter without a
   version change. Additive fields need a version bump, and Samebase keeps a validator per version
   it has met.
6. **Where the retirement lives.** Recommendation: RFC 127, with the reader contract in RFC 126.
7. **Upstream ask.** Recommendation: file one issue on Alchemy for `state read` to keep logs off
   stdout (or `--json`). Leave the read-only token for later.

## 9. Sources

Repository (base `ab60312a3`):

- `templates/base-actions/alchemy.run.ts`, `.github/workflows/alchemy.yml`,
  `scripts/deploy-names.ts`, `scripts/destroy-app.ts`, `README.md`.
- `apps/samebase/convex/repository/model.ts`, `provisioningModel.ts`, `provisioningPlan.ts`,
  `cloudflareMutations.ts`, `convexMutations.ts`, `cloudflare.ts`, `convex.ts`,
  `providerObservationQueries.ts`, `providerObservations.ts`, `pullRequestResources.ts`,
  `pullRequestCloudflareWorkerChecks.ts`, `cloudflareBuildMatching.ts`, `repositoryStatus.ts`,
  `status.ts`, `dashboard.ts`, `infrastructureOperation.ts`, `deletion/runs.ts`,
  `deletion/providerActions.ts`, `contracts/getUserRepositories.ts`.
- `apps/samebase/convex/cloudflareResources.ts`, `repositoryProvisioningWorkflow.ts`,
  `repositoryProvisioningWorkflowActions.ts`, `cloudflareOAuth.ts`, `convexManagementApi/client.ts`.
- `apps/samebase/shared/appResourceNames.ts`, `apps/samebase/src/repository/dashboard/*`.
- `specs/003`, `specs/105`, `specs/106`, `specs/115`, `specs/116`;
  `docs/data-modeling-vocabulary.md`; `archive/090_PROVISIONING_BUILDING_BLOCKS_PLAN.md:118-120`.
- RFC 126 on `rfc-repository-actions-provisioning` (`bef37f673`);
  `research/2026-10-05-alchemy-setup-stack-and-wrangler-split.md`;
  `research/2026-10-05-workers-builds-and-iac-split.md` (on branch
  `research-workers-builds-iac-split`, not on main).

Packages:

- `alchemy@2.0.0-beta.80`: `State/ResourceState.ts`, `State/ActionState.ts`,
  `State/StateEncoding.ts`, `State/HttpStateApi.ts`, `State/HttpStateStore.ts`, `Apply.ts`,
  `Cli/commands/state.ts`, `Cloudflare/StateStore/{Api,Store,Token,State,CredentialsFile}.ts`,
  `Cloudflare/EdgeSession.ts`.
- `@samebase/alchemy-cloudflare-workers-builds@0.5.0`: `Worker.ts`, `Repository.ts`, `Secret.ts`,
  `Api.ts`.
- `@samebase/alchemy-convex@0.3.0`: `Project.ts`, `DeployKey.ts`, `PreviewDeployKey.ts`,
  `Deployment.ts`, `Code.ts`, `EnvironmentVariable.ts`, `DefaultEnvironmentVariable.ts`,
  `Adoption.ts`.
- `@distilled.cloud/cloudflare@1.0.0-rc.13` `services/workers.ts` (edge-preview endpoints).
- `@octokit/openapi-types@27.0.0` `types.d.ts` (artifacts, workflow runs).
- `effect@4.0.0` `Redacted.ts`.

Reference apps: `~/dev/my/score-four/alchemy.run.ts` and `.github/workflows/infra.yml`;
`~/dev/samebase/mail/alchemy.run.ts` and `.github/workflows/infra.yml`. Both return
`{ url, previewsEnabled }`, use fixed stack names (`ScoreFour`, `SamebaseMail`), and publish nothing
for Samebase.

GitHub docs:

- [Configuring the retention period for GitHub Actions artifacts and logs](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization):
  runs, checks, and artifacts are kept 90 days by default, 1 to 90 days for public and 1 to 400 for
  private repositories.
- [actions/upload-artifact](https://github.com/actions/upload-artifact): v4 artifacts are immutable,
  `overwrite`, `artifact-id` and `artifact-digest` outputs, `retention-days` 1 to 90.
- [Workflow syntax: `permissions`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax):
  no permission key for variables or secrets.

Live reads on 2026-10-07: `samebase/tmp-alchemy-v2` runs and artifacts through `gh api`.

## Proposed RFC text

Placement: the reader and its contract replace the "Observation (PR C)" section of RFC 126, because
PR C is RFC 126's third pull request and the test RFC 126 exists for. The retirement of the
`samebase` mode's provider workflows should be RFC 127, "Retire Samebase's provider workflows in
favor of the setup stack": it changes accepted specs (003, 105, 106, 115), the default mode, and
existing apps, and it can start only after RFC 126's dogfood passes. The phases below are written so
they can move into RFC 127 unchanged.

### Decision

For a `repository_actions` repository, the identity of its Worker and Convex project comes from an
output block that the repository's setup run publishes, verified by Samebase against Cloudflare and
Convex before it is attached. Live status keeps coming from Workers Builds, GitHub checks, and
Convex. Samebase does not read Alchemy's state store.

### The output block contract

- Artifact name `samebase-setup-output`, one file `samebase-setup-output.json`, exactly one JSON
  document, at most 64 KiB, uploaded with `overwrite: true` by the `deploy` job after
  `alchemy deploy` succeeds, and by the `destroy-app` job after the destroy succeeds.
- Version rule: an integer `version`. Version 1 rejects unknown fields. Any added, removed, or
  retyped field is a new version. Samebase keeps one validator per version it has met and never
  drops one while a template that writes it can still run.
- No field may hold a secret. Ids are numbers where the provider uses numbers.

```json
{
  "version": 1,
  "state": "deployed",
  "cloudflare": {
    "accountId": "0123456789abcdef0123456789abcdef",
    "workers": [
      { "tag": "7c1f0e0d2b8a4c5e9f1a2b3c4d5e6f70", "name": "my-app", "rootDirectory": "/" }
    ]
  },
  "convex": {
    "teamId": 38516,
    "projects": [{ "projectId": 3157834, "configPath": "convex.json" }]
  }
}
```

The destroyed form is `{ "version": 1, "state": "destroyed" }`.

The template builds the deployed form as the stack's return value (`Worker.attr`, `Builds.attr`,
`Project.attr`, and the literal `convex.json`), so
`alchemy state read --backend cloudflare <stack>/prod/output` yields it; the publish step keeps only
the JSON object from the command's stdout.

### The reader

1. List runs: `GET /repos/{o}/{r}/actions/workflows/alchemy.yml/runs?branch=<default branch>`. Keep
   runs whose `path` is `.github/workflows/alchemy.yml`, `event` is `push` or `workflow_dispatch`,
   and whose `repository.id` and `head_repository.id` are the repository's GitHub id. The newest
   completed one is the setup status.
2. Find the block: the newest non-expired artifact named `samebase-setup-output` among the
   successful kept runs, ordered by the artifact's `created_at`, then id. Its `workflow_run` id,
   repository ids, and `head_sha` must equal the run's.
3. Download, require one file, one JSON document, the size bound, and a known version.
4. For `deployed`: verify every claim as in section 4 with the organization's provider connections,
   then attach all of them in one mutation with origin `setup_stack`, and record
   `setup.attached { runId, headSha, outputVersion, attachedAt }`. Any failed claim attaches nothing
   and reports the claim.
5. For `destroyed`: record `setup.destroyed { runId, headSha, readAt }`; change no attachment.

### When it runs

- In the provisioning workflow, after `sync_tree`: a step `observe_setup_run` that waits for the
  first block with backoff for up to 20 minutes while holding the write lock, then `attach_setup`.
  The wait is a loop of short read actions and workflow sleeps (`ctx.sleep` in
  `@convex-dev/workflow@0.4.6`, `dist/client/workflowContext.d.ts:116-119`), not one long action. A
  timeout ends the run as failed at that step, which the existing retry admission accepts once
  `observe_setup_run` and `attach_setup` are provider steps in
  `isRepositoryProvisioningProviderStep` (`provisioningModel.ts:58-81`).
- On `repository_retryProviderSetup` for this mode: the same two steps, after the secrets step, with
  the seed and sync skipped by their checkpoints.
- Never from a status read. The status read only reports when the newest block differs from the
  recorded `setup` checkpoint.

### The attach rule

Samebase attaches a resource from a block only when the repository has a `repository_actions` plan,
the block passed every check, and the resource is not attached to another repository. An observation
alone never attaches (spec 115). A `setup_stack` row is never deleted by Samebase, never the target
of a Samebase provider write, and detached only by a member.

### Status sources per mode

| Slot                           | `samebase`                         | `repository_actions`                                                                     |
| ------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Setup                          | Samebase's provisioning run        | Samebase's run until `attach_setup`; then the newest `alchemy` run on the default branch |
| Worker and project identity    | Attachments, `provisioned`         | Attachments, `setup_stack`                                                               |
| Production build               | Workers Builds observation         | Same                                                                                     |
| Pull request previews          | Cloudflare checks, native fallback | Same                                                                                     |
| Convex production and previews | Convex observation                 | Same                                                                                     |
| Deploy-key access              | Builds variables observation       | Same                                                                                     |
| Repairs                        | Samebase Repair buttons            | "Change `alchemy.run.ts`, or run the `alchemy` workflow"                                 |
| Removal                        | Can delete `provisioned`           | Never deletes; the confirmed destroy runs in the repository                              |

The MCP attention short-circuit for this mode (`repositoryStatus.ts:184-187`) gives way to the
normal items for attached rows, plus the setup-run items.

### Retirement of the current mode's workflows (RFC 127), each phase ships alone

1. **Phase 1, the contract in the template.** `templates/base-actions` returns the version 1 block
   from the stack and publishes it from the `deploy` and `destroy-app` jobs. No Samebase change.
   Exit: a new `tmp-` app's run publishes a block that the spike reader accepts.
2. **Phase 2, the reader (RFC 126 PR C).** The `setup_stack` origin, the `setup` checkpoint, the two
   workflow steps, the status items. Only `repository_actions` repositories change. Exit: a `tmp-`
   app created from samebase.com shows its Worker, builds, previews, and Convex rows without a
   manual Add.
3. **Phase 3, the default.** The creation form and `repository_create` default to
   `repository_actions`; `samebase` stays as an option. Exit: Nicu's decision after the release gate
   on credential scope (RFC 126 finding 1).
4. **Phase 4, no new `samebase` plans.** Creation no longer offers the mode; existing apps keep
   retry until their runs are finished. Exit: no `samebase` plan with a failed run in production.
5. **Phase 5, delete the managed provider path.** Remove the four steps and their managed code
   (section 5), and the `samebase` plan variant, under spec 003's precondition of an empty plan
   table for that variant. Manual building blocks and deletion stay.
6. **Phase 6, optional.** A migration path for older apps: seed the Alchemy layer into the
   repository, write the CI secrets, and run the `adopt` dispatch. Their Samebase-named deploy keys
   are deleted by name afterwards.
