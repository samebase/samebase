# Convex Vault Module Layout Spec

## Document Control

- Status: Accepted and implemented
- Owner: Samebase backend
- Created: 2026-05-12
- Related docs:
  - `specs/095_CONVEX_CODESPACES_MODULE_SPLIT_SPEC.md`
  - `specs/098_VAULT_DELETION_WORKFLOW_SPEC.md`
  - `research/2026-05-06-vault-first-provisioning-model.md`
  - `research/2026-05-09-vault-deletion-workflow-research.md`

## Summary

Move the root-level Convex vault modules into a dedicated `vault/` folder, but do not hide the move
behind root re-export shims and do not collapse the public API into `api.vault.index.*`.

Before this change, the root `apps/samebase/convex/` directory already had foldered domains for
`agent/`, `chat/`, `codespaces/`, `mcp/`, and `toolRuntime/`. Vault was the largest remaining
root-level backend domain. Keeping it flat made root navigation worse and made related deletion,
branch, state, and model files look like miscellaneous backend utilities instead of one product
domain.

The accepted direction is a breaking, mechanical module-path cleanup. The app is pre-user and
operator-owned, so preserving old root function references is not a goal. Prefer one clear tree now
over compatibility scaffolding that would pollute navigation.

## Original Shape

The narrow vault cluster started as 15 root-level Convex files:

- `vault.ts`
- `vaultActions.ts`
- `vaultModel.ts`
- `vaultState.ts`
- `vault.branchSelection.test.ts`
- `vault.convex.test.ts`
- `vaultDeletionCleanup.ts`
- `vaultDeletionEligibility.ts`
- `vaultDeletionEvents.ts`
- `vaultDeletionModel.ts`
- `vaultDeletionRuns.ts`
- `vaultDeletionState.ts`
- `vaultDeletionWorkflow.ts`
- `vaultDeletionWorkflowActions.ts`
- `vaultDeletionWorkflow.convex.test.ts`

Together these files are about 8.1k lines. `vault.ts` alone is about 2.5k lines, so a pure folder
move would improve root shape but leave the most important file too broad.

The original generated Convex references were root-level:

- `api.vault.*`
- `api.vaultActions.*`
- `internal.vault.*`
- `internal.vaultDeletionCleanup.*`
- `internal.vaultDeletionRuns.*`
- `internal.vaultDeletionWorkflow.*`
- `internal.vaultDeletionWorkflowActions.*`

The move touches roughly:

- 35 `api.vault.*` callsites
- 8 `api.vaultActions.*` callsites
- 128 `internal.vault.*` callsites
- 50 `internal.vaultDeletion*.*` callsites
- 54 relative imports such as `./vaultState` or `../vaultState`
- 32 non-vault files outside the moved cluster

No data migration was required for the module move. Convex function references are file-path based,
but table names are schema names. The current resource graph uses `vaultApps`,
`vaultCloudflareWorkers`, `vaultConvexDeployments`, `vaultWorkerDeploymentDependencies`, provider
creation-claim tables, `vaultInfrastructureTargets`, and `vaultInfrastructureOwnership` alongside
the source, deletion, and domain tables.

## Accepted Module Shape

Use named files under `apps/samebase/convex/vault/`:

```text
apps/samebase/convex/vault/
  actions.ts
  branches.ts
  dashboard.ts
  model.ts
  records.ts
  state.ts
  deletion/
    cleanup.ts
    eligibility.ts
    events.ts
    model.ts
    providerActions.ts
    runs.ts
    state.ts
    workflow.ts
```

The old root `vault.ts` should be split while moving:

- `vault/dashboard.ts` owns dashboard-facing public functions: `getUserVaults`,
  `getUserVaultBranchFilters`, `setVaultBranchFilters`, and `getVaultInfrastructure`.
- `vault/actions.ts` owns public actions for connect, create, retry, delete, and repository-owner
  discovery.
- `vault/records.ts` owns internal vault row creation, lookup, source connection, readiness, and
  failure mutations.
- `vault/branches.ts` owns remote branch sync, branch-tree cache, tree refresh claims, Cloudflare
  preview metadata sync, and branch selection helpers.
- `vault/model.ts` owns vault validators and vault-owned state validators used by schema.
- `vault/state.ts` owns runtime guards such as `assertConnectedVault` and `isLiveConnectedVault`.
- `vault/deletion/*` owns deletion models, eligibility, runs, events, local cleanup, workflow
  orchestration, and provider actions.

Do not add `vault/index.ts` only to avoid touching callsites. A file named `index.ts` is acceptable
only if it has a concrete Convex routing purpose; it must not become the default dumping ground for
unrelated vault functions.

## Function Reference Contract

The accepted public and internal Convex references are named by responsibility:

- `api.vault.dashboard.getUserVaults`
- `api.vault.dashboard.getVaultInfrastructure`
- `api.vault.dashboard.getUserVaultBranchFilters`
- `api.vault.dashboard.setVaultBranchFilters`
- `api.vault.records.getVaultByRepository`
- `api.vault.actions.connectRepository`
- `api.vault.actions.createRepository`
- `api.vault.actions.deleteVault`
- `api.vault.actions.listRepositoryOwners`
- `api.vault.actions.retryDeleteVault`
- `api.vault.actions.retryInfrastructureProvisioning`
- `api.vault.branches.getVaultRemoteBranches`
- `api.vault.branches.startTreeRefreshOptimistic`
- `internal.vault.records.getById`
- `internal.vault.records.getByIdForUser`
- `internal.vault.records.getInfrastructureByVaultId`
- `internal.vault.records.getByRepositoryFullName`
- `internal.vault.records.hasOtherVaultsForRepository`
- `internal.vault.records.createInitializingExistingRepositoryVaultForUser`
- `internal.vault.records.createInitializingSamebaseManagedVaultForUser`
- `internal.vault.records.connectExistingRepositoryVaultGitHub`
- `internal.vault.records.connectSamebaseManagedVaultGitHub`
- `internal.vault.records.markGithubProvisioningFailed`
- `internal.vault.records.markVaultAsReady`
- `internal.vault.records.updateVaultDevcontainerConfig`
- `internal.vault.branches.getVaultRemoteBranch`
- `internal.vault.branches.getVaultBranchTree`
- `internal.vault.branches.upsertVaultBranchTree`
- `internal.vault.branches.syncVaultRemoteBranches`
- `internal.vault.branches.claimTreeRefresh`
- `internal.vault.branches.releaseTreeRefresh`
- `internal.vault.branches.recordTreeRefreshFailure`
- `internal.vault.deletion.runs.*`
- `internal.vault.deletion.events.*`
- `internal.vault.deletion.cleanup.*`
- `internal.vault.deletion.workflow.*`
- `internal.vault.deletion.providerActions.*`

Do not preserve legacy direct-members such as `api.vault.getUserVaults`, `api.vaultActions.*`, or
`internal.vaultDeletionRuns.*` through root wrappers. Use only responsibility-scoped paths like
`api.vault.dashboard.*`, `api.vault.records.*`, `api.vault.actions.*`, and `api.vault.branches.*`.
Root shims would keep two entrypoints alive for one domain and would conflict with the repo rule
against same-name pass-through modules.

Do not use `api.vault.index.*`. The folder is the namespace; the file name should communicate why
the function exists.

## Schema Contract

`apps/samebase/convex/schema.ts` remains the single app schema entrypoint because Convex expects the
app schema there.

Vault-owned validators should live in `vault/model.ts` and `vault/deletion/model.ts`, then be
imported into root schema. If table definitions become clearer as exported table constants, use that
shape:

```ts
vaults: vaultsTable,
vaultRemoteBranches: vaultRemoteBranchesTable,
vaultBranchTrees: vaultBranchTreesTable,
vaultDeletionRuns: vaultDeletionRunsTable,
```

Keep table names stable. This spec is a module-layout refactor, not a persisted data model rename.

## Boundary Rules

Move the narrow vault cluster. Do not move every file that mentions a vault ID.

Keep these domains outside `vault/`:

- `fileStaging.ts` and `fileStagingActions.ts`: editor staging and Git commit mechanics
- `infraProvisioning.ts` and `infraRead*.ts`: provider provisioning and production-read mechanics
- `appProvisioningWorkflow*.ts` and `appProvisioningRuns.ts`: app creation workflow orchestration
- `chat/`, `agent/`, and `toolRuntime/`: agent and approval surfaces
- `codespaces/`: GitHub Codespaces lifecycle
- `github.ts` and `githubChecks.ts`: GitHub API integration
- `repositoryRefresh*.ts`: refresh queue ownership

Those modules should update imports and function references to the new vault paths. They should not
be pulled under `vault/` merely because vault identity is part of their arguments.

## Implementation Plan

1. Create the `convex/vault/` and `convex/vault/deletion/` folders.
2. Move small files first: `vaultModel.ts`, `vaultState.ts`, and the `vaultDeletion*Model/State`
   helpers.
3. Split `vault.ts` into `dashboard.ts`, `records.ts`, and `branches.ts`.
4. Move `vaultActions.ts` to `vault/actions.ts`.
5. Move deletion workflow files into `vault/deletion/`, renaming `vaultDeletionWorkflowActions.ts`
   to `providerActions.ts`.
6. Update relative imports inside and outside the vault folder.
7. Update generated-reference callsites to the new named paths.
8. Run Convex codegen and typecheck.
9. Run the moved Convex tests for vault creation, branch selection, and deletion workflow.
10. Update `apps/samebase/convex/README.md` so the backend overview points at the foldered vault
    domain.

`getVaultByRepository` belongs in `vault/records.ts` because it returns the single-vault read model
used by file surfaces, not the dashboard aggregate.

## Validation Expectations

At minimum, run:

```bash
pnpm --dir apps/samebase run typecheck
pnpm --dir apps/samebase exec vp test run convex/vault/branches.test.ts convex/vault/dashboard.convex.test.ts convex/vault/deletion/workflow.convex.test.ts
```

If test glob support is awkward after the move, run the specific moved vault test files directly. A
full `pnpm --dir apps/samebase run check` is preferred before shipping the implementation PR.

## Non-Goals

- Rename persisted Convex tables.
- Create root-level re-export shims.
- Convert vault into a Convex Component.
- Move unrelated vault-adjacent domains into `vault/`.
- Preserve compatibility for old generated function paths.
