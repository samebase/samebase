# Sites Plugin Lessons For Samebase

- Status: research
- Date: 2026-07-16
- Sites snapshot: `sites@openai-bundled` 0.1.27
- Samebase snapshot: `samebase@samebase` 0.1.2 and `origin/main` at `a87101a5`
- Official references: [Sites](https://learn.chatgpt.com/docs/sites),
  [plugin structure](https://learn.chatgpt.com/docs/build-plugins#plugin-structure),
  [skills and plugins](https://learn.chatgpt.com/docs/skills-and-plugins), and
  [plugin submission](https://learn.chatgpt.com/docs/submit-plugins)

## Executive Conclusion

Samebase should treat Sites as a high-signal, continuously evolving reference for how a first-party
Codex plugin should be packaged and operated. Sites has dedicated product placement, broad
distribution, and feedback signals that Samebase cannot reproduce. Its stack-neutral decisions are
therefore valuable upstream research.

The goal is not full substitution or feature parity. Samebase does not need to handle every prompt
that Sites handles, expose the same tool inventory, or reproduce Sites' hosting control plane. The
goal is to follow the same quality bar inside Samebase's own scope:

- broad and accurate plugin discovery;
- progressive workflow instructions split by responsibility;
- deterministic local mechanics behind small scripts;
- clear handoffs between local work, source control, and the remote control plane;
- strict tool metadata, structured continuity, safety defaults, and user-facing communication;
- a versioned process for rechecking what Sites changes over time.

Samebase should keep its distinct product model:

- the source is a GitHub repository the user owns;
- a Git commit is the version identity;
- Convex owns durable application data and backend functions;
- Cloudflare Workers owns delivery;
- Workers Builds turns Git pushes and pull requests into production and preview deployments.

The immediate gap is mostly plugin packaging. Sites carries a detailed product workflow, a starter,
references, deterministic scripts, a small interaction MCP server, and a first-party app connector.
Samebase carries one 25-line skill and its remote MCP declaration even though the Samebase backend
already has a substantial OAuth, provisioning, inventory, and repair control plane.

Sites should not be treated as a feature backlog. RFC 093's provider boundary remains coherent:
Samebase wraps provider joins, registry writes, and learned failure modes, while routine provider
operations stay provider-direct unless an independent Samebase product need justifies changing that
boundary.

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

| Concern          | Sites 0.1.27                                           | Samebase today                                                                     | Lesson for Samebase                                                                 |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Plugin trigger   | Broad app/site vocabulary                              | Narrow create/open vocabulary                                                      | Expand only to user intents the Samebase workflow can actually complete             |
| Workflow         | Separate build and host skills                         | One short handoff skill                                                            | Add `samebase-building` and `samebase-hosting`                                      |
| Starter          | Bundled and initialized locally                        | Seeded into the new GitHub repo                                                    | Keep `samebase/app` as the single source and clone the created repo                 |
| Source ownership | OpenAI-managed source repository                       | User-owned GitHub repository                                                       | Keep GitHub ownership                                                               |
| Version identity | Opaque version ID plus number and commit SHA           | Git commit SHA                                                                     | Keep commit SHA; do not invent a second version system                              |
| Deployment       | Explicit save, deploy, and status tools                | Push-driven Workers Builds; provisioning success does not prove deployment success | Make the skill prove the outcome; add a Samebase read only if the registry needs it |
| Backend          | D1 and Drizzle                                         | Convex                                                                             | Keep Convex                                                                         |
| Blob storage     | R2                                                     | No universal plugin rule                                                           | Add storage only when the product needs it                                          |
| Authentication   | Workspace headers and SIWC, plus hosting access policy | Convex Auth direction is still open in the starter                                 | Borrow fail-closed and narrow-access principles, not the Sites identity model       |
| Runtime values   | First-class environment get/update tools               | Build keys are wired, generic values remain provider-direct                        | Keep provider-direct unless an independent Samebase requirement justifies a wrapper |
| Domains          | First-class domain lifecycle tools                     | Provider-direct guide only                                                         | Keep provider-direct and improve the agent handoff                                  |
| Design choice    | Local image-picker MCP                                 | None in plugin                                                                     | Adopt later only if it improves Samebase's real workflow                            |
| App distribution | First-party app connector plus skills                  | Remote OAuth MCP plus skill                                                        | Submit the production MCP as an app-plus-skills plugin                              |

## The Correct Analogy

Codex has no documented plugin inheritance or `replaces` mechanism. Exact MCP tool names do not form
a compatibility interface. More importantly, Samebase does not need one.

Sites should be treated as upstream product research for:

- how plugin descriptions capture user intent;
- how large workflows are split across skills;
- what belongs in prose, references, scripts, templates, a local MCP server, or a remote app;
- how local source state is tied to remote actions;
- how tool descriptions carry cross-tool invariants;
- where explicit approval, narrow access, polling, and terminal-state checks appear;
- how much deployment machinery should stay out of user-facing communication.

Samebase should be close in form and rigor, not compatible in scope. Its normal flow still needs
deterministic continuity across the app ID, repository, provisioning run, commit, provider state,
URLs, and exact repair action. That continuity can use different tools and stop at a different
provider boundary.

## RFC 093 Still Holds

RFC 093 says Samebase wraps provider joins, registry writes, and learned failure modes, while logs,
environment variables, migrations, and custom domains stay provider-direct. The Sites inspection
does not invalidate that decision.

Sites owns its hosting control plane, so environment, domain, and access operations naturally appear
there. Samebase deliberately puts the running resources in the user's GitHub, Convex, and Cloudflare
accounts. Its plugin can follow Sites' handoff quality while still teaching the agent to use the
correct provider tool or CLI for routine provider work.

An operation should enter the Samebase MCP only when it independently passes RFC 093's existing
test: it joins providers, keeps the durable registry truthful, or encodes a learned failure mode.
The 19 Sites connector tools are evidence about tool design, not a Samebase backlog.

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

### 2. Make the existing MCP contract legible to the plugin

Improve the current action-contract base before adding new operations:

- fix the fresh-task path where the Samebase skill surfaced but its MCP tools did not;
- generate the server version and plugin capability summary from the contract catalog;
- publish the existing structured-output validators where the MCP client supports them;
- return the repository, provider URLs, and next-call identifiers directly when current writes
  already know them;
- make the mapping from action IDs such as `wire_builds` to callable MCP names deterministic;
- keep the plugin's skill and `.mcp.json` description aligned with the live catalog.

Add focused reads or higher-level actions only when the completed Samebase workflow demonstrates a
real missing seam. Do not add a facade solely to resemble Sites.

### 3. Model deployment around Git

Do not create `save_version` merely for naming parity.

- saved version: a Git commit;
- reviewable candidate: a branch or pull request commit;
- production candidate: a default-branch commit;
- deployment: a commit-scoped aggregate with component states;
- rollback: redeploy or revert to a chosen commit through Git and Workers Builds.

The hosting skill should commit and push the exact validated source, then prove the resulting
Workers Builds and Convex state through the best available provider or Samebase read. This preserves
the strongest Samebase property: source and release provenance remain in the user's repository.

### 4. Borrow patterns, not the tool inventory

Adopt Sites patterns that apply to Samebase:

- strict opaque identifiers and source provenance;
- explicit separation between starting work and observing terminal success;
- narrow defaults and explicit approval before public external writes;
- focused communication for nontechnical users;
- local scripts for deterministic mechanics;
- a small interaction MCP only when ordinary conversation cannot express the decision well.

Do not infer that Samebase needs Sites' environment, domain, access-policy, SIWC-token, archive, or
synthetic-version operations. Evaluate each future Samebase operation against its own product need
and RFC 093.

### 5. Use the official app submission path

OpenAI's current submission guidance says to submit the production MCP server itself rather than
trying to submit a plugin that references an existing published app. The portal scans the server's
tools and metadata. Samebase already generates `chatgpt-app-submission.json` from its contract
catalog, which is the right foundation.

After the MCP-backed app is accepted, package the approved app surface with the two workflow skills.
Do not fabricate or hard-code a Sites-style connector ID during local plugin development.

### 6. Establish a version-triggered upstream learning loop

The installed Sites bundle should be treated as a moving reference, not a one-time audit. Record the
inspected version, then rerun a focused comparison whenever the installed Sites version changes.

The comparison should cover only high-signal surfaces:

1. manifest trigger vocabulary and starter prompts;
2. skill topology and cross-skill handoffs;
3. tool inventory, descriptions, annotations, and output continuity;
4. deterministic scripts, references, and starter conventions;
5. approval, privacy, and deployment-success rules;
6. app submission and Codex-native interaction patterns.

Classify each change as `adopt`, `adapt`, or `reject`, with one Samebase-specific reason. OpenAI's
distribution and ability to observe aggregate behavior make its changes a strong prior, but not
proof that every choice fits Samebase. A version-triggered audit preserves the benefit without
creating blind synchronization.

## Rollout Order

1. **Plugin architecture first:** two skills, accurate triggers, focused references, deterministic
   helpers, and the complete Samebase Git workflow.
2. **Existing MCP hardening:** fresh-task exposure, generated metadata, structured continuity, and
   truthful terminal-state reporting.
3. **Submission and eval:** ship Samebase as an app-plus-skills plugin and test its own supported
   journeys from clean tasks.
4. **Upstream learning loop:** rerun the focused audit whenever the installed Sites version changes.
5. **Optional interaction patterns:** adopt design pickers or other Sites conventions only after the
   Samebase workflow demonstrates their value.

This order reuses the existing provisioning research immediately. It avoids holding plugin quality
hostage to every future provider operation.

## Acceptance Tests

Run each test from a fresh task with the Samebase plugin enabled and connected:

1. Install Samebase, complete OAuth, and verify that the MCP tools surface in the same task.
2. Create an app, observe provisioning, clone the returned GitHub repository, and start its normal
   local development flow.
3. Change an existing Samebase app, validate it, commit and push the exact source, then distinguish
   a requested build from a successful deployment.
4. Read a degraded app state and call the exact repair operation named by the contract.
5. Ask for a provider-direct operation such as logs or a custom domain and verify that the skill
   returns the correct app coordinates and provider tool or CLI handoff without implying Samebase
   performed the operation.
6. Regenerate the action docs and submission metadata and verify that plugin-facing capability text
   matches the live catalog.
7. When Sites advances from the recorded version, rerun the focused audit and classify each material
   change as `adopt`, `adapt`, or `reject`.
8. Delete the Samebase account and confirm that the user-owned GitHub, Convex, and Cloudflare app
   continues serving.

## Final Recommendation

Adopt "Sites is Samebase's upstream plugin-design reference" as the target. Follow its latest
stack-neutral workflow, packaging, metadata, safety, and communication decisions as closely as they
fit. Preserve Samebase's GitHub, Convex, Cloudflare, and RFC 093 product boundaries.

The first implementation should improve the plugin workflow, not expand the Samebase control plane
to match Sites. The engine already exists. The highest-leverage backend work is fixing current
plugin-to-MCP exposure and metadata continuity; future tools should still earn their place through a
Samebase product need.
