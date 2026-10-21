# Alchemy state rows for Workers and Convex: what the team store holds and what Samebase needs

Date: October 21, 2026. Status: research. It informs the next release of `@samebase/alchemy-convex`
and the reader behind `/repo/<owner>/<repo>/alchemy`. It does not define product behavior.

- Base: `origin/main` at `f143d03c0` (v2142). The reader is
  `apps/samebase/convex/repository/alchemyState.ts` and the view is
  `apps/samebase/src/components/RepositoryAlchemyStateView.tsx`, both from
  [#1759](https://github.com/samebase/samebase/pull/1759).
- Packages: `@samebase/alchemy-convex@0.6.1` from the npm tarball, and `alchemy@2.0.0-beta.83`, the
  exact peer that 0.6.1 declares. Paths with the prefix `cx/` are `src/` of the 0.6.1 package; paths
  with the prefix `alchemy/` are `node_modules/alchemy/src/` of the scratch stack.
- Convex Management API facts come from
  `apps/samebase/convex/convexManagementApi/openApi.generated.json` and from the calls of the
  measurement.
- Measured: a scratch stack with one Convex project, its production deployment, a preview
  deployment, and one Worker per stage, deployed to stages `main` and `pr-1` with the state in the
  `alchemy-state` project of team `nicu`, read back row by row, and destroyed (sections 4 and 7).
  Every table says whether a fact is read from source (declared) or from a row (measured).

## Summary

1. Verdict: the team store answers every identity field that the two attachment rows hold today
   (Worker id, name, account; Convex team id, project id, project slug) and every address field that
   Samebase reads live for the overview URLs (Worker URL list and routes; Convex deployment name,
   client URL, HTTP actions URL, type, reference, preview name). It does not answer the build badge,
   the Convex region, the Convex team slug of the dashboard link, the Workers Builds root directory,
   or which pull request a stage belongs to. Section 5 has the field table.
2. Standard Alchemy writes nothing about git, branch, pull request, or CI run into state. A measured
   row holds `status`, `fqn`, `logicalId`, `instanceId`, `resourceType`, `props`, `attr`,
   `bindings`, `providerVersion`, `downstream`, `removalPolicy`, and on the Worker `providerMode`;
   no time, no author, no commit (section 4). A stage has one output document, written only after a
   full successful apply (`alchemy/Apply.ts:283-295`). Alchemy reads `GITHUB_*` for its GitHub
   provider, for OIDC auth, and for telemetry, and none of it reaches state (section 2).
3. `attr` is the truth for display: what the provider observed after the write. `props` is what the
   stack asked for, with inputs from other resources already resolved: the deployment's
   `props.project` carries the whole project attributes. The Worker-to-Convex edge lives in
   `bindings`, not in `attr`.
4. Two measured facts help the reader beyond the store. Every Alchemy-deployed Worker carries the
   tags `alchemy:stack:<stack>`, `alchemy:stage:<stage>`, `alchemy:id:<logicalId>` in Cloudflare
   (`attr.tags`), and the plain-text bindings `ALCHEMY_STACK_NAME` and `ALCHEMY_STAGE`
   (`alchemy/Cloudflare/Workers/WorkerProvider.ts:2489-2494`). A preview deployment is named after
   the stage (`previewName: "pr-1"`, `reference: "preview/pr-1"`), not after the branch, so the
   branch match of `pullRequestResources.ts:618-643` does not find it.
5. The run record is ours to define until upstream adds one. Section 6 proposes version 1 with
   `repository`, `stackFile`, `branch`, `pullRequest`, `headCommit`, `runUrl`, `source`, and
   `recordedAt`, derived from the GitHub Actions variables in CI and from git on a laptop, and
   stored under one reserved key of the stage output in every store. The Convex store gets a `runs`
   table only when a listing by repository or pull request is needed; the reader logic stays one.
6. Recommendation, in order: (a) `@samebase/alchemy-convex` 0.7 writes the run record under the
   reserved output key for every state store it wraps; (b) the Samebase reader keys a repository to
   its stack by name, reads `attr` of `Cloudflare.Worker`, `Convex.Project`, and `Convex.Deployment`
   rows for identity and addresses, the run record for the branch and pull request of each stage,
   and keeps the live reads for build state, region, and the dashboard team slug. Section 8 has the
   paragraph.

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

Declared, from `alchemy@2.0.0-beta.83`. Section 4 confirms the row shape.

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

Declared, from `@samebase/alchemy-convex@0.6.1`, with two measured facts at the end.

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
- Measured: `POST /deployments/{name}/create_deploy_key` with an `expiresAt` 15 minutes ahead
  answers HTTP 400 `InvalidExpiresAt`, "Expiration time must be at least 30 minutes in the future".
  That is why `CONVEX_INSPECTION_KEY_TTL_MS` is 31 minutes (`convexDeploymentInspection.ts:42`). The
  read key of this measurement lived 31 minutes and was deleted after each read;
  `GET /deployments/{name}/list_deploy_keys` answered 0 keys afterwards.
- Measured: the store of team `nicu` (id 38516) is the production deployment `artful-alligator-66`
  of project 3259168; it held 2 stacks during the measurement, the real `samebase/base-alchemy` and
  the scratch stack. A read of one stack never touches the other.

## 4. Rows of the scratch stack

Measured. The stack ran from the research session's scratchpad, outside the monorepo, with
`alchemy@2.0.0-beta.83`, `@samebase/alchemy-convex@0.6.1`, `convex@1.46.0`, `effect@4.0.5`, and
`@effect/platform-node@4.0.5` (the 4.0.4 pair fails at load time next to
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
`queryGeneric`.

| Step                                           | Result                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alchemy plan --stage main --no-input`         | 3 to create, 1 binding change: `Backend`, `Project`, `Worker`, `Worker/CONVEX_URL`                                                                                        |
| `alchemy deploy --stage main --no-input --yes` | 3 succeeded in 53.5 s: `Project` 1.5 s, `Backend` (the `convex deploy` push) 39.7 s, `Worker` 11.3 s; `GET https://tmp-k7m2-rows.pfp.workers.dev` answered the Convex URL |
| `alchemy deploy --stage pr-1 --no-input --yes` | 2 succeeded in 45.8 s: `Backend` (preview deployment `successful-antelope-998`) 34.6 s, `Worker` 10.2 s                                                                   |
| Row read                                       | `state:stacks` 2 (this stack present), `state:stages` `["main","pr-1"]`, `state:list` 3 fqns for `main` and 2 for `pr-1`, one output per stage                            |

The rows, verbatim as `state:get` returned them, with one change: a `{ "__redacted__": ... }` value
would read `<redacted>`, and none occurred, because this stack holds no secret. The Cloudflare
account id and the Convex ids are identifiers, not secrets.

### Stage `main`, `Convex.Project` (fqn `Project`)

```json
{
  "status": "created",
  "fqn": "Project",
  "logicalId": "Project",
  "instanceId": "ddfa25489c4ba820b7fb0eebf42a34cf",
  "resourceType": "Convex.Project",
  "props": { "team": "nicu", "name": "tmp-k7m2-rows" },
  "attr": {
    "projectId": 3261805,
    "slug": "tmp-k7m2-rows",
    "name": "tmp-k7m2-rows",
    "teamId": 38516,
    "prodDeploymentName": "modest-guanaco-252",
    "prodDeploymentUrl": "https://modest-guanaco-252.convex.cloud"
  },
  "bindings": [],
  "providerVersion": 0,
  "downstream": ["Backend"],
  "removalPolicy": "destroy"
}
```

### Stage `main`, `Convex.Deployment` (fqn `Backend`)

```json
{
  "status": "created",
  "fqn": "Backend",
  "logicalId": "Backend",
  "instanceId": "20a80092680c7baaca879819338b9834",
  "resourceType": "Convex.Deployment",
  "props": {
    "project": {
      "projectId": 3261805,
      "slug": "tmp-k7m2-rows",
      "name": "tmp-k7m2-rows",
      "teamId": 38516,
      "prodDeploymentName": "modest-guanaco-252",
      "prodDeploymentUrl": "https://modest-guanaco-252.convex.cloud"
    },
    "type": "prod",
    "source": "./convex"
  },
  "attr": {
    "projectId": 3261805,
    "type": "prod",
    "name": "modest-guanaco-252",
    "reference": "production",
    "url": "https://modest-guanaco-252.convex.cloud",
    "siteUrl": "https://modest-guanaco-252.convex.site",
    "hash": "7146ce545bfdfc14dc89ecbc0a1ca449784bb517d42047e142d141643d59b8e3",
    "envNames": []
  },
  "bindings": [],
  "providerVersion": 0,
  "downstream": ["Worker"],
  "removalPolicy": "retain"
}
```

### Stage `main`, `Cloudflare.Worker` (fqn `Worker`)

```json
{
  "status": "created",
  "fqn": "Worker",
  "logicalId": "Worker",
  "instanceId": "4fb5acd8a74d8a46633a8e57084e0bc1",
  "resourceType": "Cloudflare.Worker",
  "props": {
    "name": "tmp-k7m2-rows",
    "main": "./worker.ts",
    "env": { "CONVEX_URL": "https://modest-guanaco-252.convex.cloud" },
    "isExternal": true
  },
  "attr": {
    "workerId": "6d2434039c4343a9a02300ba85841b70",
    "workerName": "tmp-k7m2-rows",
    "logpush": false,
    "url": "https://tmp-k7m2-rows.pfp.workers.dev",
    "urls": ["https://tmp-k7m2-rows.pfp.workers.dev"],
    "tags": ["alchemy:stack:samebase/tmp-k7m2-rows", "alchemy:stage:main", "alchemy:id:Worker"],
    "durableObjectNamespaces": {},
    "accountId": "fe57d01d7ab41f60d00ba1aade20eb33",
    "routes": [],
    "crons": [],
    "tailConsumers": [],
    "hash": {
      "bundle": "b132832cbda33e15a9cffc4ff168139206ddccf97b0a7c2230801d3710200e85",
      "metadata": "6692e8262512d066c344158cd4e091a1287954eb8b43208b87b336715b99bb65"
    }
  },
  "bindings": [
    {
      "sid": "CONVEX_URL",
      "data": {
        "bindings": [
          {
            "type": "plain_text",
            "name": "CONVEX_URL",
            "text": "https://modest-guanaco-252.convex.cloud"
          }
        ]
      }
    }
  ],
  "providerVersion": 0,
  "downstream": [],
  "removalPolicy": "destroy",
  "providerMode": "live"
}
```

### Stage `main`, output

```json
{
  "workerUrl": "https://tmp-k7m2-rows.pfp.workers.dev",
  "convexUrl": "https://modest-guanaco-252.convex.cloud",
  "convexSiteUrl": "https://modest-guanaco-252.convex.site"
}
```

### Stage `pr-1`, `Convex.Deployment` (fqn `Backend`)

```json
{
  "status": "created",
  "fqn": "Backend",
  "logicalId": "Backend",
  "instanceId": "daa271cf740eccc11aa4dea365fc6cae",
  "resourceType": "Convex.Deployment",
  "props": {
    "project": {
      "projectId": 3261805,
      "slug": "tmp-k7m2-rows",
      "name": "tmp-k7m2-rows",
      "teamId": 38516,
      "prodDeploymentName": "modest-guanaco-252",
      "prodDeploymentUrl": "https://modest-guanaco-252.convex.cloud"
    },
    "type": "preview",
    "name": "pr-1",
    "source": "./convex"
  },
  "attr": {
    "projectId": 3261805,
    "type": "preview",
    "name": "successful-antelope-998",
    "reference": "preview/pr-1",
    "previewName": "pr-1",
    "url": "https://successful-antelope-998.convex.cloud",
    "siteUrl": "https://successful-antelope-998.convex.site",
    "hash": "9d3821e3691b8ab5537d5d234026087472e62824efb504e4601b88ba310ababf",
    "envNames": []
  },
  "bindings": [],
  "providerVersion": 0,
  "downstream": ["Worker"],
  "removalPolicy": "destroy"
}
```

### Stage `pr-1`, `Cloudflare.Worker` (fqn `Worker`)

```json
{
  "status": "created",
  "fqn": "Worker",
  "logicalId": "Worker",
  "instanceId": "f8f175ad234a80698b0c386778ba969e",
  "resourceType": "Cloudflare.Worker",
  "props": {
    "name": "tmp-k7m2-rows-pr-1",
    "main": "./worker.ts",
    "env": { "CONVEX_URL": "https://successful-antelope-998.convex.cloud" },
    "isExternal": true
  },
  "attr": {
    "workerId": "09a91e0005944e2d9d2e6a618267ea5f",
    "workerName": "tmp-k7m2-rows-pr-1",
    "logpush": false,
    "url": "https://tmp-k7m2-rows-pr-1.pfp.workers.dev",
    "urls": ["https://tmp-k7m2-rows-pr-1.pfp.workers.dev"],
    "tags": ["alchemy:stack:samebase/tmp-k7m2-rows", "alchemy:stage:pr-1", "alchemy:id:Worker"],
    "durableObjectNamespaces": {},
    "accountId": "fe57d01d7ab41f60d00ba1aade20eb33",
    "routes": [],
    "crons": [],
    "tailConsumers": [],
    "hash": {
      "bundle": "b132832cbda33e15a9cffc4ff168139206ddccf97b0a7c2230801d3710200e85",
      "metadata": "605f909c031269bf3183396d536a335027e51501aff246b1738a2204cc6aaa93"
    }
  },
  "bindings": [
    {
      "sid": "CONVEX_URL",
      "data": {
        "bindings": [
          {
            "type": "plain_text",
            "name": "CONVEX_URL",
            "text": "https://successful-antelope-998.convex.cloud"
          }
        ]
      }
    }
  ],
  "providerVersion": 0,
  "downstream": [],
  "removalPolicy": "destroy",
  "providerMode": "live"
}
```

### Stage `pr-1`, output

```json
{
  "workerUrl": "https://tmp-k7m2-rows-pr-1.pfp.workers.dev",
  "convexUrl": "https://successful-antelope-998.convex.cloud",
  "convexSiteUrl": "https://successful-antelope-998.convex.site"
}
```

### What the rows show beyond the types

| Observation                                                                                                                                                                                    | Where                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| No row holds a time, an author, a commit, a branch, or a run. The only "when" is `hash`, a content identity.                                                                                   | every row                      |
| `kind`, `namespace`, and `adoptionBlocked` are absent; `providerMode: "live"` is present on the Worker only (the Cloudflare provider has a local mode); `providerVersion` is 0 everywhere.     | every row                      |
| `removalPolicy` is in the row: `destroy` where the stack set it, `retain` for the production deployment, which the stack did not set (the resource default).                                   | `Project`, `Backend`, `Worker` |
| `props` holds resolved inputs: `Backend.props.project` is the whole project attribute set, not a reference. A `Convex.Deployment` row alone names the project id, slug, team id, and prod URL. | `Backend` of both stages       |
| The Worker-to-Convex edge is in `bindings[].data.bindings` as the lowered `plain_text` binding with its value, and in `props.env`; `attr` has no bindings.                                     | `Worker` of both stages        |
| Cloudflare carries the tags `alchemy:stack:<stack>`, `alchemy:stage:<stage>`, `alchemy:id:<logicalId>` on the Worker. The stack set no tags.                                                   | `Worker.attr.tags`             |
| `props.isExternal: true` appears on the Worker, which the stack did not pass.                                                                                                                  | `Worker.props`                 |
| `attr.url` and `attr.urls` hold the workers.dev URL; `domain` is absent and `routes` is empty when the stack declares none; `hash` has `bundle` and `metadata` only (no assets, no input).     | `Worker.attr`                  |
| The preview deployment is named after the stage: `previewName: "pr-1"`, `reference: "preview/pr-1"`; Convex lists it with `previewIdentifier` `pr-1`, not with the branch name.                | `pr-1` `Backend.attr`          |
| The output is the stack's return value, nothing more: no stack name, stage, or time.                                                                                                           | both outputs                   |

## 5. Field coverage

Measured against the rows of section 4. "Store field" names the row and the key; `attr` is the
observed value and `props` the requested one.

### Cloudflare Worker

| UI field                                                 | Today                                               | Store field                                                                                                       | Verdict                                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Worker name                                              | database `workerName`                               | `Cloudflare.Worker` `attr.workerName`                                                                             | covered                                                                                                                 |
| Worker tag (join key of every live read)                 | database `workerTag`                                | `attr.workerId`                                                                                                   | covered                                                                                                                 |
| Account                                                  | database `accountId`                                | `attr.accountId`                                                                                                  | covered                                                                                                                 |
| Production URL, hostname label                           | live Worker read                                    | `attr.url` (first custom domain, else workers.dev), `attr.urls`, `attr.domain` when declared, `attr.routes[].url` | covered                                                                                                                 |
| Other domains menu                                       | live Worker read                                    | `attr.urls`, `attr.domain.aliases` when declared, `attr.routes`                                                   | covered                                                                                                                 |
| Root directory heading                                   | database `rootDirectory` (a Workers Builds setting) | none; `props.main` is the entry file relative to the stack's directory                                            | missing; the stack file path of the run record gives the directory                                                      |
| Build badge and logs link                                | live Workers Builds build, or the GitHub check run  | none; an Alchemy-deployed Worker has no Workers Builds build                                                      | missing by design; the GitHub Actions run that deployed the stage is the equivalent (run record `runUrl`, GitHub check) |
| Workers Builds connection, token, deploy keys (Settings) | live Builds settings                                | not applicable                                                                                                    | drop for Alchemy-deployed Workers                                                                                       |
| Pull-request preview URL                                 | GitHub check run alias, else Cloudflare previews    | the `Cloudflare.Worker` row of stage `pr-N`, `attr.url`                                                           | covered once the stage is linked to the pull request (run record `pullRequest`)                                         |
| Convex link of the Worker                                | live build variable `SAMEBASE_CONVEX_PROJECT`       | `props.env.CONVEX_URL` and `bindings[].data.bindings[]` (`plain_text`, with the URL)                              | covered as the deployment URL; the project follows through the `Convex.Deployment` row with that `attr.url`             |
| Stack and stage of a Worker found by an account scan     | not possible today                                  | not in the store: Cloudflare's `tags` and the `ALCHEMY_*` bindings of the Worker                                  | new, live                                                                                                               |

### Convex project and deployment

| UI field                                  | Today                                                 | Store field                                                                                | Verdict                                                                                   |
| ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Team id                                   | database `teamId`                                     | `Convex.Project` `attr.teamId`; also `Convex.Deployment` `props.project.teamId`            | covered (number to decimal string)                                                        |
| Project id                                | database `projectId`                                  | `attr.projectId` on both rows                                                              | covered                                                                                   |
| Project slug (Settings, dashboard link)   | live `GET /projects/{id}`                             | `Convex.Project` `attr.slug`; also `Convex.Deployment` `props.project.slug`                | covered                                                                                   |
| Team slug (dashboard link)                | live `GET /projects/{id}`                             | none; the rows have `teamId` only                                                          | missing; `organizations.convexTeam.teamSlug` or the live read keeps it                    |
| Production deployment name                | live `GET /projects/{id}/deployment?defaultProd=true` | `Convex.Deployment` `attr.name`; `Convex.Project` `attr.prodDeploymentName`                | covered                                                                                   |
| Client URL, HTTP actions URL (Data route) | live                                                  | `attr.url`, `attr.siteUrl`; `Convex.Project` `attr.prodDeploymentUrl`                      | covered                                                                                   |
| Deployment type                           | not shown                                             | `attr.type`, `attr.reference`                                                              | covered                                                                                   |
| Region                                    | live `deployment.region`                              | none                                                                                       | missing, as expected; live read stays                                                     |
| Code location (root heading, Data route)  | database `convexConfigPath` or `convexDirectoryPath`  | `props.source` (`./convex`, relative to the stack's directory)                             | partial; repository-relative needs the stack file path of the run record                  |
| Pull-request preview deployment           | live `list_deployments`, `previewIdentifier` = branch | the `Convex.Deployment` row of stage `pr-N`: `attr.name`, `attr.previewName`, `attr.url`   | covered once the stage is linked to the pull request; the branch match of today misses it |
| Last push                                 | not shown                                             | `attr.hash` (content identity of the last push); no time                                   | missing; the run record `recordedAt` is the deploy time                                   |
| Deploy keys (Settings)                    | live Builds variables                                 | not in this stack; a `Convex.DeployKey` row of the starter holds the key as `__redacted__` | the reader must keep dropping `__redacted__` values                                       |

## 6. The run record

Standard Alchemy records none of this (sections 2 and 4), so the schema is ours until upstream adds
one. The state location is interchangeable, so the record must not depend on the Convex store.

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
discriminant first is the house rule), `recordedAt` because the rows keep no write time (section 4;
a Convex row's `_creationTime` survives `patch`, so it is the first write, not the last). No field
holds a secret.

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
field written only to the Convex table would make the record store-dependent again. The measured
outputs (section 4) are plain objects with the stack's own keys, so a reserved key with a dot in its
name cannot collide with a stack output written in TypeScript.

Two limits follow from where Alchemy writes the output (`alchemy/Apply.ts:283-295`): a failed deploy
leaves the previous record, and a selected deploy writes none. The failed run is GitHub's fact, and
Samebase already reads it there for the setup output
(`apps/samebase/convex/repository/setupOutputModel.ts:113-140`), so the record describes the last
full successful deploy of the stage, which is what the stage's resources reflect.

Prior art in this repository: the starter's setup output
(`templates/base-actions/scripts/setup-output.ts`) carries the identities of the resources, and
Samebase takes the run provenance (`runId`, `runAttempt`, `head_sha`, `head_branch`, `html_url`)
from the GitHub run of the artifact. The run record moves the provenance next to the state, per
stage, so a preview stage names its pull request without a GitHub lookup, which the branch-named
preview lookup of today cannot do for a stage-named preview deployment (section 4).

## 7. Cleanup

Measured.

| Step                                            | Result                                                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alchemy destroy --stage pr-1 --no-input --yes` | 2 succeeded in 4.6 s: `Worker` deleted in 2.9 s, `Backend` (the preview deployment) deleted in 0.7 s                                                                                                                 |
| Store after it                                  | `state:stages` of the stack: `["main"]`; `GET https://tmp-k7m2-rows-pr-1.pfp.workers.dev` answers HTTP 404                                                                                                           |
| `alchemy destroy --stage main --no-input --yes` | 3 succeeded in 6.1 s: `Worker` deleted in 4.1 s; `Backend` orphaned in 0.2 s (its policy is `retain`, so Alchemy dropped the row and kept the deployment); `Project` deleted in 0.6 s, which deletes its deployments |
| Store after it                                  | `state:stacks` 1 (the scratch stack absent), `state:stages` of the stack `[]`                                                                                                                                        |
| Team and account after it                       | `GET /teams/38516/projects`: 0 projects named `tmp-k7m2-rows`; `GET https://tmp-k7m2-rows.pfp.workers.dev` answers HTTP 404                                                                                          |
| Keys after it                                   | `GET /deployments/artful-alligator-66/list_deploy_keys`: 0 keys, none named `rows-research-read`                                                                                                                     |

The real `samebase/base-alchemy` rows were not touched: the scratch stack has its own name, and
every write of a run is keyed by it; the store listed 2 stacks during the measurement and 1 after
the destroy. One observation for a reader that probes URLs: the host
`modest-guanaco-252.convex.cloud` still answered `GET /version` with HTTP 200 one minute after the
project delete, while `POST /api/query` answered HTTP 503 `ServiceUnavailable`; a live URL probe is
not proof that a deployment exists; the Management API is.

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
  that), `alchemy profile list`, then plan, deploy, read, destroy as the tables say.
- Row read: a Node script that reads the Convex CLI login into memory, mints one deploy key of the
  store's production deployment with `deployment:functions:runInternalQueries` only and a 31 minute
  expiry, calls `state:stacks`, `state:stages`, `state:list`, `state:get`, and `state:getOutput`
  through `POST /api/function`, writes the rows, deletes the key with
  `POST /deployments/{name}/delete_deploy_key`, and lists the keys that remain. No key or token was
  printed.
