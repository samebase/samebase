# Starter Template Strategy Specification (Iteration 1)

## Document Control

- Status: Accepted, amended 2026-04-29.
- Owner: Samebase backend/frontend
- Date: 2026-02-13
- Related specs:
- Related files:
  - `apps/samebase/convex/vault/actions.ts`
  - `apps/samebase/convex/starterSeed.ts` (or replacement)
  - `scripts/export-samebase-app-manifest.ts`
  - `apps/samebase/convex/starterSeedManifest.generated.ts`

## Summary

This spec captures the open questions and tradeoffs discussed while introducing starter seeding for
new samebase-managed vaults.

For Iteration 1, the original decision was:

- Keep starter source in a monorepo-local app package
- Do not use layered seed-step source folders
- Seed newly created vault/agent repositories as a single commit
- Preserve a future path to evaluate a separate dedicated template repository

The 2026-04-29 amendment adopts `samebase/app` as the starter source instead of the monorepo-local
starter app. Samebase still seeds generated user repositories as one commit from a generated
manifest, but the manifest is refreshed at maintenance/build time by exporting a selected
`samebase/app` branch.

## Problem Statement

Current product goal:

- New vaults should be instantly deployable and runnable in production after creation.

Observed issue with the previous approach:

- Layered snapshot folders (`seed-commits/*`) were introduced to enforce a staged multi-commit
  history.
- This creates duplicated files and additional maintenance overhead.

Strategic concern:

- Team is still evaluating whether long-term source of truth should remain monorepo-local or move to
  a separate template repository.

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

### Option C: Separate template repo (adopted 2026-04-29)

Pros:

- Cleaner separation of concerns
- Independent lifecycle/versioning for template
- Simpler mental model for starter ownership

Cons:

- Adds cross-repo release/sync process
- Requires clear reliability strategy for consumption in noter

Operational cost:

- Medium

Current resolution:

- `samebase/app` is the source of truth.
- Runtime app creation does not fetch from GitHub or require a git-capable Convex job.
- `scripts/export-samebase-app-manifest.ts` downloads the selected branch archive and writes
  `apps/samebase/convex/starterSeedManifest.generated.ts`.

### Option D: Separate repo plus staged replay/pinning (deferred)

Pros:

- Keeps pedagogical staged history while decoupling source repo

Cons:

- Highest process/tooling complexity
- More moving pieces (pins/tags/refresh workflows)

Operational cost:

- High

## Iteration 1 Decision (Final, Superseded)

- Keep starter template in a monorepo-local app package.
- Remove/avoid `seed-commits/*` layered source model.
- New vault creation seeds starter content as exactly one commit.
- Starter template package manager is pnpm to align with monorepo tooling and reduce package-manager
  variance.
- The starter app `AGENTS.md` must include:
  - exact initialization sequence used to build the template,
  - exact commands run (Vite, Convex, Tailwind, shadcn setup),
  - regeneration guidance for future updates.

## Current Decision (Amended 2026-04-29)

- Use `samebase/app` as the starter source of truth.
- Remove the monorepo-local starter app package.
- Keep the single-commit seeding behavior.
- Refresh the generated manifest with:

```bash
pnpm run template:export
pnpm run template:export -- --branch dev
```

- Store source provenance in the manifest:
  - `sourceRepo`
  - `sourceBranch`
  - `sourceCommit`
  - `contentHash`
- Do not overlay Samebase-owned files onto `samebase/app`. Generated starter content is exactly the
  selected `samebase/app` snapshot, and any required starter asset belongs there.

## Public API / Behavior Changes

### `api.vault.actions.createRepository`

Behavioral contract for Iteration 1:

- Seeds starter content in a single commit.
- Does not enforce a 4-step staged commit history.

### Infra provisioning

- No contract change.
- Existing behavior remains: provisioning is still auto-scheduled for samebase-managed vaults.

## Technical Contract for Iteration 1

- Source of seeded content: generated manifest exported from `samebase/app`.
- Seeding outcome in target repository:
  - one commit containing full runnable starter app content.
- Reliability-first requirement:
  - no dependency on live external template fetch during repo creation.

## Important Changes / Additions to Interfaces and Types

Iteration 1 simplifies the manifest contract to a single snapshot representation:

```ts
type StarterTemplateManifest = {
  version: string;
  sourceRepo: string;
  sourceBranch: string;
  sourceCommit: string;
  contentHash: string;
  commitMessage: string;
  files: Record<string, string>;
  binaryFiles: Record<string, string>;
  fileModes: Record<string, "100644" | "100755">;
};
```

Out of scope for Iteration 1:

- Multi-step manifest format (`steps[]`) and staged replay requirements.

## Acceptance Criteria

- Spec clearly records the discussion questions/problems and rationale.
- Spec explicitly defines Iteration 1 scope and deferred topics.
- Spec states exact single-commit seeding rule.
- Spec requires `samebase/app` provenance in the generated manifest.
- Starter template export includes exactly the selected `samebase/app` snapshot.

## Test Cases and Scenarios

1. Creating a new samebase-managed vault yields exactly one starter-seeding commit.
2. Seeded repository builds and runs with the current `samebase/app` stack.
3. Infra provisioning still triggers and reaches ready state.
4. `pnpm run template:export -- --branch <branch>` refreshes the manifest from the requested
   `samebase/app` branch.

## Assumptions and Defaults

- Default branch is `main`.
- Reliability is prioritized over runtime freshness for Iteration 1.
- Manual template refresh process is acceptable in this iteration.
- `samebase/app` is the separate template repo.

## Deferred / Future Iterations

- Consider preserving more of `samebase/app` history if generated repos need it after the v1
  single-commit flow.
- Evaluate preserving staged pedagogical commit history in generated repos.
- Investigate automating the `samebase/app` manifest refresh.
- Experiment with reading starter template code directly as runtime text (instead of generated
  manifest) if Convex deployment/bundling guarantees deterministic access to template files.
- If the direct text-read experiment is pursued, compare failure modes and operational complexity
  against the current generated-manifest approach before changing the default seeding path.
