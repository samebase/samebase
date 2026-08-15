# Starter Template Strategy Specification (Iteration 1)

## Document Control

- Status: Accepted, amended 2026-08-15.
- Owner: Samebase backend/frontend
- Date: 2026-02-13
- Related specs:
- Related files:
  - `apps/samebase/convex/vault/actions.ts`
  - `apps/samebase/convex/starterSeed.ts` (or replacement)
  - `templates/app`
  - `scripts/export-samebase-app-manifest.ts`
  - `scripts/publish-repository-exports.ts`
  - `apps/samebase/convex/starterSeedManifest.generated.ts`

## Summary

This spec captures the open questions and tradeoffs discussed while introducing starter seeding for
new samebase-managed vaults.

For Iteration 1, the original decision was:

- Keep starter source in a monorepo-local app package
- Do not use layered seed-step source folders
- Seed newly created vault/agent repositories as a single commit
- Preserve a future path to evaluate a separate dedicated template repository

The 2026-04-29 amendment adopted `samebase/app` as the starter source. The 2026-08-15 amendment
moves the maintained source to `templates/app` in this monorepo and makes the public `samebase/app`
repository an automatic repository export. Samebase still seeds generated user repositories as one
commit from a stored generated manifest.

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

### Option C: Separate template repo (adopted 2026-04-29, superseded 2026-08-15)

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

- This was the active resolution from 2026-04-29 through 2026-08-14.
- `samebase/app` was the source of truth.
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

### Option E: Monorepo source with public repository export (adopted 2026-08-15)

Pros:

- One pull request updates the template, its independent lockfile, the runtime seed, and the public
  repository.
- Required checks validate the exact standalone app before publication.
- Runtime app creation remains independent of GitHub and publication availability.

Cons:

- The template needs a separate package manager boundary inside the monorepo.
- Public export commits follow monorepo commit subjects instead of numbered teaching-step subjects.

Operational cost:

- Low

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

## Current Decision (Amended 2026-08-15)

- Use `templates/app` as the starter source of truth.
- Keep `templates/app` outside the root pnpm workspace. It owns its own `package.json`,
  `pnpm-workspace.yaml`, and `pnpm-lock.yaml`.
- Publish the committed `templates/app` tree to `samebase/app` after required checks pass.
- Keep the single-commit seeding behavior.
- Store the generated manifest in the Samebase deployment bundle. Runtime app creation reads this
  stored manifest and does not read `templates/app` or fetch `samebase/app`.
- Stage template changes, refresh the generated manifest, and stage the manifest with:

```bash
git add templates/app
pnpm run template:export
git add apps/samebase/convex/starterSeedManifest.generated.ts
```

- Store source provenance in the manifest:
  - `sourcePath`
  - `publishedRepo`
  - `contentHash`
- Derive the template version from `contentHash`. Do not store a source commit because the monorepo
  commit and public export commit do not exist until after the manifest is generated.
- Require manifest freshness, standalone supply-chain checks, and a standalone build before the
  public export can run.

## Public API / Behavior Changes

### `api.vault.actions.createRepository`

Behavioral contract for Iteration 1:

- Seeds starter content in a single commit.
- Does not enforce a 4-step staged commit history.

### Infra provisioning

- No contract change.
- Existing behavior remains: provisioning is still auto-scheduled for samebase-managed vaults.

## Technical Contract for Iteration 1

- Authoring source: `templates/app`.
- Source of seeded content: committed generated manifest exported from `templates/app`.
- Seeding outcome in target repository:
  - one commit containing full runnable starter app content.
- Reliability-first requirement:
  - no dependency on live external template fetch during repo creation.
- Publication requirement:
  - `samebase/app` receives the exact committed `templates/app` Git tree only after required checks
    pass.

## Important Changes / Additions to Interfaces and Types

Iteration 1 simplifies the manifest contract to a single snapshot representation:

```ts
type StarterTemplateManifest = {
  version: string;
  sourcePath: string;
  publishedRepo: string;
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
- Spec requires local source and public repository provenance in the generated manifest.
- Starter manifest includes exactly the Git-visible `templates/app` files.
- Required CI rejects a stale manifest, an unsafe standalone lockfile, or a failed standalone build.
- Repository publication exports the exact committed `templates/app` tree to `samebase/app`.

## Test Cases and Scenarios

1. Creating a new samebase-managed vault yields exactly one starter-seeding commit.
2. Seeded repository builds and runs with the current `templates/app` stack.
3. Infra provisioning still triggers and reaches ready state.
4. `pnpm run template:export` refreshes the manifest from staged Git blobs under `templates/app`.
5. Ignored local files do not enter the manifest.
6. A clean standalone install, supply-chain audit, and build pass with the nested lockfile.
7. A successful main push publishes the template tree to `samebase/app` without rewriting its
   existing history.

## Assumptions and Defaults

- Reliability is prioritized over runtime freshness for Iteration 1.
- Manifest freshness is automatic in required CI.
- A daily audit checks both monorepo and template lockfiles for new advisories that appear without a
  source change.
- `samebase/app` is public generated output and its `main` branch is append-only.

## Deferred / Future Iterations

- Consider preserving more of `samebase/app` history if generated repos need it after the v1
  single-commit flow.
- Evaluate preserving staged pedagogical commit history in generated repos.
- Use manual edition branches only when the public teaching artifact needs major stack re-curation.
  Routine updates use the monorepo export.
