# 125 One Action Catalog for the Dashboard and MCP

## Document Control

- Status: Proposal
- Owner: Nicu Chiciuc
- Created: 2026-10-01
- Last updated: 2026-10-03
- Base: `origin/main` at `a8783524a` (v2080)
- Evidence: [research note](../research/2026-10-01-mcp-tool-catalog-design.md) on
  [PR #1665](https://github.com/samebase/samebase/pull/1665) (cited below as "note")
- Related: `rfcs/089_MCP_CONVEX_FUNCTION_EXPOSURE_SPEC.md`,
  `specs/111_AGENT_BROWSER_HANDOFF_SPEC.md`,
  `specs/115_REPOSITORY_RESOURCE_ATTACHMENT_MODEL_SPEC.md`,
  `research/2026-09-18-plugin-review-remediation.md`,
  [PR #1616](https://github.com/samebase/samebase/pull/1616),
  [PR #1661](https://github.com/samebase/samebase/pull/1661),
  [PR #1662](https://github.com/samebase/samebase/pull/1662)
- Amends: the tool-name table in the `Final MCP Contract` section of
  `rfcs/123_REPOSITORY_TERMINOLOGY_AND_DATA_MIGRATION_ROLLOUT.md`. This RFC keeps its rule that a
  tool name is the Convex function path, and moves functions so that the paths read well.

## Summary

1. The dashboard and MCP share one contract and one handler per action. This RFC replaces today's 15
   tools with 18 tools that match what users ask for (catalog R in the note, with three explicit
   repair tools).
2. A new status read gives agents what the repository overview shows: each app in the repository
   with its own build and URLs, plus the branch, checks, and pull requests. A typical repository
   needs about 2.9 KB. Discovery returns only rows that a user or agent can act on.
3. A tool name is its public Convex function path with `.` replaced by `_`, for example
   `repository_list` and `repository_cloudflare_findWorkers`. A catalog test keeps them equal.
4. Four high-impact writes pass one server-side confirmation check, which the dashboard also uses.
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
   staff repository returned 48 Workers and 0 that the agent could act on.
2. **No live read.** The overview reads live state through 6 per-repository calls; MCP has none. An
   agent cannot answer "Did my last push deploy?" through Samebase.
3. **The model carries too much.** Today the model copies opaque IDs, Worker tags, Git SHAs, and a
   build token UUID between calls, and must remember to rotate deploy keys after a Worker change.
   The server instructions are about 7k characters, most of them procedures the server can do.
4. **Destructive actions do not stop.** In the note's simulation, annotations alone left the model
   acting without asking in 6 of 6 unapproved requests. The dashboard also has no confirmation for
   detach, key rotation, or connecting a Worker (Appendix B).

## Proposal

### Vocabulary

- **Repository** means the Samebase object, and **GitHub repository** means the provider object, as
  `rfcs/123` defines them
  ([L52-L66](../rfcs/123_REPOSITORY_TERMINOLOGY_AND_DATA_MIGRATION_ROLLOUT.md#domain-language)).
  Repository-level tools use "repository" in their names, titles, descriptions, and arguments.
- **App** means one deployable unit inside a repository: a Cloudflare Worker attachment and its root
  directory. One repository can hold several apps, for example a monorepo with Workers at different
  root directories. "App" is a descriptive word only: Samebase stores no app entity
  ([spec 115 L29-L30](../specs/115_REPOSITORY_RESOURCE_ATTACHMENT_MODEL_SPEC.md#domain-entities)),
  and no tool takes an app argument.
- Removal of the Samebase record is "Remove from Samebase", as `rfcs/123` requires.

### Catalog (18 tools)

Hints are `readOnlyHint / openWorldHint / destructiveHint`. "Gated" means the confirmation check
below applies.

| Tool                                           | Does                                                                                       | Arguments                                                                                                                                           | Output                                                                                         | Hints          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| `account_getAuthenticationStatus`              | Shows the connected account                                                                | none                                                                                                                                                | account, role, GitHub owners, scopes                                                           | yes / no / no  |
| `account_createSignInLink`                     | Opens the dashboard                                                                        | `returnToPath?`                                                                                                                                     | one-time URL, `expiresAt`                                                                      | no / no / no   |
| `feedback_submit`                              | Sends approved feedback                                                                    | `report`                                                                                                                                            | sent                                                                                           | no / yes / yes |
| `repository_list`                              | Lists repositories in all organizations                                                    | none                                                                                                                                                | owner/name, `repositoryId`, setup, pending Cloudflare, Worker names, Convex slugs and names    | yes / no / no  |
| `repository_getStatus`                         | Shows live repository status                                                               | `repository`                                                                                                                                        | apps with builds and URLs, Convex deployments, branch and checks, first 6 PRs, attention items | yes / no / no  |
| `repository_create`                            | Creates a repository with its first app                                                    | `githubOwnerLogin`, `name`, `convexDeploymentRegion?`, `buildTokenUuid?`, `convexProjectName?`, `cloudflareWorkerName?`, `description?`, `private?` | repository, setup running, Cloudflare plan or pending notice                                   | no / yes / no  |
| `repository_connect`                           | Connects an existing GitHub repository                                                     | `githubRepositoryFullName`                                                                                                                          | repository                                                                                     | no / no / no   |
| `repository_retryProviderSetup`                | Retries the managed provider setup of a repository (gated)                                 | `repository`, `confirmation?`                                                                                                                       | `needs_confirmation`, then setup running                                                       | no / yes / yes |
| `repository_detachResource`                    | Removes a Worker or Convex project from the repository (gated)                             | `repository`, `kind`, `resourceName`, `confirmation?`                                                                                               | `needs_confirmation`, then detached kind and name                                              | no / no / yes  |
| `repository_cloudflare_findWorkers`            | Finds Workers that can be added                                                            | `repository`                                                                                                                                        | attachable and connectable rows, counts by reason                                              | yes / no / no  |
| `repository_cloudflare_attachWorkers`          | Attaches Workers already built from this repository                                        | `repository`, `workerNames`                                                                                                                         | attached names                                                                                 | no / no / no   |
| `repository_cloudflare_connectWorker`          | Connects an unconnected Worker (gated)                                                     | `repository`, `workerName`, `rootDirectory?`, `buildTokenUuid?`, `convexProjectSlug?`, `confirmation?`                                              | `needs_confirmation`, then connected, deploy key state                                         | no / yes / yes |
| `repository_cloudflare_createWorker`           | Creates a Worker, which adds an app                                                        | `repository`, `workerName?`, `rootDirectory?`, `buildTokenUuid?`, `convexProjectSlug?`                                                              | created, deploy key state                                                                      | no / yes / no  |
| `repository_cloudflare_configureBuilds`        | Rewrites a Worker's Workers Builds settings for this repository, then starts a build       | `repository`, `workerName`, `rootDirectory?`, `buildTokenUuid?`                                                                                     | configured, build requested                                                                    | no / yes / yes |
| `repository_cloudflare_rotateConvexDeployKeys` | Replaces the Convex deploy keys in a Worker's Builds settings, then starts a build (gated) | `repository`, `workerName`, `convexProjectSlug?`, `confirmation?`                                                                                   | `needs_confirmation`, then rotated, build requested                                            | no / yes / yes |
| `repository_convex_findProjects`               | Finds Convex projects that can be added                                                    | `repository`                                                                                                                                        | code locations, attachable rows with slugs, counts by reason                                   | yes / no / no  |
| `repository_convex_attachProject`              | Attaches an existing Convex project                                                        | `repository`, `convexProjectSlug`, `codeLocation?`                                                                                                  | attached slug, code location                                                                   | no / no / no   |
| `repository_convex_createProject`              | Creates a Convex project                                                                   | `repository`, `projectName`, `convexDeploymentRegion?`, `codeLocation?`                                                                             | created, code location                                                                         | no / yes / no  |

Justifications for the three repair tools (the others are in the note, 5.1):

- `repository_retryProviderSetup`: open world because it creates missing Convex and Cloudflare
  resources; destructive because, when Cloudflare is requested, it reconfigures Builds and revokes
  and rotates recorded deploy keys
  ([retryInfrastructureProvisioning.ts L30](../apps/samebase/convex/repository/contracts/retryInfrastructureProvisioning.ts#L30)).
  Gated, because it rotates keys.
- `repository_cloudflare_configureBuilds`: open world because it writes the user's Cloudflare
  account and starts a production build; destructive because it can overwrite production and preview
  Builds settings. Not gated: it revokes no key, and the note did not measure it. Host prompts still
  apply through `destructiveHint`.
- `repository_cloudflare_rotateConvexDeployKeys`: open world because it creates keys in Convex and
  writes Builds variables; destructive because it revokes the recorded keys first, so a failure can
  leave builds without access. Gated, as the note found necessary for key rotation.

Shared rules:

- `repository` accepts `owner/name` or the `repositoryId` from `repository_list`. One list covers
  every organization of the account; `githubOwnerLogin` shows the organization
  ([getUserRepositories.ts L288](../apps/samebase/convex/repository/contracts/getUserRepositories.ts#L288)).
- `repository_create` creates the GitHub repository, its Samebase repository, and its first app: one
  Worker when a build token exists, and one Convex project.
- The server picks the build token: the given UUID, else the available last-used token, else the
  only token. Several tokens and no last-used one return an error that lists them. No token creates
  the repository with Cloudflare pending and returns the setup guide link. No tool takes
  `accountId`.
- MCP names an existing Convex project by one identifier, its slug, with an exact match only. The
  slug is unique inside a Convex team, and `repository_list`, `repository_convex_findProjects`, and
  `repository_getStatus` return it; `projectName` is for display. A Convex project name is never
  matched, because one project's name can be another project's slug. A slug that matches nothing
  returns an error that lists the attached slugs. One exception: `repository_detachResource` takes
  the recorded code location of a project whose slug cannot be read (a code location contains `.` or
  `/`, so it never equals a slug).
- The server installs the Convex deploy key after it connects or creates a Worker. The project is
  the given `convexProjectSlug`, else the repository's only attached Convex project. Several
  attached projects and no name fail before any provider change, with an error that lists them. With
  no attached project, the Worker is still created or connected; the result says that no key was
  installed and that `repository_cloudflare_rotateConvexDeployKeys` installs it later. A result
  never reports an installed key that the server did not install. When a key is installed, the first
  production build waits for it: the key step starts the build.
- A pending Cloudflare setup (a managed creation without a Workers Builds token) names one planned
  app: a Worker name, a root directory, and the plan's Convex project.
  `repository_cloudflare_createWorker` uses the plan's project without a choice only when it creates
  that exact Worker name at that exact root directory. Any other Worker is another app and follows
  the rule above, so several attached projects without `convexProjectSlug` fail before any provider
  change.
- `repository_cloudflare_rotateConvexDeployKeys` uses the same project rule. The key rotation in
  `repository_retryProviderSetup` uses the managed plan's own Convex project, which the run's
  checkpoint names, so it never chooses among several projects.
- `repository_detachResource` takes `kind` (`cloudflare_worker` or `convex_project`) with the name,
  because a Worker and a Convex project often share the repository's name (the default names are
  both the repository name).
- A Convex project without a production deployment stays attachable, as in the dashboard today
  ([convex.ts L260](../apps/samebase/convex/repository/convex.ts#L260)). Key installation and
  rotation then fail with "Deploy the Convex project to production first", in place of today's "The
  selected Convex project has no production deployment."
  ([cloudflare.ts L918](../apps/samebase/convex/repository/cloudflare.ts#L918)). The status read
  gives the same attention item.
- One Convex code location is used without asking. Several return an error that lists them.
- Errors say what to do next, in plain words.

The dashboard keeps the build token list. Left in the dashboard only: Remove from Samebase, changing
a code location, accepting a Worker or GitHub rename, members, organization settings, billing,
provider connections, and account settings.

### Status read

`repository_getStatus` returns only facts that the overview page shows:

- Per app: the Worker name, its root directory, its production build state and logs URL, and its
  URLs.
- Per Convex project: its code location and its production deployment (name, dashboard URL, region),
  or "missing".
- For the repository: the default branch head commit and its checks, the open pull request count,
  and the first 6 pull requests, each with its checks and the preview build and URL of each app.
- Attention items: each names the problem and the exact tool that fixes it, for example
  `repository_cloudflare_configureBuilds` for a Worker whose Builds settings point elsewhere, or
  "Deploy the Convex project to production first".

The overview already groups each root directory's Worker and Convex deployment
([repositoryEnvironmentRoots.ts L149](../apps/samebase/src/repository/dashboard/repositoryEnvironmentRoots.ts#L149)).
The MCP output is smaller than the dashboard result: check counts and failed check names instead of
the full check list, and no labels, line counts, node IDs, or head SHAs. Measured on realistic JSON
(attention items not included):

| Case                                                     | MCP output                          | Dashboard result |
| -------------------------------------------------------- | ----------------------------------- | ---------------- |
| 1 app, 1 Convex project, 3 checks per commit, 2 open PRs | 2.9 KB (about 800 tokens)           | 5.3 KB           |
| Same repository, no open PRs                             | 1.2 KB                              | 1.7 KB           |
| Same repository, 6 PRs (the cap)                         | 6.4 KB                              | 12.4 KB          |
| Each extra app                                           | +0.35 KB, plus 0.3 KB per listed PR | similar          |
| For comparison: today's Worker discovery, 48 rows        | 5.8 KB                              | 5.8 KB           |

The overview can replace its 6 per-repository calls with this read and show the same facts. It then
renders in one step, and one refresh reads everything. The overview moves to it after approval.

### Discovery rule

MCP discovery returns rows only for statuses that a tool or the user can act on, plus a count per
other status. For Workers: rows for attachable and connectable; counts for attached, attached
elsewhere, connected elsewhere, and unavailable. The 48-row result drops from 5.8 KB to about 0.15
KB. The dashboard keeps every row, because the Create Worker form uses all names to reject a
conflict
([RepositoryCloudflareDialog.tsx L513](../apps/samebase/src/repository/dashboard/RepositoryCloudflareDialog.tsx#L513)).
Convex rows keep `productionDeployment` so that a project with no production deployment is visible
before it is attached.

### Names and module layout

Rule: the tool name is the path of the registered Convex function that runs the tool, with `/` and
`:` replaced by `_`. For the 15 shared tools that is the public function the dashboard calls. For
the 3 MCP-only tools it is an internal function. A public sign-in link function would let a browser
session mint sign-in links. Authentication status describes the calling MCP token, which a browser
session does not have; the dashboard already lists grants through `mcp.grants.listCurrentUserGrants`
([McpClientsSettingsSection.tsx L16](../apps/samebase/src/account/McpClientsSettingsSection.tsx#L16)).
The dashboard has no feedback form.

- Measurement: four schemes routed the same within noise, with 0 wrong-server choices and 0
  malformed names (path rule 72%, fixed paths 75%, `verb_object` 73%, `samebase_` prefix 70% strict;
  note
  [3.7](../research/2026-10-01-mcp-tool-catalog-design.md#37-follow-up-naming-schemes-design-r-all-five-servers)).
- Reasons for this scheme: one string for the code location, the dashboard call
  (`api.repository.list`), and the PostHog `mcp_tool_name`. The longest name,
  `repository_cloudflare_rotateConvexDeployKeys`, has 44 characters. VS Code caps its prefix at 18
  characters and the full name at 64, so it fits (at most 62). Gemini CLI caps `mcp_<server>_<tool>`
  at 63, and a server named `samebase` gives 57 (note
  [1.4](../research/2026-10-01-mcp-tool-catalog-design.md#14-other-hosts)).
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
  it), so `convex/repository.ts` runs in the default runtime. `getStatus`, `create`, and `connect`
  call one internal Node action each, which is the runtime crossing that the Convex guidelines
  allow; their current handlers live in `"use node"` files (`repository/actions.ts` imports
  `@octokit/rest` at L7). `retryProviderSetup` needs no Node: today's handler runs one query and one
  mutation ([actions.ts L876](../apps/samebase/convex/repository/actions.ts#L876)).

| Tool                                           | Function path                                  | File                              | Kind and runtime                           | Dashboard references that change                                                                                                                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------- | --------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_getAuthenticationStatus`              | `account:getAuthenticationStatus`              | `convex/account.ts` (new)         | internal query, default                    | none (computed today in [http.ts L143](../apps/samebase/convex/mcp/http.ts#L143))                                                                                                                                                         |
| `account_createSignInLink`                     | `account:createSignInLink`                     | `convex/account.ts`               | internal action, default                   | none (today [runtime.ts L483](../apps/samebase/convex/toolRuntime/runtime.ts#L483))                                                                                                                                                       |
| `feedback_submit`                              | `feedback:submit`                              | `convex/feedback.ts` (new)        | internal action, default                   | none (today [runtime.ts L427](../apps/samebase/convex/toolRuntime/runtime.ts#L427))                                                                                                                                                       |
| `repository_list`                              | `repository:list`                              | `convex/repository.ts` (new)      | query, default                             | 8: AppRightSidebar L428, RepositoryConvexSchemaGraphView L102, RepositoryDatabaseView L61, repositoryEnvironmentRoots L18, repositorySettingsState L21, repositorySourceSetup L4, useRepositoryWorkspaceModel L31, ConnectRepository L110 |
| `repository_getStatus`                         | `repository:getStatus`                         | `convex/repository.ts`            | action, default, calls a Node read         | none until the overview adopts it                                                                                                                                                                                                         |
| `repository_create`                            | `repository:create`                            | `convex/repository.ts`            | action, default, calls Node                | NewAppPage L473                                                                                                                                                                                                                           |
| `repository_connect`                           | `repository:connect`                           | `convex/repository.ts`            | action, default, calls Node                | ConnectRepository L115                                                                                                                                                                                                                    |
| `repository_retryProviderSetup`                | `repository:retryProviderSetup`                | `convex/repository.ts`            | action, default                            | RepositorySelectedWorkspace L46                                                                                                                                                                                                           |
| `repository_detachResource`                    | `repository:detachResource`                    | `convex/repository.ts`            | mutation, default (no provider call today) | RepositorySelectedWorkspace L48 and L49                                                                                                                                                                                                   |
| `repository_cloudflare_findWorkers`            | `repository/cloudflare:findWorkers`            | `convex/repository/cloudflare.ts` | action, Node                               | RepositoryCloudflareDialog L50, L52, L432                                                                                                                                                                                                 |
| `repository_cloudflare_attachWorkers`          | `repository/cloudflare:attachWorkers`          | same                              | action, Node                               | path unchanged; arguments change at L433                                                                                                                                                                                                  |
| `repository_cloudflare_connectWorker`          | `repository/cloudflare:connectWorker`          | same                              | action, Node                               | path unchanged; arguments change at L434                                                                                                                                                                                                  |
| `repository_cloudflare_createWorker`           | `repository/cloudflare:createWorker`           | same                              | action, Node                               | path unchanged; arguments change at L435                                                                                                                                                                                                  |
| `repository_cloudflare_configureBuilds`        | `repository/cloudflare:configureBuilds`        | same                              | action, Node                               | RepositoryCloudflareDialog L437                                                                                                                                                                                                           |
| `repository_cloudflare_rotateConvexDeployKeys` | `repository/cloudflare:rotateConvexDeployKeys` | same                              | action, Node                               | RepositorySelectedWorkspace L55                                                                                                                                                                                                           |
| `repository_convex_findProjects`               | `repository/convex:findProjects`               | `convex/repository/convex.ts`     | action, Node                               | RepositoryConvexDialog L47, L49, L51, L436                                                                                                                                                                                                |
| `repository_convex_attachProject`              | `repository/convex:attachProject`              | same                              | action, Node                               | RepositoryConvexDialog L437                                                                                                                                                                                                               |
| `repository_convex_createProject`              | `repository/convex:createProject`              | same                              | action, Node                               | path unchanged; arguments change at L439                                                                                                                                                                                                  |

All references are under `apps/samebase/src/`. The internal inventory read moves with
`repository:list` ([runtime.ts L192](../apps/samebase/convex/toolRuntime/runtime.ts#L192)), and
`_generated/api.d.ts` regenerates. The modules `account.ts` and `feedback.ts` need no Node: their
handlers import only default-runtime modules (`mcp/tokens.ts`, `email.ts`,
`shared/agentBrowserHandoff.ts`).

### Confirmation gate

One server-side check serves the dashboard and MCP for four gated actions, all with
`destructiveHint: true`:

- `repository_cloudflare_connectWorker`: replaces the Worker's live deployment.
- `repository_cloudflare_rotateConvexDeployKeys`: revokes and replaces deploy keys.
- `repository_retryProviderSetup`: can revoke and replace deploy keys.
- `repository_detachResource`: removes an attachment.

1. A call without `confirmation` performs nothing. It returns `needs_confirmation` with the
   server-owned effect text in plain words, the exact acknowledgement sentence that names the
   resource, the effect, and every argument that changes the effect (for example "I confirm that the
   user approved replacing the live deployment of Worker legacy-landing with a build of
   samebase/site from root directory apps/site"), a token, and its expiry.
2. The server stores only the token hash, bound to the user, the action, the resource identity (for
   `repository_detachResource`, the `kind` and the attachment), and the whole normalized request:
   every argument except `confirmation`, after the server resolves names and defaults (repository,
   Worker tag, root directory, build token, Convex project). It keeps the request or a digest of it,
   for 10 minutes and one use. This follows `mcpBrowserLoginTokens`
   ([mcp/model.ts L138](../apps/samebase/convex/mcp/model.ts#L138)).
3. The second call sends the identical arguments plus `confirmation: { token, acknowledgement }`.
   The server checks the token, normalizes the request again, and rejects any difference from the
   stored request, for example a token issued for `rootDirectory: "apps/site"` presented with
   `rootDirectory: "apps/admin"`. It then re-reads the resource identity, requires the exact
   sentence, performs the approved request, and writes one audit row.
4. Audit: the existing audit table is `audit_mcpAccess_events` (`grantId?`, `clientId?`, `userId?`,
   `action`, `createdAt`, `detailsJson?`;
   [mcp/model.ts L157](../apps/samebase/convex/mcp/model.ts#L157)), written by `writeAudit`
   ([agentBrowserHandoff.ts L82](../apps/samebase/convex/agentBrowserHandoff.ts#L82)) and by
   `mcp/grants.ts` and `mcp/oauth.ts`. It records MCP OAuth actions only. Add a sibling
   `audit_confirmedActions_events` with `userId`, `organizationId`, `repositoryId`, `action`,
   `resource`, `request`, `effectText`, `acknowledgement`, `surface` (dashboard or MCP), `grantId?`,
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
([3.8](../research/2026-10-01-mcp-tool-catalog-design.md#38-follow-up-confirmation-for-destructive-actions)):
with annotations only, the model acted without asking in 6 of 6 unapproved requests; with a rule in
the description, 4 of 6; with a server gate, 0 of 6. Approved requests passed in 6 of 6 in every
variant. The two-step gate costs about one extra call per action (2.0 and 2.5 calls per request
against 1.5 and 1.7).

Typed-name confirmation (Remove from Samebase with provider deletion, deleting an organization,
deleting an account) stays in the dashboard and, later, in MCP elicitation only. It is never a tool
argument, and those actions stay out of MCP.

The `confirmation` argument and the `needs_confirmation` result must exist before the OpenAI
submission, because an argument change needs a new review.

### Server instructions

They shrink from about 7k to about 1k characters, because the server now picks the token, installs
keys, and names the repair tool in each attention item (note
[5.2](../research/2026-10-01-mcp-tool-catalog-design.md#52-server-instructions-shrink-to-about-1k-characters)).
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
| `repository_actions_retryInfrastructureProvisioning`           | `repository_retryProviderSetup`                                                                                               |
| `cloudflare_listWorkersBuildTokens`                            | removed (the server picks the token)                                                                                          |
| `repository_cloudflare_discoverWorkers`                        | `repository_cloudflare_findWorkers`                                                                                           |
| `repository_cloudflare_attachWorkers`                          | `repository_cloudflare_attachWorkers`                                                                                         |
| `repository_cloudflare_createWorker`                           | `repository_cloudflare_createWorker`                                                                                          |
| `repository_cloudflare_configureWorkersBuildsForGitHub`        | `repository_cloudflare_configureBuilds`                                                                                       |
| `repository_cloudflare_rotateConvexDeployKeysForWorkersBuilds` | `repository_cloudflare_rotateConvexDeployKeys`, and automatic after connect or create                                         |
| `repository_convex_discoverProjects`                           | `repository_convex_findProjects`                                                                                              |
| `repository_convex_attachProjects`                             | `repository_convex_attachProject`                                                                                             |
| new                                                            | `repository_getStatus`, `repository_cloudflare_connectWorker`, `repository_convex_createProject`, `repository_detachResource` |

No aliases: old names stop working at deploy. The rename also touches contract `id`s, `title`s, and
descriptions (titles change from "app" to "repository" where they mean the repository, for example
"Create Samebase app"); `mcp/http.ts` (instructions and the tool map); the public skill; generated
`public/docs/actions/*.md` and `llms.txt`; `chatgptAppSubmissionSource.ts` and
`chatgpt-app-submission.json`; tests that assert names; `specs/111` (tool name at L12); saved
PostHog insights that filter `mcp_tool_name`; and both plugin manifests (`0.3.0`).

## Rollout

| PR  | Scope                                                                                                                                                                 | Before submission  | State                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------- |
| 1   | This RFC                                                                                                                                                              | yes                | in [PR #1664](https://github.com/samebase/samebase/pull/1664) |
| 2   | Catalog and module moves: new paths, catalog test, `repository` argument resolution, token default, deploy-key chain, the three repair tools, discovery rule          | yes                | landed in PR #1664 as step 2                                  |
| 3   | Status read: contract, `repository:getStatus`, attention items that name the repair tool, MCP projection, a fixture test that keeps the typical MCP result under 4 KB | yes                | landed in PR #1664 as step 3                                  |
| 4   | Confirmation gate: challenge and audit tables, server check in the 4 gated actions, dashboard confirm dialogs                                                         | yes                | landed in PR #1664 as step 4                                  |
| 5   | Skill, docs, about 1k instructions, submission source with the 8 cases rewritten against the final names, plugin version                                              | yes, last          | landed in PR #1664 as step 5                                  |
| 6   | Overview page reads `repository:getStatus`                                                                                                                            | no, after approval | not started                                                   |

PR 5 also changes the wording of three submitted prompts that say "app" where they mean the
repository
([chatgptAppSubmissionSource.ts L182, L207, L242](../apps/samebase/scripts/chatgptAppSubmissionSource.ts#L182)):

- "List my Samebase apps and their setup status." becomes "List my Samebase repositories and their
  setup status."
- "Create a private Samebase app under samebase-live-tests ..." becomes "Create a private Samebase
  repository under samebase-live-tests ...".
- "Can I delete a Samebase app and all of its resources through Samebase MCP?" becomes "Can I remove
  a Samebase repository from Samebase and delete all of its resources through Samebase MCP?".

After PR 5: deploy to production, publish the plugin, run the 8 cases in ChatGPT web and mobile with
the reviewer account, then submit once. After approval, OpenAI picks up server changes that keep
tool names, arguments, and annotations. A change to those, the skill, or `.mcp.json` needs a new
review.

### Steps 2 to 5 in PR #1664

Step N is rollout PR N. Steps 2 to 5 land in
[PR #1664](https://github.com/samebase/samebase/pull/1664) with this RFC. Step 2 holds the PR 2
scope and the parts of PR 5 that the renames force, because old tool names stop working at deploy:
the server instructions, the skill, the generated docs, the submission source with the 8 cases and
the three reworded prompts, and plugin `0.3.0`. Step 3 adds the status read, so the catalog has 18
tools. Step 4 adds the confirmation gate, with the one instruction rule and the submission
justifications that it changes. Step 5 rewrites the instructions, the skill, the 18 justifications,
and the 8 cases against the final catalog, so the submission can follow the deploy.

Deviations found during step 2:

1. `repository_detachResource` takes `kind`, and the Worker tools take `convexProjectSlug?`. The
   catalog and the shared rules above include both.
2. Samebase stores Convex project IDs, not slugs. MCP reads the slugs and names live from the
   repository's Convex team for `repository_list`, the `convexProjectSlug` arguments, and
   `repository_detachResource`. `repository_list` returns `projectSlug: null` and
   `projectName: null` when the team cannot be read.
3. `repository:detachResource` is the dashboard's public mutation, as planned. The MCP tool resolves
   the name in the Node runtime, because a Convex name needs a provider read, then runs the internal
   mutation `repository:detachResourceForUser`, which shares the handler.
4. Dashboard arguments: the Cloudflare actions drop `accountId`, because the server uses the
   repository's stored account. The dashboard keeps passing IDs, Worker tags, and the token that it
   shows. `repository/convex:attachProject` keeps the dashboard's `projects` array (one atomic call
   for several projects); the MCP tool attaches one project. The Cloudflare dialog shows a Convex
   project choice only when several projects are attached. Each choice shows the project's slug and
   code location, because several projects can share a code location.
5. `rootDirectory?` of `repository_cloudflare_configureBuilds` must equal the Worker's recorded root
   directory. Changing a recorded root stays in the dashboard.
6. `account_getAuthenticationStatus` returns the GitHub owners as `githubOwnerLogins`.
7. Contract IDs follow the new names (for example `list_repositories`), so the
   `/docs/actions/<id>.md` URLs change.
8. The catalog lists reads first (`repository_list`, then the two find tools), then create and
   connect. `mcp/protocol.ts` derives the OAuth scope string from that order, and this order keeps
   the string identical, so existing grants stay reusable.

Deviations found during step 3:

1. Each Convex project in the MCP result also carries `projectSlug`, so that a person or agent can
   pass it as `convexProjectSlug`. The rotation attention item names the project the same way, or
   `null` when several projects are attached and the keys name none.
2. Facts that a provider read cannot return are `unavailable` and produce no attention item, because
   a guessed repair can be wrong. `repository_getStatus` fails with guidance only for a repository
   without a connected GitHub repository or in removal.
3. The dashboard result is the six existing overview reads (four provider observations, the open
   pull request page, and the pull request resources) plus the attention items, so the overview can
   adopt it in PR 6 without new shapes. The typical MCP result measures 2,256 bytes (1 Worker, 1
   Convex project, 3 checks per commit, 2 open PRs).
4. The production build observation keeps the commit that Cloudflare built
   (`build_trigger_metadata.commit_hash`). The MCP result returns no SHA; each app's production
   build carries `commit`: `matches_head`, `behind_head` (the latest push has no production build
   yet), or `unknown` when the head or the built commit cannot be read. This answers "Did my last
   push deploy?".
5. Checks give `total`, `failed`, `pending`, and `unknown` from GitHub's aggregate counts, which
   cover every check. GitHub lists only the first 100 checks of a commit, so `failedNames` names the
   failed checks among them, and `failedNamesComplete` is false when a counted failure is not named.
   The dashboard summary uses the same aggregate counts.
6. The attention rules read the provider setup state first, because a running managed setup holds
   the provider-write lock and every repair tool fails during it. While setup runs, the only item
   says so and names no tool. When it failed, the only item names `repository_retryProviderSetup`. A
   pending Cloudflare setup gives an item that names `repository_cloudflare_createWorker` with the
   planned Worker name and root directory; that call installs the deploy key.

Deviations found during step 4:

1. The token table is `actionConfirmationTokens`. It stores the token hash, the user, the surface
   that received the token (the dashboard, or one MCP grant and client), the action, the SHA-256
   digest of the normalized request (canonical JSON with sorted keys), the effect, and the
   acknowledgement. A second call is checked against that row, so a renamed repository between the
   two calls does not change the sentence that the user approved, and a token works only on its own
   surface. The digest leaves out the live Convex slug: the project ID binds the target, and the
   slug only words the sentence, so a failed Convex read on the second call does not reject an
   unchanged request.
2. The audit row stores `requestDigest` in place of `request`, `effect` in place of `effectText`,
   and `surface` as one union (`dashboard`, or `mcp` with `grantId` and `clientId`) in place of
   three fields. The acknowledgement names every argument that changes the effect, and the digest
   binds the row to the exact request. `resource` keeps the provider identity (account and Worker
   tag, or team and project ID), so the row stays readable after a detach deletes the attachment.
3. The sentence depends on the surface. The dashboard checkbox reads "I approve ..." because the
   person ticks it; MCP reads "I confirm that the user approved ...". The rest of the sentence is
   the same. Connect and rotation name a Convex project by its slug and its code location (for
   example "the Convex project admin at convex.json"), because several projects can share a code
   location: their actions read the slug before the check, and the request carries it for the
   sentence. Detach names a project by its code location only, because the dashboard detach is one
   mutation that cannot read Convex. MCP detach takes the slug, or the code location that Samebase
   records when the slug cannot be read (the project was deleted in Convex, or the team is
   unreadable), so such a project can still be detached.
4. The audit row is written in the transaction that consumes the token, before the action runs.
   Detach runs the check and the detach in one mutation, and retry runs its admission rules, the
   check, and the run insert in one mutation, so a refused detach or retry leaves the token unused
   and writes no audit row. Connect and rotation run provider work after the token is consumed;
   their check refuses a repository with a running provider operation first, but when the provider
   work fails, the user confirms again. A rejected second call (wrong, used, expired, or another
   user's token, another surface, another action, a changed argument, or another sentence) changes
   nothing and leaves the token as it was.
5. The first call still resolves names and defaults and checks the preconditions that need no
   provider write, so a request that cannot run fails before a challenge: several Convex projects
   without a choice, a running provider operation, the retry admission rules (managed setup failed,
   no other operation), and, for connect, a Cloudflare read that the Worker still has no Workers
   Builds connection. Connect repeats that read before the second check.
6. The gated MCP tools also receive the trusted grant and client of the bearer token, like
   `account_createSignInLink`, for the audit row. Their success results gain a `state` (`detached`,
   `setup_started`, `rotated`), so each structured result is one union with `needs_confirmation`.
   Its output schema keeps `type: "object"` at the root and lists the union members in `anyOf`,
   because the official MCP SDK rejects the whole `tools/list` result when one root is not an
   object. A test validates the real `tools/list` response with the SDK's `ListToolsResultSchema`.
7. The dashboard shows the challenge in one confirmation dialog for all four actions. For connect,
   the dialog replaces the Cloudflare form and resends the exact request that it showed. A challenge
   allows one attempt: after a failure the dialog offers only Close, and the next attempt starts the
   action again with a new challenge. Rejections of a dashboard call say "Start the action again"
   instead of the MCP instruction.

Deviations found during step 5:

1. The server instructions have 1,184 characters, not about 1k. They keep five rules that the note's
   1k draft did not need: the creation sequence with the server's token choice, the status read, the
   confirmation rule, the dashboard hand-off, and the repository name. The test bound is 1,200.
2. The plugin version is `0.3.2`, because the skill changed after step 2 set `0.3.0` and again after
   the final review. The MCP server version stays `0.3.0`.
3. The 8 cases keep their tools. No case calls `repository_getStatus`, because the review needs
   exactly five positive cases and the RFC asks for none.
4. The skill's recovery steps name no marketplace and no other client: they say to refresh or
   reconnect the Samebase connection in the current client, and to re-authorize it if an action is
   still absent. `check:plugin` rejects "marketplace" in any skill file.

## Alternatives considered

- **Primitive mirror (one tool per dashboard action, 21 tools).** Task success was the same (28/30
  against 29/30), but the hybrid catalog used 35% fewer input tokens, and the mirror makes the model
  carry IDs, tags, SHAs, and the token choice (note 3.2). Rejected.
- **One repair tool that picks the repair.** It saves two tools, but a reviewer can read it as
  "operation selection" (note
  [6](../research/2026-10-01-mcp-tool-catalog-design.md#6-strongest-evidence-against-this-recommendation)),
  and it needs one risk class for three different effects. Rejected; the status read names the exact
  repair tool.
- **`samebase_<verb>_<object>` names.** No routing gain (70% strict against 75%, 0 wrong-server
  choices in both), and it splits the vocabulary between code and tool. Rejected.
- **Phrase-only confirmation (an exact sentence as the only check).** It stops the model as well as
  the token does, but the model wrote the phrase itself in 6 of 6 approved requests, and the phrase
  is not single-use or bound to a resource identity. Rejected; the sentence stays, paired with a
  token.

## Open questions for the operator

1. **The word for a deployable unit.** `rfcs/123` defines "repository" and "GitHub repository" but
   no word for a Worker attachment and its root directory, and spec 115 says that Samebase has no
   app entity. This RFC uses "app" for it in descriptions only. Keep "app", or choose another word?

## Appendix A: Capability map

| Dashboard surface                  | Convex function today                                                                                          | Tool                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Repository list                    | `repository.dashboard.getUserRepositories`                                                                     | `repository_list`                                                                                                        |
| List row checks and PR count       | `repositoryPullRequests.listRepositorySidebarSummaries`                                                        | dashboard only                                                                                                           |
| Overview production, PRs, previews | 4 `repository.providerObservations.*` reads, 2 pull request reads                                              | `repository_getStatus`                                                                                                   |
| New repository                     | `repository.actions.createRepository`                                                                          | `repository_create`                                                                                                      |
| Connect repository                 | `repository.actions.connectRepository`                                                                         | `repository_connect`                                                                                                     |
| Build token list                   | `cloudflareBuildTokens.list`                                                                                   | dashboard only                                                                                                           |
| Cloudflare dialog                  | `repository.cloudflare.discoverWorkers`, `attachWorkers`, `connectWorker`, `createWorker`                      | the matching 4 `repository_cloudflare_*` tools                                                                           |
| Convex dialog                      | `repository.convex.discoverProjects`, `attachProjects`, `createProject`                                        | the 3 `repository_convex_*` tools                                                                                        |
| Settings repairs                   | `configureWorkersBuildsForGitHub`, `rotateConvexDeployKeysForWorkersBuilds`, `retryInfrastructureProvisioning` | `repository_cloudflare_configureBuilds`, `repository_cloudflare_rotateConvexDeployKeys`, `repository_retryProviderSetup` |
| Settings remove                    | `repository.cloudflare.detachWorker`, `repository.convex.detachProject`                                        | `repository_detachResource`                                                                                              |
| Change code location, rename sync  | `repository.convex.changeProjectCodeLocation`, `updateWorkerName`, `updateWorkerRootDirectory`                 | dashboard only                                                                                                           |
| Remove from Samebase               | `repository.actions.deleteRepository`, `retryDeleteRepository`                                                 | dashboard only                                                                                                           |

## Appendix B: Dashboard confirmations today

Verified on `a8783524a`:

| Action                 | Confirmation today                                                                                                                                                                                                                                                        | Server check                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Remove from Samebase   | Modal with opt-in checkboxes, all off by default ([RepositoryDeleteDialog.tsx L91](../apps/samebase/src/repository/dashboard/RepositoryDeleteDialog.tsx#L91), [L234](../apps/samebase/src/repository/dashboard/RepositoryDeleteDialog.tsx#L234))                          | booleans only                                                                                |
| Detach                 | Menu item, no modal ([RepositorySelectedWorkspace.tsx L223](../apps/samebase/src/repository/dashboard/RepositorySelectedWorkspace.tsx#L223))                                                                                                                              | none                                                                                         |
| Rotate deploy keys     | One-click button ([repositorySettingsState.ts L283](../apps/samebase/src/repository/dashboard/repositorySettingsState.ts#L283))                                                                                                                                           | none                                                                                         |
| Connect another Worker | "Connect and add", no warning about the replaced deployment ([RepositoryCloudflareDialog.tsx L405](../apps/samebase/src/repository/dashboard/RepositoryCloudflareDialog.tsx#L405), [L559](../apps/samebase/src/repository/dashboard/RepositoryCloudflareDialog.tsx#L559)) | none                                                                                         |
| Delete account         | Typed "delete my account" ([accountDeletionPhrase.ts L1](../apps/samebase/shared/accountDeletionPhrase.ts#L1))                                                                                                                                                            | yes ([accountDeletion/index.ts L248](../apps/samebase/convex/accountDeletion/index.ts#L248)) |
| Delete organization    | Typed organization login                                                                                                                                                                                                                                                  | yes ([organizations.ts L369](../apps/samebase/convex/organizations.ts#L369))                 |
