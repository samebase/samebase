# 060 Turbo Task Dispatch Removal Spec

## Status

- In progress
- Last updated: 2026-03-17

## Related Files

- `package.json`
- `Makefile`
- `README.md`
- `AGENTS.md`
- `apps/noter/package.json`
- `apps/noter-starter-template/package.json`

## Summary

Remove Turborepo from the Noter monorepo as a repo-owned task orchestrator.

Keep:

1. `pnpm` as the workspace and package runner
2. `make run` and `make anon` as the bootstrap entrypoints
3. app-local scripts in `apps/noter` and `apps/noter-starter-template`

Replace Turbo's current role with:

1. direct `pnpm --filter ...` root scripts for workspace task dispatch
2. explicit root cleanup commands where Turbo previously provided a shared
   `clean` surface

Do not treat every incidental reference to the string `turbo` as in scope. The
removal target is repo-owned build and developer workflow wiring, not generic
editor heuristics for arbitrary user repositories.

## Problem

Noter currently describes itself as a Turborepo monorepo, but Turbo is not
carrying meaningful architectural weight in the current repo shape.

Today:

1. `pnpm-workspace.yaml` is the real monorepo boundary
2. each app already owns its real `dev`, `build`, and `lint` logic
3. the most important operator workflow is already expressed through `make`
   targets rather than Turbo tasks

The cost of keeping Turbo is mostly cognitive:

1. contributors must learn one more tool even though the repo does not use a
   real internal package graph
2. docs and setup material imply Turbo is essential when it is currently only a
   thin root-level wrapper
3. container and lockfile surfaces carry an extra dependency that does not add
   much value

## Goals

1. Preserve the existing root command surface where practical:
   - `pnpm dev`
   - `pnpm build`
   - `pnpm build:ci`
   - `pnpm lint`
   - `pnpm lint:ci`
   - `pnpm dev:starter`
   - `pnpm build:starter`
   - `pnpm lint:starter`
2. Keep worktree and local bootstrap flows centered on `make run` and
   `make anon`.
3. Remove the Turbo dependency, config file, and repo-level Turbo-specific
   setup.
4. Update source-of-truth docs so the repo is described as a `pnpm` workspace
   monorepo instead of a Turborepo monorepo.
5. Keep the starter-template export output aligned with the new repo contract.

## Non-Goals

1. Replacing `pnpm` with `make`.
2. Changing app-local build systems, Vite, Convex, or Playwright workflows.
3. Reworking CI beyond swapping the implementation behind existing root
   commands.
4. Removing runtime heuristics that intentionally recognize `.turbo` folders or
   `turbo` packages in arbitrary user repositories loaded by Noter's editor.
5. Introducing a new task runner or a new abstraction layer.

## Current State

Turbo is currently used in a limited way:

1. root `package.json` scripts call `turbo run ... --filter=...`
2. `turbo.json` defines a small task graph and cache behavior
3. the root package declares `turbo` as a dev dependency
4. the devcontainer installs `turbo` globally
5. README and AGENTS describe the repo as a Turborepo monorepo
6. ignore and starter-export surfaces include repo-owned `.turbo` cache paths

The repo does not currently have active internal workspace packages under
`packages/*`, so Turbo is not managing a meaningful dependency graph today.

## Proposal

### 1. Replace Turbo-backed root scripts with direct pnpm workspace dispatch

Examples:

1. `pnpm dev` -> `pnpm --filter noter dev`
2. `pnpm build` -> `pnpm --filter noter build`
3. `pnpm lint` -> `pnpm --filter noter lint` plus the existing root script
   checks
4. starter-template entrypoints -> direct `pnpm --filter noter-starter-template`
   dispatch

### 2. Remove Turbo config and dependency surfaces

1. delete `turbo.json`
2. remove `turbo` from root `devDependencies`
3. remove repo-owned Turbo setup from the devcontainer

### 3. Keep Make responsible for bootstrap, not workspace dispatch

`make` already owns the important environment/bootstrap flows:

1. `make run`
2. `make anon`
3. `make anon-once`
4. Daytona-local wrappers

That split should remain:

1. `pnpm` dispatches workspace package scripts
2. `make` orchestrates repo bootstrap and runtime setup

### 4. Replace the old global clean behavior explicitly

Because app packages do not currently expose a shared `clean` script, the root
package must define explicit cleanup behavior for current build outputs and
caches instead of relying on Turbo to discover tasks.

### 5. Update source-of-truth docs and generated starter output

Update:

1. `README.md`
2. `AGENTS.md`
3. starter-template export inputs and generated manifest output

## Rollout

1. Add this spec.
2. Patch root scripts and config.
3. Remove Turbo dependency and config file.
4. Update docs and starter-template export output.
5. Refresh the lockfile and generated starter manifest.
6. Run focused validation on the updated entrypoints.

## Validation

At minimum, confirm:

1. `pnpm install --lockfile-only` succeeds after dependency changes
2. `pnpm build:starter` still works through the root script
3. `pnpm lint:scripts` still works
4. starter manifest export still succeeds
5. CI entrypoints continue to exist under the same root script names

## Risks

1. If the repo later adds real shared workspace packages, direct `pnpm --filter`
   dispatch will provide less automatic graph orchestration than Turbo.
2. Any missed Turbo-owned docs or bootstrap surfaces will leave confusing, stale
   instructions behind.
3. A too-aggressive cleanup of incidental `turbo` references could regress
   editor behavior for arbitrary connected repos, so scope discipline matters.
