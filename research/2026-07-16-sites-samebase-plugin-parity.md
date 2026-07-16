# Sites And Samebase Plugin Parity

- Status: research
- Date: 2026-07-16
- Sites snapshot: `sites@openai-bundled` 0.1.27
- Samebase snapshot: `samebase@samebase` 0.1.2 and `origin/main` at `a87101a5`
- Official references: [Sites](https://learn.chatgpt.com/docs/sites),
  [plugin structure](https://learn.chatgpt.com/docs/build-plugins#plugin-structure),
  [skills and plugins](https://learn.chatgpt.com/docs/skills-and-plugins), and
  [plugin submission](https://learn.chatgpt.com/docs/submit-plugins)

## Executive Conclusion

Samebase can become a semantic substitute for Sites. A user should be able to replace an explicit
Sites plugin mention with Samebase and preserve the journey: create or open an app, work on the real
source locally, preview it, publish an exact source state, observe deployment, and receive the live
URL.

That does not require matching Sites tool names or reproducing Sites internals. It requires matching
the user-level workflow and preserving state between its stages. Samebase should keep its stronger
model:

- the source is a GitHub repository the user owns;
- a Git commit is the version identity;
- Convex owns durable application data and backend functions;
- Cloudflare Workers owns delivery;
- Workers Builds turns Git pushes and pull requests into production and preview deployments.

The immediate gap is mostly plugin packaging. Sites carries a detailed product workflow, a starter,
references, deterministic scripts, a small interaction MCP server, and a first-party app connector.
Samebase carries one 25-line skill and its remote MCP declaration even though the Samebase backend
already has a substantial OAuth, provisioning, inventory, and repair control plane.

Full substitution also requires one product-boundary decision. RFC 093 deliberately leaves
environment variables and domains to provider-direct tools. Sites includes them in its own control
plane. The recommended revision is narrow: Samebase should own app-scoped lifecycle operations for
apps in its registry, but should still avoid wrapping generic provider administration, logs, data
inspection, migrations, queues, or unrelated resources.

## Source Boundary

This investigation inspected the installed proprietary Sites bundle and the callable tool schemas
made available by the current Codex task. The evidence is suitable for understanding behavior and
designing an independent implementation. Samebase should not copy Sites code, templates, or prose.

The installed bundle proves that Sites workloads target Cloudflare-compatible infrastructure:

- the starter uses Vinext, Wrangler, and `@cloudflare/vite-plugin`;
- `.openai/hosting.json` declares logical D1 and R2 bindings;
- the build emits a Cloudflare Worker-compatible server entrypoint;
- the custom-domain tools return Cloudflare validation state.

It does not prove that every Sites control-plane service runs on Cloudflare. The connector response
types identify an OpenAI AppGen control plane around the hosted workload.

## How Sites Is Organized

The installed `sites@openai-bundled` plugin has four distinct layers.

### 1. Plugin discovery and presentation

`.codex-plugin/plugin.json` declares:

- broad trigger vocabulary for websites, landing pages, dashboards, portals, trackers, internal
  tools, and games;
- two bundled skills;
- an app connector through `.app.json`;
- a local MCP server through `.mcp.json`;
- display metadata, starter prompts, terms, icons, and brand color.

The split matters. The plugin manifest makes Sites discoverable, but it does not contain the build
or hosting procedure.

The bundle also treats instructions as production behavior. Its `TEMPEST.md` requires blocking human
review for changes to skills, manifests, tool descriptions, authentication, deployment, network
behavior, or dependencies. Samebase should apply the same standard to its generated plugin surface.

### 2. Workflow skills

`skills/sites-building/SKILL.md` is the main product workflow. It defines:

1. a one-shot path for a new, simple, single-route site;
2. a capability path for existing projects, multiple routes, persistence, uploads, authentication,
   connectors, or requested browser QA;
3. immediate project setup and local preview;
4. optional visual decisions through three comparable design previews;
5. implementation and build validation;
6. a mandatory handoff to the hosting skill unless the user requests local-only work.

`skills/sites-hosting/SKILL.md` owns the publish transaction:

1. create or reuse the hosted project;
2. push the exact validated source state;
3. package the build artifact;
4. save a version tied to the pushed commit SHA;
5. deploy that saved version;
6. poll deployment state;
7. open and return the production URL.

The skills hide source-control and deployment machinery from nontechnical users while preserving
strict internal provenance.

### 3. Deterministic local assets

The plugin bundles:

- a Vinext starter using Next 16, React 19, Vite, Tailwind, Drizzle, and Cloudflare tooling;
- focused authentication and persistence references;
- an initializer that copies the starter, initializes Git, and installs locked dependencies;
- a renderer for design previews;
- a packager that stages `dist`, hosting metadata, and database migrations into a validated archive.

The root scripts are tiny stable entrypoints into scripts owned by the relevant skill. This keeps
the workflow instructions readable and the mechanical work executable.

### 4. Two separate tool planes

The `.mcp.json` file does not host Sites. It starts one local stdio MCP server with one read-only
tool, `choose_site_design`. The server validates exactly three local image options and uses an
`openai/form` image picker to return the selected implementation brief.

The remote hosting operations come from the app referenced by `.app.json`. The current task exposed
19 Sites connector tools:

| Lifecycle group                | Tools                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Project catalog                | `list_sites`, `get_site`, `update_site_metadata`                                                                          |
| Creation, source, and versions | `create_site`, `create_source_repository_write_credential`, `save_site_version`, `list_site_versions`, `get_site_version` |
| Deployment                     | `deploy_private_site_version`, `deploy_site_version`, `get_deployment_status`                                             |
| Runtime and access             | `get_environment_variables`, `update_environment_variables`, `update_site_access`, `generate_siwc_bypass_token`           |
| Domains                        | `add_custom_domain`, `list_custom_domains`, `refresh_custom_domain_status`, `remove_custom_domain`                        |

Every tool repeats the same control-plane invariants in its description:

- persisted opaque IDs win over title or slug matching;
- source must be pushed before a version is saved;
- commit SHA and uploaded archive must describe the same source state;
- only saved versions can deploy;
- every deployed URL is production;
- private deployment is preferred, while wider deployment requires explicit approval;
- nonterminal deployments are polled through a dedicated status read.

This repeated metadata is part of the runtime product contract, not incidental documentation.

## The Sites State Model

Sites uses four identities:

```text
local source
  -> source repository commit SHA
  -> saved version ID and version number
  -> deployment ID and production URL
```

The local `.openai/hosting.json` stores only the hosted project ID and optional logical D1/R2
binding names. Runtime values stay in the control plane. Saved versions and deployments are separate
so a user can create a reviewable candidate without making it live.

The model is careful because Sites owns a source repository and accepts a packaged build artifact.
It must prove that the repository commit and archive are the same release.

## How Samebase Is Organized Today

### Plugin bundle

The installed `samebase@samebase` plugin contains:

- `.codex-plugin/plugin.json`;
- `.mcp.json` pointing to `https://api.samebase.com/mcp` with OAuth;
- one icon;
- one 25-line `samebase` skill.

It has no `.app.json`, local MCP server, scripts, references, starter, or distinct build and hosting
skills. Its trigger description focuses on creating or opening a Samebase app and then continuing in
the local GitHub repository. It does not claim the general website, dashboard, portal, game, or
internal-tool workflow that Sites claims.

The current Codex task surfaced the Samebase skill but no callable Samebase MCP tools, even though
the plugin is installed and its remote OAuth server is enabled in the CLI. That may be an
authentication or capability-loading condition, but it is a real fresh-task integration case that
the plugin needs to test.

### Remote MCP and control plane

The backend is much further ahead than the plugin. `apps/samebase/convex/mcp/http.ts` implements:

- OAuth protected-resource and authorization-server discovery;
- dynamic client registration;
- authorization code plus PKCE;
- scoped grants, refresh tokens, hashed token storage, and audit rows;
- `tools/list` filtered by both the grant and the user's current access;
- `tools/call` with the same current-access recheck.

The action catalog currently contains 14 tools:

| Lifecycle group                      | Tools                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and browser handoff   | `samebase_auth_getAuthenticationStatus`, `create_browser_handoff`                                                                                                 |
| App inventory and provisioning state | `vault_dashboard_getUserVaults`                                                                                                                                   |
| Create and import                    | `vault_actions_createRepository`, `vault_actions_connectRepository`                                                                                               |
| Provider discovery                   | `vault_convex_listProjects`, `vault_cloudflare_listAccounts`, `vault_cloudflare_listWorkers`                                                                      |
| Attach existing resources            | `vault_convex_connectExistingProject`, `vault_cloudflare_connectExistingWorker`                                                                                   |
| Wire, verify, and repair             | `vault_cloudflare_wireBuilds`, `vault_cloudflare_wireConvexBuildAccess`, `vault_cloudflare_verifyInfrastructure`, `vault_actions_retryInfrastructureProvisioning` |

The contracts are a strong foundation. One contract owns each action's access key, Convex
validators, MCP metadata, annotations, generated docs, `llms.txt` entry, and ChatGPT submission
metadata. The create action already provisions the complete base: a GitHub repository and starter,
Convex dev/prod deployments, a Cloudflare Worker, Workers Builds production and preview triggers,
and the corresponding Convex deploy keys.

The inspection also found four contract-quality gaps that matter to an app-plus-skills plugin:

- `tools/list` publishes derived input schemas but not the contracts' existing structured-output
  validators (`apps/samebase/convex/mcp/http.ts:415-430`);
- the MCP server reports hard-coded version `0.1.0` while the installed plugin is `0.1.2`
  (`apps/samebase/convex/mcp/http.ts:1101-1115`);
- the plugin's `.mcp.json` note says the server creates and lists apps, which under-describes the
  current 14-tool catalog;
- degraded state returns an action ID such as `wire_builds`, while the callable MCP name is
  `vault_cloudflare_wireBuilds`, so the agent must translate between two public vocabularies.

### Current lifecycle semantics

Samebase already has a better source and version model for its product:

```text
user-owned GitHub repository
  -> branch and commit SHA
  -> Workers Build plus Convex deployment
  -> preview or production URLs
```

It should not add an internal source repository, tar archive, or synthetic version number merely to
look like Sites. A Git commit is the saved version. A pull-request branch is the review candidate. A
default-branch commit is the production candidate. Samebase's missing control-plane noun is the
commit-scoped deployment that combines frontend and backend status.

Today, provisioning records success after it requests the initial Cloudflare build, not after it
observes a successful deployment. `apps/samebase/convex/cloudflareResources.ts` triggers the build,
then `apps/samebase/convex/appProvisioningWorkflow.ts` can report that app infrastructure is ready.
That is valid infrastructure-provisioning state, but it is not equivalent to Sites' terminal
deployment state. The new deployment noun must keep those states separate.

## Side-By-Side Assessment

| Concern          | Sites 0.1.27                                           | Samebase today                                                                     | Recommended Samebase target                                            |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Plugin trigger   | Broad app/site vocabulary                              | Narrow create/open vocabulary                                                      | Match the broad user intents                                           |
| Workflow         | Separate build and host skills                         | One short handoff skill                                                            | Add `samebase-building` and `samebase-hosting`                         |
| Starter          | Bundled and initialized locally                        | Seeded into the new GitHub repo                                                    | Keep `samebase/app` as the single source and clone the created repo    |
| Source ownership | OpenAI-managed source repository                       | User-owned GitHub repository                                                       | Keep GitHub ownership                                                  |
| Version identity | Opaque version ID plus number and commit SHA           | Git commit SHA                                                                     | Keep commit SHA; do not invent a second version system                 |
| Deployment       | Explicit save, deploy, and status tools                | Push-driven Workers Builds; provisioning success does not prove deployment success | Add commit-scoped deployment status and hosting workflow               |
| Backend          | D1 and Drizzle                                         | Convex                                                                             | Keep Convex                                                            |
| Blob storage     | R2                                                     | No universal plugin rule                                                           | Add only when the product needs blobs                                  |
| Authentication   | Workspace headers and SIWC, plus hosting access policy | Convex Auth direction is still open in the starter                                 | Decide a private-by-default app access contract before claiming parity |
| Runtime values   | First-class environment get/update tools               | Build keys are wired, generic values remain provider-direct                        | Add app-scoped frontend/backend runtime value tools                    |
| Domains          | First-class domain lifecycle tools                     | Provider-direct guide only                                                         | Add app-scoped domain tools if substitution is the goal                |
| Design choice    | Local image-picker MCP                                 | None in plugin                                                                     | Reimplement the interaction independently after the core path works    |
| App distribution | First-party app connector plus skills                  | Remote OAuth MCP plus skill                                                        | Submit the production MCP as an app-plus-skills plugin                 |

## What "Replace Sites With Samebase" Must Mean

Codex has no documented plugin inheritance or `replaces` mechanism. Exact MCP tool names do not form
a compatibility interface. The plugin mention selects a bundle, skills describe the workflow, and
tool metadata lets the model choose operations.

The useful compatibility test is therefore semantic:

```text
[@Sites] Build and publish this app
[@Samebase] Build and publish this app
```

Both prompts should finish with a working application and production URL. Their internal traces
should differ. Sites may save an archive-backed version. Samebase should create or open the real
GitHub repository, work locally, commit and push, observe Workers Builds and Convex, then return the
deployment URL.

State continuity matters more than names. Every stage needs deterministic structured output for:

- app ID;
- repository URL and default branch;
- provisioning run and current step;
- commit SHA;
- preview or production environment;
- frontend and backend deployment status;
- preview and production URLs;
- the exact next repair action when degraded.

## Product-Boundary Conflict

RFC 093 currently says Samebase wraps provider joins, registry writes, and learned failure modes,
while logs, environment variables, migrations, and custom domains stay provider-direct. Its
non-goals explicitly say Samebase MCP complements official provider tools and never substitutes for
them.

That boundary is coherent for a thin operations registry. It is not coherent with the proposed
Sites-substitute promise. A user who selects only Samebase cannot finish common Sites tasks if the
workflow stops and asks for another plugin or CLI to configure a runtime value, verify deployment,
or attach a domain.

The exact recommended boundary is:

> Samebase owns app-scoped lifecycle operations for a repository, Convex deployment, and Cloudflare
> Worker already joined in the Samebase registry. Generic provider administration and deep provider
> operations remain provider-direct.

This allows deployment status, app environment values, access, and app domains without turning
Samebase into a replacement Cloudflare or Convex console. Logs, arbitrary data queries, schema
migrations, queues, cron configuration, account-wide resource creation, and unrelated provider
resources remain out of scope.

## Recommended Target Architecture

### 1. Make the plugin carry the complete journey

In the `samebase/agent-plugins` repository:

- replace the single generic skill with `samebase-building` and `samebase-hosting`;
- broaden discovery to websites, dashboards, portals, trackers, games, and internal tools;
- route new and existing repositories separately;
- encode setup, clone, `pnpm dev`, preview, implementation, validation, commit, push, deployment
  observation, and live URL handoff;
- add focused references for the Samebase stack, persistence, authentication, Git handoff, previews,
  and hosting;
- keep the starter in `samebase/app` instead of embedding a second copy in the plugin;
- add deterministic scripts only where prose cannot safely reproduce the operation;
- add MCP server `instructions` that summarize the cross-tool workflow and constraints.

Use the Sites workflow as a behavioral checklist, not as source material.

### 2. Add a small user-facing MCP facade

Build the facade from the existing action-contract base rather than adding a parallel catalog:

| New semantic operation  | Purpose                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `get_account_readiness` | Report Samebase auth plus GitHub, Convex, and Cloudflare connection readiness before creation                           |
| `create_app`            | Choose stable provider names from one app name unless the user overrides them, then start the existing managed workflow |
| `list_apps`             | Return a concise app list with IDs, repository URLs, deployment summary, and live URL                                   |
| `get_app`               | Return one app's focused state, resources, current commit, URLs, and exact repair action                                |
| `get_deployment_status` | Return a commit-scoped aggregate of Workers Build and Convex deployment state                                           |

The existing detailed tools remain useful for attach and repair. The facade removes the current
requirement for users to supply four provider-specific names and avoids forcing agents to parse the
very large `get_user_vaults` result for a single app.

Every write should return structured state. The current create tool returns only `vaultId` and
`runId`, and several repair tools return confirmation text only. The Sites tools consistently return
the identifiers needed by the next call.

Publish the existing structured-output validators through MCP metadata where the client supports
them. Generate the server version, plugin capability summary, and action-name mapping from the same
contract catalog so the plugin cannot drift behind the backend.

### 3. Model deployment around Git

Do not create `save_version` merely for naming parity.

- saved version: a Git commit;
- reviewable candidate: a branch or pull request commit;
- production candidate: a default-branch commit;
- deployment: a commit-scoped aggregate with component states;
- rollback: redeploy or revert to a chosen commit through Git and Workers Builds.

The hosting skill should commit and push the exact validated source, then call the focused
deployment read until the frontend and backend reach a terminal state. This preserves the strongest
Samebase property: source and release provenance remain in the user's repository.

### 4. Close the real parity gaps

After the build-to-URL path is reliable, add app-scoped contracts for:

1. frontend and backend runtime values, including secret redaction and revision state;
2. custom-domain add, list, refresh, and remove;
3. deployed-app access policy;
4. preview and production deployment history by commit;
5. a private deployment path that does not require the user to make an unfinished app public.

Access is the largest blocker. A private GitHub repository does not make its Worker private. Sites
defaults to narrow visitor access and has a dedicated owner-only deployment path. Samebase should
not claim drop-in parity until its starter and control plane have a deliberate private-by-default
visitor model. The preferred direction is an app-owned Convex Auth gate rather than hiding this
inside plugin prose, but that needs its own accepted product contract.

### 5. Use the official app submission path

OpenAI's current submission guidance says to submit the production MCP server itself rather than
trying to submit a plugin that references an existing published app. The portal scans the server's
tools and metadata. Samebase already generates `chatgpt-app-submission.json` from its contract
catalog, which is the right foundation.

After the MCP-backed app is accepted, package the approved app surface with the two workflow skills.
Do not fabricate or hard-code a Sites-style connector ID during local plugin development.

## Rollout Order

1. **Plugin parity first:** two skills, broad triggers, references, complete Git-to-live workflow,
   fresh-install OAuth test.
2. **Focused reads and structured outputs:** readiness, app detail, deployment status, URLs, and
   repair continuity.
3. **App-scoped hosting controls:** environment values, domains, access, deployment history.
4. **Design interaction:** independent three-option picker only after the core path is dependable.
5. **Submission and eval:** app-plus-skills submission, then identical-prompt tests with only the
   plugin mention changed.

This order reuses the existing provisioning research immediately. It avoids holding plugin quality
hostage to every future provider operation.

## Acceptance Tests

Run each test from a fresh task with only the named plugin enabled and connected:

1. Build and publish a public one-page site. Samebase returns the GitHub repository and production
   URL.
2. Build a persistent dashboard. Samebase chooses Convex, validates locally, pushes the exact
   commit, and reports both deployment components.
3. Open an existing Samebase app, change it, create a preview, and return the preview URL.
4. Save work without production deployment. The result is a commit or review branch, not a live
   release.
5. Add one runtime secret without exposing its value in tool output or logs.
6. Attach a custom domain and report the exact validation state.
7. Keep an unfinished deployment owner-only, then widen access only after explicit approval.
8. Install Samebase in a clean Codex host, complete OAuth, and verify that the MCP tools surface in
   the same task.
9. Delete the Samebase account and confirm that the user-owned GitHub, Convex, and Cloudflare app
   continues serving.

The primary eval should use paired prompts where only `[@Sites]` changes to `[@Samebase]`. Success
is equivalent user-visible completion, not identical internal calls.

## Final Recommendation

Adopt "Samebase is the user-owned-stack substitute for Sites" as the target. Mirror Sites at the
workflow and safety-contract level, preserve Git commits and Workers Builds as Samebase's native
release model, and revise RFC 093 only enough to let Samebase finish app-scoped hosting work itself.

The first implementation should be the plugin workflow, not a new provisioning engine. The engine
already exists. The highest-leverage backend additions are focused app/deployment reads and
structured outputs that let the workflow continue deterministically.
