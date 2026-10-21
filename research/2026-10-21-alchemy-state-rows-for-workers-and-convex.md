# Alchemy state rows for Workers and Convex: what the team store holds and what Samebase needs

Date: October 21, 2026. Status: research. It informs the next release of `@samebase/alchemy-convex`
and the reader behind `/repo/<owner>/<repo>/alchemy`. It does not define product behavior.

- Base: `origin/main` at `f143d03c0` (v2142). The reader is
  `apps/samebase/convex/repository/alchemyState.ts` and the view is
  `apps/samebase/src/components/RepositoryAlchemyStateView.tsx`, both from
  [#1759](https://github.com/samebase/samebase/pull/1759).
- Packages read: `@samebase/alchemy-convex@0.6.1` from the npm tarball, and `alchemy@2.0.0-beta.83`,
  the exact peer that 0.6.1 declares. Paths with the prefix `cx/` are `src/` of the 0.6.1 package;
  paths with the prefix `alchemy/` are `node_modules/alchemy/src/` of the scratch stack.
- Convex Management API facts come from
  `apps/samebase/convex/convexManagementApi/openApi.generated.json`.
- Measurement status: the scratch stack is written and `alchemy plan --stage main` ran against the
  team store (3 creates, 1 binding). The deploy, the row read, and the destroy (sections 4 and 7)
  wait for an approval: the research session's permission classifier refused the deploy of the
  temporary Worker and Convex project. Every table below says whether a fact is read from source
  (declared) or from a row (measured).

## Summary

1. Verdict, from the declared attributes and pending the rows: the team store answers every identity
   field that the two attachment rows hold today (Worker id, name, account; Convex team id, project
   id, project slug) and every address field that Samebase reads live for the overview URLs (Worker
   URL, custom domains, routes; Convex deployment name, client URL, HTTP actions URL, type, preview
   name). It does not answer the build badge, the Convex region, the Convex team slug of the
   dashboard link, the Workers Builds root directory, or which pull request a stage belongs to.
   Section 5 has the field table.
2. Standard Alchemy writes nothing about git, branch, pull request, or CI run into state. A resource
   row has `resourceType`, `status`, `props`, `attr`, `bindings`, `downstream`, `logicalId`,
   `instanceId`, `fqn`, `providerVersion`, and optional `removalPolicy`, `providerMode`,
   `adoptionBlocked`, `kind` (`alchemy/State/ResourceState.ts:30-95`). A stage has one output
   document, written only after a full successful apply (`alchemy/Apply.ts:283-295`). Alchemy reads
   `GITHUB_*` for its own GitHub provider, for OIDC auth, and for telemetry, and none of it reaches
   state (section 2).
3. `attr` is the truth for display: it is what the provider observed after the write. `props` is
   what the stack asked for. A field that exists only in `props`, such as the Worker's `env` or the
   deployment's `source`, says intent, not fact.
4. The run record is ours to define until upstream adds one. Section 6 proposes version 1 with
   `repository`, `stackFile`, `branch`, `pullRequest`, `headCommit`, `runUrl`, `source`, and
   `recordedAt`, derived from the GitHub Actions variables in CI and from git on a laptop, and
   stored under one reserved key of the stage output in every store. The Convex store gets a `runs`
   table only when a listing by repository or pull request is needed; the reader logic stays one.
5. Every deployed Worker already carries `ALCHEMY_STACK_NAME`, `ALCHEMY_STAGE`,
   `ALCHEMY_WORKER_NAME`, and `ALCHEMY_CLOUDFLARE_ACCOUNT_ID` as plain-text bindings
   (`alchemy/Cloudflare/Workers/WorkerProvider.ts:2489-2494`). Samebase's Worker scan can name the
   stack and stage of a Worker from the Cloudflare API without the store.
6. Recommendation, in order: (a) `@samebase/alchemy-convex` 0.7 writes the run record under the
   reserved output key for every state store it wraps; (b) the Samebase reader keys a repository to
   its stack by name, then reads `attr` of `Cloudflare.Worker`, `Convex.Project`, and
   `Convex.Deployment` rows for identity and addresses, the run record for the branch and pull
   request of each stage, and keeps the live reads for build state, region, and the dashboard team
   slug. Section 8 has the paragraph.

## 1. What the overview shows today

A sub-agent read every component and query behind the repository overview; the references below were
spot-checked (`RepositoryEnvironmentTree.tsx:139-172, 470-520`,
`repositoryEnvironmentRoots.ts:186-211`, `providerObservations.ts:330-340, 598-608`,
`convexProjectResources.ts:52-69`, `model.ts:237-256`, `pullRequestResources.ts:618-643`). Paths are
relative to `apps/samebase/`. Origin names one of: a database attachment row, the live Cloudflare
API, the live Convex Management API, the GitHub API, or derived.

The database rows come from `api.repository.list` (`convex/repository/dashboard.ts:647-896`). The
live values come from four actions that `useRepositoryProviderObservations.ts:85-210` calls, and
`buildProductionEnvironmentRoots` (`src/repository/dashboard/repositoryEnvironmentRoots.ts:153-351`)
joins both into rows.

### Cloudflare Worker, default-branch section

| Field                                              | Rendered at                             | Read from                                                                               | Origin                                                                                                                                                    |
| -------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root directory heading (hidden when only `/`)      | `RepositoryEnvironmentTree.tsx:222-226` | `cloudflareWorkers[].rootDirectory`                                                     | database row `repositoryCloudflareWorkers.rootDirectory`                                                                                                  |
| Worker name                                        | `RepositoryEnvironmentTree.tsx:478-480` | `cloudflareWorkers[].workerName`                                                        | database row `repositoryCloudflareWorkers.workerName`; the live name is not used here                                                                     |
| Build badge (Queued, Building, Built, Failed, ...) | `RepositoryEnvironmentTree.tsx:481-491` | `observeCloudflareWorkerBuilds[].productionBuild.buildState`                            | live Cloudflare API: `GET /accounts/{a}/builds/workers/{tag}/builds`, newest build on GitHub's live default branch (`cloudflareBuildMatching.ts:143-190`) |
| Build logs link                                    | `RepositoryEnvironmentTree.tsx:484`     | `productionBuild.logsUrl`                                                               | derived: database `accountId`, live Worker name, live `build_uuid` (`providerDashboardUrls.ts:1-7`)                                                       |
| "No build", "Checking", "Unavailable"              | `RepositoryEnvironmentTree.tsx:493-499` | the state of the builds read                                                            | derived                                                                                                                                                   |
| Production URL (label is the hostname)             | `RepositoryEnvironmentTree.tsx:504-518` | first custom domain, else the workers.dev URL (`repositoryEnvironmentRoots.ts:189-211`) | live Cloudflare API: `GET /accounts/{a}/workers/workers/{tag}` (`cloudflareResources.ts:380-470`, through `providerObservations.ts:130-189`)              |
| Other domains menu                                 | `RepositoryEnvironmentTree.tsx:519-521` | the destinations after the first                                                        | live Cloudflare API, same read                                                                                                                            |
| Worker count in the sidebar                        | `RepositoryOverviewSidebar.tsx:224-277` | `cloudflareWorkers.length`                                                              | database rows                                                                                                                                             |
| "Finish Cloudflare setup"                          | `RepositoryOverviewPage.tsx:164-184`    | the provisioning plan                                                                   | database row `workflow_repositoryProvisioning_plans.cloudflare`                                                                                           |
| Setup stack line "Workers: {name} at {root}"       | `RepositorySetupStackStatus.tsx:44-53`  | `setupOutput.readStatus`                                                                | GitHub API (the `samebase-setup-output` artifact) verified against the live Cloudflare API                                                                |

The Settings tab adds, for the Worker: the account name (database row `organizations`), the
dashboard link (derived), "Cloudflare now uses the name X" and "now builds from Y" (live Worker and
Builds settings), the Workers Builds connection and its API token name (live
`GET /accounts/{a}/builds/workers/{tag}` and `GET /accounts/{a}/builds/tokens`), and the Convex
deploy-key status read from the build variables `CONVEX_DEPLOY_KEY` and `SAMEBASE_CONVEX_PROJECT`
(`repositorySettingsState.ts:310-444, 723-805`).

### Convex, default-branch section

There is no project card. Each attached project gives at most one production deployment row. Dev
deployments appear nowhere; preview deployments appear only under pull requests.

| Field                                      | Rendered at                             | Read from                                                                     | Origin                                                                                                           |
| ------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Root directory heading                     | `RepositoryEnvironmentTree.tsx:222-226` | `getConvexCodeRootDirectory(project.codeLocation)`                            | derived from database row `repositoryConvexProjects.convexConfigPath` or `.convexDirectoryPath`                  |
| Deployment name (link label)               | `RepositoryEnvironmentTree.tsx:154-156` | `productionDeployment.deploymentName` (`providerObservations.ts:601`)         | live Convex Management API: `GET /projects/{id}/deployment?defaultProd=true` (`convexProjectResources.ts:52-69`) |
| Link to the Convex dashboard               | `RepositoryEnvironmentTree.tsx:146`     | `productionDeployment.dashboardUrl` (`providerObservations.ts:602-606`)       | derived: `teamSlug` and `slug` from live `GET /projects/{id}` plus the live deployment name                      |
| Region (flag and name)                     | `RepositoryEnvironmentTree.tsx:168-172` | `productionDeployment.region` (`providerObservations.ts:607`)                 | live Convex Management API, `deployment.region`                                                                  |
| Menu: Data, Schema, Components routes      | `repositoryEnvironmentRoots.ts:289-321` | `repositories.defaultBranch`, `repositoryConvexProjects._id`, deployment name | derived                                                                                                          |
| Project count in the sidebar               | `RepositoryOverviewSidebar.tsx:225-291` | `convexProjects.length`                                                       | database rows                                                                                                    |
| Setup stack line "Convex projects: {slug}" | `RepositorySetupStackStatus.tsx:47-53`  | `setupOutput.readStatus`                                                      | GitHub API artifact verified against the live Convex Management API (`convex.ts:624, 700-708`)                   |

Not shown on the overview: the client URL (`*.convex.cloud`), the HTTP actions URL
(`*.convex.site`), the deployment type, the project slug as text, the team slug, deploy key names,
the component tree, the last deploy time. The Data route uses `deploymentUrl` and a deploy key name
without showing them (`src/components/RepositoryDatabaseView.tsx:114, 146`). Deploy key names are
built at run time and never stored (`convex/repository/workersBuildsConvexDeployKeyNames.ts:1-26`).

The Settings tab shows for the project: the owner line `{teamSlug}/` and the project slug (live
`GET /projects/{id}`, with the database `teamId` and `projectId` as fallbacks), "Production:
{region}" (live), and the code-location warnings (GitHub tree discovery compared with the database
code location).

### Pull-request rows

| Row                                                | Read from                                                                                                                                  | Origin                                                                                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker name and root                               | `pullRequestResources.ts:567-573`                                                                                                          | database row                                                                                                                                                                              |
| Worker build badge and logs link                   | `pullRequestCloudflareWorkerChecks.ts:291-344`                                                                                             | GitHub API: the check run `Workers Builds: {name}` of the Cloudflare GitHub App, matched by account id and Worker name                                                                    |
| Worker "Branch preview" URL                        | check-run summary field "Preview Alias URL" (`pullRequestCloudflareWorkerChecks.ts:257-289`), else `readCloudflareWorkerBranchPreviewUrls` | GitHub API, else live Cloudflare API (`cloudflareResources.ts:1161-1231`)                                                                                                                 |
| Convex preview deployment name and link            | `pullRequestResources.ts:618-643, 774-783`                                                                                                 | live Convex Management API: `GET /projects/{id}/list_deployments?deploymentType=preview`, the one whose `previewIdentifier` equals the head branch; the link needs the live project slugs |
| Other previews (unattached Worker, Pages, Netlify) | `pullRequestResources.ts:582-609`, `pullRequestHostingPreviews.ts`                                                                         | GitHub API (check runs and bot comments)                                                                                                                                                  |

### The attachment tables

| Table                                                  | Fields                                                                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repositoryCloudflareWorkers` (`model.ts:237-250`)     | `repositoryId`, `organizationId`, `accountId`, `workerName`, `workerTag`, `rootDirectory`, `origin`                                                   |
| `repositoryConvexProjects` (`model.ts:252-256`)        | `repositoryId`, `organizationId`, `teamId`, `projectId`, `convexConfigPath` or `convexDirectoryPath`, `origin`; no deployment name, region, URL, slug |
| `repositories` (`model.ts:142-235`)                    | `convexTeamId`, `cloudflareAccountId`, `defaultBranch`, `githubRepositoryDatabaseId`                                                                  |
| `organizations` (`convex/organization/model.ts:61-73`) | `convexTeam{teamId, teamSlug?}`, `cloudflareAccount{accountId, accountName}`                                                                          |

Everything else is read live: the Worker read and the builds read poll every 60 seconds, the Convex
reads have a 60 second stale time, and the pull-request read polls while a build runs
(`useRepositoryProviderObservations.ts:119-154`, `useRepositoryPullRequests.ts:258-259`).

## 2. What standard Alchemy writes

Declared, from `alchemy@2.0.0-beta.83`.

| Fact                                                                                                                                                                                                                                                                                       | Reference                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| A resource row has `kind?`, `resourceType`, `namespace`, `fqn`, `logicalId`, `instanceId`, `providerVersion`, `status`, `downstream`, `bindings`, `props?`, `attr?`, `removalPolicy?`, `adoptionBlocked?`, `providerMode?`; `updating`, `replacing`, and `replaced` rows add `old`.        | `alchemy/State/ResourceState.ts:30-95, 97-150`           |
| `status` is one of `creating`, `created`, `updating`, `updated`, `deleting`, `replacing`, `replaced`.                                                                                                                                                                                      | `alchemy/State/ResourceState.ts:7-15`                    |
| A stage has one output document, the evaluated return value of the stack, written after a full successful apply and not after a selected one (`--include`, `--exclude`).                                                                                                                   | `alchemy/Apply.ts:283-295`                               |
| A converged destroy deletes every row and the output of the stage, and fails if a row remains.                                                                                                                                                                                             | `alchemy/Apply.ts:258-281`                               |
| A `Redacted` value is stored in clear as `{ "__redacted__": <value> }`; the reviver rebuilds the `Redacted`.                                                                                                                                                                               | `alchemy/State/StateEncoding.ts:10, 78-91`               |
| Every deployed Worker gets the plain-text bindings `ALCHEMY_PHASE`, `ALCHEMY_WORKER_NAME`, `ALCHEMY_STACK_NAME`, `ALCHEMY_STAGE`, `ALCHEMY_CLOUDFLARE_ACCOUNT_ID`; a string in `env` becomes a `plain_text` binding, a `Redacted` a `secret_text` binding, anything else a `json` binding. | `alchemy/Cloudflare/Workers/WorkerProvider.ts:2482-2510` |
| Alchemy reads `GITHUB_ACTIONS`, `GITHUB_SHA`, `GITHUB_REPOSITORY_OWNER`, `GITHUB_REPOSITORY`, and `PULL_REQUEST` into a `GitHubEnv` config for its GitHub provider. Nothing writes it to state.                                                                                            | `alchemy/GitHub/Env.ts:8-45`                             |
| Alchemy detects CI (`GITHUB_ACTIONS`, `GITLAB_CI`, ...) and reads the git branch and remote for telemetry only.                                                                                                                                                                            | `alchemy/Telemetry/Attributes.ts:78-120`                 |
| Alchemy reads `GITHUB_ACTIONS` and the Actions OIDC endpoint for OIDC auth.                                                                                                                                                                                                                | `alchemy/Auth/OidcToken.ts:18, 73`                       |
| The hosted Alchemist session knows the stack name and the stage, nothing about the repository or the run.                                                                                                                                                                                  | `alchemy/Alchemist/Session.ts:55, 96-106`                |

A search of `alchemy/` for `GITHUB_SHA`, `GITHUB_REF`, `GITHUB_REPOSITORY`, `GITHUB_RUN_ID`,
`rev-parse`, and `GITHUB_ACTIONS` finds only the four files above plus a doc comment in
`alchemy/Cloudflare/Workers/Worker.ts:2083` (`version: { tag: process.env.GITHUB_SHA }`, a user
choice). So the run record of section 6 is ours until upstream adds one.

### Declared attributes of the three resources

| Resource            | `props` (what the stack asked for)                                                                              | `attr` (what the provider observed)                                                                                                                                                                                                                                                                                                                                                                                                  | Reference                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `Cloudflare.Worker` | `name?`, `main?`, `env?`, `workersDev?`, `domain?`, `routes?`, `compatibility?`, `tags?`, `observability?`, ... | `workerId`, `workerName`, `namespace`, `logpush`, `url`, `urls`, `domain`, `tags`, `durableObjectNamespaces`, `accountId`, `routes[]{id, pattern, zoneId, url?}`, `crons`, `tailConsumers?`, `streamingTailConsumers?`, `versionOf?`, `previewOf?`, `previewId?`, `previewName?`, `previewSlug?`, `versionId?`, `versionAlias?`, `deploymentId?`, `affinityZoneIds?`, `hash?{assets, bundle, input, additionalWorkspaces, metadata}` | `alchemy/Cloudflare/Workers/Worker.ts:510-585, 1134-1275` |
| `Convex.Project`    | `team`, `name`, `deploymentRegion?`, `deploymentType?`; or `team`, `slug`                                       | `projectId`, `slug`, `name`, `teamId`, `prodDeploymentName`, `prodDeploymentUrl`                                                                                                                                                                                                                                                                                                                                                     | `cx/Project.ts:40-67`                                     |
| `Convex.Deployment` | `project{projectId}`, `type`, `name?` (dev and preview), `source?`, `env?`                                      | `projectId`, `type`, `name`, `reference`, `previewName`, `url`, `siteUrl`, `hash`, `envNames`                                                                                                                                                                                                                                                                                                                                        | `cx/Deployment.ts:78-129`                                 |

Ids: Alchemy keeps Convex team and project ids as JavaScript numbers; Samebase keeps them as decimal
strings (`research/2026-10-07-alchemy-as-samebase-source-of-truth.md`, section 1). The reader
converts.

## 3. The team store and its reader

Declared, from `@samebase/alchemy-convex@0.6.1`.

- Tables: `resources (stack, stage, fqn, value)` with the index `by_fqn` and
  `outputs (stack, stage, value)` with the index `by_stage`; `value` is the JSON text of Alchemy's
  `encodeState` (`cx/store/convex/schema.ts`).
- Functions, all internal: `state:version`, `state:stacks`, `state:stages`, `state:list`,
  `state:get`, `state:replaced`, `state:getOutput`, and the mutations `state:set`, `state:remove`,
  `state:removeStack`, `state:setOutput` (`cx/store/convex/state.ts`). `STORE_VERSION` is 1
  (`cx/store/convex/version.ts`). The names are a wire contract: never renamed or removed.
- A run of a stack mints a deploy key of the store's production deployment with
  `deployment:functions:runInternalQueries` and `deployment:functions:runInternalMutations`, and
  deletes it when the run ends (`cx/State.ts:69-76, 325-350`).
- Samebase reads with a key that has `deployment:functions:runInternalQueries` only
  (`apps/samebase/convex/repository/convexDeploymentInspection.ts:43-51`), keys the stack by the
  repository's `owner/name` (`alchemyState.ts:98`), and replaces every `__redacted__` value with
  `null` before the value leaves the action (`alchemyState.ts:52-61`).
- The stack name is a convention, not a rule: the README of the package recommends
  `GITHUB_REPOSITORY`; the Samebase stack is named `Samebase` (`apps/samebase/alchemy.run.ts:29`)
  and the starter names it from `deployNames()` (`templates/base-actions/alchemy.run.ts:34, 117`).
  Both keep their state in the Cloudflare store today, not in the team store.

## 4. Rows of the scratch stack

Pending the deploy approval. The stack is in the research session's scratchpad, outside the
monorepo, with `alchemy@2.0.0-beta.83`, `@samebase/alchemy-convex@0.6.1`, `convex@1.46.0`,
`effect@4.0.5`, and `@effect/platform-node@4.0.5` (the 4.0.4 pair fails at load time next to
`@effect/platform-node-shared@4.0.5`, which the alchemy-convex README warns about). Credentials: the
Convex CLI login of this Mac, no `CONVEX_ACCESS_TOKEN`; the Alchemy profile `default` (Cloudflare,
OAuth) that `alchemy profile list` reports.

```ts
// alchemy.run.ts of the scratch stack
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const NAME = "tmp-k7m2-rows";

export default Alchemy.Stack(
  `samebase/${NAME}`,
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Convex.providers()),
    state: Convex.state({ team: "nicu" }),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    const backend =
      stage === "main"
        ? yield* Convex.Deployment("Backend", {
            project: yield* Convex.Project("Project", { team: "nicu", name: NAME }).pipe(
              RemovalPolicy.destroy(),
            ),
            type: "prod",
            source: "./convex",
          })
        : yield* Convex.Deployment("Backend", {
            project: yield* Convex.Project.ref("Project", { stage: "main" }),
            type: "preview",
            name: stage,
            source: "./convex",
          }).pipe(RemovalPolicy.destroy());
    const worker = yield* Cloudflare.Worker("Worker", {
      name: stage === "main" ? NAME : `${NAME}-${stage}`,
      main: "./worker.ts",
      env: { CONVEX_URL: backend.url },
    });
    return { workerUrl: worker.url, convexUrl: backend.url, convexSiteUrl: backend.siteUrl };
  }),
);
```

`worker.ts` answers every request with `env.CONVEX_URL`; `convex/hello.ts` exports one
`queryGeneric`. `alchemy plan --stage main --no-input` reported `3 to create, 1 binding changes`:
`Backend`, `Project`, `Worker`, and `Worker/CONVEX_URL`.

Planned measurement, once approved:

1. `alchemy deploy --stage main --no-input --yes`, then
   `alchemy deploy --stage pr-1 --no-input --yes`.
2. Read every row of `samebase/tmp-k7m2-rows` through `state:stages`, `state:list`, `state:get`, and
   `state:getOutput` with a key limited to `deployment:functions:runInternalQueries` on the store's
   production deployment (project 3259168 of team `nicu`), delete the key, and confirm with
   `GET /deployments/{name}/list_deploy_keys` that it is gone.
3. Record each row verbatim with every `__redacted__` value replaced by `<redacted>`: the
   `Cloudflare.Worker`, `Convex.Project`, and `Convex.Deployment` rows of `main`, the
   `Cloudflare.Worker` and `Convex.Deployment` rows of `pr-1`, and both outputs.

### Measured rows

Pending.

## 5. Field coverage

Declared, to be confirmed against the measured rows. "Store field" names the row and the key; `attr`
is the observed value and `props` the requested one.

### Cloudflare Worker

| UI field                                                 | Today                                               | Store field                                                                                         | Verdict                                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Worker name                                              | database `workerName`                               | `Cloudflare.Worker` `attr.workerName`                                                               | covered                                                                                                                 |
| Worker tag (join key of every live read)                 | database `workerTag`                                | `attr.workerId`                                                                                     | covered                                                                                                                 |
| Account                                                  | database `accountId`                                | `attr.accountId`                                                                                    | covered                                                                                                                 |
| Production URL, hostname label                           | live Worker read                                    | `attr.url` (first custom domain, else workers.dev), `attr.urls`, `attr.domain`, `attr.routes[].url` | covered                                                                                                                 |
| Other domains menu                                       | live Worker read                                    | `attr.urls`, `attr.domain.aliases`, `attr.routes`                                                   | covered                                                                                                                 |
| Root directory heading                                   | database `rootDirectory` (a Workers Builds setting) | none; `props.main` is the entry file relative to the stack's directory                              | missing; the stack file path of the run record gives the directory                                                      |
| Build badge and logs link                                | live Workers Builds build, or the GitHub check run  | none; an Alchemy-deployed Worker has no Workers Builds build                                        | missing by design; the GitHub Actions run that deployed the stage is the equivalent (run record `runUrl`, GitHub check) |
| Workers Builds connection, token, deploy keys (Settings) | live Builds settings                                | not applicable                                                                                      | drop for Alchemy-deployed Workers                                                                                       |
| Pull-request preview URL                                 | GitHub check run alias, else Cloudflare previews    | the `Cloudflare.Worker` row of stage `pr-N`, `attr.url`                                             | covered once the stage is linked to the pull request (run record `pullRequest`)                                         |
| Convex link of the Worker                                | live build variable `SAMEBASE_CONVEX_PROJECT`       | `props.env.CONVEX_URL` (intent) and the binding `Worker/CONVEX_URL` in `bindings`                   | covered as intent; `attr` has no copy of the bindings                                                                   |

### Convex project and deployment

| UI field                                  | Today                                                 | Store field                                                                                | Verdict                                                                  |
| ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Team id                                   | database `teamId`                                     | `Convex.Project` `attr.teamId`                                                             | covered (number to decimal string)                                       |
| Project id                                | database `projectId`                                  | `attr.projectId`, also `Convex.Deployment` `attr.projectId`                                | covered                                                                  |
| Project slug (Settings, dashboard link)   | live `GET /projects/{id}`                             | `Convex.Project` `attr.slug`                                                               | covered                                                                  |
| Team slug (dashboard link)                | live `GET /projects/{id}`                             | none; `attr` has `teamId` only                                                             | missing; `organizations.convexTeam.teamSlug` or the live read keeps it   |
| Production deployment name                | live `GET /projects/{id}/deployment?defaultProd=true` | `Convex.Deployment` `attr.name`; `Convex.Project` `attr.prodDeploymentName`                | covered                                                                  |
| Client URL, HTTP actions URL (Data route) | live                                                  | `attr.url`, `attr.siteUrl`; `Convex.Project` `attr.prodDeploymentUrl`                      | covered                                                                  |
| Deployment type                           | not shown                                             | `attr.type`, `attr.reference`                                                              | covered                                                                  |
| Region                                    | live `deployment.region`                              | none                                                                                       | missing, as expected; live read stays                                    |
| Code location (root heading, Data route)  | database `convexConfigPath` or `convexDirectoryPath`  | `props.source` (`./convex`, relative to the stack's directory)                             | partial; repository-relative needs the stack file path of the run record |
| Pull-request preview deployment           | live `list_deployments`, `previewIdentifier` = branch | the `Convex.Deployment` row of stage `pr-N`: `attr.name`, `attr.previewName`, `attr.url`   | covered once the stage is linked to the pull request                     |
| Last push                                 | not shown                                             | `attr.hash` (content identity of the last push); no time                                   | missing; the run record `recordedAt` is the deploy time                  |
| Deploy keys (Settings)                    | live Builds variables                                 | not in this stack; a `Convex.DeployKey` row of the starter holds the key as `__redacted__` | the reader must keep dropping `__redacted__` values                      |

## 6. The run record

Standard Alchemy records none of this (section 2), so the schema is ours until upstream adds one.
The state location is interchangeable, so the record must not depend on the Convex store.

### Schema, version 1

```ts
type RunRecord = {
  version: 1;
  /** GitHub `owner/name`. */
  repository: string;
  /** Path of the stack file from the repository root, POSIX separators, such as `apps/samebase/alchemy.run.ts`. */
  stackFile: string;
  /** The branch that was deployed: the head branch of a pull request, else the pushed branch. */
  branch: string;
  /** The pull request whose head was deployed, or null for a push and for a laptop. */
  pullRequest: number | null;
  /** The commit that was deployed, 40 hex characters. */
  headCommit: string;
  /** The GitHub Actions run and attempt, or null for a laptop. */
  runUrl: string | null;
  source: "github-actions" | "laptop";
  /** ISO 8601, when the record was written. */
  recordedAt: string;
};
```

`version`, `source`, and `recordedAt` are additions to the asked list: `version` for the reader's
validator, `source` to tell a laptop deploy from CI (the fields that are null say it too, but a
discriminant first is the house rule), `recordedAt` because the store keeps no write time (a row's
`_creationTime` survives `patch`, so it is the first write, not the last). No field holds a secret.

### Derivation

| Field         | GitHub Actions                                                                                                      | Laptop                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `repository`  | `GITHUB_REPOSITORY`                                                                                                 | `git remote get-url origin`, parsed to `owner/name`            |
| `stackFile`   | `path.relative(GITHUB_WORKSPACE, process.cwd())` joined with the stack file name                                    | `git rev-parse --show-toplevel` in place of `GITHUB_WORKSPACE` |
| `branch`      | `GITHUB_HEAD_REF` when set (pull request events), else `GITHUB_REF_NAME`                                            | `git rev-parse --abbrev-ref HEAD`                              |
| `pullRequest` | `pull_request.number` of the event payload at `GITHUB_EVENT_PATH`; null when the payload has none                   | null                                                           |
| `headCommit`  | `pull_request.head.sha` of the payload (`GITHUB_SHA` is the merge commit on pull request events), else `GITHUB_SHA` | `git rev-parse HEAD`                                           |
| `runUrl`      | `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT}`            | null                                                           |
| `source`      | `github-actions` when `GITHUB_ACTIONS` is `true`                                                                    | `laptop`                                                       |

The stack file name: the alchemy CLI resolves `--config` (default `alchemy.run.ts`) against the
working directory and the layer does not see the flag, so the first version takes the name from an
option with that default. A fork pull request runs without secrets, so the stack cannot write state
from one; the record therefore needs no head repository field. A dirty laptop tree is a known gap:
`headCommit` names the last commit, not the working tree.

### Where each store keeps it

| Store                                         | Place                                                                 | Written by                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Every store (Convex, Cloudflare, HTTP, local) | the stage output document, under the reserved key `samebase.run`      | a `State` layer wrapper that adds the key in `setOutput`; it is independent of the store it wraps |
| Convex store, later                           | a `runs (stack, stage, value)` table and `state:runs`, `state:getRun` | the same wrapper, when a listing by repository or pull request is needed; `STORE_VERSION` 2       |

One reader logic covers all: read the output document, validate the reserved key. The table is an
index over the same record, not a second source, and it waits for a proven listing need, because a
field written only to the Convex table would make the record store-dependent again.

Two limits follow from where Alchemy writes the output (`alchemy/Apply.ts:283-295`): a failed deploy
leaves the previous record, and a selected deploy writes none. The failed run is GitHub's fact, and
Samebase already reads it there for the setup output
(`apps/samebase/convex/repository/setupOutputModel.ts:113-140`), so the record describes the last
full successful deploy of the stage, which is what the stage's resources reflect.

Prior art in this repository: the starter's setup output
(`templates/base-actions/scripts/setup-output.ts`) carries the identities of the resources, and
Samebase takes the run provenance (`runId`, `runAttempt`, `head_sha`, `head_branch`, `html_url`)
from the GitHub run of the artifact. The run record moves the provenance next to the state, per
stage, so a preview stage names its pull request without a GitHub lookup.

## 7. Cleanup

Pending the deploy. The plan: `alchemy destroy --stage pr-1 --no-input --yes`, then
`alchemy destroy --stage main --no-input --yes` (the Project has `RemovalPolicy.destroy()`, so the
temporary Convex project goes with it); read `state:stages` for `samebase/tmp-k7m2-rows` and expect
an empty list; list the Workers of the account and the projects of team `nicu` and expect no
`tmp-k7m2-rows`; list the deploy keys of the store's production deployment and expect none named
`rows-research-read`. The real `samebase/base-alchemy` rows are not touched: the scratch stack has
its own name, and every write of a run is keyed by it.

## 8. Recommendation

`@samebase/alchemy-convex` 0.7 should, in this order: wrap `setOutput` of every `State` layer it
offers so the stage output carries the run record of section 6 under `samebase.run`, derived from
the GitHub Actions variables or from git, with no secret and no store-specific field; keep the
store's wire names and `STORE_VERSION` 1, because the record needs no new function; and add a `runs`
table only when a listing by repository or pull request is needed. The Samebase reader should, in
this order: key a repository to its stack by name as it does; read the `attr` of
`Cloudflare.Worker`, `Convex.Project`, and `Convex.Deployment` rows for identity and addresses, with
the number-to-string conversion of the Convex ids and `__redacted__` values dropped; read
`samebase.run` of each stage output to label a stage with its branch and pull request and to place
the code locations under the stack file's directory; and keep the live reads for what the store
cannot know: the build state (the GitHub run of the stage), the Convex region, and the dashboard
team slug.

## Method

- UI inventory: an Explore sub-agent read the overview, settings, and pull-request code paths; the
  references in section 1 were spot-checked by hand.
- Alchemy and alchemy-convex facts: read from the installed `alchemy@2.0.0-beta.83` and the
  `@samebase/alchemy-convex@0.6.1` tarball.
- Scratch stack: `pnpm install` with `allowBuilds` for `esbuild` and `workerd` in
  `pnpm-workspace.yaml` (pnpm 11 refuses to run their scripts otherwise and the alchemy CLI stops on
  that), `alchemy profile list`, `alchemy plan --stage main --no-input`.
