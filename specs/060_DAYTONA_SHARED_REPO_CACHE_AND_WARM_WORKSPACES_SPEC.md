# 060 Daytona Shared Repo Cache And Warm Workspaces Spec

## Status

- Proposed
- Last updated: 2026-03-16

## Related Specs

- `specs/040_DAYTONA_USAGE_AND_FLOW_SPEC.md`
- `specs/053_DAYTONA_LOCAL_RUNTIME_PROFILE_AND_SEED_SOURCE_SPEC.md`
- `specs/055_DAYTONA_CODEX_SHARED_HOME_SPEC.md`
- `specs/059_DAYTONA_PERSISTENT_TMUX_TERMINALS_SPEC.md`
- `notes/daytona-volume-direct-mount-research-2026-03-16.md`

## Summary

Noter should keep Daytona sandboxes and sandbox-side `tmux` sessions alive, and
make repo checkout plus dependency bootstrap fast by introducing shared
Daytona-backed caches:

1. a per-user-per-repo git mirror cache
2. a per-user pnpm store cache
3. the existing per-user shared Codex state volume

The key design choice is:

- use shared Daytona volumes for durable cache state
- keep the live mutable repo working tree local to each sandbox

This preserves the fast path from local objects and local package tarballs while
avoiding the current unknowns around running a full active worktree directly on
top of a Daytona volume mount.

## Problem

The current Daytona path still does too much cold work in the workspace
lifecycle:

1. repo contents are materialized from snapshot or refreshed from GitHub
2. workspace bootstrap may still need `pnpm install`
3. sandbox replacement resets useful terminal state even when the user only
   needed a newer checkout

That means the product still pays too much for:

1. branch switches
2. new commits on an existing branch
3. opening a fresh workspace after a snapshot or sandbox refresh
4. reconnecting to work that was already in progress

This is especially wasteful now that the product is already moving toward
persistent sandbox-side `tmux` sessions.

## Current State Observed In Repo

### What is already good

1. `startDaytonaWorkspace` already attempts sandbox reuse and resume before
   creating a new sandbox.
2. Codex state is already persisted through a shared Daytona volume.
3. The runtime already supports durable `tmux` sessions for the dev server, and
   a separate spec proposes stable shell sessions.

### What is still missing

1. Shared Daytona volumes are only used for Codex state, not repo or package
   caches.
2. Live/debug mode still fetches from GitHub inside the workspace sandbox and
   hard-resets the repo to the target commit.
3. If `node_modules` is missing, the workspace path still falls back to a full
   `pnpm install`.
4. The current optimized path is still mostly snapshot/image oriented rather
   than cache-volume oriented.

## Goals

1. Keep the operator inside the same sandbox and the same `tmux` sessions across
   routine repo refreshes.
2. Make branch checkout and commit refresh fast enough that recreating a sandbox
   is no longer the default answer.
3. Reuse git objects and pnpm package artifacts from shared Daytona-backed
   storage instead of redownloading them repeatedly.
4. Preserve the existing snapshot/deps-image path as a fallback while the new
   cache path is proven.
5. Answer the remaining Daytona volume questions with a much smaller research
   surface than the full Noter monorepo.

## Non-Goals

1. Do not immediately replace prebuilt snapshots or deps images.
2. Do not mount the active mutable repo working tree directly from the shared
   volume in the first rollout.
3. Do not add speculative multi-repo or org-wide shared caches across users.
4. Do not introduce git worktrees inside the sandbox as the default first
   implementation.

## Main Decision

Use a persistent repo cache volume plus a persistent pnpm store volume, but keep
the active checkout local to the sandbox filesystem.

Reason:

1. the repo mirror and pnpm store are naturally cache-shaped and durable
2. the active worktree is where file watching, git index updates, lockfiles,
   chmod, and editor writes are most sensitive
3. Daytona volume semantics are still not fully understood for heavy mutable
   worktree usage
4. Noter already had to split live `CODEX_HOME` from shared volume-backed state
   for similar reasons

This gives a fast and conservative first path:

1. fetch once into shared cache
2. materialize quickly into local sandbox workspace
3. keep the sandbox and `tmux` sessions alive

## Cache Model

### 1. Git mirror cache volume

Add a per-user-per-repo Daytona volume used only for git object storage and ref
tracking.

Recommended contents:

- bare mirror path: `/home/daytona/.noter-cache/git/mirrors/<owner>/<repo>.git`

Recommended naming:

- `noter-git-cache-<env>-<userId>-<repo>`

Behavior:

1. the mirror tracks all remote refs needed by the user for that repo
2. refreshes happen against the mirror, not against every workspace checkout
3. workspace materialization reads from the mirror over a local filesystem path

### 2. pnpm store volume

Add a per-user Daytona volume mounted at:

- `/home/daytona/.pnpm-store`

Set:

- `PNPM_STORE_DIR=/home/daytona/.pnpm-store`

Behavior:

1. tarballs and package store contents survive sandbox replacement
2. workspace installs use the shared store and stay mostly local/offline
3. `node_modules` remains sandbox-local and disposable

Implementation note:

1. This spec assumes the current Noter-facing sandbox user contract from
   `specs/055_DAYTONA_CODEX_SHARED_HOME_SPEC.md`: sandbox user `daytona`, home
   `/home/daytona`, and a runtime-facing writable home under that path.
2. Daytona may still start some raw commands as `root`, but Noter-managed
   bootstrap must validate the pnpm store mount against the same effective
   `daytona` user contract used for shared Codex state.
3. A sandbox whose pnpm store mount is not writable by `daytona` should be
   treated as incompatible and recreated or repaired before bootstrap, rather
   than gaining a separate root-only fallback path.

### 3. Existing Codex shared volume

Keep the current shared Codex state contract unchanged:

1. local live `CODEX_HOME`
2. shared backing volume mounted at `.codex-shared`
3. projected sync semantics for the live home

The repo-cache and pnpm-store work should not regress the current Codex shared
home design.

## Sandbox Roles

### 1. Repo maintenance sandbox

Create one lightweight Daytona sandbox per user+repo that exists only to keep
the shared git mirror warm.

Responsibilities:

1. mount the repo cache volume
2. create or repair the bare mirror
3. fetch all configured refs from origin
4. expose the latest known commit map for branches

This sandbox is a cache-maintenance worker, not the operator-facing workspace.

### 2. Operator workspace sandbox

Keep one normal workspace sandbox per vault+branch as the operator-facing
environment.

Responsibilities:

1. mount the shared pnpm store volume
2. optionally mount the repo cache volume at a cache path
3. keep the active worktree local at `/home/daytona/workspace/<repo>`
4. own the durable `tmux` shell and dev-server sessions

## Refresh Model

### Research default

For the research harness, allow an aggressive periodic fetch loop:

- fetch every 10 seconds

This is acceptable for a single-repo experiment because it answers the latency
question quickly.

### Product default

For the real product rollout, start more conservatively:

1. fetch on workspace open
2. fetch on explicit branch switch
3. keep a background refresh loop, but coalesce it to a slower interval than the
   research harness

Reason:

1. per-repo 10-second polling does not scale well across many users and private
   repos
2. most of the value comes from a warm mirror plus immediate on-open refresh

## Workspace Materialization Contract

When a workspace sandbox starts or needs a branch refresh:

1. ensure the repo mirror volume is mounted and current enough
2. keep the active checkout local in `/home/daytona/workspace/<repo>`
3. materialize from the local mirror rather than cloning from GitHub over the
   network
4. reset the local checkout to the requested branch or commit
5. keep existing `tmux` sessions when the sandbox itself is reused

The implementation should evaluate the fastest stable local materialization
primitive:

1. `git clone --reference-if-able`
2. local-path fetch from the bare mirror
3. git alternates or another mirror-backed checkout strategy

The first rollout should pick the simplest option that works reliably under
Daytona volume semantics.

## Why Not Directly Mount The Live Repo Yet

Directly mounting the active worktree from a Daytona volume is attractive, but
it should be deferred until a smaller research harness proves all of the
following:

1. `git status`, `git checkout`, and index updates behave normally
2. Vite and related file watchers react correctly to writes on the mounted
   filesystem
3. rename/chmod/chown-sensitive tooling behaves correctly
4. `pnpm install` and lockfile writes do not hit the same class of permission
   issues already seen with direct Codex-home mounts

Until those are proven, the safer design is:

1. shared volume for cache state
2. local sandbox filesystem for live working state

## Small Research Harness

Before changing the full Noter flow, build a tiny Daytona repo specifically to
answer the volume questions.

Recommended characteristics:

1. single Node app
2. one `pnpm-lock.yaml`
3. one simple Vite or file-watch loop
4. one `tmux` session
5. one git remote with a few branches

Questions this harness must answer:

1. how fast is mirror refresh from GitHub into a Daytona volume-backed bare repo
2. how fast is local checkout from that mirror into sandbox-local workspace
3. how much does a shared pnpm store cut repeated install time
4. whether a direct volume-mounted active worktree breaks git or file watchers
5. whether the same volume can be mounted into multiple sandboxes safely for
   this use case

This research harness should be the primary place to understand Daytona volume
behavior rather than using the full Noter monorepo as the first probe.

## Rollout Plan

1. Keep current snapshot/deps-image flow as the default safe path.
2. Add the smaller Daytona cache research harness and measure mirror checkout
   plus shared-store behavior.
3. Add per-user pnpm store volume support to workspace sandboxes.
4. Add per-user-per-repo git mirror volume support plus a maintenance sandbox.
5. Add workspace materialization from local mirror into sandbox-local checkout.
6. Wire workspace refresh to reuse the existing sandbox and existing `tmux`
   sessions whenever the sandbox is still compatible.
7. Only after the harness proves it safe, evaluate a direct volume-mounted live
   worktree path as an optional later optimization.

## Acceptance Criteria

1. Reopening a workspace for the same vault+branch normally reuses the existing
   sandbox and the same durable `tmux` sessions.
2. Refreshing to a newer commit on the same branch does not require recreating
   the sandbox when the sandbox is still compatible.
3. The first workspace after a new commit can materialize from a local
   volume-backed git mirror instead of cloning from GitHub over the network.
4. Repeated `pnpm install` runs in fresh sandboxes use the shared pnpm store and
   show at least 25% median wall-clock improvement and 15% p95 improvement
   across at least 30 fresh-sandbox runs per condition versus a no-shared-store
   baseline, with identical repo commit and sandbox sizing.
5. Snapshot-backed startup remains available as a fallback during rollout.

## Open Questions

1. Whether Daytona volume mounts are performant enough for git mirrors at the
   scale of a large monorepo.
2. Whether the same repo cache volume should be mounted into the maintenance
   sandbox and workspace sandboxes simultaneously or whether the workspace
   should read from a periodic synchronized copy.
3. Whether a single shared cache volume with `subpath` mounts is better than
   separate volumes for git mirror and pnpm store.
4. Whether the maintenance worker belongs inside Daytona as a sandbox or outside
   Daytona as a control-plane job that targets the volume.

## Immediate Next Step

Do not start by replacing snapshots.

Start by building the smaller Daytona cache harness and measuring three exact
paths:

1. GitHub -> volume-backed bare mirror refresh
2. bare mirror -> sandbox-local branch checkout
3. shared pnpm store -> fresh sandbox bootstrap

If those numbers are good, wire the same model into Noter. If those numbers are
bad, keep snapshots as the main optimization path and treat the volume approach
as repo-cache-only, not full workspace materialization.
