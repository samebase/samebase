# Samebase Codebase Simplification Audit

## Document Control

- Status: Research
- Owner: Nicu Chiciuc
- Created: 2026-07-10
- Measurement commit: `9ad9acc2` (`origin/main`, after PR #1192)
- Scope: Product boundary, frontend and backend organization, Convex data model, TypeScript
  complexity, CI, observability, automation, and dependency carrying cost
- Related direction: [`main_idea.md`](../main_idea.md),
  [`rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md`](../rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md)
- Excluded while active: the agent browser handoff and MCP OAuth hardening owned by session
  `019f435c-77e8-7be1-b8af-78c50972b0df`. That work was reviewed as a boundary, not modified, and
  later merged in [PR #1192](https://github.com/samebase/samebase/pull/1192).

## Executive Finding

Samebase currently carries two products:

1. A GitHub, Convex, and Cloudflare provisioning and repair control plane.
2. A browser IDE with repository mirroring, collaborative editing, chat, hosted execution, embedded
   provider data tools, experimental navigation, and design laboratories.

The first product matches the latest strategy. The second is a legacy product plus several
experiments. Keeping both makes every layer harder: the frontend shell, route model, access keys,
backend schema, deletion workflow, privacy policy, dependencies, CI, and documentation all describe
far more than the current product needs.

The recommended boundary is one product:

> A phone-friendly provisioning, registry, monitoring, and repair control plane whose operational
> actions are available through the same small agent-facing contract catalog.

Delete code authoring, repository content mirroring, hosted compute, embedded provider consoles,
data exploration, design playgrounds, and hidden feature-flagged implementations. Git history is the
recovery mechanism. Do not keep dormant runtime quarantine.

The pattern-based footprint of the questioned surfaces is about 98,600 lines across 336 files. The
patterns overlap, so this is not a promised deletion diff. A realistic net reduction is 80,000 to
90,000 lines after adding a simpler responsive shell and retaining static brand assets.

## Method

The audit used:

- Static inspection of application, Convex, package, test, workflow, script, spec, RFC, research,
  and generated-code boundaries.
- Git history and churn from 2026-06-10 through 2026-07-10.
- Read-only production aggregate queries. No row contents, credentials, or user data were included
  in this report.
- The deployed signed-in product surface, inspected read-only. The production dashboard currently
  exposes both the control plane and the full editor.
- The last 100 `main` CI runs and the current worktree inventory.
- Official Cloudflare and Convex documentation for deployment and observability behavior.
- Four independent sidecar audits: product boundary, data model, TypeScript and organization, and
  tooling and monitoring. A fifth adversarial review argued the strongest case against deleting
  FileView before the final recommendation was made.

## Measured Baseline

| Measure                                                               | Current value |
| --------------------------------------------------------------------- | ------------: |
| Tracked files                                                         |         1,734 |
| Tracked TypeScript and JavaScript lines                               |       370,132 |
| Production-like TypeScript lines, excluding tests and generated files |       172,202 |
| Test TypeScript lines                                                 |        82,635 |
| Generated API, manifest, and binding lines                            |       142,673 |
| Tracked Markdown lines                                                |        78,377 |
| Samebase app tables, excluding component-owned tables                 |            48 |
| Top-level files in `apps/samebase/convex`                             |           109 |
| Explicit `route(...)` declarations                                    |            40 |

The month ending 2026-07-10 added about 115,000 lines and removed about 59,000 across 192 `main`
commits. High change velocity is not itself a problem. The problem is that parallel experiments and
superseded product directions remained live after conclusions changed.

A local production build at the measurement commit makes the carrying cost visible. It reads 362
client asset files. The largest client chunks include FileView at about 3.67 MB raw, ProseMark at
about 557 KB, Three.js at about 515 KB, and the visual fixture at about 221 KB. Code splitting
reduces initial transfer, but it does not reduce maintenance, dependency, test, or security surface.

## Product Boundary

### Keep

- Public landing, receipts, action docs, pricing, legal, and authentication.
- Provider connection and health for GitHub, Convex, and Cloudflare.
- Create or import an app; attach provider resources; wire builds and deploy keys; verify; retry;
  delete.
- A repository and app registry.
- Branch, pull request, check, preview, deployment, and provisioning status.
- Direct links to GitHub, Convex, and Cloudflare consoles.
- The small action catalog shared by UI, generated docs, and MCP.
- Connected machines and the browser handoff from PR #1192.
- Static SVG and PNG brand assets.

### Delete

1. **Chat, Agent Graph, and Codespaces.** `CHAT_ENABLED` and `CODESPACES_ENABLED` are false.
   Production has no app-owned Codespaces, agent thread context, chat metadata, graph layout, or AI
   production access rows. Component-owned Agent data still needs an inventory and bounded cleanup.
   The `.codespace-agent` subsystem is also an untyped command execution and file mutation server on
   a publicly forwarded port. Remove the routes, Convex functions, tables, component, dependencies,
   feature flags, privacy text, tests, and server.
2. **Embedded Convex database and schema tools.** These routes mint elevated deploy keys, embed a
   provider data surface, sample schema state, and store snapshots. The current direction explicitly
   refers day-two provider operations to provider consoles and CLIs. Keep the existing Convex
   dashboard links.
3. **Interactive logo rendering and logo laboratories.** Keep the accepted static assets. Replace
   runtime logo call sites with static images, then remove Three.js, raster seam studies, voxel
   controls, transitions, URL serialization, prehydration, and eight lab routes.
4. **The custom route URL editor.** It is mounted around every route and contributes 7,129
   editor-exclusive tracked lines, with 40 type aliases, 231 functions, 13 effects, 30 callbacks,
   generic dispatch suppression, touch previews, restoration rules, and query metadata. Replace it
   with normal browser navigation. If installed PWA navigation needs chrome, keep only Back,
   Forward, Refresh, and a read-only location.
5. **Workspace V3 and the Solid layout lab.** V3 is an unmounted copy of V2, including 2,149 lines
   that are byte-equivalent after mechanical renaming. The Solid package has no product consumer and
   carries its own dependency graph.
6. **Pitch, Codex research, storage inspector, and production visual-fixture routes.** Research and
   test harnesses should not be application features. Keep only honest route-level test harnesses
   needed by current product behavior.
7. **FileView and repository content mirroring.** Remove the editor, staging and collaboration
   model, full Git tree storage, media upload, compare and rebase engine, multiple editor stacks,
   developer tools, and dashboard entry links. Replace `Edit` and `View changes` with GitHub branch
   and pull request links.

### Why FileView Is Still a Delete

FileView was the only disputed recommendation. The strongest evidence for keeping it is real:

- The operator interview says the branch editor is used.
- The pricing page merged after the strategy pivot and names FileView as the future metered feature.
- The dashboard deliberately routes default branches to `Edit` and other branches to `View changes`.

That evidence proves personal usefulness and a pricing hypothesis, not product demand. The evidence
is mixed, but the carrying cost and current product direction lead to this recommendation:

- The current strategy says serious development remains in the user's coding agent or local repo.
- There are no external users.
- Production has two staging rows, neither representing a changed, renamed, deleted, binary, or
  uploaded file; five blobs; one folder preference; and zero collaborative updates.
- The surface owns roughly 29,500 direct lines across about 100 files before shared dashboard and
  deletion code. It also owns repository-content storage, privacy obligations, merge and rebase
  correctness, several editor frameworks, and a known document-size defect.
- GitHub, local editors, and coding agents already cover the workflow that Samebase would need to
  make exceptional before charging for it.

Keeping this system for a future paid feature is speculative future-proofing. The recommendation is
to delete it. Because it removes functionality the operator personally uses and reverses a public
pricing statement, Phase 2 must begin with an explicit operator product decision before the first
FileView deletion PR. If users later prove a need for phone editing, rebuild only the proven
workflow from a clean boundary. Remove the current pricing promise at the same time.

## Correctness and Safety Findings

### Worker build commands could deploy during build

Both auxiliary Worker packages used `wrangler deploy` as their build script. Cloudflare Workers
Builds runs the build command before its configured deploy command, so a branch build could deploy
before the preview upload. [PR #1193](https://github.com/samebase/samebase/pull/1193) changes build
to `wrangler deploy --dry-run` and documents the invariant. This matches Cloudflare's
[build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) and
[build branch](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/) behavior.

### Production Worker logs were disabled

All three Wrangler files asked nested logs to persist while setting top-level
`observability.enabled` to false. Cloudflare documents that setting `enabled` to true is what causes
Worker logs to be persisted. [PR #1194](https://github.com/samebase/samebase/pull/1194) enables logs
at full sampling while traffic is low and leaves traces disabled. It should merge after PR #1193.
See Cloudflare's
[Wrangler observability configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#observability).

### File staging can exceed the Convex document limit

The staging path permits about 900 KB of inline text, then stores it twice as current and initial
content in one document. If FileView were retained, this would need a discriminated row with one
content value and one base revision or blob reference. Deleting FileView removes the defect and the
associated storage model.

### Blob ownership is inconsistent

Blobs are looked up globally by SHA but deleted as vault-owned resources. A globally shared cache
needs reference counting or garbage collection. A vault-owned resource needs `(vaultId, sha)`
identity. The current table is both. Delete it with FileView.

### Machine token rows grow without bound

Machine control tokens expire after 15 minutes, but issuance inserts a new row and introspection
only rejects expired rows. Production contains 3,715 machine control tokens, all expired, plus 12
expired registration requests. Connected machines remain in the target product, so this is not
removed by the product cleanup.

Start with bounded expiry cleanup that preserves concurrent-tab semantics. Two tabs currently cache
independent short-lived tokens, so enforcing one active token per user and machine would make them
invalidate each other. Decide singleton semantics separately. Delete expired and
ownership-invalidated tokens in bounded batches, then add an age and cardinality alert.

### Vault deletion is not a proven ownership boundary

The deletion workflow omits at least repository refresh requests and can leave component-owned chat
records behind. Folder state can also be recreated during deletion. Feature deletion removes much of
this surface. Before feature removal starts, the retained model needs a table ownership manifest
that classifies every table as delete, detach, or preserve, gates writers during deletion, and fails
when a new table is unclassified.

## Target Data Model

The current naming and joins obscure the real nouns. A `vault` is a repository. A `vaultApp` is a
deployable root inside that repository. Provider rows duplicate `vaultId`, `userId`, and `appRoot`
instead of referencing the app record.

Use these nouns after feature deletion:

| Noun             | Owns                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| `user`           | Provider connections, connected machines, sparse account preferences         |
| `repository`     | GitHub identity, deletion boundary, current refresh metadata                 |
| `app`            | Repository root plus optional Convex and Cloudflare provider state           |
| `branch`         | Replaceable dashboard cache for branch, PR, check, commit, and preview state |
| `operationRun`   | Requested inputs, active workflow, lifecycle state, failure, timestamps      |
| `operationEvent` | Append-only audit history for a run                                          |
| `mcpClient`      | Registered client identity and registration lifecycle                        |
| `mcpGrant`       | User approval, scopes, token family, audit, and browser handoff lifecycle    |

`operationRun` and `operationEvent` describe an ownership family, not one mandatory generic table.
Keep provisioning and deletion shapes separate unless one physical model demonstrably removes states
and code. Do not replace two explicit workflows with an abstract workflow framework.

Retire `vault` as a UI and new-code term after the migration. The product creates and monitors apps
in repositories. Keep the physical `vaults` table and existing MCP wire fields until a dedicated
new-table and foreign-key migration earns its cost; Convex IDs are table-specific, so this is not a
folder rename.

Treat the action catalog as an external contract. `get_user_vaults` exposes repository and file
metadata, retained tools accept `vaultId`, and current tool names use the `vault_*` vocabulary.
Internal storage can resolve those fields through app IDs without changing the wire contract. Any
rename or result removal needs a separate versioned contract decision with generated docs, plugins,
tests, and consumers updated together.

Make `app` the provider-state aggregate. Current mutations already enforce at most one connected
Convex deployment and one Cloudflare Worker per app root. Inline those provider states or reference
them by `appId`; do not continue joining through duplicated `(vaultId, appRoot)` coordinates.
Operation intent belongs to the run, not permanently on the app.

Branches remain a materialized cache because the phone dashboard needs subscribed and sortable
status. A cache row must not become the source of truth for deleted-branch recovery, file drafts, or
provider ownership.

Delete these feature-owned tables only after entrypoints stop writing, production rows are cleaned,
and cleanup is verified:

- `dashboardSettings`
- `workspaceSidebarState`
- `vaultBranchFilters`
- `vaultResourceLinksState`
- `vaultConvexSchemaSnapshots`
- `vaultConvexSchemaGraphLayouts`
- `fileStaging`
- `blobs`
- `folderExpansionState`
- `agentGraphNodeLayout`
- `agentThreadContext`
- `chatMessageMetadata`
- `aiProdAccessRequests`
- `aiProdAccessAudit`
- `codespaces`
- `collaborativeUpdates`

Migrate or fold these retained-product tables through widen, dual-write, backfill, read cutover,
verification, and only then narrow:

- Fold `vaultCloudflareWorkers` and `vaultConvexDeployments` into app-owned provider state.
- Move planned inputs from `vaultInfrastructureTargets` into operation runs.
- Preserve the stale-run fencing owned by `vaultInfrastructureOwnership` in the app or active run
  before removing that table. Wait out or block active Workflows during cutover.
- Replace retained app-root and readiness consumers of `vaultBranchTrees` before deleting the tree
  cache.
- Move preview URL state from `vaultDomains` onto the retained branch cache, dual-write and refresh,
  then delete the domain table. Custom domain management is unshipped.
- Stop writing `githubCommitCheckItems`; the aggregate summary already exists on
  `githubCommitCheckSnapshots`. Either inline check and preview summary into the branch cache, or
  add repository ownership plus bounded expiry to the snapshot table.
- Move branch filters into URL or local state and resource-link disclosure into local state before
  deleting `vaultBranchFilters` and `vaultResourceLinksState`.

Billing is also unconfigured: all product IDs are empty and checkout cannot succeed. Delete Polar
billing until pricing and a billable feature exist. Remove the webhook and writers first, clear the
six optional user billing fields in bounded batches, verify no populated values remain, then remove
the fields and `by_polar_external_customer_id` index in a later deploy.

The repository refresh subsystem currently combines a Workpool job, a durable request lifecycle and
lease, and vault-level refresh lock and failure fields. It also declares unshipped demand variants
that the runner does not execute. After editor deletion, reduce this to one coordinator: Workpool
plus repository freshness, or one explicit durable request model, not both.

That cutover must quiesce Workpool: disable new enqueue, wait for or cancel active jobs, deploy
callbacks that no longer require old request rows, then clean requests and remove the old functions
and table. Queued component jobs can otherwise call removed handles after deployment.

## TypeScript and Organization

The codebase is not uniformly overengineered. The expensive generic machinery is concentrated in a
few systems, which makes deletion unusually high leverage.

### Delete exact mirrors and abandoned implementations first

- `apps/samebase/public/samebase.ts` is byte-identical to `packages/sync/samebase.ts`, both 4,449
  lines. Vite already serves and emits the canonical package source. Keep one source and generate
  the public artifact during build.
- Delete Workspace V3, the Solid package, dead workspace sidebar utilities, and unused declaration
  mirrors.
- Delete `trackedFilePath` and its generated union of every tracked repository path. Runtime file
  existence at the few important script boundaries is simpler and more truthful.

These low-risk removals total about 15,000 tracked lines before the route URL editor is considered.

### Delete `@samebase/sure`

The package is about 3,700 lines and has only seven non-MCP production consumers. It contains
unfinished APIs such as `spread_NOT_IMPLEMENTED`, `meta_wip`, TODO-heavy generic code, all
production `any` occurrences in the package, and most of its type suppressions. Zod is already
installed and used at provider boundaries.

Use direct Convex validators at Convex boundaries, Zod for external data where it is already the
local vocabulary, and small direct parsers for route search. Do not replace Sure with another
general validation framework.

### Prune `@samebase/dependent`

Keep the few honest helpers that quarantine TypeScript gaps: `guard`, `includes`, `notEmpty`,
`isRecord`, `keys`, `entries`, `fromEntries`, and `pick`. Delete unused arity, tuple, promise,
timeout, testing, and typo-compatible exports. The package should be a small vocabulary, not a type
utility collection.

### Replace the Convex function type facade

The current facade reproduces 117 lines of Convex generic types and ends with three
`@ts-expect-error` assignments. There are 157 production registrations through the custom builders,
but only six are public and every public registration is a query.

Keep authenticated `query`, `mutation`, and `action` builders that require a real access key. Add a
single `publicQuery` builder for public reads. Let `convex-helpers` infer one concrete context per
builder. Remove `requiredAccess` from `ctx.viewer`, pass the policy directly to attribution, and
delete the hand-copied generic facade. Keep the small capability-key access model, then shrink its
keys as deleted features disappear.

Keep the action catalog as plain, explicit data for the small set of public operational actions. It
earns its existence by feeding MCP and generated action docs. Do not turn every Convex function into
an action contract and do not add another schema language.

### Make workspace geometry per-device

Pixel widths, the selected mobile pane, and merged mobile geometry vary by device. Persist them in
local storage, not Convex. This deletes about 620 to 700 lines and the `workspaceSidebarState` table
while keeping prehydration. The current `workspaceKey` dimension is speculative anyway: production
has one call site and always passes `app`.

### Organize only after deletion

Moving the current 109 top-level Convex files into folders would create a large diff while
preserving the wrong system. Delete first, collapse the model, then organize the retained code
around product nouns:

```text
apps/samebase/convex/
  auth/
  repositories/
  apps/
  operations/
  providers/
    github/
    convex/
    cloudflare/
  machines/
  mcp/
  settings/

apps/samebase/src/
  public/
  shell/
  dashboard/
  providers/
  machines/
```

Do not add service, repository, domain, DTO, adapter, or factory layers. Folder names should state
ownership. Functions should stay close to their validators, provider calls, and tests.

## CI, Automation, and Monitoring

### Move browser failures before merge

Playwright and Windows jobs run only after a commit reaches `main`. In the rolling sample captured
on 2026-07-10, 31 of the last 100 `main` CI runs failed and 28 of those failed runs contained a
failed Playwright job. The current process discovers a large class of browser regressions after
merge.

Move the canonical Linux Playwright run to pull requests, add workflow concurrency with cancellation
for superseded commits, and stop duplicating the suite on every `main` push once the PR gate is
stable. This changes when the same validation runs, not whether it runs. Keep genuinely slow GPU
stress in a nightly lane. Run supply-chain validation in parallel with useful checks.

The current GitHub ruleset does not require a pull request or any status check. Workflow placement
alone is therefore a process convention, not a hard gate. After the pull-request lane proves stable,
require the existing `ci (24.x)` aggregate and pull requests in the ruleset as a separate governance
change.

Root checks currently omit shipped workspaces and run some package tests twice. Give each retained
workspace one `check` script and enumerate workspaces from the workspace graph rather than a manual
allowlist.

### Stop automation from retaining worktrees

The schema drift automation has retained 15 worktrees using about 22.5 GB. Git knows about 49
worktrees and 115 local branches; at least 18 branch worktrees already point to branches merged to
`main`.

During this audit, the existing recurrence was corrected from every day of the week to Sunday only.
That stops the accidental daily cadence but does not remove accumulated worktrees or make successful
no-op runs ephemeral.

Move schema drift verification to a scheduled GitHub Actions runner. It needs two verification
commands and should open a branch or issue only when drift exists. Add a read-only maintenance
report for worktree disk use, merged or closed-PR worktrees, stale branches, and expired checkpoint
refs. Cleanup must continue through the provider-safe `clean` workflow.

### Replace the SSR canary

The SSR workflow force-pushes a permanent branch after each `main` update. Its PR remains open and
unstable even when the synchronization workflow succeeds. Replace it with a focused SSR build job
that produces one actionable required or nightly signal.

### Prefer native observability

- Keep Cloudflare Workers Logs enabled after PR #1194.
- Configure Convex native PostHog exception reporting and, if the plan supports it, the native log
  stream. Do not create a custom logging framework.
- Use a small structured event object for the production `console` calls that remain after feature
  deletion.
- Add read-only integrity reports for orphaned provider resources, incomplete deletion ownership,
  expired machine tokens, refresh backlog age, and table cardinality.
- Configure provider spending thresholds and budget alerts while traffic is low.

## Rollout

### Phase 0: Immediate safety

1. Merge PR #1193.
2. Merge PR #1194 after it.
3. Add the deletion ownership manifest, classify every retained table, and gate writers during
   deletion before removing feature entrypoints.
4. Add bounded machine token expiry cleanup without changing concurrent-tab semantics.
5. Move Playwright validation to pull requests with concurrency cancellation.

### Phase 1: Exact deletion wins

1. Merge [PR #1195](https://github.com/samebase/samebase/pull/1195), which deletes the tracked sync
   script mirror and emits the hosted artifact from the canonical package source.
2. Delete Workspace V3 and the Solid lab.
3. Delete dead workspace utilities, unused dependencies, stale declarations, and `trackedFilePath`.
4. Align Wrangler and pnpm versions, and make release-age exception expiry fail CI.

### Phase 2: Remove non-product surfaces

1. Record the explicit operator decision on FileView deletion because this reverses personally used
   behavior and the current pricing statement.
2. Replace dynamic logos with static assets, then delete logo labs and Three.js.
3. Stop chat and Codespaces writers, clean app-owned and Agent component data in bounded batches,
   clear `activeCodespaceId` and related compatibility fields, verify, then delete chat, Agent
   Graph, Codespaces, and `.codespace-agent` entrypoints.
4. Delete embedded database and schema routes while preserving provider-console links.
5. Delete FileView and replace dashboard edit links with GitHub and PR links.
6. Delete the route URL editor and replace the three-pane workspace shell with a conventional
   responsive shell.

Keep schemas temporarily widened until production cleanup succeeds. Do not mix route deletion and
destructive data narrowing in one deploy.

Preserve PR #1192 as an explicit invariant throughout this phase: `/agents/connect`,
`/oauth/mcp/consent`, handoff prehydration and no-store headers, MCP grant revocation UI, and the
current `/vault/` default return path must keep working. Move its grant visual coverage from the
generic visual fixture to the real Providers route before deleting that fixture. Sure, function
builder, shell, and route-search changes that touch MCP or handoff code need isolated PRs with the
full spec 111 validation matrix.

### Phase 3: Collapse the data model

1. Finish bounded cleanup for removed feature data, including Agent component threads before
   removing the Agent component.
2. Make app the provider-state aggregate using widen, dual-write, backfill, read cutover, verify,
   and narrow. Preserve latest-run fencing and wait out active Workflows.
3. Move branch preview and check summary state into the branch cache or add explicit ownership and
   expiry to the retained snapshot.
4. Replace retained app-root and readiness reads of the tree cache, then remove it.
5. Remove Codespaces and devcontainer compatibility fields. Preserve user ownership, deletion, and
   refresh timestamps, failure, and cooldown as explicit repository state.
6. Collapse repository refresh to one coordinator after disabling enqueue and quiescing Workpool.
7. Narrow the schema and remove unused Convex components.

### Phase 4: Simplify TypeScript and organize

1. Delete Sure and prune Dependent.
2. Replace the Convex function generic facade.
3. Move retained backend code into noun-owned folders.
4. Rename UI and new-code vault terminology to repository and app. Keep physical table and MCP wire
   identifiers until a separately designed foreign-key migration.
5. Rewrite README and current specs to describe only shipped behavior; archive superseded material
   in small batches.

## Rules for the Cleanup

- Delete before splitting giant files. A well-factored obsolete subsystem is still obsolete.
- Do not preserve app-internal compatibility shims. Published HTTP, MCP, and provider wire contracts
  are external boundaries and change only through explicit migration or versioning.
- Do not create generic framework code to make deletion easier.
- Each PR should remove one coherent boundary and its tests, dependencies, routes, docs, and tables
  when safe.
- Keep schemas widened until data cleanup is proven, then narrow in a later deploy.
- Every retained table must have one owner and one deletion policy.
- Every retained state field must change a current product decision or user-visible status.
- Prefer provider-native logs, consoles, CLIs, and MCP servers over Samebase replicas.

## Conclusion

The codebase does not need a general reorganization project. It needs a product deletion project,
then a small data-model rewrite, then ordinary organization.

The highest-value outcome is not a prettier folder tree. It is removing the browser IDE and its
adjacent experiments so that one person can hold the whole retained system in their head: users own
provider connections; repositories own GitHub identity and cached status; apps own their Convex and
Cloudflare state; operations own lifecycle and audit; machines provide remote control; MCP exposes
the same small action set as the dashboard.

That is the system Samebase's current direction already describes. The cleanup makes the code match
it.
