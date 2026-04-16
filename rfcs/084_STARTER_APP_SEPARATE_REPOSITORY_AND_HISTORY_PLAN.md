# 084 Starter App Separate Repository Plan

## Status

- Draft
- Last updated: 2026-04-16
- Dedicated source repo created privately at
  [link https://github.com/noter-md/convex-cloudflare-pages-stack](https://github.com/noter-md/convex-cloudflare-pages-stack)
- Iteration 1 decision: Noter only needs the latest starter snapshot from that
  repo; history-aware replay is deferred.

## Related Docs And Files

- `specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md`
- `specs/053_DAYTONA_LOCAL_RUNTIME_PROFILE_AND_SEED_SOURCE_SPEC.md`
- `apps/noter/convex/starterSeedManifest.generated.ts`
- `scripts/refresh-starter-manifest.ts`
- `apps/noter/convex/starterSeed.ts`

## Summary

We should move the starter app source of truth out of the Noter monorepo and
into its own repository under the `noter-md` GitHub organization.

For the first implementation, Noter only needs a single dedicated source repo
that holds the latest starter state. We do not need to preserve or replay that
repo's commit history into managed repos yet.

The dedicated repo can still keep a readable history for maintainers, but the
seed contract for Iteration 1 stays simple:

1. one canonical starter source repo
2. one pinned latest snapshot exported into this monorepo
3. one generated starter commit when Noter seeds a managed repo

## Why This RFC Exists

`specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md` intentionally chose the simplest
possible Iteration 1:

- keep the starter in the monorepo
- seed newly created repos as one commit
- defer a separate repository

That decision reduced operational complexity, but it also means starter
authoring still happens inside the main Noter repo. We now want to separate
those concerns without taking on history-aware replay work in the same step.

## Problem

Today the starter app is optimized for reliable monorepo-managed seeding:

1. the source lives in `apps/noter-starter-template`
2. Noter exports the entire app into a manifest
3. new managed repos get a single generated starter commit

That model is still acceptable for seeding behavior, but it fails the
separate-source-repo requirement in three ways:

1. the source of truth still lives inside the monorepo
2. starter maintenance is coupled to unrelated monorepo work
3. the release pin is implicit in a local directory instead of a dedicated repo

## Goals

1. Give the starter app its own dedicated repository in the `noter-md`
   organization.
2. Keep a clear release pin so Noter can seed deterministically from the latest
   source repo snapshot.
3. Keep the starter app on the same Vite Plus and scaffold-critical config
   baseline as the main app whenever those shared defaults change.
4. Shape the dedicated starter repo so it can eventually be made public once the
   content is clean enough to stand on its own.
5. Leave room to add a history-aware replay path later if it turns out to be
   worth the extra maintenance.

## Non-Goals

1. Preserving the current monorepo starter manifest format as the long-term
   source of truth.
2. Making commit-history replay part of the first implementation.
3. Solving every cross-repo sync detail in the first implementation pass.
4. Blocking manual GitHub template usage if it is useful for operators outside
   the managed Noter seeding flow.

## Locked Facts

### First Implementation Only Needs Latest Snapshot Seeding

The current `starterSeed.ts` path already creates a managed repository from a
single manifest snapshot and one root commit. That behavior is acceptable for
Iteration 1 after the source of truth moves out of this monorepo.

For now, the separate repo requirement is about authoring location, ownership,
and release pinning, not about preserving or replaying the source repo history.

### The Old Monorepo Source Path Becomes Legacy

Once this direction is accepted, `apps/noter-starter-template` should be treated
as a transitional mirror or export target:

- acceptable while we migrate
- not acceptable as the long-term authoring home for the starter

## Proposed Direction

### 1. Create A Dedicated Starter Repository

Create a separate repository in the `noter-md` organization for the starter app
named:

- `convex-cloudflare-pages-stack`

This repo should be a self-sustained full-stack repo that Noter happens to seed
and manage well, not a partial mirror that still depends on the monorepo for
core runtime files.

The repository should keep a monorepo shape even though it currently contains a
single real app. The initial app layout should live under `apps/web` so the
starter can grow without a later root-to-monorepo migration.

### 2. Keep The Source Repo Readable, But Do Not Make History Part Of The Seed Contract Yet

The dedicated source repo can still keep a readable commit history, and the
current repo already does. But Noter does not need to consume that history in
Iteration 1.

What matters for the first implementation:

1. the source repo contains the latest starter state
2. we can pin that state explicitly
3. we can refresh the seed snapshot in this monorepo from that state

### 3. Move Noter To Separate-Repo Latest-Snapshot Seeding

Noter-managed repo creation should continue to seed one flat starter snapshot in
Iteration 1, but that snapshot should come from the dedicated starter repo
instead of being authored directly in this monorepo.

Chosen direction:

1. the starter source repo remains the canonical latest source of truth
2. this monorepo consumes a generated latest-snapshot manifest exported from
   that repo
3. that export is refreshed manually whenever starter changes affect the managed
   seeding contract
4. managed repos keep the current one-snapshot seed behavior for now

What is not acceptable as the final path:

1. continuing to treat `apps/noter-starter-template` as the long-term source of
   truth
2. an implicit live import path that changes behavior without an explicit
   refresh in this monorepo
3. coupling starter authoring to unrelated monorepo work

The dedicated starter repo should also be treated as a maintained sibling app,
not a frozen export. When shared bootstrap-facing config changes in Noter, the
starter app should be updated in the same logical change set unless the change
is genuinely app-specific. This especially applies to Vite Plus setup, Vite
config, `tsconfig`, and lint/format settings because those files define the
first-run experience for seeded repos.

### 4. Treat GitHub Templates As Optional And Non-Blocking

We do not need GitHub template repositories for the first implementation.

If, later, GitHub templates are still useful for a separate manual distribution
path, they can be added as a convenience layer. They are not required to unlock
the separate-repo move.

The stronger long-term leverage is a repo that is clean enough to make public.

Any template usage should therefore be treated as optional and subordinate to
two higher-priority outcomes:

- separate source of truth
- eventual public readiness

## Options Considered

### Option A: Keep The Monorepo Source And Add Better Docs

Pros:

- lowest short-term implementation cost
- no new cross-repo release mechanics

Cons:

- starter authoring still happens in the monorepo
- does not actually move the source of truth

Verdict:

- reject

### Option B: Separate Repo, Keep Latest-Snapshot Seeding

Pros:

- clean repo separation
- matches the current seed implementation shape
- low migration cost

Cons:

- does not preserve source repo history in managed repos
- still requires a clear export-and-pin workflow

Verdict:

- recommended for Iteration 1

### Option C: Separate Repo Plus History-Aware Seeding

Pros:

- preserves more of the source repo story in managed repos

Cons:

- adds a cross-repo pinning and release story
- requires a new seeding contract in Noter
- not necessary to unlock the separate-repo move

Verdict:

- defer

## Rollout Shape

### Phase 1: Dedicated Repo And Latest Snapshot

1. Create the dedicated starter repo in `noter-md`.
2. Keep the repo clean enough that making it public later is a realistic path.
3. Decide only later whether GitHub template mode adds value.

Current implementation status:

1. `docs: add repository build contract`
2. `feat: scaffold monorepo starter workspace`
3. `chore: adopt vite plus workspace tooling`
4. `feat: wire the app to convex`
5. `feat: add the starter ui and todo flow`
6. `chore: add noter workspace assets`

### Phase 2: Versioned Latest-Snapshot Consumption

1. Export a generated latest-snapshot release artifact from
   `convex-cloudflare-pages-stack`.
2. Commit that artifact into this monorepo so the seeding input remains
   deterministic and reviewable.
3. Record the source repo commit SHA in the generated artifact so the pin is
   auditable.

### Phase 3: Managed Repo Seeding Migration

1. Update Noter to consume the latest starter snapshot from the dedicated repo.
2. Keep the current single-commit export path shape because it already matches
   Iteration 1.
3. Retire the monorepo starter directory as the authoring home once the
   dedicated repo path is fully active.

### Later Phase: Optional History-Aware Replay

If we decide the educational value is worth the extra machinery, we can add a
history-aware replay path later. That should be a separate decision after the
separate-repo latest-snapshot path is stable.

## Open Questions

1. What cleanup bar do we want before making `convex-cloudflare-pages-stack`
   public?

## Acceptance Criteria For This Direction

1. The dedicated starter repo exists in `noter-md`.
2. It holds the latest starter source of truth.
3. This monorepo has a defined path to pin and consume the latest snapshot from
   that repo.
4. Noter has a defined path to seed managed repos from that latest starter
   snapshot.
5. The old monorepo-only source model is explicitly treated as a transitional
   path, not the destination.
