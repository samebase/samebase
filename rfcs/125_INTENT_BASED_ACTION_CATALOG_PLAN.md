# 125 One Intent-Based Action Catalog for the Dashboard and MCP

## Document Control

- Status: Proposal
- Owner: Nicu Chiciuc
- Created: 2026-10-01
- Base: `origin/main` at `0a8596197` (v2076)
- Related: `rfcs/089_MCP_CONVEX_FUNCTION_EXPOSURE_SPEC.md`,
  `rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md`, `specs/111_AGENT_BROWSER_HANDOFF_SPEC.md`,
  `research/2026-09-18-plugin-review-remediation.md`,
  [PR #1616](https://github.com/samebase/samebase/pull/1616),
  [PR #1661](https://github.com/samebase/samebase/pull/1661),
  [PR #1662](https://github.com/samebase/samebase/pull/1662)
- Supersedes on acceptance: the tool-name table and the "write tool descriptions say call the list
  tool first" rule in the `Final MCP Contract` section of
  `rfcs/123_REPOSITORY_TERMINOLOGY_AND_DATA_MIGRATION_ROLLOUT.md` (moved to `archive/` by
  [PR #1582](https://github.com/samebase/samebase/pull/1582)).

## Summary

1. Samebase has one contract per action, and one handler serves the dashboard and MCP. Only 15
   contracts are MCP tools. Five dashboard dialog actions and every live status read are missing.
2. This RFC proposes 21 tools: 15 renamed and 6 new. All names use `samebase_<verb>_<object>`.
3. The new tool `samebase_get_repository_status` returns what the repository overview shows. For a
   typical app, the MCP result is about 2.9 KB.
4. Discovery returns rows only for resources that the user or agent can act on.
5. Five implementation PRs land before one OpenAI submission. The last PR rewrites the 8 submitted
   test cases against the final names.

## Motivation

OpenAI reviews a submission in about two weeks. Submitted tools must stay as submitted. A later
change to tool names, arguments, annotations, or the tool set needs a new version and a new review.
We want the good tool set first and one submission.

### 1. The plumbing is incomplete

The dashboard Connections dialogs call five actions that have contracts but no `mcp` section:
connect a Worker, detach a Worker, create a Convex project, change a Convex code location, and
detach a Convex project. The MCP instructions tell agents to hand these off to the dashboard
([http.ts L92](../apps/samebase/convex/mcp/http.ts#L92)).

On 2026-10-01, Worker discovery for one staff app returned 48 Workers: 1 `attached`, 0 `attachable`,
and 45 `attached_elsewhere`, `connected_elsewhere`, or `connectable`. The agent could act on none of
them, because no tool connects a `connectable` Worker.

`repository_actions_connectRepository` requires `githubRepositoryDatabaseId`. No tool returns that
value for a repository that is not yet connected. ChatGPT has no `gh` CLI, so a ChatGPT user cannot
connect a repository unless the user supplies the numeric ID.

### 2. MCP has no live status read

The repository overview reads live state through 6 per-repository calls. The repository list adds 1
cross-repository call ([Appendix A](#appendix-a-dashboard-capability-map)). MCP has none of these
reads. The instructions send agents to provider tools for build and deployment state
([http.ts L102](../apps/samebase/convex/mcp/http.ts#L102)), but ChatGPT has no Workers Builds or
Convex tools. An agent cannot answer "Did my last push deploy?" through Samebase.

### 3. Tool names mix four styles

- `repository_dashboard_getUserRepositories` (domain, module, camelCase function)
- `cloudflare_listWorkersBuildTokens` (provider, camelCase function)
- `create_browser_handoff` (snake_case, no prefix)
- `samebase_auth_getAuthenticationStatus` and `samebase_feedback_submit` (prefix, mixed order)

Names encode Convex module paths, not user intent. Eight descriptions begin with "Call
repository_dashboard_getUserRepositories first and use its returned repositoryId", and a ninth
(connect) begins with the same call. Contract description and doc strings contain 46 literal tool
names, 27 of them the inventory tool name. One name in the server instructions is a literal string,
not an interpolated contract value ([http.ts L100](../apps/samebase/convex/mcp/http.ts#L100)).

### 4. Human-only areas are correctly excluded

These areas stay out of MCP. This RFC confirms that and does not remap them: providers (OAuth and
API keys), members and invitations, organization settings and billing (Polar), account settings and
deletion, admin, the staff-only file editor and staging, the schema graph, the embedded Convex Data
page, and dashboard view state (folders, collapse state, filters).

## Proposal

### Naming rule

- Every tool name is `samebase_<verb>_<object>`, in lowercase snake_case, with at most 40
  characters.
- Verbs come from one closed set: `get`, `list`, `discover`, `create`, `connect`, `attach`,
  `detach`, `configure`, `rotate`, `retry`, `change`, `submit`.
- The object is singular when the tool acts on one item and plural when it takes or returns a list.
  Provider resources keep the provider name: `cloudflare_worker`, `convex_project`,
  `workers_builds`, `convex_deploy_keys`.
- The Samebase object is `repository`, as `rfcs/123` requires. Arguments already say `repositoryId`.
- `mcp.name` equals `samebase_` plus the contract `id`. A catalog test enforces it. Then the
  contract `id`, the docs URL `/docs/actions/<id>.md`, and the tool name are one vocabulary.
- The `samebase_` prefix prevents collisions in hosts that put tools from several servers in one
  list, such as a GitHub server that also has `list_repositories`.

### Catalog

Hints are `readOnlyHint / openWorldHint / destructiveHint`. `openWorldHint: no` means that the tool
reads or writes only Samebase and the provider accounts that the user connected to Samebase. This is
the current convention
([submission source L25](../apps/samebase/scripts/chatgptAppSubmissionSource.ts#L25)).

| Tool                                   | Contract (`id`)               | Args                                                                                      | Output                                                     | Hints          | Hint reason                                                                  | Change  |
| -------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------- | ------- |
| `samebase_get_authentication_status`   | `get_authentication_status`   | none                                                                                      | account, role, scopes                                      | yes / no / no  | Reads the caller's own grant.                                                | renamed |
| `samebase_create_sign_in_link`         | `create_sign_in_link`         | `returnToPath?`                                                                           | one-time URL, `expiresAt`                                  | no / no / no   | Writes only Samebase handoff state.                                          | renamed |
| `samebase_submit_feedback`             | `submit_feedback`             | `report`                                                                                  | acknowledgement                                            | no / yes / yes | A sent email cannot be recalled.                                             | renamed |
| `samebase_list_repositories`           | `list_repositories`           | none                                                                                      | one list across all organizations, with `githubOwnerLogin` | yes / no / no  | Reads Samebase records only.                                                 | renamed |
| `samebase_get_repository_status`       | `get_repository_status`       | `repositoryId`                                                                            | overview facts (see below)                                 | yes / no / no  | Reads the user's connected GitHub, Cloudflare, and Convex accounts.          | **new** |
| `samebase_create_repository`           | `create_repository`           | unchanged                                                                                 | `repositoryId`                                             | no / yes / no  | Creates new provider resources and overwrites none.                          | renamed |
| `samebase_connect_repository`          | `connect_repository`          | `githubRepositoryFullName`                                                                | `repositoryId`, `githubRepositoryDatabaseId`               | no / no / no   | Reads one installed GitHub repository and writes a Samebase record.          | renamed |
| `samebase_retry_provider_setup`        | `retry_provider_setup`        | `repositoryId`                                                                            | acknowledgement                                            | no / yes / yes | Can overwrite Builds settings and revoke deploy keys.                        | renamed |
| `samebase_list_workers_build_tokens`   | `list_workers_build_tokens`   | `githubOwnerLogin`                                                                        | token names and UUIDs                                      | yes / no / no  | Reads non-secret token metadata.                                             | renamed |
| `samebase_discover_cloudflare_workers` | `discover_cloudflare_workers` | `repositoryId`, `accountId`                                                               | actionable rows plus counts                                | yes / no / no  | Reads the connected Cloudflare account.                                      | renamed |
| `samebase_attach_cloudflare_workers`   | `attach_cloudflare_workers`   | `repositoryId`, `accountId`, `workers`                                                    | `workerIds`                                                | no / no / no   | Adds Samebase records. No provider write.                                    | renamed |
| `samebase_connect_cloudflare_worker`   | `connect_cloudflare_worker`   | `repositoryId`, `accountId`, `workerName`, `workerTag`, `rootDirectory`, `buildTokenUuid` | `workerId`, optional notice                                | no / yes / yes | Its first production build replaces the Worker's current deployment.         | **new** |
| `samebase_create_cloudflare_worker`    | `create_cloudflare_worker`    | unchanged                                                                                 | `workerId`                                                 | no / yes / no  | Creates a new Worker and rejects existing names.                             | renamed |
| `samebase_configure_workers_builds`    | `configure_workers_builds`    | unchanged                                                                                 | acknowledgement                                            | no / yes / yes | Can overwrite Builds settings.                                               | renamed |
| `samebase_rotate_convex_deploy_keys`   | `rotate_convex_deploy_keys`   | unchanged                                                                                 | acknowledgement                                            | no / yes / yes | Revokes recorded keys before it writes new keys.                             | renamed |
| `samebase_detach_cloudflare_worker`    | `detach_cloudflare_worker`    | `repositoryId`, `workerId`                                                                | `workerId`                                                 | no / no / yes  | Deletes a Samebase record. The Worker does not change.                       | **new** |
| `samebase_discover_convex_projects`    | `discover_convex_projects`    | `repositoryId`                                                                            | code locations, actionable rows, counts                    | yes / no / no  | Reads the repository tree and the connected Convex team.                     | renamed |
| `samebase_attach_convex_projects`      | `attach_convex_projects`      | `repositoryId`, `projects`                                                                | `convexProjectIds`                                         | no / no / no   | Adds Samebase records. No provider write.                                    | renamed |
| `samebase_create_convex_project`       | `create_convex_project`       | `repositoryId`, `projectName`, `deploymentRegion`, `codeLocation`                         | `convexProjectId`                                          | no / yes / no  | Creates a new project with one production deployment and overwrites nothing. | **new** |
| `samebase_change_convex_code_location` | `change_convex_code_location` | `repositoryId`, `convexProjectId`, `codeLocation`                                         | `convexProjectId`                                          | no / no / yes  | Overwrites one stored Samebase value. No file or provider change.            | **new** |
| `samebase_detach_convex_project`       | `detach_convex_project`       | `repositoryId`, `convexProjectId`                                                         | `convexProjectId`                                          | no / no / yes  | Deletes a Samebase record. The project does not change.                      | **new** |

Every tool gets an `outputSchema`. The four acknowledgement-only tools return a fixed
`{ status: "started" }` or `{ status: "done" }` object instead of plain text only
(`research/2026-09-18-plugin-review-remediation.md`).

Decisions in this table:

- **Detach is a tool.** It deletes only the Samebase record
  ([cloudflareMutations.ts L332](../apps/samebase/convex/repository/cloudflareMutations.ts#L332),
  [convexMutations.ts L540](../apps/samebase/convex/repository/convexMutations.ts#L540)). The user
  can undo it with attach. An agent needs it to move a Worker or a project from one repository to
  another. `destructiveHint: true` makes clients ask for confirmation.
- **Connect a Worker is destructive.** The Worker must have no Builds connection, but the action
  requests a production build
  ([cloudflare.ts L1387](../apps/samebase/convex/repository/cloudflare.ts#L1387)). That build
  replaces whatever the Worker serves now.
- **Connect a repository takes `githubRepositoryFullName`.** The MCP projection resolves the owner
  to the organization, reads the repository through that organization's GitHub App installation, and
  passes the database ID to the shared handler. This follows the existing `mcpArgs` pattern
  ([connectRepository.ts L24](../apps/samebase/convex/repository/contracts/connectRepository.ts#L24)).
  No repository search tool is needed. The stored identity stays the database ID.

Deliberately left out:

| Dashboard capability                                                 | Reason                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Remove from Samebase (`deleteRepository`, `retryDeleteRepository`)   | It can delete the GitHub repository and provider resources. This cannot be undone. Dashboard only.     |
| Worker name and root sync, GitHub repository and owner rename sync   | These accept provider drift. They are rare, and the Settings page shows the difference.                |
| Name availability check (`checkCreateRepositoryResourceNames`)       | Create already fails before any write when a name is taken.                                            |
| GitHub repository search (`github.listRepositories`)                 | Connect takes the full name. A search tool would list every repository in an installation.             |
| Cross-repository summary (`listRepositorySidebarSummaries`)          | Status gives the same facts per repository. Inventory is polled during create and stays Samebase-only. |
| Convex deploy-key state (`observeCloudflareWorkerConvexBuildAccess`) | A Settings fact. Rotation is safe to repeat. Add it later if agents need it.                           |

### The status read

`samebase_get_repository_status` maps to one new contract, `get_repository_status`, with access
`access_dashboard`. That access already covers inventory and the dashboard observation reads, so no
new OAuth scope is needed. One Convex action runs the existing provider reads in parallel. It reuses
the bodies of the 4 observation actions and the 2 pull request actions as `...ForUser` functions,
which is the pattern that `discoverCloudflareWorkersForUser` already uses. It makes no new provider
call and stores no mirror.

`returns` contains only facts that the overview page shows. Shape sketch:

```text
{
  repositoryId, githubRepositoryFullName,
  defaultBranch: { state: "available"; name; headCommit: { oid; title; committedAt; url };
                   checks: CheckSummary; checkContexts: CheckContext[] } | { state: "unavailable" },
  production: {
    workers: { workerId; workerName; rootDirectory; urls: string[];
               build: { state: "available"; buildState; logsUrl } | { state: "absent" | "unavailable" } }[],
    convexProjects: { convexProjectId; rootDirectory;
                      deployment: { state: "available"; deploymentName; dashboardUrl; region }
                                | { state: "missing" | "unavailable" } }[],
  },
  pullRequests: { state: "available"; openCount; hasMore; items: PullRequestStatus[] }
              | { state: "unavailable" },
}
```

`items` holds the first 6 open pull requests, which is the dashboard page size
([useRepositoryPullRequests.ts L25](../apps/samebase/src/repository/dashboard/useRepositoryPullRequests.ts#L25)).
Each item has the number, title, URL, draft flag, head and base branch, update time, line and file
counts, labels, `checks`, `checkContexts`, and previews: per Worker the build and branch preview
URL, per Convex project the branch deployment, and other hosting previews.

The MCP `structuredContent` is smaller. It replaces each `checkContexts` list with `failedChecks`
(name and URL only). It drops labels, line and file counts, GitHub node IDs, head SHAs, and preview
provenance. The `text` field is one summary line, not a JSON copy.

Payload size, measured on a realistic JSON example with 32-character IDs and real URL shapes:

| Case                                                                | MCP `structuredContent`             | Dashboard `returns` |
| ------------------------------------------------------------------- | ----------------------------------- | ------------------- |
| Typical app: 1 Worker, 1 Convex project, 3 checks per commit, 2 PRs | 2.9 KB (about 800 tokens)           | 5.3 KB              |
| Same app, no open PRs                                               | 1.2 KB                              | 1.7 KB              |
| Same app, 6 PRs (the cap)                                           | 6.4 KB                              | 12.4 KB             |
| Each extra Worker                                                   | +0.35 KB, plus 0.3 KB per listed PR | similar             |
| For comparison: today's Worker discovery with 48 rows               | 5.8 KB                              | 5.8 KB              |
| For comparison: today's inventory, per repository                   | 0.8 KB                              | larger              |

The composed read is smaller than one Worker discovery call today. The 6-PR cap bounds it.

Can the overview page replace its calls with this one read without losing a displayed fact?

- The 6 per-repository calls: yes, because `returns` keeps the check list for the checks popover and
  the other hosting previews. Two behaviors change. The page renders in one step instead of
  progressively. One 60-second refresh reads everything, where today only builds and the first pull
  request page refresh. Pull requests after the first 6 still load through the existing paged reads.
- The cross-repository list summary: no. It is not a per-repository read, and it stays.
- The overview also starts the Convex deploy-key read today, but only Settings shows it
  ([repositorySettingsState.ts L322](../apps/samebase/src/repository/dashboard/repositorySettingsState.ts#L322)).
  The status read leaves it out.

Recommendation: ship the action and the MCP tool first. Move the overview to it in a later PR, after
we measure p95 latency.

### Discovery output rule

- MCP discovery returns rows only for statuses that the user or a tool can act on, and a count for
  every other status. The dashboard `returns` keeps every row, because the Create Worker form uses
  all names to reject a conflict
  ([RepositoryCloudflareDialog.tsx L513](../apps/samebase/src/repository/dashboard/RepositoryCloudflareDialog.tsx#L513)).
- Workers: rows for `attachable` and `connectable`. Counts for `attached`, `attached_elsewhere`,
  `connected_elsewhere`, and `unavailable`. Inventory already lists attached Workers. The 48-row
  observation goes from 5.8 KB to about 0.15 KB, plus about 0.12 KB per actionable row.
- Convex: `attachable` requires `productionDeployment.state: "available"`. Today a project without a
  production deployment is `attachable`
  ([convex.ts L260](../apps/samebase/convex/repository/convex.ts#L260)), and deploy-key rotation
  later fails with "The selected Convex project has no production deployment."
  ([cloudflare.ts L918](../apps/samebase/convex/repository/cloudflare.ts#L918)). Add the status
  `needs_production_deployment`. Attach rejects it on the server, so the dashboard and MCP agree, as
  in PR #1661. MCP returns rows for `attachable` and `needs_production_deployment` and counts for
  `attached` and `attached_elsewhere`.

### Instructions and skill

Server instructions ([http.ts L88-L104](../apps/samebase/convex/mcp/http.ts#L88), now 7.2 KB):

- Shorten the dashboard-only list to: removing a repository, accepting a Worker or GitHub rename,
  members, organization settings, billing, and provider connections.
- Add one sentence: every repository tool takes `repositoryId` from `samebase_list_repositories`.
  Delete the "Call ... first" prefix from the 9 descriptions. The `inputDescriptions` already name
  the source tool.
- Add routing: for build, deployment, URL, check, or pull request state, call
  `samebase_get_repository_status`. Do not call it as a preflight. Keep provider tools for logs,
  environment values, migrations, and custom domains.
- Interpolate every tool name from its contract, including the literal at L100.
- Target: shorter than today.

Skill ([SKILL.md](../packages/plugin/plugins/samebase/skills/samebase/SKILL.md)):

- Rename the 5 tool references (L21, L41, L43, L47, L58).
- In "Verify the result", use the status read for build and deployment state.
- Bump the version in both plugin manifests on each change, as
  `skills/update-samebase-agent-plugin/SKILL.md` requires. Use `0.3.0` for the rename, because old
  tool names stop working.

## Rename map

| Current name                                                   | New name                               | Contract `id` change                                                          |
| -------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| `samebase_auth_getAuthenticationStatus`                        | `samebase_get_authentication_status`   | none                                                                          |
| `create_browser_handoff`                                       | `samebase_create_sign_in_link`         | `create_browser_handoff` to `create_sign_in_link`                             |
| `samebase_feedback_submit`                                     | `samebase_submit_feedback`             | none                                                                          |
| `repository_dashboard_getUserRepositories`                     | `samebase_list_repositories`           | `get_user_repositories` to `list_repositories`                                |
| `repository_actions_createRepository`                          | `samebase_create_repository`           | none                                                                          |
| `repository_actions_connectRepository`                         | `samebase_connect_repository`          | `connect_existing_repository` to `connect_repository`                         |
| `repository_actions_retryInfrastructureProvisioning`           | `samebase_retry_provider_setup`        | `retry_infrastructure_provisioning` to `retry_provider_setup`                 |
| `cloudflare_listWorkersBuildTokens`                            | `samebase_list_workers_build_tokens`   | none                                                                          |
| `repository_cloudflare_discoverWorkers`                        | `samebase_discover_cloudflare_workers` | none                                                                          |
| `repository_cloudflare_attachWorkers`                          | `samebase_attach_cloudflare_workers`   | none                                                                          |
| `repository_cloudflare_createWorker`                           | `samebase_create_cloudflare_worker`    | none                                                                          |
| `repository_cloudflare_configureWorkersBuildsForGitHub`        | `samebase_configure_workers_builds`    | `configure_workers_builds_for_github` to `configure_workers_builds`           |
| `repository_cloudflare_rotateConvexDeployKeysForWorkersBuilds` | `samebase_rotate_convex_deploy_keys`   | `rotate_convex_deploy_keys_for_workers_builds` to `rotate_convex_deploy_keys` |
| `repository_convex_discoverProjects`                           | `samebase_discover_convex_projects`    | none                                                                          |
| `repository_convex_attachProjects`                             | `samebase_attach_convex_projects`      | none                                                                          |

There are no aliases. Old names stop working at deploy, as in `rfcs/123`.

Blast radius (counts on `0a8596197`):

| Place                                                                                                              | What changes                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 12 contract files in `convex/repository/contracts`, `convex/mcp/contracts`, `convex/agentBrowserHandoff/contracts` | `mcp.name`, `id`, `title`; 9 description prefixes; 46 literal names in description and doc strings                         |
| `convex/toolRuntime/runtime.ts`                                                                                    | Wrappers for 6 new tools. Existing wrappers read names from contracts.                                                     |
| `convex/mcp/http.ts`                                                                                               | Instructions L88-L104, including the literal at L100; tool map L202-L244 for new tools                                     |
| `convex/toolRuntime/actionCatalog.ts`                                                                              | 6 new entries; new test that `mcp.name` is `samebase_` plus `id`                                                           |
| Public skill                                                                                                       | 5 references                                                                                                               |
| `public/docs/actions/*.md`, `public/llms.txt`                                                                      | Regenerated. 5 doc URLs change with their `id`. 6 new pages.                                                               |
| `scripts/chatgptAppSubmissionSource.ts`, `chatgpt-app-submission.json`                                             | 15 justification keys renamed, 6 added; the 8 cases rewritten; JSON regenerated                                            |
| Tests                                                                                                              | `http.convex.test.ts` (49 hits), `runtime.convex.test.ts` (3), `actionCatalog.test.ts` (1), `usageAttribution.test.ts` (2) |
| `specs/111_AGENT_BROWSER_HANDOFF_SPEC.md`                                                                          | Tool name at L12                                                                                                           |
| PostHog usage log                                                                                                  | `mcp_tool_name` values change on the deploy date. Update saved insights that filter by name.                               |
| Plugin manifests                                                                                                   | Version bump in `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`                                               |

## Rollout

| PR  | Scope                                                                                                                                              | Size                              | Before submission run |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------- |
| 1   | This RFC                                                                                                                                           | 1 doc                             | yes                   |
| 2   | Rename to `samebase_<verb>_<object>`: ids, names, instructions, description prefixes, skill, spec 111, docs, tests, name test, plugin `0.3.0`      | about 50 files, mostly mechanical | yes                   |
| 3   | Actionable discovery: Convex production-deployment rule in discover and attach; MCP rows and counts for both discoveries                           | about 250 lines                   | yes                   |
| 4   | Dialog actions as tools: `mcp` sections for the 5 contracts, runtime wrappers, structured acknowledgements, connect by full name, justifications   | about 500 lines                   | yes                   |
| 5   | Status read: contract, extracted `...ForUser` reads, action, MCP tool, justifications, a fixture test that keeps the typical MCP result under 4 KB | about 700 lines                   | yes                   |
| 6   | Submission package: rewrite the 8 cases, final instructions and skill text, regenerate the submission JSON, plugin version bump                    | about 200 lines                   | yes, last             |
| 7   | Overview page uses the status read                                                                                                                 | about 300 lines                   | no, after approval    |

The rename goes first, so the new tools start with their final names.

PR 6 rewrites the 8 submitted cases against the final names. It is the last PR before the submission
run. Proposed changes:

- Replace the authentication-status case with a status case: "Did my last change to
  samebase-live-tests/tmp-my-cool-app2 deploy?" It calls `samebase_list_repositories` and
  `samebase_get_repository_status`.
- Rewrite the Worker discovery case. Its expected output now says that a `connectable` Worker can be
  connected with `samebase_connect_cloudflare_worker`
  ([submission source L200](../apps/samebase/scripts/chatgptAppSubmissionSource.ts#L200)).
- Rename tools in the inventory, create, and sign-in link cases.
- Keep the 3 negative cases. "Delete through MCP" stays valid, because removal stays dashboard-only.

Before the run: deploy PRs 2 to 6 to production, publish the plugin version from PR 6, and run all 8
cases in ChatGPT web and mobile with the reviewer account. Then submit once.

After approval, OpenAI picks up MCP server changes without a new version. Handler logic, latency
work, error text, and PR 7 can ship then. A new version and review are necessary for a change to the
tool set, a tool name, arguments, annotations, the skill, or `.mcp.json`. Keep output shapes stable,
because the submitted cases describe them.

## Alternatives considered

- **Keep the 15 tools and submit now.** This is the fastest path to a review. But the review fixes
  today's tool set. Connect-Worker, status, and the new names would each need a second review of
  about two weeks. Case 3 also encodes "connect only in the dashboard". Rejected.
- **Separate MCP-only handlers.** They would let MCP compose reads or relax rules without dashboard
  changes. But they break the one-contract design, and two code paths for one rule drift. The Convex
  production-deployment rule already disagrees between discovery and rotation. Rejected. MCP keeps
  only projections of the shared handler: `mcpArgs` and a smaller `structuredContent`, as in PR
  #1662.
- **Put live status into inventory.** Inventory is polled during create. GitHub and provider reads
  on every poll add latency and couple the poll to provider failures. Rejected.

## Open questions for the operator

1. **Names.** Approve `samebase_<verb>_<object>` with the noun `repository` (from `rfcs/123`),
   although titles and test prompts say "app". Approve `samebase_create_sign_in_link` in place of
   `create_browser_handoff`.
2. **Detach.** Expose both detach tools with `destructiveHint: true` (recommended), or keep them
   dashboard-only and keep the hand-off sentence.
3. **Repository search.** Connect by `githubRepositoryFullName` with no search tool (recommended),
   or add `samebase_list_github_repositories`.
4. **Convex production deployment.** Make `attachable` require an available production deployment in
   the dashboard and MCP (recommended). The dashboard dialog then stops offering those projects.

## Appendix A: Dashboard capability map

Verified on `0a8596197`. "MCP today" means a tool exists now.

| Dashboard surface                   | Convex function                                                            | Contract                                   | MCP today | Proposal                     |
| ----------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ | --------- | ---------------------------- |
| Repository list                     | `repository.dashboard.getUserRepositories`                                 | `getUserRepositoriesContract`              | yes       | `samebase_list_repositories` |
| List row: checks and PR count       | `repositoryPullRequests.listRepositorySidebarSummaries`                    | none                                       | no        | stays dashboard-only         |
| Overview: production URLs           | `repository.providerObservations.observeCloudflareWorkers`                 | none                                       | no        | status read                  |
| Overview: production build          | `repository.providerObservations.observeCloudflareWorkerBuilds`            | none                                       | no        | status read                  |
| Settings: Convex deploy-key state   | `repository.providerObservations.observeCloudflareWorkerConvexBuildAccess` | none                                       | no        | left out                     |
| Overview: Convex deployment         | `repository.providerObservations.observeConvexProjects`                    | none                                       | no        | status read                  |
| Overview: default branch, PR list   | `repositoryPullRequests.listOpenPullRequests`                              | none                                       | no        | status read (first 6)        |
| Overview: PR previews               | `repository.pullRequestResources.getPullRequestResources`                  | none                                       | no        | status read (first 6)        |
| New repository                      | `repository.actions.createRepository`                                      | `createRepositoryContract`                 | yes       | renamed                      |
| New repository: name check          | `repository.actions.checkCreateRepositoryResourceNames`                    | none                                       | no        | left out                     |
| Connect repository: picker          | `github.listRepositories`, `github.listRepositoriesPreview`                | none                                       | no        | left out                     |
| Connect repository                  | `repository.actions.connectRepository`                                     | `connectRepositoryContract`                | yes       | renamed, full-name args      |
| Retry provider setup                | `repository.actions.retryInfrastructureProvisioning`                       | `retryInfrastructureProvisioningContract`  | yes       | renamed                      |
| Remove from Samebase, retry removal | `repository.actions.deleteRepository`, `retryDeleteRepository`             | none                                       | no        | dashboard-only               |
| Workers Builds tokens               | `cloudflareBuildTokens.list`                                               | `cloudflareListWorkersBuildTokensContract` | yes       | renamed                      |
| Cloudflare dialog: discover         | `repository.cloudflare.discoverWorkers`                                    | `cloudflareDiscoverWorkersContract`        | yes       | renamed, rows and counts     |
| Cloudflare dialog: attach           | `repository.cloudflare.attachWorkers`                                      | `cloudflareAttachWorkersContract`          | yes       | renamed                      |
| Cloudflare dialog: connect another  | `repository.cloudflare.connectWorker`                                      | `cloudflareConnectWorkerContract`          | no        | new tool                     |
| Cloudflare dialog: create Worker    | `repository.cloudflare.createWorker`                                       | `cloudflareCreateWorkerContract`           | yes       | renamed                      |
| Settings: configure Builds          | `repository.cloudflare.configureWorkersBuildsForGitHub`                    | contract with `mcp`                        | yes       | renamed                      |
| Settings: rotate deploy keys        | `repository.cloudflare.rotateConvexDeployKeysForWorkersBuilds`             | contract with `mcp`                        | yes       | renamed                      |
| Settings: remove Worker             | `repository.cloudflare.detachWorker`                                       | `cloudflareDetachWorkerContract`           | no        | new tool                     |
| Settings: update Worker name, root  | `repository.cloudflare.updateWorkerName`, `updateWorkerRootDirectory`      | none                                       | no        | left out                     |
| Convex dialog: discover             | `repository.convex.discoverProjects`                                       | `convexDiscoverProjectsContract`           | yes       | renamed, deployment rule     |
| Convex dialog: attach               | `repository.convex.attachProjects`                                         | `convexAttachProjectsContract`             | yes       | renamed                      |
| Convex dialog: create project       | `repository.convex.createProject`                                          | `convexCreateProjectContract`              | no        | new tool                     |
| Settings: change code location      | `repository.convex.changeProjectCodeLocation`                              | `convexChangeProjectCodeLocationContract`  | no        | new tool                     |
| Settings: remove Convex project     | `repository.convex.detachProject`                                          | `convexDetachProjectContract`              | no        | new tool                     |
| Settings: sync GitHub rename        | `github.updateRepositoryGitHubRepositoryName`                              | none                                       | no        | left out                     |
| Session tools                       | none (computed in `mcp/http.ts` and `toolRuntime/runtime.ts`)              | 3 MCP-only contracts                       | yes       | renamed                      |

## Appendix B: Evidence

Contracts and handlers:

- One contract for both surfaces:
  [cloudflare.ts L1644](../apps/samebase/convex/repository/cloudflare.ts#L1644) and
  [runtime.ts L347](../apps/samebase/convex/toolRuntime/runtime.ts#L347) both call
  `discoverCloudflareWorkersForUser`.
- Catalog order and the list of 15:
  [actionCatalog.ts L32](../apps/samebase/convex/toolRuntime/actionCatalog.ts#L32).
- Attachment statuses:
  [cloudflareAttachments.ts L38](../apps/samebase/convex/repository/contracts/cloudflareAttachments.ts#L38),
  [convexAttachments.ts L60](../apps/samebase/convex/repository/contracts/convexAttachments.ts#L60).
- Contracts without `mcp`:
  [cloudflareAttachments.ts L159](../apps/samebase/convex/repository/contracts/cloudflareAttachments.ts#L159)
  (connect), [L222](../apps/samebase/convex/repository/contracts/cloudflareAttachments.ts#L222)
  (detach),
  [convexAttachments.ts L175](../apps/samebase/convex/repository/contracts/convexAttachments.ts#L175)
  (create, change, detach).
- Dashboard actions: [cloudflare.ts L1665](../apps/samebase/convex/repository/cloudflare.ts#L1665)
  (connect), [L1682](../apps/samebase/convex/repository/cloudflare.ts#L1682) (detach),
  [L1703](../apps/samebase/convex/repository/cloudflare.ts#L1703) and
  [L1747](../apps/samebase/convex/repository/cloudflare.ts#L1747) (name and root sync),
  [convex.ts L817](../apps/samebase/convex/repository/convex.ts#L817) (create, change, detach),
  [actions.ts L849](../apps/samebase/convex/repository/actions.ts#L849) (name check),
  [L914](../apps/samebase/convex/repository/actions.ts#L914) (delete),
  [L953](../apps/samebase/convex/repository/actions.ts#L953) (retry delete),
  [github.ts L788](../apps/samebase/convex/github.ts#L788) (repository list).
- Smaller MCP projections:
  [getUserRepositories.ts L236](../apps/samebase/convex/repository/contracts/getUserRepositories.ts#L236),
  [convexAttachments.ts L90](../apps/samebase/convex/repository/contracts/convexAttachments.ts#L90).
- Production deployment rule: Convex project creation requests `deploymentType: "prod"`
  ([convex.ts L304](../apps/samebase/convex/repository/convex.ts#L304)); discovery ignores it
  ([L260](../apps/samebase/convex/repository/convex.ts#L260)); rotation requires it
  ([cloudflare.ts L918](../apps/samebase/convex/repository/cloudflare.ts#L918)).

Live reads:

- Observation validators and actions:
  [providerObservations.ts L37](../apps/samebase/convex/repository/providerObservations.ts#L37),
  [L286](../apps/samebase/convex/repository/providerObservations.ts#L286),
  [L349](../apps/samebase/convex/repository/providerObservations.ts#L349),
  [L506](../apps/samebase/convex/repository/providerObservations.ts#L506),
  [L579](../apps/samebase/convex/repository/providerObservations.ts#L579).
- Pull request validators and actions:
  [repositoryPullRequests.ts L89](../apps/samebase/convex/repositoryPullRequests.ts#L89),
  [L709](../apps/samebase/convex/repositoryPullRequests.ts#L709),
  [L751](../apps/samebase/convex/repositoryPullRequests.ts#L751),
  [pullRequestResources.ts L48](../apps/samebase/convex/repository/pullRequestResources.ts#L48).
- Callers:
  [useRepositoryWorkspaceModel.ts L37](../apps/samebase/src/repository/dashboard/useRepositoryWorkspaceModel.ts#L37),
  [useRepositoryProviderObservations.ts L85](../apps/samebase/src/repository/dashboard/useRepositoryProviderObservations.ts#L85),
  [useRepositoryPullRequests.ts L167](../apps/samebase/src/repository/dashboard/useRepositoryPullRequests.ts#L167),
  [useRepositorySidebarSummaries.ts L28](../apps/samebase/src/repository/dashboard/useRepositorySidebarSummaries.ts#L28).
- Displayed facts:
  [RepositoryOverviewPage.tsx L294](../apps/samebase/src/repository/dashboard/RepositoryOverviewPage.tsx#L294),
  [RepositoryEnvironmentTree.tsx L256](../apps/samebase/src/repository/dashboard/RepositoryEnvironmentTree.tsx#L256)
  (default branch and production),
  [L467](../apps/samebase/src/repository/dashboard/RepositoryEnvironmentTree.tsx#L467) (Worker row),
  [L624](../apps/samebase/src/repository/dashboard/RepositoryEnvironmentTree.tsx#L624) (PR
  previews),
  [repositoryEnvironmentRoots.ts L149](../apps/samebase/src/repository/dashboard/repositoryEnvironmentRoots.ts#L149),
  [RepositoryPullRequestsSection.tsx L53](../apps/samebase/src/repository/dashboard/RepositoryPullRequestsSection.tsx#L53),
  [RepositoryOverviewSidebar.tsx L131](../apps/samebase/src/repository/dashboard/RepositoryOverviewSidebar.tsx#L131)
  (list row).

MCP surface and submission:

- Server instructions: [http.ts L88](../apps/samebase/convex/mcp/http.ts#L88); tool map
  [L202](../apps/samebase/convex/mcp/http.ts#L202); authentication status
  [L143](../apps/samebase/convex/mcp/http.ts#L143).
- Submission source: justifications
  [L25](../apps/samebase/scripts/chatgptAppSubmissionSource.ts#L25), cases
  [L168](../apps/samebase/scripts/chatgptAppSubmissionSource.ts#L168), negative cases
  [L230](../apps/samebase/scripts/chatgptAppSubmissionSource.ts#L230).
- Usage log name type: [usageAttribution.ts L12](../apps/samebase/convex/usageAttribution.ts#L12).
- Plugin version `0.2.40`:
  [.claude-plugin/plugin.json](../packages/plugin/plugins/samebase/.claude-plugin/plugin.json),
  [.codex-plugin/plugin.json](../packages/plugin/plugins/samebase/.codex-plugin/plugin.json).
- Hands-on discovery result (48 Workers, 0 attachable): operator session on 2026-10-01, staff
  account.
