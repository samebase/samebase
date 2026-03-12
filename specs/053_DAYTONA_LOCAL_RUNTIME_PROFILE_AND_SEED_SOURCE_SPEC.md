# 053 Daytona Local Runtime Profile And Seed Source Spec

## Status

- Proposed
- Last updated: 2026-03-12

## Related Specs

- `specs/025_MULTI_WORKTREE_OAUTH_BROKER_SPEC.md`
- `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
- `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
- `specs/051_DAYTONA_STANDARD_RUNTIME_AND_PTY_SESSIONS_SPEC.md`
- `specs/052_DAYTONA_RUNTIME_MANIFEST_AND_SANDBOX_PROGRAMS_SPEC.md`

## Summary

Define an explicit separation between:

1. the active Convex runtime target used by a Daytona workspace sandbox
2. the cloud dev deployment used as a read-only seed source
3. the Daytona control-plane deployment identity used for naming and auth

Default Daytona workspace sandboxes to:

1. one normal repo checkout inside the sandbox
2. a local anonymous Convex runtime in `.env.local`
3. a separate explicit source file only for copying allowlisted seed variables

The cloud dev deployment must remain available for seed copying, but it must not
silently become the active runtime target for `make anon` inside the sandbox.

## Problem

On 2026-03-12, the Daytona workspace bootstrap flow reproduced this failure:

1. Remove sandbox.
2. Create sandbox.
3. Open `Dev Server`.
4. Observe `make anon` fail inside the sandbox.

Concrete failures seen in the dev-server/install logs:

- `InvalidDeploymentName: Couldn't parse deployment name local-1c49`
- `Local deployment must be anonymous/local (got dev:quiet-robin-508 ...)`

The underlying issue is architectural, not just one bad string:

1. the seed-copy flow needs access to shared dev deployment credentials
2. the active sandbox runtime should still default to local anonymous Convex
3. Daytona resource naming/auth also needs deployment context

Those three concerns have been leaking into each other.

The current system already has the right low-level primitive for seed copying:
`scripts/convex-sync-dev-env.js` accepts `--source-env <path>` and writes a
separate `.env.anon-seed.local` file. The missing contract is how Daytona should
provide that source env and any required auth without changing the active
runtime target.

## Terms

### Runtime Profile

The active deployment target that the sandbox backend/frontend run against.

For Daytona workspaces, the default runtime profile must be:

- `local anonymous`

This is represented by `apps/noter/.env.local`.

### Seed Source

A read-only source deployment used only to copy allowlisted values into
`apps/noter/.env.anon-seed.local`.

For Daytona workspaces, the default seed source is:

- the shared cloud dev deployment

This is not the active runtime.

### Control-Plane Deployment Identity

The deployment information used by Daytona-facing backend logic for:

1. naming
2. scoping
3. auth to Noter-managed Daytona flows

This may come from `DAYTONA_CONVEX_DEPLOY_KEY`, but it must not implicitly
change the runtime profile of the sandbox dev server.

## Goals

1. Keep Daytona workspace dev servers on local anonymous Convex by default.
2. Preserve the ability to copy allowlisted seed variables from the shared cloud
   dev deployment.
3. Avoid using git worktrees inside Daytona sandboxes by default.
4. Make any switch from local anonymous to shared dev explicit.
5. Prevent `CONVEX_DEPLOY_KEY` leakage into the long-lived shell/dev-server
   runtime environment.
6. Reuse the existing `make anon` / `make anon-once` flow where practical.

## Non-Goals

1. Replacing the local host-side git worktree workflow.
2. Making Daytona sandboxes branch-per-worktree by default.
3. Removing `DAYTONA_CONVEX_DEPLOY_KEY` from all backend flows.
4. Solving Daytona naming/worktree scoping in this spec.
5. Turning `convex-dev.js` into a fully generic multi-profile runtime launcher
   in the first rollout.

## Locked Decisions

### 1. Daytona Workspaces Default To One Normal Checkout

The default Daytona workspace model is:

1. one sandbox per agent/workspace context
2. one normal repo checkout inside that sandbox
3. no automatic git worktree creation inside the sandbox

This follows the direction already noted in
`specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`: worktrees inside a
sandbox are optional, not the baseline model.

### 2. `.env.local` Remains The Active Runtime File

Inside a Daytona workspace sandbox:

1. `apps/noter/.env.local` remains the active runtime file
2. it must resolve to a local anonymous deployment by default
3. `convex-dev.js`, `predev.js`, and related runtime scripts may continue to
   treat `.env.local` as the active runtime contract in the first rollout

This avoids a wide refactor of the local runtime path.

### 3. `.env.anon-seed.local` Remains A Seed Output File

`apps/noter/.env.anon-seed.local` remains:

1. a generated seed file
2. the input to the local seed replay flow
3. not an active runtime file

It exists to transport allowlisted values into the local anonymous deployment.

### 4. Daytona Must Use An Explicit Seed Source File

Daytona sandbox bootstrap must not rely on accidental discovery of a source env
from `git worktree list`.

Instead, Daytona must provide an explicit source env file to the seed-copy step.

Recommended file:

- `apps/noter/.env.daytona-source.local`

Contract:

1. the file is generated inside the sandbox
2. it is not committed
3. it contains only the minimum deployment selector needed for the source side
4. it does not become the active runtime file

At minimum, it should contain:

- `CONVEX_DEPLOYMENT=dev:<deployment-name>`

where `<deployment-name>` is derived from the Daytona-side dev deployment
identity.

### 5. Source Auth Must Be Scoped To The Copy Step Only

If the Convex CLI inside the sandbox needs a deploy key to read the shared dev
deployment env, that auth must be scoped only to the seed-copy subprocess.

Rules:

1. `CONVEX_DEPLOY_KEY` must not be exported globally into the long-lived Daytona
   shell/dev-server environment for local mode
2. `CONVEX_DEPLOY_KEY` must not be written into `apps/noter/.env.local`
3. `CONVEX_DEPLOY_KEY` must not be used as the active runtime selector for
   `make anon`
4. `DAYTONA_CONVEX_DEPLOY_KEY` may remain available to Daytona-specific backend
   logic and/or local Convex env when intentionally seeded for Daytona features

The local-mode invariant is:

- shared dev credentials may be used to copy seed values
- shared dev credentials must not silently turn local runtime into cloud dev

### 6. Remote Dev Runtime Must Be Explicit

If Noter later supports running a Daytona workspace directly against the shared
dev deployment, that must be:

1. explicit in product/UI
2. modeled as a different runtime profile
3. separate from the default `Create sandbox` -> `Open Dev Server` flow

The default Daytona workspace path remains:

- local anonymous runtime

### 7. Daytona Uses Wrapper Targets Over The Shared Anon Primitive

Inside Daytona sandboxes, the preferred operator-facing bootstrap commands are:

- `make daytona-local`
- `make daytona-local-once`

Contract:

1. these are Daytona-specific wrappers over the shared anon flow
2. they delegate to `make anon` / `make anon-once`
3. they may pass Daytona-only concerns such as explicit source env selection,
   scoped source auth, and `--no-branch`
4. `make anon` remains the reusable low-level primitive, not the clearest
   Daytona-facing command name

## File And Env Contract

### Active Runtime

`apps/noter/.env.local`

Requirements:

1. points to the local anonymous deployment
2. remains the runtime file used by `convex-dev.js`
3. must not contain `CONVEX_DEPLOY_KEY` in default Daytona local mode

### Seed Output

`apps/noter/.env.anon-seed.local`

Requirements:

1. generated by `scripts/convex-sync-dev-env.js`
2. contains local `CONVEX_DEPLOYMENT` plus allowlisted seed inputs
3. is consumed by `scripts/convex-seed-dev-auth.js`
4. is not treated as the active runtime file

### Daytona Source File

`apps/noter/.env.daytona-source.local`

Requirements:

1. generated only for Daytona-managed sandbox bootstrap
2. contains source-side deployment selection data
3. is passed explicitly via `--source-env`
4. is not used by `convex-dev.js` as the active runtime file

### Env Var Roles

`DAYTONA_CONVEX_DEPLOY_KEY`

1. Daytona control-plane identity
2. optional source-auth input for seed copying
3. may be stored in local Convex env only where Daytona backend features require
   it

`CONVEX_DEPLOY_KEY`

1. reserved for explicit Convex CLI auth to a cloud deployment
2. must be scoped to the seed-copy subprocess only in Daytona local mode
3. must not be globally exported for `make anon` default runtime

## Bootstrap Contract

### Local Host Worktree Flow

The existing local host-side worktree flow remains valid:

1. `make anon` starts a local anonymous deployment
2. `scripts/convex-sync-dev-env.js` may auto-discover a cloud dev source env
   from the main worktree
3. `scripts/convex-seed-dev-auth.js` replays allowlisted values into the local
   anonymous deployment

This spec does not replace that flow.

### Daytona Workspace Flow

The Daytona workspace bootstrap flow must be:

1. start local anonymous Convex runtime in `apps/noter/.env.local`
2. generate `apps/noter/.env.daytona-source.local`
3. run
   `scripts/convex-sync-dev-env.js --source-env apps/noter/.env.daytona-source.local`
4. if needed, provide source auth only to that sync command
5. write `apps/noter/.env.anon-seed.local`
6. run `scripts/convex-seed-dev-auth.js`
7. refresh local anonymous auth keys
8. start the normal dev runtime

The key invariant is:

- the source env is explicit
- the active runtime stays local anonymous

## Make And Script Contract

The preferred implementation is a minimal extension of the current bootstrap
path, not a full runtime-profile rewrite.

### `make daytona-local` / `make daytona-local-once`

These wrapper targets are the preferred Daytona sandbox entrypoints.

They should:

1. generate `apps/noter/.env.daytona-source.local` when a Daytona cloud dev
   source can be derived
2. delegate to `make anon` / `make anon-once`
3. pass `--no-branch` so sandboxes do not invent internal worktree branches
4. pass explicit source-selection inputs only when the source env exists

### `make anon` / `make anon-once`

These targets remain the shared low-level bootstrap entrypoints.

They should gain optional source-selection inputs used by Daytona wrappers:

1. `ANON_SOURCE_ENV`
2. `ANON_SOURCE_DEPLOY_KEY` or equivalent scoped input

Rules:

1. if `ANON_SOURCE_ENV` is unset, current auto-discovery behavior remains
2. if `ANON_SOURCE_ENV` is set, `scripts/convex-sync-dev-env.js` must use that
   path explicitly
3. if source auth is required, it must be applied only to the sync command, not
   to the entire `make anon` process tree

### `scripts/convex-sync-dev-env.js`

This script already has the right core primitive:

- `--source-env <path>`

This spec keeps that as the explicit source selector.

This script should continue to:

1. read local anonymous `.env.local` as the target runtime identity
2. read the source env file separately
3. write `apps/noter/.env.anon-seed.local`

### `convex-dev.js`

Do not make `convex-dev.js` fully multi-profile in the first rollout.

Keep the simpler contract:

1. `.env.local` is the active runtime file
2. Daytona source selection is handled outside `convex-dev.js`

## Product Contract

### Default Daytona UX

For `Create sandbox` followed by `Open Dev Server`:

1. the sandbox uses local anonymous Convex runtime
2. the shared cloud dev deployment is used only as a seed source
3. internal git worktrees are not created by default

### Future Optional UX

If Noter adds a user-visible runtime switch later, it should expose explicit
choices such as:

1. `Local anonymous`
2. `Shared dev`

That is a separate follow-up and not part of the default flow in this spec.

## Acceptance Criteria

1. In a fresh Daytona workspace sandbox, `Open Dev Server` no longer fails with
   `InvalidDeploymentName` or
   `Local deployment must be anonymous/local (got dev:...)`.
2. `apps/noter/.env.local` inside the sandbox still resolves to a local
   anonymous deployment after bootstrap.
3. The seed-copy step can still read allowlisted values from the shared cloud
   dev deployment using an explicit source env.
4. `CONVEX_DEPLOY_KEY` is not present as a long-lived global runtime env var in
   the default Daytona local mode.
5. Multiple Daytona sandboxes can run concurrently without relying on internal
   git worktrees.
6. Any future switch to shared dev runtime is explicit and not the default.

## Implementation Plan

1. Add a Daytona-specific explicit source env file contract.
2. Add Daytona wrapper bootstrap targets over the shared anon flow.
3. Extend `make anon` / `make anon-once` with optional source-selection inputs.
4. Scope cloud source auth only to the seed-copy step.
5. Update Daytona dev-server bootstrap to use the explicit Daytona local
   wrapper.
6. Add regression coverage for the default Daytona local-mode path.

## Implementation Checklist

- [x] Add a Daytona-specific explicit source env generator.
- [x] Add `make daytona-local` / `make daytona-local-once` wrapper targets.
- [x] Extend `make anon` / `make anon-once` with optional source inputs.
- [x] Scope cloud source auth only to the seed-copy step.
- [x] Update Daytona dev-server bootstrap to use the explicit Daytona local
      wrapper.
- [x] Add regression coverage for the default Daytona local-mode path.

## Deferred Follow-Ups

1. Local/worktree-unique Daytona resource naming.
2. Whether `apps/noter/.env.daytona-source.local` should persist in-repo or be
   generated under `/tmp` and referenced by absolute path.
3. Whether the Convex CLI should gain a more direct first-class deploy-key +
   source-env workflow that reduces wrapper logic further.
