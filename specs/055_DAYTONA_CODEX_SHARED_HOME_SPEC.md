# 055 Daytona Codex Shared Home Spec

## Status

- Implemented
- Source of truth for Daytona Codex home behavior
- Last updated: 2026-03-16

## Summary

Noter keeps one shared Codex state surface per user across Daytona auth and
workspace sandboxes, but the shared Daytona volume is no longer mounted directly
at `CODEX_HOME`.

The implemented contract is:

- app-level Codex usage runs as sandbox user `daytona`
- live `CODEX_HOME` is a local writable directory at `/home/daytona/.codex`
- the shared Daytona volume is mounted at `/home/daytona/.codex-shared`
- persistent shared entries are projected from the backing mount into the local
  Codex home
- shared Codex config also pretrusts the active repo path for workspace shells
- sandbox-local temp/log paths stay local to avoid Daytona volume permission
  edge cases
- legacy sandboxes that still mount the volume directly at
  `/home/daytona/.codex` are incompatible and must be recreated

This preserves shared auth/config/memories without relying on a direct mutable
volume mount for the whole live Codex home.

## Problem

Two earlier models were not good enough:

1. the original auth-volume model mounted the shared Codex volume at
   `/root/.codex`
2. the first shared-home follow-up mounted the same shared volume directly at
   `/home/daytona/.codex`

The direct `/home/daytona/.codex` mount still failed in real sandboxes. Observed
behavior during local and production-style validation:

1. sandbox commands often still started as `root` unless explicitly switched to
   `daytona`
2. the mounted Daytona volume materialized under the sandbox with ownership that
   behaved like `nobody:nogroup`
3. Codex could read auth, but operations that expect a normal writable home,
   especially temp-file chmod/chown behavior, failed with
   `Operation not permitted`
4. opening a workspace shell could attach to a stale legacy sandbox and fail
   while trying to repair `/home/daytona/.codex`

The critical concrete failure observed under `strace` was a chmod failure inside
Codex temp-file handling under the directly mounted shared home.

## Goals

1. Keep one shared Codex identity/config/memory surface per user across Daytona
   sandboxes.
2. Make `codex login status` and normal interactive Codex usage work in both the
   auth sandbox and repo workspace sandboxes.
3. Run Noter-managed Codex commands and PTY sessions as the intended sandbox
   user `daytona` even when the raw Daytona process default is `root`.
4. Remove compatibility with stale direct-mount sandboxes instead of carrying
   indefinite fallback logic.

## Non-Goals

1. Do not store Codex auth in Convex documents, repo files, env vars, or
   snapshots.
2. Do not fall back to per-sandbox isolated auth copies as the primary design.
3. Do not treat the shared volume as an auth-only cache; shared Codex state is a
   deliberate product behavior.
4. Do not preserve old `/root/.codex` or direct `/home/daytona/.codex` mount
   behavior for backward compatibility.

## Runtime Contract

### 1. Sandbox user contract

The intended Noter-facing runtime user is:

- user: `daytona`
- group: `daytona`
- home: `/home/daytona`

Noter must not assume the raw Daytona command execution default is already that
user. The implementation therefore explicitly switches command execution and PTY
startup into `daytona` for Codex-facing flows.

Implications:

1. direct `sandbox.process.executeCommand("id -un")` may still return `root`
2. Noter-managed command helpers must run Codex commands as `daytona`
3. embedded PTY shells must auto-switch into `daytona` before handing control to
   the user

### 2. Projected Codex home layout

The live sandbox layout is:

- local live Codex home: `/home/daytona/.codex`
- shared backing mount: `/home/daytona/.codex-shared`

The shared Daytona volume is mounted only at:

- `/home/daytona/.codex-shared`

Noter sets:

- `CODEX_HOME=/home/daytona/.codex`

### 3. Shared vs local entries

The projected Codex home is split intentionally.

Local sandbox-owned paths:

- `/home/daytona/.codex`
- `/home/daytona/.codex/tmp`
- `/home/daytona/.codex/log`

Shared persistent entries projected from the backing mount:

- `/home/daytona/.codex/auth.json`
- `/home/daytona/.codex/memories`

Sandbox-local durable file mirrored to the shared backing mount:

- `/home/daytona/.codex/config.toml`

The local home stays writable by `daytona`. Shared entries are surfaced from
`/home/daytona/.codex-shared` into that live home, but `config.toml` is kept as
a normal local file and synchronized with the shared backing store. Codex
rewrites `config.toml` with an atomic save path that still hits Daytona volume
permission edge cases when the live file itself points directly at the mounted
volume.

### 4. Sandbox creation contract

For both:

1. the per-user Codex auth sandbox
2. normal Daytona workspace sandboxes

Noter must:

1. create the sandbox with `user: "daytona"`
2. set `CODEX_HOME=/home/daytona/.codex`
3. mount the shared Codex volume at `/home/daytona/.codex-shared`
4. ensure the projected local Codex home exists before Codex commands or PTY
   sessions are opened

### 5. Compatibility boundary

A Daytona sandbox is incompatible with the current Codex contract if any of the
following is true:

1. sandbox user is not `daytona`
2. `CODEX_HOME` is set to anything other than `/home/daytona/.codex`
3. the shared Codex volume is mounted directly at `/home/daytona/.codex`
4. the shared Codex auth volume is missing when the sandbox is expected to reuse
   Codex state

Incompatible sandboxes should be deleted and recreated. Noter should not keep
reattaching terminal sessions to them.

### 6. Terminal contract

For workspace shell, workspace dev-server terminal, and Codex auth terminal:

1. ensure the sandbox is started
2. ensure the projected Codex home exists and is writable
3. ensure repo workdir ownership is writable by `daytona` for workspace shells
4. open the PTY session with initial input that switches into a `daytona` shell

This is required because the PTY transport alone does not guarantee the desired
user context.

### 7. Shared-state semantics

This design still preserves one shared Codex state surface per user.

Shared across auth/workspace sandboxes:

- login state
- shared Codex config state (mirrored from the local live `config.toml`)
- memories
- other future durable Codex state represented by projected shared entries

Sandbox-local only:

- temp files
- log files
- ephemeral process state

This is the minimum split that preserves the intended product behavior while
avoiding the direct-mount permission failures.

### 8. Workspace trust behavior

For Daytona workspace shells, Noter should prewrite the local live Codex config
and mirror it back to the shared backing store so the active repo path is
trusted by default.

The expected shared config behavior is:

1. keep `no_alt_screen = true`
2. ensure the active workspace repo path is present under `[projects."<path>"]`
3. set `trust_level = "trusted"` for that repo path before the operator runs
   interactive `codex`

This avoids the extra interactive trust prompt for the repo that Noter itself
just opened as the active Daytona workspace.

## Migration / Cleanup Rules

1. Legacy `/root/.codex` auth sandboxes are obsolete.
2. Legacy workspace sandboxes with direct `/home/daytona/.codex` volume mounts
   are obsolete.
3. Terminal resolution must not reattach to those legacy sandboxes by persisted
   id alone.
4. The workspace start path and terminal path must converge on the same
   compatibility contract.
5. If a stale sandbox is discovered, recreate it instead of adding another
   compatibility branch.

## Validation

The expected validation surface is:

1. Providers -> Codex -> `Connect in Daytona`
2. complete `codex login --device-auth`
3. `Check login` reports ready
4. create or open a Daytona workspace sandbox for a repo
5. inside the workspace sandbox, verify:
   - wrapped command user resolves to `daytona`
   - `echo $CODEX_HOME` prints `/home/daytona/.codex`
   - `/home/daytona/.codex` is writable by `daytona`
   - `/home/daytona/.codex/config.toml` is a regular local file, not a symlink
   - `/home/daytona/.codex-shared` is the mounted backing store
   - shared `config.toml` contains the repo path with `trust_level = "trusted"`
   - toggling Codex mode inside the PTY does not emit a config persistence error
   - `command -v codex` succeeds
   - `codex login status` succeeds without the old PATH/log/chmod permission
     warnings

## Concrete Validation Completed On 2026-03-15

Validated locally against the real Daytona API and a temporary repo workspace:

1. auth sandbox reached `Ready in Daytona`
2. workspace sandbox selected by Noter mounted the shared volume at
   `/home/daytona/.codex-shared`
3. wrapped command execution reported user `daytona`
4. live `CODEX_HOME` was `/home/daytona/.codex`
5. `codex login status` in the workspace sandbox returned
   `Logged in using ChatGPT`
6. the prior direct-mount failure
   (`chown ... /home/daytona/.codex: Operation not permitted`) was reproduced on
   a stale sandbox and resolved by treating that sandbox layout as incompatible

## Implementation Files

- `apps/noter/convex/daytona/sandboxUser.ts`
- `apps/noter/convex/daytona/actions.ts`
- `apps/noter/convex/daytona/terminal.ts`
