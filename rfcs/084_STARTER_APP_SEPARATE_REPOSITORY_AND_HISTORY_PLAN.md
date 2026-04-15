# 084 Starter App Separate Repository And History Plan

## Status

- Draft
- Last updated: 2026-04-16

## Related Docs And Files

- `specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md`
- `specs/053_DAYTONA_LOCAL_RUNTIME_PROFILE_AND_SEED_SOURCE_SPEC.md`
- `apps/noter-starter-template/AGENTS.md`
- `apps/noter-starter-template/scripts/export-template-manifest.ts`
- `apps/noter/convex/starterSeed.ts`
- GitHub Docs:
  [Creating a repository from a template](https://docs.github.com/en/enterprise-server%403.14/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template)

## Summary

We should move the starter app source of truth out of the Noter monorepo and
into its own repository under the `noter-md` GitHub organization.

That repository should optimize for human-readable construction history:

1. The first commit is always `AGENTS.md`.
2. That first `AGENTS.md` contains the initial human-written prompt that sets
   the build constraints for the repo, including the requirement to commit
   incrementally and cite the docs used.
3. Each later commit should represent one understandable setup step or product
   addition, so someone can learn the stack just by reading the history.

GitHub template repositories can still be enabled later for manual operator
convenience, but they cannot be the primary creation path for Noter-managed
starter repos because GitHub-native template generation starts the new
repository with a single commit instead of preserving the source history.

## Why This RFC Exists

`specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md` intentionally chose the opposite
tradeoff for Iteration 1:

- keep the starter in the monorepo
- seed newly created repos as one commit
- defer a separate repository

That decision reduced operational complexity, but it also explicitly gave up the
"history teaches the setup" property. We now want that property to be first
class, so the old decision needs a clean replacement instead of piecemeal
exceptions.

## Problem

Today the starter app is optimized for reliable monorepo-managed seeding:

1. the source lives in `apps/noter-starter-template`
2. Noter exports the entire app into a manifest
3. new managed repos get a single generated starter commit

That model fails the new requirement in three ways:

1. the real build narrative is hidden inside one generated snapshot
2. a reader cannot tell which docs or commands produced the final shape
3. GitHub-native template generation does not solve this, because it creates a
   new repo with unrelated history and a single starting commit

## Goals

1. Give the starter app its own dedicated repository in the `noter-md`
   organization.
2. Make the default branch history understandable by humans without internal
   Noter knowledge.
3. Require the first commit to be `AGENTS.md` with the original human prompt
   that defines the step-by-step history discipline.
4. Keep each setup or integration step visible as a separate commit whenever the
   repo evolves.
5. Let Noter-managed starter repos inherit or replay that educational history
   instead of collapsing it into one generated snapshot.
6. Keep a clear release pin so Noter can seed deterministically.
7. Keep the starter app on the same Vite Plus and scaffold-critical config
   baseline as the main app whenever those shared defaults change.
8. Shape the dedicated starter repo so it can eventually be made public once the
   history and content are clean enough to stand on their own.

## Non-Goals

1. Preserving the current monorepo starter manifest format as the long-term
   source of truth.
2. Guaranteeing identical commit SHAs between the source template repo and every
   seeded repo.
3. Solving every cross-repo sync detail in the first implementation pass.
4. Blocking manual GitHub template usage if it is useful for operators outside
   the managed Noter seeding flow.

## Locked Facts

### GitHub Template Repositories Are Not Enough On Their Own

GitHub’s documented template-repository behavior is useful for manual copying of
files and branches, but it does not preserve a pedagogical commit history:

- a fork includes the full parent commit history
- a repo created from a template starts with a single commit

That means "mark the repo as a GitHub template" is, at most, an optional manual
distribution feature. It is not sufficient for the managed Noter flow if the
resulting repo history must explain the setup step by step.

### The Old Single-Commit Seed Path Becomes Legacy

Once this direction is accepted, the current export-and-seed model should be
treated as a legacy bridge:

- acceptable while we migrate
- not acceptable as the final product contract for new starter repos

## Proposed Direction

### 1. Create A Dedicated Starter-App Repository

Create a separate repository in the `noter-md` organization for the starter app
named:

- `convex-cloudflare-pages-starter`

This repo should be a self-sustained full-stack app repo that Noter happens to
seed and manage well, not a partial mirror that still depends on the monorepo
for core runtime files.

### 2. Make The Repository History A Product Surface

The repo history is part of the product, not just an implementation detail.

Required history contract:

1. Commit 1 is `AGENTS.md` only.
2. Commit 1 contains the original human-written prompt that instructs the repo
   maintainer to:
   - build incrementally
   - commit after each meaningful setup step
   - document the official docs used for each step
   - keep the history readable by humans
3. Later commits should each map to one understandable change such as:
   - scaffold Vite app
   - add Convex baseline
   - add Tailwind
   - add shadcn primitives
   - add starter domain example
4. The repo should prefer updating `AGENTS.md`, `README.md`, or adjacent docs in
   the same commit when a setup step depends on new external guidance.
5. The source repo keeps its own full readable history, but the specific subset
   of commits replayed into managed repos is a deliberate release decision each
   time the starter history changes.

### 3. Move Noter To History-Aware Seeding

Noter-managed repo creation should no longer treat the starter app as one flat
blob export.

Instead, Noter should seed from a pinned version of the dedicated starter repo
using a history-aware strategy.

Chosen direction:

1. the starter source repo remains the canonical full history
2. the monorepo consumes a generated multi-commit manifest exported from that
   source repo
3. that export is refreshed manually whenever starter changes affect the managed
   seeding contract
4. each export can intentionally choose the replayed commit subset instead of
   blindly mirroring every source-repo commit

What is not acceptable as the final path:

1. one generated root commit that hides all intermediate steps
2. relying only on GitHub’s template-repository creation flow
3. an implicit live git import path that changes behavior without an explicit
   refresh in this monorepo

The dedicated starter repo should also be treated as a maintained sibling app,
not a frozen export. When shared bootstrap-facing config changes in Noter, the
starter app should be updated in the same logical change set unless the change
is genuinely app-specific. This especially applies to Vite Plus setup, Vite
config, `tsconfig`, and lint/format settings because those files define the
first-run experience for seeded repos.

### 4. Treat GitHub Templates As Optional And Non-Blocking

We do not need GitHub template repositories if they hide the history we want
people to learn from.

If, later, GitHub templates are still useful for a separate manual distribution
path, they can be added as a convenience layer. If they continue to conflict
with readable inherited history, we should simply not use them for the managed
path.

The stronger long-term leverage is a repo that is clean enough to make public.
That creates a clearer human-readable artifact than a private template whose
main benefit is file copying speed.

Any template usage should therefore be treated as optional and subordinate to
two higher-priority outcomes:

- readable history
- eventual public readiness

## Options Considered

### Option A: Keep The Monorepo Source And Add Better Docs

Pros:

- lowest short-term implementation cost
- no new cross-repo release mechanics

Cons:

- still hides the build narrative behind one generated snapshot
- does not satisfy the "history should teach the setup" requirement

Verdict:

- reject

### Option B: Separate Repo, Use GitHub Templates Only

Pros:

- clean repo separation
- easy operator story
- low GitHub-side complexity

Cons:

- template generation starts the new repo with a single commit
- fails the history requirement for Noter-managed repos

Verdict:

- reject as the primary managed path
- only reconsider as an optional convenience if it does not distract from the
  public-readable repo goal

### Option C: Separate Repo Plus History-Aware Seeding

Pros:

- matches the educational-history requirement
- keeps the starter source of truth small and legible
- allows the starter repo itself to serve as living documentation

Cons:

- adds a cross-repo pinning and release story
- requires a new seeding contract in Noter

Verdict:

- recommended

## Rollout Shape

### Phase 1: Dedicated Repo And Commit Discipline

1. Create the dedicated starter-app repo in `noter-md`.
2. Seed it with a first commit containing only `AGENTS.md`.
3. Rebuild the app step by step in readable commits from official docs.
4. Keep the repo clean enough that making it public later is a realistic path.
5. Decide only later whether GitHub template mode adds value without undermining
   the history-first goal.

### Phase 2: Versioned Consumption Contract

1. Export a generated multi-commit release artifact from
   `convex-cloudflare-pages-starter`.
2. Commit that artifact into this monorepo so the seeding input remains
   deterministic and reviewable.
3. Record the source repo commit SHA and replayed commit list in the generated
   artifact so the pin is auditable.

### Phase 3: Managed Repo Seeding Migration

1. Add the new history-aware seeding path to Noter.
2. Keep the current single-commit export path only as a temporary fallback while
   the new path proves reliable.
3. Retire the monorepo starter directory once the dedicated repo path is fully
   active.

## Open Questions

1. What cleanup bar do we want before making `convex-cloudflare-pages-starter`
   public?

## Acceptance Criteria For This Direction

1. The dedicated starter-app repo exists in `noter-md`.
2. Its first commit is `AGENTS.md` with the original human-written prompt.
3. Its history shows the starter setup in understandable, incremental commits.
4. Noter has a defined path to seed managed repos without collapsing that
   history into one commit.
5. The old monorepo-only single-commit model is explicitly treated as a
   transitional path, not the destination.
