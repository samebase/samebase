# 123 Repository Terminology and Data Migration Rollout

## Document Control

- Status: Active
- Owner: Samebase repository domain
- Started: 2026-09-02
- Last updated: 2026-09-03
- Current checkpoint: Production reads and writes the repository tables. All 21 old tables and the
  migration ID map are empty. Phase 6 code removal is in progress.
- Next action: Merge and deploy the Phase 6 removal after its checks pass.
- Completion rule: Update this file after each phase. Add the pull request and verification evidence
  before a phase changes to `Complete`.

This RFC is the one progress record for the rollout. Current product behavior remains in `specs/`.
This RFC records the temporary states that are necessary to reach the final product behavior.

## Outcome

Samebase will use `repository` as the product noun in the UI, URLs, MCP, code, tests, current
documentation, and Convex data model. The final system will not require a user or an agent to learn
the word `vault`.

The rollout must preserve every current user's Samebase repositories and repository data. It must
not disconnect a GitHub repository, recreate a GitHub repository, or ask a user to connect the same
GitHub repository again.

The rollout has two separate changes:

1. Change the public web language and routes. This does not change stored data or Convex IDs.
2. During a later maintenance window, copy the stored data to repository-named tables and switch the
   backend and MCP to those tables.

## Progress

| Phase | Scope                                   | Status      | Evidence                                                                                                                     |
| ----- | --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0     | Fix the language and migration contract | Complete    | This RFC                                                                                                                     |
| 1     | Change public web copy and routes       | Complete    | [PR #1570](https://github.com/samebase/samebase/pull/1570)                                                                   |
| 2     | Add dormant migration support           | Complete    | [PR #1575](https://github.com/samebase/samebase/pull/1575)                                                                   |
| 3     | Rehearse the complete cutover           | Skipped     | Operator decision on 2026-09-02                                                                                              |
| 4     | Drain, freeze, copy, and switch         | In progress | [PR #1577](https://github.com/samebase/samebase/pull/1577), [draft PR #1578](https://github.com/samebase/samebase/pull/1578) |
| 5     | Stabilize the new system                | Not started |                                                                                                                              |
| 6     | Remove old data and migration support   | Not started |                                                                                                                              |

Only one phase can be `In progress`. A phase is complete only when all of its exit checks pass.

## Domain Language

Use this definition:

> A Samebase repository is the durable Samebase object for one intended or connected GitHub
> repository. It can exist before the GitHub connection succeeds. After connection, it cannot bind
> to a different GitHub repository.

The final language has these rules:

- Bare `repository` means the Samebase object.
- `GitHub repository` means the provider object on GitHub.
- Use `repository` and `repositories` in UI copy. Do not use `repo` in UI copy.
- Reserve `repo` for the literal `/repo` URL segment and unchanged fields in raw provider payloads.
- Use full `repository` names in code, tables, types, MCP, errors, tests, and current documentation.
- Use `Remove from Samebase` for local record removal.
- Use `Also delete the GitHub repository` for the separate remote deletion choice.
- Do not call local record removal `Delete repository`.

### Identity Names

The final code must keep three identity types separate:

| Name                         | Exact meaning                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `repositoryId`               | The Convex `Id<"repositories">` for the Samebase repository document.             |
| `githubRepositoryDatabaseId` | GitHub's numeric repository database ID, stored as a string.                      |
| `githubRepositoryNodeId`     | GitHub's GraphQL node ID. Use it only in code that reads or writes that exact ID. |

`githubRepositoryDatabaseId` is the clear final name for the current `ghRepoId` field. This is a
field rename, not a new GitHub connection and not a new provider request. Connected repositories
must have this value. A repository that is still provisioning or failed before GitHub confirmed an
identity can omit it.

Do not use `githubRepositoryId`. GitHub has a numeric database ID and a GraphQL node ID, so that
name does not identify which value it contains. Do not use `repoId`, `ghRepoId`, or an unqualified
external `repositoryId` in the final code.

Use `githubOwnerLogin`, `githubRepositoryName`, and `githubRepositoryFullName` when a value is a
GitHub coordinate. Raw GitHub, Cloudflare, and Convex provider payloads keep the provider's own
field names at the validation boundary. Convert them to Samebase names after validation.

### Final Public Routes

- `/repo`
- `/repo/:owner/:repository`
- `/repo/:owner/:repository/settings`
- `/repo/:owner/:repository/fs/*`
- `/repo/:owner/:repository/db/*`
- `/repo/:owner/:repository/schema/*`
- `/org/:owner/repositories`

`:owner` is the GitHub owner login. `:repository` is the GitHub repository name. Neither parameter
is a Convex document ID.

The old `/vault` and `/org/:owner/vaults` routes return Not Found. There are no redirects or route
aliases. Existing accepted query parameters and hash values must remain intact when navigation
changes the path.

### Final MCP Contract

The database and MCP change happen in the same cutover. The final repository list contract is:

- contract ID: `get_user_repositories`
- tool name: `repository_dashboard_getUserRepositories`
- result object: `{ repositories }`
- Samebase identity field: `repositoryId`
- GitHub identity field: `githubRepositoryDatabaseId`

All other MCP arguments and results use `repositoryId` for a Samebase ID. Tool descriptions must say
`Samebase repository ID` or `GitHub repository database ID`. Instructions for a write tool must tell
the agent to call the repository list tool first and use its returned `repositoryId`.

The old MCP IDs, names, arguments, and result keys stop working at the cutover. There are no
aliases. An MCP client must refresh its tool catalog after the cutover.

The complete MCP tool-name cutover is:

| Contract ID                                    | Final tool name                                                |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `get_user_repositories`                        | `repository_dashboard_getUserRepositories`                     |
| `create_repository`                            | `repository_actions_createRepository`                          |
| `connect_existing_repository`                  | `repository_actions_connectRepository`                         |
| `discover_convex_projects`                     | `repository_convex_discoverProjects`                           |
| `discover_cloudflare_workers`                  | `repository_cloudflare_discoverWorkers`                        |
| `attach_convex_projects`                       | `repository_convex_attachProjects`                             |
| `attach_cloudflare_workers`                    | `repository_cloudflare_attachWorkers`                          |
| `create_cloudflare_worker`                     | `repository_cloudflare_createWorker`                           |
| `configure_workers_builds_for_github`          | `repository_cloudflare_configureWorkersBuildsForGitHub`        |
| `rotate_convex_deploy_keys_for_workers_builds` | `repository_cloudflare_rotateConvexDeployKeysForWorkersBuilds` |
| `retry_infrastructure_provisioning`            | `repository_actions_retryInfrastructureProvisioning`           |
| `list_workers_build_tokens`                    | `cloudflare_listWorkersBuildTokens`                            |
| `submit_feedback`                              | `samebase_feedback_submit`                                     |
| `create_browser_handoff`                       | `create_browser_handoff`                                       |
| `get_authentication_status`                    | `samebase_auth_getAuthenticationStatus`                        |

## Why This Sequence Is Safe

The public web change can ship first because the public route identifies a GitHub repository with
its owner and name. It does not put a Convex `vaults` ID in the URL. UI labels also do not change a
stored document. During this temporary phase, the UI says `repository` while its backend calls can
still use the old `vault` names.

The MCP change cannot ship in the first phase. A `repositoryId` must always be an
`Id<"repositories">`. If MCP used that field name before the table change, it would first contain an
`Id<"vaults">` and then change meaning at the cutover. Waiting gives MCP clients one clear breaking
change instead of two.

The data change uses a maintenance window because a copy is safe only when old writers cannot change
the source rows. The migration copies data. It does not delete the source data. The operator
verifies the complete copy before the new code can write to it. The old code and old tables remain
available for rollback until the new system passes production checks.

There is no reconnect job. The migration copies the existing GitHub repository database ID,
installation relationship, organization relationship, provider resource IDs, and storage IDs. It
does not call GitHub, Convex provider, or Cloudflare mutation APIs.

## Preservation Contract

The migration must preserve:

- all not-connected, provisioning, connected, and failed Samebase repository documents
- organization and user relationships
- GitHub repository database IDs and repository coordinates
- GitHub App installation relationships and authorization boundaries
- attached Convex project and Cloudflare Worker identities
- provisioning runs, events, plans, and write locks that the retention rules keep
- deletion runs and events, including retained retry chains
- folders, assignments, filters, layouts, and disclosure settings
- branch trees, schema snapshots, file observations, staged files, and staged updates
- every referenced Convex `_storage` object
- all business timestamps, lifecycle states, and deterministic ordering fields

The migration must not:

- delete or create a GitHub repository
- disconnect or reconnect a GitHub repository
- change a GitHub App installation
- create or delete a Convex project or Cloudflare Worker
- delete and upload a storage object again
- ask a user to take action

Phase 2 must inventory browser-only values that use a `vaultId` in their key. It must either migrate
each useful value before the ID cut or record that the value is a safe cache or device preference
that can reset. Browser-only state must never control whether a repository appears in Samebase.

## Table Migration Scope

The physical migration includes these 21 tables:

| Source table                               | Target table                                    |
| ------------------------------------------ | ----------------------------------------------- |
| `vaults`                                   | `repositories`                                  |
| `vaultCloudflareWorkers`                   | `repositoryCloudflareWorkers`                   |
| `vaultConvexProjects`                      | `repositoryConvexProjects`                      |
| `observations_vaultRepository_branchTrees` | `observations_repository_branchTrees`           |
| `ui_vaultPullRequests_filters`             | `ui_repositoryPullRequests_filters`             |
| `ui_vaultResourceLinks_settings`           | `ui_repositoryResourceLinks_settings`           |
| `ui_vaultFolders`                          | `ui_repositoryTree_folders`                     |
| `ui_vaultFolderAssignments`                | `ui_repositoryTree_folderAssignments`           |
| `ui_vaultOrganizationTree_settings`        | `ui_repositoryTree_organizationSettings`        |
| `observations_vaultConvexSchema_snapshots` | `observations_repositoryConvexSchema_snapshots` |
| `ui_vaultConvexSchemaGraph_nodeLayouts`    | `ui_repositoryConvexSchemaGraph_nodeLayouts`    |
| `workflow_vaultDeletion_runs`              | `workflow_repositoryDeletion_runs`              |
| `workflow_vaultDeletion_events`            | `workflow_repositoryDeletion_events`            |
| `workflow_vaultProvisioning_plans`         | `workflow_repositoryProvisioning_plans`         |
| `workflow_vaultProvisioning_writeLocks`    | `workflow_repositoryProvisioning_writeLocks`    |
| `workflow_vaultProvisioning_runs`          | `workflow_repositoryProvisioning_runs`          |
| `workflow_vaultProvisioning_events`        | `workflow_repositoryProvisioning_events`        |
| `vaultStagedFiles`                         | `repositoryStagedFiles`                         |
| `observations_vaultFiles_blobs`            | `observations_repositoryFiles_blobs`            |
| `ui_vaultFileTree_folderExpansions`        | `ui_repositoryFileTree_folderExpansions`        |
| `vaultStagedFileUpdates`                   | `repositoryStagedFileUpdates`                   |

The migration also changes all stored references to these table IDs. This includes references to
repository documents, provisioning runs, deletion runs, folders, and any other copied document.
Convex creates a new ID when a row moves to a new table. The migration must not cast an old ID to a
new ID.

Use one temporary source-to-target ID-map table. Its validator must be a discriminated union with
one typed variant for each source and target table pair. Each copied source document has exactly one
`copied_document` map row and one target document. A missing repository root that is referenced only
by retained deletion history uses a separate `deleted_repository_identity` map variant. Index the
map by source kind and source ID, and by target kind and target ID.

Convex also creates a new `_creationTime` for every copied document. The migration cannot preserve
that system field. Add `repositories.createdAt` and set it to the source repository's
`_creationTime`. New repository creation must set `createdAt` directly. Phase 2 must find every
other read that uses `_creationTime`. If code uses the value as product data, add and copy an
explicit field. If code uses it only as a tie-breaker, copy rows in source `_creationTime` order and
verify that the order remains the same.

### Cyclic And Missing Root References

A repository document can store a provisioning or deletion run ID while that run stores the
repository ID. The migration resolves this cycle in these steps:

1. Insert a migration-only placeholder repository document and record its new `repositoryId`.
2. Copy and map the referenced run documents.
3. Replace the placeholder fields with the final repository fields and new run IDs.
4. Verify that no placeholder repository remains.

Successful deletion history can refer to an old `vaultId` after its vault row is gone. Preserve that
history with these steps:

1. Insert one migration-only repository tombstone for each distinct missing old `vaultId`.
2. Record the old ID and new `repositoryId` in the ID map.
3. Copy the deletion runs, events, and retry references with the new IDs.
4. Delete the migration-only tombstone.

The final deletion history can refer to a `repositoryId` whose repository document no longer exists.
This matches the current retention rule. The tombstone is only a safe way to create a valid
`Id<"repositories">`; it is never visible to a product read.

## Phase 0: Fix The Contract

Status: Complete.

This RFC fixes the public language, identity names, public routes, MCP cutover rule, table scope,
data preservation rule, and rollback boundary.

Exit checks:

- The term `repository` has one final product meaning.
- `repositoryId` and `githubRepositoryDatabaseId` have exact and different meanings.
- All 21 source and target tables are listed.
- Cyclic references and retained deletion history have a migration method.
- The plan accounts for new Convex IDs and new `_creationTime` values.
- UI can change before storage, but MCP cannot.
- No step needs a user or provider reconnection.

## Phase 1: Change Public Web Copy And Routes

Status: Complete in [PR #1570](https://github.com/samebase/samebase/pull/1570).

Change only the public web boundary:

- Change visible `Vault` and `Vaults` copy to `Repository` and `Repositories`.
- Move the global route from `/vault` to `/repo`.
- Move detail and child routes to `/repo/:owner/:repository`.
- Move the organization list route to `/org/:owner/repositories`.
- Remove the old routes without redirects.
- Update route links, direct-link recovery, unavailable states, breadcrumbs, page titles, and
  accepted current specs.
- Keep generated Convex APIs, MCP, physical tables, and persisted IDs on the old names.
- Keep the temporary vocabulary split at the route and query boundary. Do not add general aliases or
  dual models.

Exit checks:

- All new routes work after a direct load, sign-in return, Back, Forward, and reload.
- Internal navigation keeps unrelated query parameters and hash values.
- Old routes return Not Found.
- Shipped UI does not show `vault` in user-visible copy.
- Existing route and screenshot owners pass.
- MCP and stored IDs are unchanged.

Evidence:

- The 44 affected app test files passed 510 tests.
- The four affected Convex test files passed 76 tests.
- Samebase type checking, lint, and the production build passed. Lint reported only the existing
  warnings.
- In the affected Linux browser sweep, 52 tests passed. The organization context test found a wait
  timing issue. After the test wait was fixed, its focused Linux run passed. The repository removal
  dialog snapshot was regenerated in the canonical Linux environment and passed.
- Cloudflare redirect verification passed after the new `/home` target was committed.
- Action documentation regenerated 15 contracts with no diff. MCP tool names, result fields, and
  generated public documentation are unchanged.
- `schema.ts`, generated Convex APIs, physical table names, stored IDs, and provider connections did
  not change.

## Phase 2: Add Dormant Migration Support

Status: Complete in [PR #1575](https://github.com/samebase/samebase/pull/1575).

Deploy migration support while the old application continues to read and write only the old tables:

- Add and configure `@convex-dev/migrations`.
- Add the target tables with temporary migration validators where the ID cycles require them.
- Add the typed source-to-target ID map.
- Add a backend maintenance state with `normal`, `draining`, and `frozen` states.
- Make all repository-domain UI, MCP, webhook, scheduled, workflow, editor, refresh, and provider
  writes obey that state before they create a side effect.
- Add bounded, resumable jobs to inventory, copy, verify, clear migration-owned target rows, and
  prepare the direct rollback that is available before new-table writes start.
- Add a deterministic audit command that lists every current `vault` table, stored reference,
  function path, MCP surface, route, and current document.
- Inventory browser-only keys that contain a `vaultId`.
- Inventory every repository-domain read that uses `_creationTime`.

Do not copy production rows in this phase. Old writers remain active, so an early copy can become
stale. Production use is limited to read-only inventory and migration dry runs.

The maintenance states have these exact meanings:

- `normal`: Current reads and writes can run.
- `draining`: Reject each new repository-domain operation. Permit only the continuation and
  completion calls for a workflow run or manual write that held its lock before draining started.
- `frozen`: Reject every repository-domain write except an authorized migration operator job.

The backend must enforce this gate. A maintenance page or disabled browser control is not enough.

A generated Convex upload URL remains valid for one hour. Samebase records a 65-minute repository
operation lease when it creates one. This lease blocks the change from `draining` to `frozen` until
the upload finishes or the URL and safety buffer expire. The extra five minutes cover clock and
transaction timing around URL creation. See the
[Convex upload URL contract](https://docs.convex.dev/file-storage/upload-files#generating-the-upload-url).

Each copy operation must be idempotent. A repeated source row must use its existing target ID and
must not insert a duplicate or rewrite an unchanged target. Each batch must be small enough for
Convex transaction limits. A run must resume safely after any batch.

A repository operation that schedules more write batches must give those batches a separate lease.
The lease must stay active until the last scheduled batch finishes. This rule prevents a freeze
while delayed repository writes can still run.

Exit checks:

- The audit covers all 21 tables and every stored ID reference.
- A second copy of one source row returns the same target ID.
- Every `copied_document` map row points to one source row and one target row.
- Every copied target has the exact translated business fields and no copied target is extra.
- Every `deleted_repository_identity` map row has no source or target repository row and is used
  only by retained succeeded deletion history.
- The jobs resume after an interrupted batch.
- The clear-target job deletes only migration-owned target rows and map rows.
- The clear-target job does not delete source rows or `_storage` objects.
- All target indexes are ready before the maintenance window.
- Focused Convex tests cover maintenance authorization, ID mapping, retries, and orphan detection.

Operator entry points added in this phase:

- Run `pnpm audit:repository-migration` from the repository root for the deterministic code and
  contract inventory.
- Call `repositoryMigration/maintenance:transitionRepositoryMaintenanceMode` to move through
  `normal`, `draining`, and `frozen`.
- Call `repositoryMigration/inventory:inventoryBatch` once per table and continue with its returned
  cursor until `isDone` is true.
- Call `repositoryMigration/run:runCompleteCopy` only in `frozen` mode. The run includes mapping,
  copy, exact translated-field verification, mapping verification, and rejection of extra target
  rows.
- Call `repositoryMigration/run:runClearTargets` only in `frozen` mode to remove migration-owned
  targets and ID maps before new-table writes start. Use `{ "reset": true }` when a rehearsal must
  repeat a completed copy or clear sequence.

These functions are dormant after the Phase 2 deployment. Phase 2 does not call the production copy
or clear functions.

## Phase 3: Rehearse The Complete Cutover

Status: Skipped by operator decision on 2026-09-02.

Samebase currently has 21 repository records, and most belong to the operator. The operator accepted
the risk of finding migration-specific data cases during the production maintenance window instead
of building a separate preview rehearsal system. The full backup, frozen writes, unchanged source
tables, resumable copy, exact target verification, and direct rollback boundary remain required.

The requirements below record the rehearsal that was considered. They are not Phase 4 exit checks.

Run the full cutover on an isolated local or preview deployment. The fixture must include:

- every repository provisioning state
- provisioning runs and events, including the root and run ID cycle
- one active-looking run that the drain step must reject
- one deletion retry chain
- one successful deletion run whose repository row is already absent
- folders and assignments
- multiple attached Convex projects and Cloudflare Workers
- schema snapshots and graph layouts
- inline blobs and Convex `_storage` blobs
- staged files and staged updates
- interrupted migration batches and a repeated full migration

Use this copy order:

1. Take and store the final source inventory.
2. Insert and map a placeholder repository for every current old `vaultId`. Insert and map a
   tombstone for every missing old `vaultId` that retained deletion history references.
3. Copy and map folders, provider attachments, provisioning runs, and deletion runs.
4. Patch repository run references, deletion gates, folder references, and deletion retry links.
5. Copy events, assignments, observations, UI state, staged data, snapshots, and layouts.
6. Remove migration-only repository placeholders and tombstones.
7. Verify the final target data.

Exit checks:

- Source and target row counts match for every table.
- A deterministic digest of all business fields matches for every source and target row. The digest
  maps old IDs to new IDs, maps renamed fields, and excludes the generated `_creationTime`.
- Every stored ID edge resolves through the expected map row.
- There are no missing or extra target rows, except the intentional absent roots in retained
  deletion history.
- The multiset of `_storage` references matches and every referenced object exists.
- A second complete migration changes zero target documents.
- A forced interruption at each phase boundary resumes without duplicates.
- A rollback rehearsal restores the old application without changing old data.
- The measured maintenance duration is accepted.

## Phase 4: Drain, Freeze, Copy, And Switch

Status: Complete.

Run this phase in one announced maintenance window.

Before the drain starts, create a full Convex backup that includes file storage. Record the backup
identifier and the source deployment in this RFC.

Cutover backup:

- Backup identifier: `nicu-samebase-clear-butterfly-858-1788382338278`
- Source deployment: `clear-butterfly-858`
- Recorded: 2026-09-03, before the drain started

### Drain

1. Set maintenance state to `draining`.
2. Reject new UI, MCP, webhook, refresh, provisioning, deletion, editor, scheduled provider-write,
   and manual provider-write starts.
3. Permit work that started before the drain to finish.
4. Confirm that no provisioning or deletion run is queued or running.
5. Confirm that the Workflow component has no active repository-domain workflow, pending step,
   retry, or completion callback.
6. Confirm that no scheduled function still has an old `internal.vault.*` handle.

### Freeze And Copy

1. Set maintenance state to `frozen`.
2. Reject every old-table and new-table repository-domain write except the migration operator jobs.
3. Take the final source inventory.
4. Clear only target rows that the migration owns.
5. Run the complete batched copy.
6. Run the complete exact-field, ID-map, target-ownership, and storage-reference verification.

Production cutover record, times in UTC:

- Draining started at `2026-09-02T21:16:28.472Z`.
- All active provisioning, deletion, Workflow, scheduled old-function, provider-write, account
  deletion, upload, tree-refresh, operation-lease, and token-refresh blocker counts were zero.
- Frozen mode started at `2026-09-02T21:18:52.629Z`.
- The final inventory completed in 70 bounded calls across 21 source tables. It found 1,404 source
  rows, 2,509 stored ID edges, zero missing references, zero missing storage references, and 420
  valid missing repository roots in retained deletion history.
- All four target-clear jobs completed successfully. They removed zero rows because no earlier
  production copy existed.
- All 91 ordered copy and verification jobs completed successfully from `2026-09-02T21:22:32.701Z`
  through `2026-09-02T21:23:12.936Z`. Every job is complete with a null cursor. No job failed.
- PR #1578 deployed as commit `678d28dbde2099fc7497386ea467ec981c05767e` with Cloudflare build
  `9a2ca5bb-f797-4a7b-b8fc-d8bc7c4329fb`.
- The repository UI, routes, backend reads, and MCP contract passed production checks.
- Maintenance returned to `normal` at `2026-09-02T21:56:43.912Z`.
- New repository provisioning succeeded after writes resumed.

### Switch

1. Deploy the internal rename from `convex/vault` to `convex/repository`.
2. Switch all code, validators, indexes, types, tests, workflow names, status values, errors, and
   generated APIs to the target tables and repository language.
3. Switch MCP to the final repository contract in the same deployment.
4. Update the Samebase agent plugin contract and instructions in the same deployment.
5. Keep both old and new table definitions in the schema.
6. Run read-only production checks for repository lists, direct routes, files, branches, pull
   requests, providers, schema views, settings, deletion history, and MCP listing.
7. Record the deployed version, final inventory totals, and complete exact-field and relationship
   verification results.
8. If all checks pass, set maintenance state to `normal` and enable writes on the new tables.

The switch must not run a provider mutation. It must not use the normal deletion workflow to clear
old data.

### Rollback Boundary

Before new-table writes are enabled, rollback is direct: deploy the old code, keep the unchanged
source tables, and clear only migration-owned target rows and map rows.

After new-table writes are enabled, the old tables are no longer current. Do not deploy the old code
after this point. Fix forward on the new tables unless a separate reverse migration is first
implemented and verified. The operator must record the exact time and deployed version when this
boundary passes.

Exit checks:

- The drain and freeze checks pass.
- All data verification checks pass against the final production inventory.
- New code and MCP read the target tables.
- The Samebase agent plugin publishes only the new tool names and ID descriptions.
- The UI and MCP return the same repositories and relationships as before maintenance.
- New writes pass on the target tables.
- No provider mutation or user action was necessary.

## Phase 5: Stabilize The New System

Status: Complete.

Keep the old tables as a frozen rollback record. Do not delete them in the cutover deployment.

Exit checks:

- New reads and writes pass focused production checks.
- Old table digests have not changed.
- No old public function or MCP tool receives a call.
- No active Workflow or scheduled handle names an old `vault` function.
- All new rows conform to the final narrow validators.
- The audit finds no current production code, UI, MCP, test, or accepted-spec use of `vault`, except
  for frozen old table definitions and temporary migration support.
- The operator explicitly accepts the end of the fast rollback window.

After these checks, deploy the final narrow validators. Keep the old table definitions until Phase 6
removes the old rows.

Production evidence:

- The old tables remained at the recorded 1,404 rows until Phase 6 started.
- The earlier exact-field and ID-map verification remained complete. No separate digest baseline was
  recorded.
- No migration placeholder or tombstone remained in the repository tables.
- No active Workflow, operation lease, or scheduled function referenced an old vault function.
- The old MCP tool name returned `Unknown tool`.
- The operator accepted the end of the fast rollback window by directing Phase 6 and creating its
  backup.

## Phase 6: Remove Old Data And Migration Support

Status: In progress.

Create a new full Convex backup that contains both the frozen old metadata and file storage. Record
its backup identifier and source deployment in this RFC. Then delete the old metadata rows with a
migration-only cleanup job. Do not call the old vault deletion workflow because that workflow also
deletes shared `_storage` objects that the new rows still use.

Phase 6 backup:

- Backup identifier: `nicu-samebase-clear-butterfly-858-1788386495025`
- Source deployment: `clear-butterfly-858`
- Recorded: 2026-09-03, before old metadata deletion

Production cleanup:

- Temporary cleanup commit: `e1fe8db7c`
- The dry run deleted one batch from `workflow_vaultDeletion_events` and rolled it back.
- The full cleanup ran from `2026-09-02T22:14:57.087Z` through `2026-09-02T22:15:08.969Z`.
- All 22 cleanup jobs succeeded. They deleted 1,404 rows from the 21 old tables and 1,439 rows from
  the migration ID map.
- All 21 old tables and the migration ID map then contained zero rows.
- The repository tables contained 1,474 rows after cleanup. This includes successful new repository
  work after the cutover.
- No target `_storage` reference was missing. The cleanup code did not call storage or provider
  APIs.
- The migration component and application scheduler had no active cleanup or old vault function.

Exit checks:

- Every old table is empty.
- Every migrated `_storage` object still exists.
- Production code does not read the ID map.
- The operator accepts that a later rollback needs data restoration.

Then remove:

- old table definitions
- old `convex/vault` functions and generated API paths
- source-to-target ID maps
- migration-only validators, placeholders, and tombstones
- migration jobs and temporary maintenance code
- obsolete tests and current documentation that describe the old names

Reduce the accepted final behavior into the relevant specs. Archive this RFC after all completion
checks and evidence links are present.

## Decisions

| Date       | Decision                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------- |
| 2026-09-02 | Use `repository` as the final product noun and keep `repo` only as the URL segment.          |
| 2026-09-02 | Remove old public routes and MCP names without redirects or aliases.                         |
| 2026-09-02 | Ship UI copy and routes before the physical data migration.                                  |
| 2026-09-02 | Ship MCP and the internal data-model rename together.                                        |
| 2026-09-02 | Preserve user data with a frozen, verified copy. Do not delete and reconnect repositories.   |
| 2026-09-02 | Rename `ghRepoId` to `githubRepositoryDatabaseId` so the GitHub ID type is explicit.         |
| 2026-09-02 | Keep source tables unchanged through the first production checks to support a fast rollback. |

## Non-Goals

- Keep a permanent compatibility reader, route redirect, MCP alias, or dual-write path.
- Change the meaning of a Samebase repository lifecycle state.
- Change organization ownership, authorization, billing, or provider destinations.
- Recreate external resources.
- Rewrite historical files in `archive/` or research notes only to replace an old term.
