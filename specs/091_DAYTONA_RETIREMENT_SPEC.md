# 091 Daytona Retirement Spec

## Document Control

- Status: Accepted implementation plan
- Owner: Noter development environment direction
- Created: 2026-05-04
- Supersedes active Daytona implementation plans for future work:
  - `specs/010_DAYTONA_SANDBOX_INTEGRATION_SPEC.md`
  - `specs/040_DAYTONA_USAGE_AND_FLOW_SPEC.md`
  - `specs/049_DAYTONA_CODEX_DEVICE_AUTH_PERSISTENCE_SPEC.md`
  - `specs/055_DAYTONA_CODEX_SHARED_HOME_SPEC.md`
  - `specs/058_DAYTONA_DEPS_IMAGE_DISCOVERY_SPEC.md`
  - `specs/059_DAYTONA_PERSISTENT_TMUX_TERMINALS_SPEC.md`

## Summary

Retire Noter's Daytona integration from the live app and codebase.

Daytona is currently paused while Noter focuses on local-machine Codex and
connected-machine workflows. The pause switch prevents normal runtime use, but
the implementation still threads Daytona through active routes, Convex schema
shapes, generated API surface, Vite config, env allowlists, package
dependencies, tests, scripts, workflows, manual tests, and accepted docs.

That live scaffolding is now more expensive than useful. It makes the current
product direction harder to understand, gives agents stale implementation paths
to follow, and keeps maintenance/security review surface around a compute path
that is no longer an active bet.

The accepted direction is to delete Daytona product/runtime code instead of
keeping it hidden behind `DAYTONA_PAUSED`. Git history and archived docs are the
recovery mechanism if Daytona or a similar provider becomes relevant again.

## Decision

1. Remove Daytona as a shipped product/runtime integration.
2. Do not preserve a hidden feature flag path for future Daytona use.
3. Keep only direction-neutral behavior by renaming it away from Daytona.
4. Retire Daytona docs/manual tests in the same cleanup branch that removes the
   code they describe.
5. Treat Convex data removal as a migration, not a same-deploy schema deletion.

## Current State

Daytona is currently blocked by `apps/noter/shared/daytonaPause.ts`:

1. `DAYTONA_PAUSED` resolves to `true`.
2. Vault dashboard and file view Daytona UI are not rendered.
3. `CodexProviderRow` returns `null`.
4. Daytona Convex actions and terminal helpers fail closed with the shared pause
   message.
5. Snapshot queueing is skipped while refreshing vault trees.

Even paused, Daytona remains active codebase context:

1. Frontend imports include `DaytonaWorkspaceButton`, `DaytonaPreviewPanel`,
   `DaytonaSnapshotList`, `DaytonaSnapshotBanner`, and PTY helpers.
2. Convex modules under `apps/noter/convex/daytona/` remain generated API
   surface.
3. `vaults` still carries `daytonaSandbox*`, `daytonaSnapshot*`, and
   `daytonaPrebuild*` fields.
4. `daytonaSnapshots` remains in schema and query paths.
5. Vite still defines Daytona SDK/proxy constants.
6. Root scripts and CI still include Daytona runtime/deps-image tooling.
7. `@daytonaio/*` packages remain app dependencies.
8. Specs and manual tests still describe Daytona as a live implementation
   direction unless this retirement spec is considered first.

## Goals

1. Make local-machine Codex and connected-machine flows the clear development
   environment direction.
2. Remove Daytona code that can mislead future implementation work.
3. Reduce active dependency, env, script, and workflow surface.
4. Preserve only provider-neutral infrastructure that is still used end to end.
5. Retire Daytona docs without losing historical context.
6. Clean Convex data safely with an explicit migration sequence.

## Non-Goals

1. Replacing Daytona with another hosted compute provider in this plan.
2. Designing the future Codex cloud or remote compute integration.
3. Keeping dormant Daytona compatibility paths for possible future revival.
4. Preserving old Daytona data after the migration completes.
5. Bulk-moving unrelated docs while this retirement work is active.

## Retirement Plan

### Phase 1: Remove Product Entrypoints

Remove user-facing and route-owned Daytona surfaces:

1. Delete Daytona dashboard and file-view controls.
2. Delete Daytona preview UI and preview toggles.
3. Delete Daytona snapshot banners and lists.
4. Remove Codex-in-Daytona provider connection UI.
5. Remove static Daytona imports from active app routes.
6. Remove user-facing copy that names Daytona as an available action.

After this phase, no shipped UI should expose Daytona controls, state, or
terminology.

### Phase 2: Remove Runtime Actions And Tooling

Remove backend/runtime entrypoints that only exist for Daytona:

1. Delete `apps/noter/convex/daytona/*` actions, terminal helpers, policies,
   generated runtime renderings, and tests.
2. Remove Daytona calls from vault actions and vault queries.
3. Remove `@daytonaio/api-client` and `@daytonaio/sdk`.
4. Remove root Daytona scripts, runtime-manifest helpers, deps-image hash
   tooling, and local Daytona runner scripts.
5. Remove `.github/workflows/daytona-deps-image.yml` and
   `Dockerfile.daytona-deps`.
6. Remove Daytona env allowlist entries.

Any helper that remains useful outside Daytona must be renamed and shaped around
its current owner. Do not keep one-line compatibility wrappers or Daytona-named
aliases.

### Phase 3: Generalize Or Remove Direction-Neutral Pieces

Some code may be useful without Daytona but should not keep Daytona ownership:

1. If the Vite browser Convex proxy is still needed for public tunnel or
   worktree flows, rename it to describe that boundary directly.
2. If deployment-profile detection still needs a deploy-key fallback, rename the
   env contract away from `DAYTONA_CONVEX_DEPLOY_KEY` and migrate callers.
3. If any PTY logic is still useful for connected machines, reintroduce it under
   the connected-machine boundary instead of importing Daytona helpers.

If a neutralized path is not used end to end by the current app, delete it.

### Phase 4: Migrate Convex Data

Use a widen-migrate-narrow sequence for schema cleanup.

1. First deploy code that no longer reads or writes Daytona fields/tables.
2. Run an explicit migration that unsets Daytona fields on `vaults`.
3. Do not automate deletion of external Daytona sandboxes or snapshots; the
   operator can remove those manually in Daytona.
4. Verify no documents retain removed fields.
5. Only then remove Daytona fields from `apps/noter/convex/schema.ts`.
6. Treat any remaining `daytonaSnapshots` table cleanup as a separate manual or
   doc-retirement task, not part of the automated Phase 4 migration.
7. Remove migration scaffolding after the narrow deploy is stable.

Do not remove schema fields while production data can still contain them.

### Phase 5: Retire Docs And Tests

Retire docs in the same branch that removes the corresponding implementation:

1. Move superseded Daytona specs/manual tests to `archive/` or mark them retired
   with a pointer to this spec.
2. Delete manual tests that validate Daytona user flows.
3. Remove references from adjacent specs that keep Daytona as a current
   dependency.
4. Keep one short historical note if needed, but do not preserve active rollout
   instructions.

## Guardrails

1. Do not add new Daytona code while executing this plan.
2. Do not add a replacement provider abstraction until a concrete shipped
   provider exists.
3. Do not keep compatibility shims for app-internal Daytona imports.
4. Do not leak old Daytona env values, tokens, deploy keys, snapshot names, or
   logs into docs, tests, screenshots, or PR text.
5. Preserve connected-machine and local-worktree behavior while removing
   Daytona.
6. Keep deletion batches small enough that review can distinguish UI removal,
   runtime removal, data migration, and doc retirement.

## Implementation Log

### 2026-05-04

- Phase 1 started in PR #689 by removing active Daytona dashboard, file-view,
  preview, snapshot, and Codex-in-Daytona provider UI entrypoints.
- Frontend Daytona UI support components and their focused tests were deleted.
- Backend Convex modules, schema fields, Vite proxy naming, env contracts, and
  legacy data cleanup intentionally remain for later phases.
- Phase 2 started by deleting Daytona Convex actions, runtime renderings, root
  scripts, deps-image workflow, and package dependencies.
- Vault actions and queries no longer call Daytona APIs, expose Daytona runtime
  state, or enqueue Daytona snapshot builds.
- Convex schema fields/tables, Vite proxy naming, and deploy-key fallback
  intentionally remain for the migration and neutralization phases.
- Phase 3 started by renaming the browser Convex proxy away from Daytona-owned
  filenames, env contracts, compile-time defines, and proxy paths.
- The deployment-profile deploy-key fallback was removed instead of renamed
  because no current app flow sets it end to end after Phase 2.
- An unused Codex config runtime helper was deleted rather than kept as dormant
  PTY scaffolding.
- Phase 4 started by adding explicit Convex migration scaffolding for legacy
  Daytona data cleanup.
- The cleanup migration unsets Daytona fields on `vaults` and exposes an
  internal verification query plus operator runbook.
- Daytona schema fields intentionally remain until the cleanup migration has run
  and verification reports completion.
- Daytona sandboxes, external Daytona snapshots, and Noter's legacy
  `daytonaSnapshots` rows are not deleted by the automated migration.
- Phase 4 narrow schema cleanup continued after production verification returned
  `complete: true` with no sampled vault ids.
- The Daytona fields on `vaults` and the completed migration scaffolding were
  removed from active code.
- The `daytonaSnapshots` table remains until its internal rows are handled by a
  separate manual or doc-retirement task.

## Validation

Each cleanup PR should verify the part it changes:

1. Typecheck and lint after removing UI/runtime imports.
2. Convex code generation after deleting backend modules.
3. Unit tests for deployment-profile/proxy behavior if those pieces are
   generalized.
4. Migration dry run before mutating production data.
5. Schema validation after the narrow deploy.
6. Route-level smoke tests for vault dashboard, file view, provider settings,
   connected-machine, and local-worktree flows.

## Exit Criteria

Daytona retirement is complete when:

1. No active UI, Convex action, script, workflow, env allowlist, dependency, or
   generated API surface mentions Daytona.
2. `vaults` no longer stores Daytona fields.
3. `daytonaSnapshots` no longer exists in active schema.
4. Current specs no longer describe Daytona as an available product direction.
5. Local-machine Codex and connected-machine docs remain the only current
   development-environment path.
6. Route-level smoke tests for vault dashboard, file view, provider settings,
   connected-machine, and local-worktree flows.

## Exit Criteria

Daytona retirement is complete when:

1. No active UI, Convex action, script, workflow, env allowlist, dependency, or
   generated API surface mentions Daytona.
2. `vaults` no longer stores Daytona fields.
3. `daytonaSnapshots` no longer exists in active schema.
4. Current specs no longer describe Daytona as an available product direction.
5. Local-machine Codex and connected-machine docs remain the only current
   development-environment path.
