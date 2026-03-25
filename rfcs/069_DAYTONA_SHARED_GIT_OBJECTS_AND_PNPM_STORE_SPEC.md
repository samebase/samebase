# 069 Daytona Shared Git Objects And PNPM Store Spec

## Document Control

- Status: Draft RFC
- Owner: Noter platform / Daytona
- Last updated: 2026-03-25
- Depends on:
  - `specs/010_DAYTONA_SANDBOX_INTEGRATION_SPEC.md`
  - `specs/024_DAYTONA_IMAGE_AND_STARTUP_PERFORMANCE_SPEC.md`
  - `specs/055_DAYTONA_CODEX_SHARED_HOME_SPEC.md`
  - `specs/058_DAYTONA_DEPS_IMAGE_DISCOVERY_SPEC.md`
  - `notes/daytona-volume-direct-mount-research-2026-03-16.md`
  - `apps/noter/convex/daytona/actions.ts`
  - `Dockerfile.daytona-deps`

## Purpose

Decide whether Noter should place Git object data and PNPM package data on a
Daytona volume shared across sandboxes, and if so, define the narrowest
implementation that is likely to improve startup time without creating a fragile
storage contract.

This RFC focuses on Daytona workspaces and snapshot-backed sandboxes for the
Noter monorepo. It does not attempt to solve arbitrary repo caching for all
future vaults.

## Product Framing

The goal here is not "remove every install step at any cost." The real goal is:

1. get to a usable workspace as fast as practical
2. keep the startup path simple enough that an operator can explain what
   happened afterward
3. make slow starts and failures easy to debug

That means a slightly slower startup with one clear timeline can be better than
a more heavily cached system whose behavior is hard to reconstruct.

## Executive Summary

As researched on 2026-03-25, the answer is:

1. The first follow-up should be startup observability, not a new shared-cache
   mechanism.
2. Do not move live Git repositories or shared Git object databases onto a
   Daytona volume as a normal path.
3. A shared writable PNPM store volume is technically feasible, but only as a
   network-download cache. It will not behave like the fast same-filesystem
   hardlink path that pnpm is optimized for.
4. A read-only shared cache volume is not a good primary design for either pnpm
   or Git with current Daytona volume semantics.
5. The best near-term path remains the existing deps-image and snapshot work,
   plus a clearer startup timeline, with an optional later pilot for a writable
   shared PNPM store volume in live-debug and fallback-install paths.
6. If Noter wants direct shared mounts for metadata-sensitive tools, the more
   important upstream Daytona ask is not "more volume usage"; it is a better
   mount contract: ownership control, read-only mounts, and ideally a local-disk
   cache class that is not backed by S3/FUSE.

## Research Questions

1. Can Daytona volumes safely host shared Git blobs or a shared pnpm store
   across many sandboxes?
2. Would a shared volume make installs materially faster, or only reduce network
   fetches?
3. Is a read-only shared cache realistic with today's Daytona API and mount
   behavior?
4. What prior work already exists in Noter and in Daytona itself?
5. What is the smallest implementation worth piloting in Noter?

## Current Noter State

### Existing startup optimizations

Noter already invests in startup speed in two places:

1. `Dockerfile.daytona-deps` installs dependencies into the deps image and uses
   a BuildKit cache mount for the pnpm store during image build.
2. Daytona snapshot-backed provisioning avoids repeating full bootstrap work
   when a suitable snapshot already exists.

Those are the current primary optimizations. They operate on local filesystem
layers inside the image/snapshot path, not on a shared runtime volume.

### Current runtime fallback behavior

In `apps/noter/convex/daytona/actions.ts`, the live dev-server bootstrap still
falls back to `pnpm install --prod=false --force --node-linker=hoisted` when
`node_modules` is missing.

That means there is still a path where package-download and package-import cost
matters inside a running sandbox, especially for live-debug flows or snapshot
misses.

### Existing shared-volume precedent

Noter already uses a Daytona volume for shared Codex state, but only through a
projected-home workaround:

- live `CODEX_HOME` stays local and writable
- the shared volume is mounted at `/home/daytona/.codex-shared`
- durable files are projected or mirrored into the local home

That design exists specifically because direct mutable volume mounts were not
reliable enough for metadata-sensitive home-directory behavior.

This matters here because both Git object stores and pnpm stores are also
metadata-sensitive.

### Existing debug surface is still fragmented

The current startup action already records useful timing data:

- `totalMs`
- `sandboxCreateMs`
- `repoRefreshMs`
- `devServerStartMs`
- provisioning and repo-refresh mode fields

However, the operator-facing story is still fragmented:

1. `startDaytonaWorkspace` returns one long synthesized message plus coarse
   timing.
2. raw `daytona:*` console events are spread across many branches of the action.
3. `getDaytonaBootstrapLogs` currently tails only `PNPM_INSTALL_LOG`, which
   covers install fallback but not the full startup path.
4. snapshot selection, sandbox reuse versus recreate, repo refresh decisions,
   and dev-server launch status do not appear as one persisted ordered timeline.

Implication:

Today it is still too hard to answer basic operator questions such as:

- did we reuse or recreate the sandbox
- which snapshot was selected and why
- whether repo refresh ran or was skipped
- whether the slow part was sandbox materialization, git refresh, install
  fallback, or dev-server boot
- what failed first

## External Findings

### 1. Daytona volumes are shared, S3-backed FUSE mounts

Daytona's current docs describe volumes as:

- FUSE-based mounts
- backed by S3-compatible object storage
- shareable across multiple sandboxes
- generally slower than the local sandbox filesystem for both reads and writes

Implication:

Daytona volumes are viable for durable shared files, but they should not be
assumed to behave like a fast local package-cache disk.

### 2. Daytona recently added volume subpath mounts

Daytona's 2025-11-27 changelog explicitly calls out volume subpath mounts added
to the API, runner, and SDK.

Implication:

If Noter pilots a shared cache volume, it should use subpaths to isolate
different logical caches rather than creating unrelated top-level volumes for
every small use case.

### 3. Daytona's documented volume mount contract is still narrow

Current official SDK/docs show volume mounts with:

- `volumeId`
- `mountPath`
- optional `subpath`

Current Daytona docs do not document mount-level controls for:

- read-only mode
- UID/GID ownership mapping
- mount flags tuned for package-manager or Git semantics

Implication:

The current Daytona product surface supports "mount this shared directory", not
"mount this cache with POSIX-like policy controls".

### 4. Noter's prior direct-mount research found the same structural limit

The existing repo note from 2026-03-16 inspected Daytona's open-source runner
and concluded that Daytona mounts volumes via host-side `mount-s3` and then
bind-mounts them into sandboxes. That note also observed that Daytona's current
surface does not expose ownership-aware mount configuration.

Implication:

The Codex shared-home workaround was not a one-off. It reflects a real product
boundary in Daytona's current volume implementation.

### 5. pnpm's fast path assumes a local store on the same disk

pnpm's docs state:

- the store is the location where packages are saved on disk
- the store should be on the same disk as installation
- if the store is on a different disk, pnpm copies packages instead of
  hard-linking them
- package import behavior can be `auto`, `hardlink`, `copy`, `clone`, or
  `clone-or-copy`

Implication:

A Daytona volume-backed pnpm store mounted into a sandbox will almost certainly
act like a cross-filesystem store relative to the repo worktree, so pnpm will
lose the hardlink-based fast path and fall back to copying. That still saves
registry download time, but it does not eliminate local package materialization
cost.

### 6. `pnpm fetch` is real prior art for prewarming a store

pnpm documents `pnpm fetch` as a way to load packages into the store from the
lockfile and then run `pnpm install --offline`.

Implication:

If Noter uses a shared writable pnpm store volume, the correct model is:

- prewarm the store with `pnpm fetch`
- later install from that warm store with `--offline`

This is a network-cache optimization, not a replacement for image/snapshot
prebuilds.

### 7. Git already has local object-sharing mechanisms, but they are fragile

Git documents two relevant families of optimization:

1. `git clone --reference` / alternates
2. partial clone filters like `--filter=blob:none`

Git also documents that:

- alternates are recorded via `objects/info/alternates`
- `--shared` and `--reference` can create dependency on another object store
- that dependency is dangerous if the source repository garbage-collects objects
  later
- partial clone can lazily fetch missing objects from promisor remotes, but
  dynamic object fetching adds overhead

Implication:

Git has mechanisms for reducing network transfer, but neither one makes a
Daytona FUSE volume an obviously good place to store the shared cache:

- alternates add correctness and maintenance risk
- partial clone avoids local shared storage but may still be slow for blob-heavy
  developer workflows

## Feasibility Assessment

### Option A: Shared writable pnpm store on a Daytona volume

#### Verdict

Feasible as a limited pilot.

#### What it can realistically improve

- repeated registry downloads across sandboxes for the same user or repo
- cold-start cost when the current path would otherwise run a full online
  `pnpm install`

#### What it will not realistically improve

- same-filesystem hardlink import speed
- local `node_modules` materialization cost
- snapshot build performance, unless Daytona later supports mounting volumes in
  snapshot build contexts

#### Why it is still worth considering

This is the only cache-sharing idea in this RFC that:

- fits Daytona's current public API
- fits pnpm's documented fetch/offline flow
- can be isolated to a fallback path without rewriting the primary sandbox model

#### Important constraints

1. Keep `node_modules` local to the sandbox repo directory.
2. Keep the shared store writable.
3. Treat the volume as a package-download cache, not a shared `node_modules`.
4. Default to a per-user volume, not a global cross-user cache.
5. Prefer a subpath layout so Noter owns only one logical "package cache" volume
   per user.

### Option B: Read-only shared pnpm seed volume

#### Verdict

Do not use as the primary design.

#### Why

1. Daytona does not currently document a read-only mount mode for volumes.
2. pnpm documents how to use a store and how to fetch into it, but this research
   did not find first-party documentation that blesses a shared read-only store
   as a supported multi-installer pattern.
3. Even with a fully warmed store, the repo still needs local materialization
   into `node_modules`.
4. If the warm seed is incomplete for the current lockfile, the read-only model
   becomes awkward immediately.

#### Acceptable future follow-up

Revisit only if Daytona ships explicit read-only volume mounts and Noter can
show that a writable local overlay is materially faster than today's deps-image
path.

### Option C: Shared Git object database or bare mirror on a Daytona volume

#### Verdict

Do not adopt as a normal Noter path.

#### Why

1. Git alternates and `--reference` create an object-store dependency that Git
   explicitly documents as risky when the source repository later prunes
   objects.
2. Git object databases are metadata-heavy, and Daytona documents volumes as
   slower than local sandbox storage for both reads and writes.
3. A shared bare mirror on a volume would need its own update, locking, and GC
   policy to avoid cache corruption or stale-object surprises.
4. Even if the cache is correct, it is not obvious that reading packfiles over
   Daytona's FUSE/S3 volume will beat cloning from GitHub's normal smart
   transport for Noter's repo shape.

#### Acceptable future follow-up

Only revisit if measurement shows Git network transfer is the dominant startup
cost after the existing deps-image and snapshot path is already warm.

### Option D: Git partial clone instead of shared Git blobs

#### Verdict

Worth keeping in mind, but not as the first follow-up from this RFC.

#### Why

Git's partial-clone support is real and supported, but the docs also state that
dynamic missing-object fetches add overhead. For a developer workspace that is
expected to open, build, and edit a broad monorepo, lazy blob fetch may simply
move cost later rather than removing it.

This is a cleaner direction than shared alternates if Git transfer ever proves
to be the bottleneck, but it should be measured separately.

## Recommendation

The recommended plan is:

1. First, add one clear startup timeline and phase model for Daytona launches.
2. Keep deps images and snapshot-backed startup as the primary optimization
   path.
3. If we still need a shared runtime cache after measuring the observable
   startup path, pilot only a writable shared pnpm store volume.
4. Keep Git repos and Git object databases local to each sandbox.
5. Reject read-only shared cache designs for now.
6. Capture an upstream Daytona ask for richer volume mount controls and a
   non-FUSE local cache primitive.

## Recommended Debuggability Work First

Before adding a shared pnpm-store volume, Noter should make startup legible.

### Desired startup model

Every Daytona workspace launch should be explainable as one ordered sequence of
phases with timestamps and outcomes, for example:

1. request accepted
2. commit resolved
3. snapshot selected
4. sandbox reused, resumed, or created
5. sandbox writable check
6. repo refresh decision and result
7. dependency/install fallback decision and result
8. dev server launch decision and result
9. final ready or failed outcome

### Minimum product surface

For each launch attempt, expose a small structured timeline instead of only a
free-form paragraph and scattered logs.

The smallest useful shape is:

- `runId`
- `startedAt`
- `finishedAt`
- `outcome`
- `snapshotName`
- `sandboxLifecycle`
- ordered `phases[]` with:
  - `name`
  - `startedAt`
  - `finishedAt`
  - `status`
  - `summary`

### Why this should come first

If startup is still confusing, adding a shared cache volume increases the number
of hidden branches:

- was the volume mounted
- was the store warm
- did `pnpm fetch` run
- did offline install work
- did we fall back to online install

That is acceptable only after the base launch path is visible enough to debug.

## Proposed Noter Pilot

### Scope

Pilot a shared writable pnpm store only for paths that currently fall back to
runtime install:

- live-debug workspaces
- snapshot misses
- dev-server fallback when `node_modules` is missing

Do not change the normal snapshot-backed happy path first.

This pilot should happen only after the startup timeline work above exists,
because otherwise the new cache path will make failure analysis harder.

### Storage shape

Use one Daytona volume per user, for example:

- `noter-pnpm-store-<env>-<userId>`

Mount it under a stable cache path such as:

- `/home/daytona/.noter-cache/pnpm`

Use a pnpm-owned subpath such as:

- `pnpm-store`

This keeps the volume reusable for other future cache experiments without
committing the whole mount to pnpm forever.

### Install shape

The pilot path should:

1. mount the shared volume into the sandbox
2. point pnpm `storeDir` at the mounted path
3. run `pnpm fetch` for the current lockfile when the store is cold or likely
   incomplete
4. run `pnpm install --offline`
5. keep `node_modules` local in the repo workspace

For determinism, the pilot should explicitly choose a package import method that
matches the expected cross-filesystem reality rather than relying on pnpm's
fallback behavior silently.

### Fallback

If the volume path fails, the store is missing, or offline install does not
work, Noter should fall back to the current install path and emit clear logs.

This must be an optimization, not a new hard dependency for sandbox startup.

## Proposed Daytona Upstream Requests

If Noter pursues deeper shared-cache work, the most useful Daytona feature asks
are:

1. volume mount ownership controls that match the sandbox runtime user
2. explicit read-only volume mounts
3. clear documented semantics for metadata-heavy developer-tool workloads
4. ideally, a local runner-disk cache class distinct from S3/FUSE-backed volumes

Without those capabilities, Daytona volumes are better suited for durable shared
files than for pretending to be a local package-manager disk.

## Rollout Plan

### Phase 0: Make startup observable

Before changing cache behavior, add a structured startup timeline for Daytona
workspace launches so operators can see what happened and when.

At minimum, record and surface:

- selected snapshot name
- sandbox lifecycle: reused, resumed, created
- repo refresh attempted or skipped, with reason
- dependency/install fallback attempted or skipped
- dev-server launch outcome
- per-phase timing and overall timing

### Phase 1: Measure current runtime-install paths

Before changing behavior, capture baseline numbers for:

- runtime `pnpm install` wall time
- download-heavy time versus local import-heavy time
- snapshot-miss frequency
- live-debug frequency

### Phase 2: Writable shared pnpm-store pilot

Implement the volume mount behind a narrow runtime gate and validate:

- cold volume
- warm volume
- lockfile changes
- concurrent sandboxes for the same user
- sandbox recreation after volume reuse

### Phase 3: Keep or remove based on data

Keep the feature only if the pilot materially reduces wall-clock startup time in
the runtime-install paths that actually matter in production.

If the gain is marginal, remove it and keep the design surface small.

## Open Questions

1. Does Daytona snapshot creation support any mountable cache surface during the
   image build path? This RFC assumes no.
2. How much of current runtime-install cost is registry download versus local
   unpack and script execution?
3. Does pnpm's cross-filesystem copy path on a Daytona volume outperform the
   current no-volume path enough to justify the complexity?
4. Are Daytona volumes isolated strongly enough at the org/user level that a
   per-user cache is the correct security boundary for Noter?

## Non-Goals

1. Do not put the live repo checkout itself on a Daytona volume.
2. Do not share `node_modules` directly across sandboxes.
3. Do not implement Git alternates or shared bare-mirror cloning in this RFC.
4. Do not add a large new cache-control UI or admin surface for this.

## Validation Notes

This document is based on:

- existing Noter Daytona specs and code
- the repo's prior direct-mount research note
- current Daytona docs and changelog
- current pnpm docs
- current Git docs

This worktree did not have `node_modules` bootstrapped, so local inspection of
the installed Daytona SDK types was not possible here. The lockfile currently
pins `@daytonaio/sdk@0.143.0`, while the external Daytona docs referenced in
this RFC reflect the current hosted documentation as of 2026-03-25.

## Source Links

### Internal sources

1. `notes/daytona-volume-direct-mount-research-2026-03-16.md`
2. `specs/010_DAYTONA_SANDBOX_INTEGRATION_SPEC.md`
3. `specs/024_DAYTONA_IMAGE_AND_STARTUP_PERFORMANCE_SPEC.md`
4. `specs/055_DAYTONA_CODEX_SHARED_HOME_SPEC.md`
5. `specs/058_DAYTONA_DEPS_IMAGE_DISCOVERY_SPEC.md`
6. `apps/noter/convex/daytona/actions.ts`
7. `Dockerfile.daytona-deps`

### External sources

1. Daytona volumes docs: <https://www.daytona.io/docs/en/volumes/>
2. Daytona TypeScript SDK volume reference:
   <https://www.daytona.io/docs/en/typescript-sdk/volume/>
3. Daytona changelog for volume subpath mounts:
   <https://www.daytona.io/changelog/ssh-gateway-regions-volumes>
4. pnpm settings: <https://pnpm.io/settings>
5. pnpm fetch: <https://pnpm.io/cli/fetch>
6. Git clone: <https://git-scm.com/docs/git-clone>
7. Git repository layout: <https://git-scm.com/docs/gitrepository-layout>
8. Git partial clone: <https://git-scm.com/docs/partial-clone/2.36.0>
