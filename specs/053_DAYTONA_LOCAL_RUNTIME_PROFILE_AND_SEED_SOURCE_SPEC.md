# 053 Daytona Local Runtime Profile And Seed Source Spec

## Status

- In progress
- Last updated: 2026-03-13

## Related Specs

- `specs/025_MULTI_WORKTREE_OAUTH_BROKER_SPEC.md`
- `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
- `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
- `specs/051_DAYTONA_STANDARD_RUNTIME_AND_PTY_SESSIONS_SPEC.md`
- `specs/052_DAYTONA_RUNTIME_MANIFEST_AND_SANDBOX_PROGRAMS_SPEC.md`

## Summary

Define an explicit separation between:

1. the workspace materialization mode used to construct or refresh a Daytona
   sandbox
2. the active Convex runtime target used by a Daytona workspace sandbox
3. the cloud dev deployment used as a read-only seed source
4. the Daytona control-plane deployment identity used for naming and auth
5. the explicit Daytona-local bootstrap entrypoint used by the current repo
   shape

Default Daytona workspace sandboxes to:

1. one normal repo checkout inside the sandbox
2. a local anonymous Convex runtime in `.env.local`
3. a separate explicit source file only for copying allowlisted seed variables

Require both Daytona provisioning modes:

1. optimized snapshot-backed materialization
2. live/debug materialization

to converge on the same final `daytona-local` runtime contract.

The cloud dev deployment must remain available for seed copying, but it must not
silently become the active runtime target for `make anon` inside the sandbox.

This spec also covers the gap between the two repo shapes Noter currently boots
in Daytona:

1. the local monorepo/worktree shape (`apps/noter` app root)
2. the seeded starter-template repo shape (repo-root app root)

## Problem

On 2026-03-12, the Daytona workspace bootstrap flow reproduced this failure:

1. Remove sandbox.
2. Create sandbox.
3. Open `Dev Server`.
4. Observe Vite start, Convex prompt for login, and the preview fail.

Concrete failures seen across the 2026-03-12 Daytona reruns:

- `InvalidDeploymentName: Couldn't parse deployment name local-1c49`
- `Local deployment must be anonymous/local (got dev:quiet-robin-508 ...)`
- `Welcome to Convex! Would you like to login to your account?`
- `Missing VITE_CONVEX_URL in environment`

The underlying issue is architectural, not just one bad string:

1. the seed-copy flow needs access to shared dev deployment credentials
2. the active sandbox runtime should still default to local anonymous Convex
3. Daytona resource naming/auth also needs deployment context

Those three concerns have been leaking into each other.

The current system already has the right low-level primitive for seed copying:
`scripts/convex-sync-dev-env.ts` accepts `--source-env <path>` and writes a
separate `.env.anon-seed.local` file. The missing contract is how Daytona should
provide that source env and any required auth without changing the active
runtime target.

Manual verification of the current PR branch found additional concrete gaps:

1. the main repo now exposes `make daytona-local`, but the seeded starter repo
   does not expose an equivalent explicit Daytona-local entrypoint
2. the Daytona launcher therefore falls back to raw `pnpm run dev` in the
   starter repo, which skips the anonymous bootstrap entirely
3. created Daytona sandboxes currently inject `NOTER_*` metadata, but not
   `DAYTONA_CONVEX_DEPLOY_KEY`
4. because of 1-3, the starter repo never generates an explicit source env,
   never runs the seed-copy bootstrap, and instead starts raw `convex dev`

Follow-up validation on 2026-03-13 proved the main-repo bootstrap fixes in
isolation:

1. the sandbox receives `DAYTONA_CONVEX_DEPLOY_KEY`
2. `make daytona-local-once` succeeds inside the sandbox when the repo checkout
   is refreshed to the PR branch
3. the sandbox produces `.env.local`, `.env.daytona-source.local`, and
   `.env.anon-seed.local`
4. Daytona preview loads successfully once the frontend is started on `5173`
   against that bootstrapped anonymous backend

The remaining product gap is different from "non-main branches":

1. snapshot-backed materialization and live/debug materialization are not yet
   first-class provisioning modes
2. the dashboard should remain the control surface, but today reproducing or
   debugging bootstrap failures still requires direct sandbox mutation
3. there is no normalized runtime equivalence check proving that the optimized
   path and the live/debug path end in the same final state

So the next spec scope is:

- separate workspace materialization from runtime bootstrap
- guarantee both provisioning modes converge on the same runtime contract
- prove that convergence with a normalized runtime manifest

## Terms

### Runtime Profile

The active deployment target that the sandbox backend/frontend run against.

For Daytona workspaces, the default runtime profile must be:

- `local anonymous`

This is represented by `<app-root>/.env.local`.

### Seed Source

A read-only source deployment used only to copy allowlisted values into
`<app-root>/.env.anon-seed.local`.

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

### App Root

The directory in the current repo shape that owns the runtime files for the app:

1. `package.json`
2. `convex/`
3. `.env.local`
4. `.env.anon-seed.local`
5. `.env.daytona-source.local`

Examples:

- monorepo/worktree repo shape: `apps/noter`
- seeded starter-template repo shape: repo root

Unless otherwise noted, env-file paths in this spec are relative to the app
root.

### Provisioning Mode

The way Daytona materializes repo contents before bootstrap starts.

Initial modes:

- `snapshot-backed`
- `live/debug`

Provisioning mode chooses how the repo checkout and dependency layer are
materialized. It does not change the runtime profile or the bootstrap contract.

### Runtime Manifest

A normalized, redacted JSON summary of the final bootstrapped sandbox state.

This is the contract used to compare two Daytona provisioning modes for the same
commit.

It should include deterministic facts such as:

1. repo `HEAD`
2. normalized env artifacts
3. bootstrap outputs
4. listening services
5. preview or health success

It should exclude nondeterministic facts such as:

1. timestamps
2. raw logs
3. PIDs
4. full image bytes

## Goals

1. Keep Daytona workspace dev servers on local anonymous Convex by default.
2. Preserve the ability to copy allowlisted seed variables from the shared cloud
   dev deployment.
3. Avoid using git worktrees inside Daytona sandboxes by default.
4. Make any switch from local anonymous to shared dev explicit.
5. Prevent `CONVEX_DEPLOY_KEY` leakage into the long-lived shell/dev-server
   runtime environment.
6. Reuse the existing `make anon` / `make anon-once` flow where practical.
7. Ensure seeded starter-template repos boot Daytona through an explicit local
   bootstrap entrypoint instead of raw `pnpm run dev`.
8. Distinguish workspace materialization from runtime bootstrap.
9. Add a first-class live/debug provisioning mode for debugging bootstrap
   failures without changing the runtime contract.
10. Add a normalized runtime-manifest comparison proving the optimized path and
    the live/debug path converge on the same final state.

## Non-Goals

1. Replacing the local host-side git worktree workflow.
2. Making Daytona sandboxes branch-per-worktree by default.
3. Removing `DAYTONA_CONVEX_DEPLOY_KEY` from all backend flows.
4. Solving Daytona naming/worktree scoping in this spec.
5. Turning `apps/noter/scripts/convex-dev.ts` into a fully generic multi-profile
   runtime launcher in the first rollout.
6. Comparing raw Daytona snapshot/image bytes as the primary correctness signal.

## Locked Decisions

### 1. Daytona Workspaces Default To One Normal Checkout

The default Daytona workspace model is:

1. one sandbox per agent/workspace context
2. one normal repo checkout inside that sandbox
3. no automatic git worktree creation inside the sandbox

This follows the direction already noted in
`specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`: worktrees inside a
sandbox are optional, not the baseline model.

### 2. App-Root `.env.local` Remains The Active Runtime File

Inside a Daytona workspace sandbox:

1. `<app-root>/.env.local` remains the active runtime file
2. it must resolve to a local anonymous deployment by default
3. `apps/noter/scripts/convex-dev.ts`, `apps/noter/scripts/predev.ts`, and
   related runtime scripts may continue to treat `.env.local` as the active
   runtime contract in the first rollout

This avoids a wide refactor of the local runtime path.

Examples:

1. monorepo/worktree: `apps/noter/.env.local`
2. seeded starter repo: `.env.local`

### 3. App-Root `.env.anon-seed.local` Remains A Seed Output File

`<app-root>/.env.anon-seed.local` remains:

1. a generated seed file
2. the input to the local seed replay flow
3. not an active runtime file

It exists to transport allowlisted values into the local anonymous deployment.

### 4. Daytona Must Use An Explicit Seed Source File

Daytona sandbox bootstrap must not rely on accidental discovery of a source env
from `git worktree list`.

Instead, Daytona must provide an explicit source env file to the seed-copy step.

Recommended file:

- `<app-root>/.env.daytona-source.local`

Contract:

1. the file is generated inside the sandbox
2. it is not committed
3. it contains the source-side deployment selector
4. when required by the Convex CLI, it also contains scoped source auth
5. it is only passed to the seed-copy step
6. it does not become the active runtime file

At minimum, it should contain:

- `CONVEX_DEPLOYMENT=dev:<deployment-name>`

where `<deployment-name>` is derived from the Daytona-side dev deployment
identity.

When source-side auth is required for
`npx convex env list --env-file <app-root>/.env.daytona-source.local`, it must
also contain:

- `CONVEX_DEPLOY_KEY=<deploy-key>`

This auth lives in the explicit Daytona source file because the current Convex
CLI path does not reliably honor parent-process `CONVEX_DEPLOY_KEY` when
`--env-file` is used.

Examples:

1. monorepo/worktree: `apps/noter/.env.daytona-source.local`
2. seeded starter repo: `.env.daytona-source.local`

### 5. Source Auth Must Be Scoped To The Copy Step Only

If the Convex CLI inside the sandbox needs a deploy key to read the shared dev
deployment env, that auth must be scoped only to the seed-copy subprocess.

Rules:

1. `CONVEX_DEPLOY_KEY` must not be exported globally into the long-lived Daytona
   shell/dev-server environment for local mode
2. `CONVEX_DEPLOY_KEY` must not be written into `<app-root>/.env.local`
3. `CONVEX_DEPLOY_KEY` must not be used as the active runtime selector for
   `make anon`
4. `DAYTONA_CONVEX_DEPLOY_KEY` may remain available to Daytona-specific backend
   logic and/or local Convex env when intentionally seeded for Daytona features
5. writing `CONVEX_DEPLOY_KEY` into `<app-root>/.env.daytona-source.local` is
   allowed only because that file is passed explicitly to the seed-copy step and
   is not the active runtime file

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

For repo shapes that ship a root `Makefile`, Daytona should invoke those target
names directly.

### 8. `DAYTONA_CONVEX_DEPLOY_KEY` Must Be Available Inside The Sandbox

When the Daytona control plane has `DAYTONA_CONVEX_DEPLOY_KEY`, the created
sandbox must receive that same env var.

Rules:

1. it may remain available in the sandbox environment as
   `DAYTONA_CONVEX_DEPLOY_KEY`
2. bootstrap scripts may read it to derive
   `<app-root>/.env.daytona-source.local`
3. it must not be blindly rewritten to a long-lived global `CONVEX_DEPLOY_KEY`
4. it must not be written into `<app-root>/.env.local`

### 9. Noter-Managed Generated Repos Must Expose An Explicit Daytona Entry Point

The seeded repo created from the exported `notermd/app` snapshot must expose an
explicit Daytona-local bootstrap entrypoint at the repo root when Daytona
support is enabled for generated apps.

Preferred first rollout:

1. add a repo-root `Makefile` to `notermd/app`
2. expose `daytona-local` and `daytona-local-once`
3. keep `pnpm run dev` as the inner dev command started after bootstrap
4. do not treat raw `pnpm run dev` as a sufficient Daytona bootstrap contract

### 10. Snapshot-Backed And Live/Debug Are Provisioning Modes, Not Runtime Profiles

Daytona needs at least two provisioning modes:

1. `snapshot-backed`
2. `live/debug`

These choose how a sandbox reaches the target repo contents.

They must not define different runtime behavior.

Both modes must end in the same:

1. repo content
2. env-file contract
3. anonymous local Convex bootstrap
4. frontend preview contract

The live/debug path exists to reproduce bootstrap failures and validate fixes,
not to invent an alternate runtime profile.

### 11. Runtime Equivalence Is Validated By A Normalized Runtime Manifest

Do not compare raw snapshot/image bytes.

Instead, compare a normalized runtime manifest collected after bootstrap.

That manifest should be:

1. deterministic
2. redacted for secrets
3. stable across timestamps and process IDs
4. strict enough to prove both provisioning modes converge on the same final
   runtime state

## File And Env Contract

### Active Runtime

`<app-root>/.env.local`

Requirements:

1. points to the local anonymous deployment
2. remains the runtime file used by `apps/noter/scripts/convex-dev.ts`
3. must not contain `CONVEX_DEPLOY_KEY` in default Daytona local mode

### Seed Output

`<app-root>/.env.anon-seed.local`

Requirements:

1. generated by `scripts/convex-sync-dev-env.ts`
2. contains local `CONVEX_DEPLOYMENT` plus allowlisted seed inputs
3. is consumed by `scripts/convex-seed-dev-auth.ts`
4. is not treated as the active runtime file

### Daytona Source File

`<app-root>/.env.daytona-source.local`

Requirements:

1. generated only for Daytona-managed sandbox bootstrap
2. contains source-side deployment selection data
3. contains scoped source auth when the Convex CLI needs it for
   `--env-file`-based cloud reads
4. is passed explicitly via `--source-env`
5. is not used by `apps/noter/scripts/convex-dev.ts` as the active runtime file

### Env Var Roles

`DAYTONA_CONVEX_DEPLOY_KEY`

1. Daytona control-plane identity
2. optional source-auth input for seed copying
3. may be stored in local Convex env only where Daytona backend features require
   it
4. must be injected into the created Daytona sandbox when available so local
   bootstrap can derive the explicit source env file

`CONVEX_DEPLOY_KEY`

1. reserved for explicit Convex CLI auth to a cloud deployment
2. must be scoped to the seed-copy subprocess only in Daytona local mode
3. must not be globally exported for `make anon` default runtime

## Bootstrap Contract

### Local Host Worktree Flow

The existing local host-side worktree flow remains valid:

1. `make anon` starts a local anonymous deployment
2. `scripts/convex-sync-dev-env.ts` may auto-discover a cloud dev source env
   from the main worktree
3. `scripts/convex-seed-dev-auth.ts` replays allowlisted values into the local
   anonymous deployment

This spec does not replace that flow.

### Daytona Workspace Flow

The Daytona workspace bootstrap flow must be:

1. create the sandbox with `DAYTONA_CONVEX_DEPLOY_KEY` available in sandbox env
   when configured on the control plane
2. resolve the repo's explicit Daytona-local bootstrap entrypoint
3. start local anonymous Convex runtime in `<app-root>/.env.local`
4. generate `<app-root>/.env.daytona-source.local`
5. run
   `scripts/convex-sync-dev-env.ts --source-env <app-root>/.env.daytona-source.local`
6. if needed, provide source auth only to that sync command
7. write `<app-root>/.env.anon-seed.local`
8. run `scripts/convex-seed-dev-auth.ts`
9. refresh local anonymous auth keys
10. start the normal dev runtime

The key invariant is:

- the source env is explicit
- the active runtime stays local anonymous

For Noter-managed starter repos, raw `pnpm run dev` is not a substitute for
steps 2-9.

## Provisioning Contract

### Snapshot-Backed Materialization

The optimized path may:

1. use a commit-pinned Daytona snapshot
2. optionally reuse a cached dependency image
3. materialize repo contents before bootstrap begins

But after materialization it must still run the same `daytona-local` bootstrap
contract.

Snapshot-backed materialization is an optimization, not a different runtime
mode.

### Live/Debug Materialization

The debug path may:

1. create or reuse a normal sandbox without depending on matching snapshot
   freshness
2. fetch or reset the repo to the target commit or branch
3. then run the same `daytona-local` bootstrap contract

This path exists so bootstrap failures can be reproduced and fixed without
depending on the snapshot pipeline.

### Shared Invariant

For the same target commit, both provisioning modes must converge on the same
normalized runtime manifest.

## Make And Script Contract

The preferred implementation is a minimal extension of the current bootstrap
path, not a full runtime-profile rewrite.

### `make daytona-local` / `make daytona-local-once`

For repos that ship a root `Makefile`, these wrapper targets are the preferred
Daytona sandbox entrypoints.

They should:

1. generate `<app-root>/.env.daytona-source.local` when a Daytona cloud dev
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
2. if `ANON_SOURCE_ENV` is set, `scripts/convex-sync-dev-env.ts` must use that
   path explicitly
3. if source auth is required, it must be applied only to the sync command, not
   to the entire `make anon` process tree

### `scripts/convex-sync-dev-env.ts`

This script already has the right core primitive:

- `--source-env <path>`

This spec keeps that as the explicit source selector.

This script should continue to:

1. read local anonymous `.env.local` as the target runtime identity
2. read the source env file separately
3. write `<app-root>/.env.anon-seed.local`

### `scripts/daytona-write-source-env.ts`

This script is responsible for generating the explicit Daytona source file.

It should:

1. derive `CONVEX_DEPLOYMENT=dev:*` from `DAYTONA_CONVEX_DEPLOY_KEY`
2. write `CONVEX_DEPLOY_KEY` into the source file when the Convex CLI requires
   it for `--env-file` auth
3. avoid touching `<app-root>/.env.local`
4. remain Daytona-specific rather than becoming the active runtime selector

### `apps/noter/scripts/convex-dev.ts`

Do not make `apps/noter/scripts/convex-dev.ts` fully multi-profile in the first
rollout.

Keep the simpler contract:

1. `.env.local` is the active runtime file
2. Daytona source selection is handled outside
   `apps/noter/scripts/convex-dev.ts`

### Generated `notermd/app` Repositories

The seeded generated repo must carry its own explicit Daytona bootstrap
contract.

Required first-rollout changes:

1. add a repo-root bootstrap entrypoint to `notermd/app`
2. preferred initial implementation: repo-root `Makefile` exposing
   `daytona-local` and `daytona-local-once`
3. use repo-root env files (`.env.local`, `.env.anon-seed.local`,
   `.env.daytona-source.local`) instead of `apps/noter/...`
4. keep `pnpm run dev` as the inner app runtime, not the outer Daytona bootstrap
   command
5. ensure `pnpm run template:export` includes any new root bootstrap assets so
   seeded repos receive them

### Daytona Launcher Resolution

For Noter-managed repos, the launcher must prefer explicit Daytona-local
bootstrap entrypoints and fail closed when they are missing.

Rules:

1. prefer explicit Daytona-local wrapper entrypoints over raw dev commands
2. do not silently fall back to raw `pnpm run dev` for generated
   `notermd/app`-derived repos
3. if a Noter-managed repo lacks the required explicit Daytona-local entrypoint,
   return an actionable error instead of starting a partially bootstrapped dev
   server

## Product Contract

### Default Daytona UX

For `Create sandbox` followed by `Open Dev Server`:

1. the dashboard remains the control surface
2. the sandbox uses local anonymous Convex runtime
3. the shared cloud dev deployment is used only as a seed source
4. internal git worktrees are not created by default
5. product may choose snapshot-backed or live/debug materialization, but both
   must end in the same `daytona-local` runtime contract

### Future Optional UX

If Noter adds a user-visible runtime switch later, it should expose explicit
choices such as:

1. `Local anonymous`
2. `Shared dev`

That is a separate follow-up and not part of the default flow in this spec.

## Acceptance Criteria

1. In the existing `noter` repo shape, the dashboard never silently falls back
   to raw `make run` or `pnpm run dev` when explicit `daytona-local` bootstrap
   is required.
2. `DAYTONA_CONVEX_DEPLOY_KEY` is available inside the sandbox env when it is
   configured on the Daytona control plane.
3. `<app-root>/.env.daytona-source.local` contains the explicit source-side
   deployment selector and, when needed by the Convex CLI, scoped source auth.
4. `<app-root>/.env.local` inside the sandbox still resolves to a local
   anonymous deployment after bootstrap.
5. `make daytona-local-once` succeeds for the target commit inside a Daytona
   sandbox and produces `<app-root>/.env.local`,
   `<app-root>/.env.daytona-source.local`, and
   `<app-root>/.env.anon-seed.local`.
6. `CONVEX_DEPLOY_KEY` is not present as a long-lived global runtime env var in
   the default Daytona local mode.
7. The bootstrapped sandbox can serve the frontend on port `5173` and the
   Daytona preview loads successfully.
8. Product supports both snapshot-backed and live/debug provisioning modes, and
   both run the same `daytona-local` bootstrap contract.
9. For the same target commit, the normalized runtime manifest matches between
   snapshot-backed and live/debug provisioning modes.
10. The dashboard remains the operator control surface for both provisioning
    modes; reproducing bootstrap failures must not require vault-route-only or
    CLI-only steps in the product path.
11. In a fresh Daytona workspace sandbox seeded from `notermd/app`,
    `Open Dev Server` uses an explicit Daytona-local bootstrap entrypoint
    instead of raw `pnpm run dev`.
12. Multiple Daytona sandboxes can run concurrently without relying on internal
    git worktrees.
13. Any future switch to shared dev runtime is explicit and not the default.

## Implementation Plan

1. Lock the runtime contract around `daytona-local`, explicit source env, and
   scoped source auth.
2. Add a normalized runtime-manifest collector and comparer.
3. Add a first-class live/debug provisioning mode for the existing `noter` repo
   path.
4. Teach the dashboard to choose between snapshot-backed and live/debug
   materialization while always converging on the same bootstrap contract.
5. Reset dev-server and bootstrap log state per run so the dashboard reflects
   the current attempt rather than stale output.
6. Extend the same explicit contract to the starter-template repo shape.
7. Add regression coverage and manual validation proving runtime equivalence
   between provisioning modes.

## Implementation Checklist

### Baseline Already Proven On The Existing `noter` Repo Path

- [x] Add a Daytona-specific explicit source env generator for the main-repo
      flow.
- [x] Add main-repo `make daytona-local` / `make daytona-local-once` wrapper
      targets.
- [x] Extend main-repo `make anon` / `make anon-once` with optional explicit
      source inputs.
- [x] Scope cloud source auth to the explicit seed-copy contract instead of the
      long-lived runtime environment.
- [x] Inject `DAYTONA_CONVEX_DEPLOY_KEY` into created Daytona sandboxes.
- [x] Make the main-repo Daytona launcher fail closed instead of silently
      falling back to raw dev startup.
- [x] Write `CONVEX_DEPLOY_KEY` into `.env.daytona-source.local` when Convex CLI
      `--env-file` auth requires it.
- [x] Prove inside a Daytona sandbox that `make daytona-local-once` reaches the
      anonymous local + seed-copy success state for the target commit.

### Immediate Next Work

- [ ] Add `scripts/daytona-runtime-manifest.ts` to emit a redacted normalized
      runtime manifest from a bootstrapped sandbox.
- [ ] Add a comparer or integration validation that diffs runtime manifests
      between snapshot-backed and live/debug provisioning modes for the same
      commit.
- [ ] Add a first-class live/debug provisioning mode for the existing `noter`
      repo path that refreshes the target commit without relying on snapshot
      freshness.
- [ ] Teach dashboard Daytona actions to choose snapshot-backed vs live/debug
      materialization while always invoking the same `daytona-local` contract.
- [ ] Reset dev-server and install-log state per run so the dashboard shows the
      current bootstrap result instead of stale output after repo refresh or
      reprovision.
- [ ] Re-run Playwright from the dashboard-only flow and confirm both
      provisioning modes converge on the same runtime manifest and a working
      preview.

### Follow-On Work For The Generated Repo Shape

- [ ] Generalize the Daytona env-file contract to app-root-relative paths so
      seeded starter repos use repo-root `.env*` files.
- [ ] Add repo-root Daytona bootstrap entrypoints to `notermd/app`.
- [ ] Ensure the generated repo Daytona launcher uses the explicit bootstrap
      path and does not fall back to raw `pnpm run dev`.
- [ ] Regenerate/export the `notermd/app` manifest so seeded repos receive the
      new bootstrap files.
- [ ] Re-run Playwright on a fresh Noter-managed starter repo and confirm no
      Convex login prompt, no `Missing VITE_CONVEX_URL` preview failure, and the
      same runtime-manifest contract as the main repo shape.

## Deferred Follow-Ups

1. Local/worktree-unique Daytona resource naming.
2. Whether `<app-root>/.env.daytona-source.local` should persist in-repo or be
   generated under `/tmp` and referenced by absolute path. For starter-template
   repos, this follow-up should be evaluated against repo-root `.env*` files.
3. Whether the Convex CLI should gain a more direct first-class deploy-key +
   source-env workflow that reduces wrapper logic further.
4. Branch-specific snapshot materialization. This is an optimization follow-up,
   not the core fix for bootstrap reproducibility.
5. Whether non-Noter-managed connected repos should eventually advertise an
   explicit Daytona-local contract or fail with a tailored unsupported message.
