# 125 One Action Catalog for the Dashboard and MCP

## Document Control

- Status: Proposal
- Owner: Nicu Chiciuc
- Created: 2026-10-01
- Last updated: 2026-10-03
- Base: `origin/main` at `a8783524a` (v2080)
- Evidence:
  [research note](https://github.com/samebase/samebase/blob/research-mcp-tool-catalog-design/research/2026-10-01-mcp-tool-catalog-design.md)
  on [PR #1665](https://github.com/samebase/samebase/pull/1665) (cited below as "note")
- Related: `rfcs/089_MCP_CONVEX_FUNCTION_EXPOSURE_SPEC.md`,
  `specs/111_AGENT_BROWSER_HANDOFF_SPEC.md`, `research/2026-09-18-plugin-review-remediation.md`,
  [PR #1616](https://github.com/samebase/samebase/pull/1616),
  [PR #1661](https://github.com/samebase/samebase/pull/1661),
  [PR #1662](https://github.com/samebase/samebase/pull/1662)
- Amends: the tool-name table in the `Final MCP Contract` section of
  `rfcs/123_REPOSITORY_TERMINOLOGY_AND_DATA_MIGRATION_ROLLOUT.md`. This RFC keeps its rule that a
  tool name is the Convex function path, and moves functions so that the paths read well.

## Summary

1. The dashboard and MCP share one contract and one handler per action. This RFC replaces today's 15
   tools with 16 tools that match what users ask for (catalog R in the note).
2. A new status read gives agents what the repository overview shows, in about 2.9 KB per typical
   app. Discovery returns only rows that a user or agent can act on.
3. A tool name is its public Convex function path with `.` replaced by `_`, for example
   `repository_list` and `repository_cloudflare_findWorkers`. A catalog test keeps them equal.
4. Three high-impact writes pass one server-side confirmation check, which the dashboard also uses.
   The caller sends back a token and an explicit acknowledgement sentence, and both go to the audit
   log.
5. Four implementation PRs land before one OpenAI submission. The last PR rewrites the 8 submitted
   test cases against the final names.

## Motivation

OpenAI reviews a submission in about two weeks, and submitted tools must stay as submitted. A later
change to the tool set, a name, an argument, or an annotation needs a new review. So the final
catalog comes first, then one submission.

1. **Plumbing is incomplete.** Five dashboard dialog actions (connect a Worker, detach a Worker,
   create a Convex project, change a code location, detach a Convex project) have contracts but no
   MCP tool. The instructions hand them to the dashboard
   ([http.ts L92](../apps/samebase/convex/mcp/http.ts#L92)). On 2026-10-01, Worker discovery for one
   staff app returned 48 Workers and 0 that the agent could act on.
2. **No live read.** The overview reads live state through 6 per-repository calls; MCP has none. An
   agent cannot answer "Did my last push deploy?" through Samebase.
3. **The model carries too much.** Today the model copies opaque IDs, Worker tags, Git SHAs, and a
   build token UUID between calls, and must remember to rotate deploy keys after a Worker change.
   The server instructions are about 7k characters, most of them procedures the server can do.
4. **Destructive actions do not stop.** In the note's simulation, annotations alone left the model
   acting without asking in 6 of 6 unapproved requests. The dashboard also has no confirmation for
   detach, key rotation, or connecting a Worker (Appendix B).

## Proposal

### Catalog (16 tools)

Hints are `readOnlyHint / openWorldHint / destructiveHint`. "Gated" means the confirmation check
below applies.

| Tool                                  | Does                                                           | Arguments                                                                                                                                           | Output                                                                        | Hints          |
| ------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------- |
| `account_getAuthenticationStatus`     | Shows the connected account                                    | none                                                                                                                                                | account, role, GitHub owners, scopes                                          | yes / no / no  |
| `account_createSignInLink`            | Opens the dashboard                                            | `returnToPath?`                                                                                                                                     | one-time URL, `expiresAt`                                                     | no / no / no   |
| `feedback_submit`                     | Sends approved feedback                                        | `report`                                                                                                                                            | sent                                                                          | no / yes / yes |
| `repository_list`                     | Lists apps in all organizations                                | none                                                                                                                                                | owner/name, `repositoryId`, setup, pending Cloudflare, attachment names       | yes / no / no  |
| `repository_getStatus`                | Shows live app status                                          | `repository`                                                                                                                                        | branch and checks, builds and URLs, deployments, first 6 PRs, attention items | yes / no / no  |
| `repository_create`                   | Creates an app                                                 | `githubOwnerLogin`, `name`, `convexDeploymentRegion?`, `buildTokenUuid?`, `convexProjectName?`, `cloudflareWorkerName?`, `description?`, `private?` | app, setup running, Cloudflare plan or pending notice                         | no / yes / no  |
| `repository_connect`                  | Connects an existing GitHub repository                         | `githubRepositoryFullName`                                                                                                                          | app                                                                           | no / no / no   |
| `repository_cloudflare_findWorkers`   | Finds Workers that can be added                                | `repository`                                                                                                                                        | attachable and connectable rows, counts by reason                             | yes / no / no  |
| `repository_cloudflare_attachWorkers` | Attaches Workers already built from this repository            | `repository`, `workerNames`                                                                                                                         | attached names                                                                | no / no / no   |
| `repository_cloudflare_connectWorker` | Connects an unconnected Worker (gated)                         | `repository`, `workerName`, `rootDirectory?`, `buildTokenUuid?`, `confirmation?`                                                                    | `needs_confirmation`, then connected, deploy key installed                    | no / yes / yes |
| `repository_cloudflare_createWorker`  | Creates a Worker                                               | `repository`, `workerName?`, `rootDirectory?`, `buildTokenUuid?`                                                                                    | created, deploy key installed                                                 | no / yes / no  |
| `repository_convex_findProjects`      | Finds Convex projects that can be added                        | `repository`                                                                                                                                        | code locations, attachable rows, counts by reason                             | yes / no / no  |
| `repository_convex_attachProject`     | Attaches an existing Convex project                            | `repository`, `projectName`, `codeLocation?`                                                                                                        | attached, code location                                                       | no / no / no   |
| `repository_convex_createProject`     | Creates a Convex project                                       | `repository`, `projectName`, `convexDeploymentRegion?`, `codeLocation?`                                                                             | created, code location                                                        | no / yes / no  |
| `repository_repair`                   | Repairs Builds settings and deploy keys, retries setup (gated) | `repository`, `buildTokenUuid?`, `confirmation?`                                                                                                    | `needs_confirmation`, then performed steps, remaining problems                | no / yes / yes |
| `repository_detachResource`           | Removes a Worker or Convex project from the app (gated)        | `repository`, `resourceName`, `confirmation?`                                                                                                       | `needs_confirmation`, then detached kind and name                             | no / no / yes  |

Shared rules:

- `repository` accepts `owner/name` or the `repositoryId` from `repository_list`. Tool titles and
  descriptions say "app"; names and arguments use the code noun `repository` (`rfcs/123`).
- The server picks the build token: the given UUID, else the available last-used token, else the
  only token. Several tokens and no last-used one return an error that lists them. No token creates
  the app with Cloudflare pending and returns the setup guide link. No tool takes `accountId`.
- The server installs the Convex deploy key after it connects or creates a Worker.
- One Convex code location is used without asking. Several return an error that lists them.
- Errors say what to do next, in plain words.
- One app list covers every organization of the account; `githubOwnerLogin` shows the organization
  ([getUserRepositories.ts L288](../apps/samebase/convex/repository/contracts/getUserRepositories.ts#L288)).

`repository_repair` replaces three tools (configure Builds, rotate keys, retry provisioning). The
dashboard's Settings buttons call it with an explicit step. The build token list stays a dashboard
read. Left in the dashboard only: removing an app, changing a code location, accepting a Worker or
GitHub rename, members, organization settings, billing, provider connections, and account settings.

### Status read

`repository_getStatus` returns only facts that the overview page shows. Its MCP output is smaller
than the dashboard result: failed check names instead of the full check list, and no labels, line
counts, node IDs, or head SHAs. Measured on realistic JSON (attention items not included):

| Case                                              | MCP output                | Dashboard result |
| ------------------------------------------------- | ------------------------- | ---------------- |
| 1 Worker, 1 Convex project, 3 checks, 2 open PRs  | 2.9 KB (about 800 tokens) | 5.3 KB           |
| Same app, no open PRs                             | 1.2 KB                    | 1.7 KB           |
| Same app, 6 PRs (the cap)                         | 6.4 KB                    | 12.4 KB          |
| For comparison: today's Worker discovery, 48 rows | 5.8 KB                    | 5.8 KB           |

The overview can replace its 6 per-repository calls with this read and show the same facts. It then
renders in one step, and one refresh reads everything. The overview moves to it after approval.

### Discovery rule

MCP discovery returns rows only for statuses that a tool or the user can act on, plus a count per
other status. For Workers: rows for attachable and connectable; counts for attached, attached
elsewhere, connected elsewhere, and unavailable. The 48-row result drops from 5.8 KB to about 0.15
KB. The dashboard keeps every row, because the Create Worker form uses all names to reject a
conflict
([RepositoryCloudflareDialog.tsx L513](../apps/samebase/src/repository/dashboard/RepositoryCloudflareDialog.tsx#L513)).

### Names and module layout

Rule: the tool name is the path of the registered Convex function that runs the tool, with `/` and
`:` replaced by `_`. For the 13 shared tools that is the public function the dashboard calls. For
the 3 MCP-only tools it is an internal function. A public sign-in link function would let a browser
session mint sign-in links. Authentication status describes the calling MCP token, which a browser
session does not have; the dashboard already lists grants through `mcp.grants.listCurrentUserGrants`
([McpClientsSettingsSection.tsx L16](../apps/samebase/src/account/McpClientsSettingsSection.tsx#L16)).
The dashboard has no feedback form.

- Measurement: four schemes routed the same within noise, with 0 wrong-server choices and 0
  malformed names (path rule 72%, fixed paths 75%, `verb_object` 73%, `samebase_` prefix 70% strict;
  note
  [3.7](https://github.com/samebase/samebase/blob/research-mcp-tool-catalog-design/research/2026-10-01-mcp-tool-catalog-design.md#37-follow-up-naming-schemes-design-r-all-five-servers)).
- Reasons for this scheme: one string for the code location, the dashboard call
  (`api.repository.list`), and the PostHog `mcp_tool_name`. The longest name has 35 characters,
  under VS Code's 64 and Gemini CLI's 63 including their prefixes (note
  [1.4](https://github.com/samebase/samebase/blob/research-mcp-tool-catalog-design/research/2026-10-01-mcp-tool-catalog-design.md#14-other-hosts)).
- `mcp.name` stays an explicit string, as `rfcs/089` asks
  ([L117-L119](../rfcs/089_MCP_CONVEX_FUNCTION_EXPOSURE_SPEC.md#explicit-public-tool-names)).
  `apps/samebase/convex/toolRuntime/actionCatalog.test.ts` gets an exhaustive
  `Record<ActionContractMcpName, FunctionReference>` and fails when `getFunctionName(ref)` with `/`
  and `:` replaced differs from `mcp.name`. Moving a function is then a visible rename, not a silent
  one.

Verified constraints:

- `convex/<name>.ts` and `convex/<name>/<sub>.ts` can both hold registered functions. A probe on
  `origin/main` at `0a8596197` pushed one query in each to the local backend, ran both with
  `npx convex run`, and passed `tsgo --noEmit`. Convex 1.45 merges module types with
  `UnionToIntersection` (`convex/dist/esm-types/server/api.d.ts` L95-L113).
- An export must not have the name of a submodule. None of the new exports matches a file in
  `convex/repository/`.
- A `"use node"` file holds only actions. `repository_list` is a query (the dashboard subscribes to
  it), so `convex/repository.ts` runs in the default runtime. Its Node-backed actions call one
  internal Node action each, which is the runtime crossing that the Convex guidelines allow. Every
  current handler behind them lives in a `"use node"` file (`repository/actions.ts` imports
  `@octokit/rest` at L7).

| Tool                                  | Function path                         | File                              | Kind and runtime                           | Dashboard references that change                                                                                                                                                                                                          |
| ------------------------------------- | ------------------------------------- | --------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_getAuthenticationStatus`     | `account:getAuthenticationStatus`     | `convex/account.ts` (new)         | internal query, default                    | none (computed today in [http.ts L143](../apps/samebase/convex/mcp/http.ts#L143))                                                                                                                                                         |
| `account_createSignInLink`            | `account:createSignInLink`            | `convex/account.ts`               | internal action, default                   | none (today [runtime.ts L483](../apps/samebase/convex/toolRuntime/runtime.ts#L483))                                                                                                                                                       |
| `feedback_submit`                     | `feedback:submit`                     | `convex/feedback.ts` (new)        | internal action, default                   | none (today [runtime.ts L427](../apps/samebase/convex/toolRuntime/runtime.ts#L427))                                                                                                                                                       |
| `repository_list`                     | `repository:list`                     | `convex/repository.ts` (new)      | query, default                             | 8: AppRightSidebar L428, RepositoryConvexSchemaGraphView L102, RepositoryDatabaseView L61, repositoryEnvironmentRoots L18, repositorySettingsState L21, repositorySourceSetup L4, useRepositoryWorkspaceModel L31, ConnectRepository L110 |
| `repository_getStatus`                | `repository:getStatus`                | `convex/repository.ts`            | action, default, calls a Node read         | none until the overview adopts it                                                                                                                                                                                                         |
| `repository_create`                   | `repository:create`                   | `convex/repository.ts`            | action, default, calls Node                | NewAppPage L473                                                                                                                                                                                                                           |
| `repository_connect`                  | `repository:connect`                  | `convex/repository.ts`            | action, default, calls Node                | ConnectRepository L115                                                                                                                                                                                                                    |
| `repository_repair`                   | `repository:repair`                   | `convex/repository.ts`            | action, default, calls Node                | RepositorySelectedWorkspace L46 and L55, RepositoryCloudflareDialog L437                                                                                                                                                                  |
| `repository_detachResource`           | `repository:detachResource`           | `convex/repository.ts`            | mutation, default (no provider call today) | RepositorySelectedWorkspace L48 and L49                                                                                                                                                                                                   |
| `repository_cloudflare_findWorkers`   | `repository/cloudflare:findWorkers`   | `convex/repository/cloudflare.ts` | action, Node                               | RepositoryCloudflareDialog L50, L52, L432                                                                                                                                                                                                 |
| `repository_cloudflare_attachWorkers` | `repository/cloudflare:attachWorkers` | same                              | action, Node                               | path unchanged; arguments change at L433                                                                                                                                                                                                  |
| `repository_cloudflare_connectWorker` | `repository/cloudflare:connectWorker` | same                              | action, Node                               | path unchanged; arguments change at L434                                                                                                                                                                                                  |
| `repository_cloudflare_createWorker`  | `repository/cloudflare:createWorker`  | same                              | action, Node                               | path unchanged; arguments change at L435                                                                                                                                                                                                  |
| `repository_convex_findProjects`      | `repository/convex:findProjects`      | `convex/repository/convex.ts`     | action, Node                               | RepositoryConvexDialog L47, L49, L51, L436                                                                                                                                                                                                |
| `repository_convex_attachProject`     | `repository/convex:attachProject`     | same                              | action, Node                               | RepositoryConvexDialog L437                                                                                                                                                                                                               |
| `repository_convex_createProject`     | `repository/convex:createProject`     | same                              | action, Node                               | path unchanged; arguments change at L439                                                                                                                                                                                                  |

All references are under `apps/samebase/src/`. The internal inventory read moves with
`repository:list` ([runtime.ts L192](../apps/samebase/convex/toolRuntime/runtime.ts#L192)), and
`_generated/api.d.ts` regenerates. The modules `account.ts` and `feedback.ts` need no Node: their
handlers import only default-runtime modules (`mcp/tokens.ts`, `email.ts`,
`shared/agentBrowserHandoff.ts`).

### Confirmation gate

One server-side check serves the dashboard and MCP for three gated actions:
`repository_cloudflare_connectWorker` (replaces the Worker's live deployment), `repository_repair`
(can overwrite Builds settings and revoke and rotate deploy keys), and `repository_detachResource`.
All three keep `destructiveHint: true`.

1. A call without `confirmation` performs nothing. It returns `needs_confirmation` with the
   server-owned effect text in plain words, the exact acknowledgement sentence that names the
   resource and the effect (for example "I confirm that the user approved replacing the live
   deployment of Worker legacy-landing"), a token, and its expiry.
2. The server stores only the token hash, bound to the user, the action, and the resource identity,
   for 10 minutes and one use. This follows `mcpBrowserLoginTokens`
   ([mcp/model.ts L138](../apps/samebase/convex/mcp/model.ts#L138)).
3. The second call sends `confirmation: { token, acknowledgement }`. The server checks the token,
   re-reads the resource identity, requires the exact sentence, performs the action, and writes one
   audit row.
4. Audit: the existing audit table is `audit_mcpAccess_events` (`grantId?`, `clientId?`, `userId?`,
   `action`, `createdAt`, `detailsJson?`;
   [mcp/model.ts L157](../apps/samebase/convex/mcp/model.ts#L157)), written by `writeAudit`
   ([agentBrowserHandoff.ts L82](../apps/samebase/convex/agentBrowserHandoff.ts#L82)) and by
   `mcp/grants.ts` and `mcp/oauth.ts`. It records MCP OAuth actions only. Add a sibling
   `audit_confirmedActions_events` with `userId`, `organizationId`, `repositoryId`, `action`,
   `resource`, `effectText`, `acknowledgement`, `surface` (dashboard or MCP), `grantId?`,
   `clientId?`, `issuedAt`, and `confirmedAt`. As an `audit_` table, nothing reads it to authorize
   (`docs/data-modeling-vocabulary.md`). Both new tables need an account-deletion policy entry.
5. Dashboard: the same action returns the same challenge. The confirm dialog shows the server's
   effect text and the acknowledgement sentence as a checkbox label, like a signup checkbox. The
   dialog then resends with the token. Detach, key rotation, and connecting a Worker gain the
   confirmation step that they lack today (Appendix B).

Limit: this proves that the caller paused and stated the effect. It does not prove that a human
agreed. When the request already held approval, the model wrote the exact phrase itself in 6 of 6
cases. Hosts add their own prompt for destructive tools, and MCP elicitation becomes the human
channel where hosts support it. Because the first call is also destructive-annotated, a host that
prompts on every destructive call prompts twice.

Measured in the note
([3.8](https://github.com/samebase/samebase/blob/research-mcp-tool-catalog-design/research/2026-10-01-mcp-tool-catalog-design.md#38-follow-up-confirmation-for-destructive-actions)):
with annotations only, the model acted without asking in 6 of 6 unapproved requests; with a rule in
the description, 4 of 6; with a server gate, 0 of 6. Approved requests passed in 6 of 6 in every
variant. The two-step gate costs about one extra call per action (2.0 and 2.5 calls per request
against 1.5 and 1.7).

Typed-name confirmation (removing an app with provider deletion, deleting an organization, deleting
an account) stays in the dashboard and, later, in MCP elicitation only. It is never a tool argument,
and those actions stay out of MCP.

The `confirmation` argument and the `needs_confirmation` result must exist before the OpenAI
submission, because an argument change needs a new review.

### Server instructions

They shrink from about 7k to about 1k characters, because the server now picks the token, installs
keys, and diagnoses repairs (note
[5.2](https://github.com/samebase/samebase/blob/research-mcp-tool-catalog-design/research/2026-10-01-mcp-tool-catalog-design.md#52-server-instructions-shrink-to-about-1k-characters)).
They keep the sentence "For a request to open the Samebase dashboard, call
`account_createSignInLink` directly"; one batch without it missed the submitted dashboard case. The
EU price sentence moves to the `convexDeploymentRegion` input description.

## Rename map

| Current tool                                                   | New tool                                                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `samebase_auth_getAuthenticationStatus`                        | `account_getAuthenticationStatus`                                                                                             |
| `create_browser_handoff`                                       | `account_createSignInLink`                                                                                                    |
| `samebase_feedback_submit`                                     | `feedback_submit`                                                                                                             |
| `repository_dashboard_getUserRepositories`                     | `repository_list`                                                                                                             |
| `repository_actions_createRepository`                          | `repository_create`                                                                                                           |
| `repository_actions_connectRepository`                         | `repository_connect`                                                                                                          |
| `cloudflare_listWorkersBuildTokens`                            | removed (the server picks the token)                                                                                          |
| `repository_cloudflare_discoverWorkers`                        | `repository_cloudflare_findWorkers`                                                                                           |
| `repository_cloudflare_attachWorkers`                          | `repository_cloudflare_attachWorkers`                                                                                         |
| `repository_cloudflare_createWorker`                           | `repository_cloudflare_createWorker`                                                                                          |
| `repository_cloudflare_configureWorkersBuildsForGitHub`        | `repository_repair`                                                                                                           |
| `repository_cloudflare_rotateConvexDeployKeysForWorkersBuilds` | `repository_repair`, and automatic after connect or create                                                                    |
| `repository_actions_retryInfrastructureProvisioning`           | `repository_repair`                                                                                                           |
| `repository_convex_discoverProjects`                           | `repository_convex_findProjects`                                                                                              |
| `repository_convex_attachProjects`                             | `repository_convex_attachProject`                                                                                             |
| new                                                            | `repository_getStatus`, `repository_cloudflare_connectWorker`, `repository_convex_createProject`, `repository_detachResource` |

No aliases: old names stop working at deploy. The rename also touches contract `id`s, `title`s, and
descriptions; `mcp/http.ts` (instructions and the tool map); the public skill; generated
`public/docs/actions/*.md` and `llms.txt`; `chatgptAppSubmissionSource.ts` and
`chatgpt-app-submission.json`; tests that assert names; `specs/111` (tool name at L12); saved
PostHog insights that filter `mcp_tool_name`; and both plugin manifests (`0.3.0`).

## Rollout

| PR  | Scope                                                                                                                                                     | Before submission  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | This RFC                                                                                                                                                  | yes                |
| 2   | Catalog and module moves: new paths, catalog test, `repository` argument resolution, token default, deploy-key chain, `repository_repair`, discovery rule | yes                |
| 3   | Status read: contract, `repository:getStatus`, MCP projection, a fixture test that keeps the typical MCP result under 4 KB                                | yes                |
| 4   | Confirmation gate: challenge and audit tables, server check in the 3 gated actions, dashboard confirm dialogs                                             | yes                |
| 5   | Skill, docs, about 1k instructions, submission source with the 8 cases rewritten against the final names, plugin version                                  | yes, last          |
| 6   | Overview page reads `repository:getStatus`                                                                                                                | no, after approval |

After PR 5: deploy to production, publish the plugin, run the 8 cases in ChatGPT web and mobile with
the reviewer account, then submit once. After approval, OpenAI picks up server changes that keep
tool names, arguments, and annotations. A change to those, the skill, or `.mcp.json` needs a new
review.

## Alternatives considered

- **Primitive mirror (one tool per dashboard action, 21 tools).** Task success was the same (28/30
  against 29/30), but the hybrid catalog used 35% fewer input tokens, and the mirror makes the model
  carry IDs, tags, SHAs, and the token choice (note 3.2). Rejected.
- **`samebase_<verb>_<object>` names.** No routing gain (70% strict against 75%, 0 wrong-server
  choices in both), and it splits the vocabulary between code and tool. Rejected.
- **Phrase-only confirmation (an exact sentence as the only check).** It stops the model as well as
  the token does, but the model wrote the phrase itself in 6 of 6 approved requests, and the phrase
  is not single-use or bound to a resource identity. Rejected; the sentence stays, paired with a
  token.

## Open questions for the operator

1. **`repository_repair` review risk.** An OpenAI reviewer may read one repair tool as "operation
   selection" (note
   [6](https://github.com/samebase/samebase/blob/research-mcp-tool-catalog-design/research/2026-10-01-mcp-tool-catalog-design.md#6-strongest-evidence-against-this-recommendation)).
   Fallback: three explicit repair tools whose names the attention items give (19 tools). Submit
   with one repair tool, or with the fallback?
2. **Convex project without a production deployment.** Discovery calls it attachable today
   ([convex.ts L260](../apps/samebase/convex/repository/convex.ts#L260)), but the deploy-key step
   needs one ([cloudflare.ts L918](../apps/samebase/convex/repository/cloudflare.ts#L918)). Make
   attachable require a production deployment, or keep attach allowed and say the requirement in the
   error and in the repair result?

## Appendix A: Capability map

| Dashboard surface                  | Convex function today                                                                                          | Tool                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Repository list                    | `repository.dashboard.getUserRepositories`                                                                     | `repository_list`                     |
| List row checks and PR count       | `repositoryPullRequests.listRepositorySidebarSummaries`                                                        | dashboard only                        |
| Overview production, PRs, previews | 4 `repository.providerObservations.*` reads, 2 pull request reads                                              | `repository_getStatus`                |
| New repository                     | `repository.actions.createRepository`                                                                          | `repository_create`                   |
| Connect repository                 | `repository.actions.connectRepository`                                                                         | `repository_connect`                  |
| Build token list                   | `cloudflareBuildTokens.list`                                                                                   | dashboard only                        |
| Cloudflare dialog                  | `repository.cloudflare.discoverWorkers`, `attachWorkers`, `connectWorker`, `createWorker`                      | the 4 `repository_cloudflare_*` tools |
| Convex dialog                      | `repository.convex.discoverProjects`, `attachProjects`, `createProject`                                        | the 3 `repository_convex_*` tools     |
| Settings repairs                   | `configureWorkersBuildsForGitHub`, `rotateConvexDeployKeysForWorkersBuilds`, `retryInfrastructureProvisioning` | `repository_repair`                   |
| Settings remove                    | `repository.cloudflare.detachWorker`, `repository.convex.detachProject`                                        | `repository_detachResource`           |
| Change code location, rename sync  | `repository.convex.changeProjectCodeLocation`, `updateWorkerName`, `updateWorkerRootDirectory`                 | dashboard only                        |
| Remove from Samebase               | `repository.actions.deleteRepository`, `retryDeleteRepository`                                                 | dashboard only                        |

## Appendix B: Dashboard confirmations today

Verified on `a8783524a`:

| Action                 | Confirmation today                                                                                                                                                                                                                                                        | Server check                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Remove an app          | Modal with opt-in checkboxes, all off by default ([RepositoryDeleteDialog.tsx L91](../apps/samebase/src/repository/dashboard/RepositoryDeleteDialog.tsx#L91), [L234](../apps/samebase/src/repository/dashboard/RepositoryDeleteDialog.tsx#L234))                          | booleans only                                                                                |
| Detach                 | Menu item, no modal ([RepositorySelectedWorkspace.tsx L223](../apps/samebase/src/repository/dashboard/RepositorySelectedWorkspace.tsx#L223))                                                                                                                              | none                                                                                         |
| Rotate deploy keys     | One-click button ([repositorySettingsState.ts L283](../apps/samebase/src/repository/dashboard/repositorySettingsState.ts#L283))                                                                                                                                           | none                                                                                         |
| Connect another Worker | "Connect and add", no warning about the replaced deployment ([RepositoryCloudflareDialog.tsx L405](../apps/samebase/src/repository/dashboard/RepositoryCloudflareDialog.tsx#L405), [L559](../apps/samebase/src/repository/dashboard/RepositoryCloudflareDialog.tsx#L559)) | none                                                                                         |
| Delete account         | Typed "delete my account" ([accountDeletionPhrase.ts L1](../apps/samebase/shared/accountDeletionPhrase.ts#L1))                                                                                                                                                            | yes ([accountDeletion/index.ts L248](../apps/samebase/convex/accountDeletion/index.ts#L248)) |
| Delete organization    | Typed organization login                                                                                                                                                                                                                                                  | yes ([organizations.ts L369](../apps/samebase/convex/organizations.ts#L369))                 |
