# Starter Template Strategy Specification (Iteration 1)

## Document Control

- Status: Draft for implementation.
- Owner: Noter backend/frontend
- Date: 2026-02-13
- Related files:
  - `apps/noter/convex/vaultActions.ts`
  - `apps/noter/convex/starterSeed.ts` (or replacement)
  - `apps/noter-starter-template/AGENTS.md`
  - `apps/noter-starter-template/scripts/sync-codespace-assets.mjs`
  - `apps/noter-starter-template/.devcontainer/devcontainer.json`
  - `apps/noter-starter-template/.codespace-agent/server.js`

## Summary

This spec captures the open questions and tradeoffs discussed while introducing starter seeding for new noter-managed vaults.

For Iteration 1, the decision is:

- Keep starter source in monorepo at `apps/noter-starter-template`
- Do not use layered seed-step source folders
- Seed newly created vault/agent repositories as a single commit
- Preserve a future path to evaluate a separate dedicated template repository

## Problem Statement

Current product goal:

- New vaults should be instantly deployable and runnable in production after creation.

Observed issue with the previous approach:

- Layered snapshot folders (`seed-commits/*`) were introduced to enforce a staged multi-commit history.
- This creates duplicated files and additional maintenance overhead.

Strategic concern:

- Team is still evaluating whether long-term source of truth should remain monorepo-local or move to a separate template repository.

## Questions Raised (Captured From Discussion)

- Is layered commit snapshotting worth the implementation and maintenance complexity?
- Would a separate template repo reduce ongoing operational overhead?
- How should reuse from monorepo into template be handled over time?
- Should staged commit history be mandatory in generated user repositories?
- How much runtime dependency on external GitHub sources is acceptable during vault creation?

## Options Considered

### Option A: Monorepo template with layered snapshots (current complex model)

Pros:

- Deterministic per-stage source snapshots
- Easier to visualize stage-to-stage content differences

Cons:

- High duplication (`seed-commits/*` + current template root)
- More maintenance work for every template update
- Additional tooling/manifest complexity

Operational cost:

- High

### Option B: Monorepo template without layering, single snapshot commit (chosen for Iteration 1)

Pros:

- Lowest complexity inside current repo
- Minimal maintenance overhead
- Reliability-first creation flow remains straightforward

Cons:

- Generated repo no longer teaches incremental setup via commit history
- Less explicit stage semantics in seed pipeline

Operational cost:

- Low

### Option C: Separate template repo (deferred)

Pros:

- Cleaner separation of concerns
- Independent lifecycle/versioning for template
- Simpler mental model for starter ownership

Cons:

- Adds cross-repo release/sync process
- Requires clear reliability strategy for consumption in noter

Operational cost:

- Medium

### Option D: Separate repo plus staged replay/pinning (deferred)

Pros:

- Keeps pedagogical staged history while decoupling source repo

Cons:

- Highest process/tooling complexity
- More moving pieces (pins/tags/refresh workflows)

Operational cost:

- High

## Iteration 1 Decision (Final)

- Keep starter template in monorepo at `apps/noter-starter-template`.
- Remove/avoid `seed-commits/*` layered source model.
- New vault creation seeds starter content as exactly one commit.
- Starter template package manager is pnpm to align with monorepo tooling and reduce package-manager variance.
- Codespace runtime assets are part of the starter contract:
  - `.devcontainer/devcontainer.json`
  - `.codespace-agent/**`
- `apps/noter-starter-template/AGENTS.md` must include:
  - exact initialization sequence used to build the template,
  - exact commands run (Vite, Convex, Tailwind, shadcn setup),
  - regeneration guidance for future updates.

## Sync Contract (Added 2026-02-14)

- Canonical sources live at monorepo root:
  - `.devcontainer/devcontainer.json`
  - `.codespace-agent/**`
- Starter template copies are synchronized by:
  - `pnpm --filter noter-starter-template run template:sync-codespace`
- `template:export` must run sync first so manifest output cannot drift from canonical runtime assets.
- Sync excludes runtime-only artifacts (for example `.codespace-agent/node_modules`, `.codespace-agent/.agent-token`).

## Public API / Behavior Changes

### `vaultActions.createRepository`

Behavioral contract for Iteration 1:

- Seeds starter content in a single commit.
- Does not enforce a 4-step staged commit history.

### Infra provisioning

- No contract change.
- Existing behavior remains: provisioning is still auto-scheduled for noter-managed vaults.

## Technical Contract for Iteration 1

- Source of seeded content: monorepo starter template.
- Seeding outcome in target repository:
  - one commit containing full runnable starter app content.
- Reliability-first requirement:
  - no dependency on live external template fetch during repo creation.

## Important Changes / Additions to Interfaces and Types

Iteration 1 simplifies the manifest contract to a single snapshot representation:

```ts
type StarterTemplateManifest = {
  version: string;
  commitMessage: string;
  files: Record<string, string>;
};
```

Out of scope for Iteration 1:

- Multi-step manifest format (`steps[]`) and staged replay requirements.

## Acceptance Criteria

- Spec clearly records the discussion questions/problems and rationale.
- Spec explicitly defines Iteration 1 scope and deferred topics.
- Spec states exact single-commit seeding rule.
- Spec requires command-level setup history in template `AGENTS.md`.
- Starter template export always includes up-to-date `.devcontainer` + `.codespace-agent` assets from canonical root sources.

## Test Cases and Scenarios

1. Creating a new noter-managed vault yields exactly one starter-seeding commit.
2. Seeded repository builds and runs with React + Vite + Convex + Tailwind + shadcn baseline.
3. Infra provisioning still triggers and reaches ready state.
4. `apps/noter-starter-template/AGENTS.md` includes reproducible setup commands.

## Assumptions and Defaults

- Default branch is `main`.
- Reliability is prioritized over runtime freshness for Iteration 1.
- Manual template refresh process is acceptable in this iteration.
- Exploring a separate template repo is deferred, not rejected.

## Deferred / Future Iterations

- Evaluate moving source of truth to a separate template repository.
- Evaluate preserving staged pedagogical commit history in generated repos.
- Evaluate sync automation strategy between monorepo and template repo.
- Experiment with reading starter template code directly as runtime text (instead of generated manifest) if Convex deployment/bundling guarantees deterministic access to template files.
- If the direct text-read experiment is pursued, compare failure modes and operational complexity against the current generated-manifest approach before changing the default seeding path.
