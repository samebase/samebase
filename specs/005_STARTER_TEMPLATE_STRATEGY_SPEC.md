# Starter Template Strategy Specification (Iteration 1)

## Document Control

- Status: Accepted, amended 2026-11-04.
- Owner: Samebase backend/frontend
- Date: 2026-02-13
- Related specs:
- Related files:
  - `apps/samebase/convex/repository/actions.ts`
  - `apps/samebase/convex/starterSeed.ts` (or replacement)
  - [samebase/base](https://github.com/samebase/base)
  - `scripts/export-starter-manifest.ts`
  - `apps/samebase/convex/starterSeedManifest.generated.ts`

## Summary

This spec captures the open questions and tradeoffs discussed while introducing starter seeding for
new samebase-managed repositories.

For Iteration 1, the original decision was:

- Keep starter source in a monorepo-local app package
- Do not use layered seed-step source folders
- Seed newly created repository/agent repositories as a single commit
- Preserve a future path to evaluate a separate dedicated template repository

The 2026-04-29 amendment adopted `samebase/app` as the starter source. The 2026-08-15 amendment
moves the maintained source to `templates/app` in this monorepo and makes the public `samebase/app`
repository an automatic repository export. Samebase still seeds generated user repositories as one
commit from a stored generated manifest.

The 2026-08-31 amendment renames the maintained source to `templates/base`, the public repository to
`samebase/base`, and the private package to `samebase-base`. Product actions and generated user
repositories continue to use app language.

The 2026-11-04 amendment makes `samebase/base` the maintained source again, so its pull requests
deploy previews before merge. The monorepo no longer holds or exports the template. The generated
manifest pins one `samebase/base` commit, and a maintainer moves the pin by hand. Samebase still
seeds one commit from the stored manifest.

## Problem Statement

Current product goal:

- New repositories should be instantly deployable and runnable in production after creation.

Observed issue with the previous approach:

- Layered snapshot folders (`seed-commits/*`) were introduced to enforce a staged multi-commit
  history.
- This creates duplicated files and additional maintenance overhead.

Strategic concern:

- Team is still evaluating whether long-term source of truth should remain monorepo-local or move to
  a separate template repository.

## Questions Raised (Captured From Discussion)

- Is layered commit snapshotting worth the implementation and maintenance complexity?
- Would a separate template repository reduce ongoing operational overhead?
- How should reuse from monorepo into template be handled over time?
- Should staged commit history be mandatory in generated user repositories?
- How much runtime dependency on external GitHub sources is acceptable during repository creation?

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

- Lowest complexity inside the current repository
- Minimal maintenance overhead
- Reliability-first creation flow remains straightforward

Cons:

- Generated repository no longer teaches incremental setup through commit history
- Less explicit stage semantics in seed pipeline

Operational cost:

- Low

### Option C: Separate template repository (adopted 2026-04-29, superseded 2026-08-15)

Pros:

- Cleaner separation of concerns
- Independent lifecycle/versioning for template
- Simpler mental model for starter ownership

Cons:

- Adds a cross-repository release and synchronization process
- Requires clear reliability strategy for consumption in noter

Operational cost:

- Medium

Current resolution:

- This was the active resolution from 2026-04-29 through 2026-08-14.
- `samebase/app` was the source of truth.
- Runtime app creation does not fetch from GitHub or require a git-capable Convex job.
- `scripts/export-samebase-app-manifest.ts` downloads the selected branch archive and writes
  `apps/samebase/convex/starterSeedManifest.generated.ts`.

### Option D: Separate repository plus staged replay and pinning (deferred)

Pros:

- Keeps pedagogical staged history while decoupling the source repository

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
- New repository creation seeds starter content as exactly one commit.
- Starter template package manager is pnpm to align with monorepo tooling and reduce package-manager
  variance.
- The starter app `AGENTS.md` must include:
  - exact initialization sequence used to build the template,
  - exact commands run (Vite, Convex, Tailwind, shadcn setup),
  - regeneration guidance for future updates.

## Current Decision (Amended 2026-11-04)

- Use `samebase/base` as the starter source of truth. Change it with pull requests there.
- Name the private root package `samebase-base`.
- Keep the single-commit seeding behavior.
- Store the generated manifest in the Samebase deployment bundle. Runtime app creation reads this
  stored manifest and does not fetch `samebase/base`.
- Pin one `samebase/base` commit in the manifest. Pin the current `main` and regenerate the manifest
  with:

```bash
pnpm run template:export -- --update
git add apps/samebase/convex/starterSeedManifest.generated.ts
```

- Store source provenance in the manifest:
  - `sourceRepository`
  - `sourceCommit`
  - `contentHash`
- Derive the `samebase-base-<hash>` template version from `contentHash`.
- Require manifest freshness against the pinned commit. Run the standalone supply-chain checks, the
  standalone build, and the Windows checks on the pinned commit when the pin changes and nightly.

## Public API / Behavior Changes

### `api.repository.create`

Behavioral contract for Iteration 1:

- Seeds starter content in a single commit.
- Does not enforce a 4-step staged commit history.

### Infra provisioning

- No contract change.
- Existing behavior remains: provisioning is still auto-scheduled for samebase-managed repositories.

## Technical Contract for Iteration 1

- Authoring source: `samebase/base`.
- Source of seeded content: committed generated manifest of one pinned `samebase/base` commit.
- Seeding outcome in target repository:
  - one commit containing full runnable starter app content.
- Reliability-first requirement:
  - no dependency on a live external template fetch during repository creation.

## Important Changes / Additions to Interfaces and Types

Iteration 1 simplifies the manifest contract to a single snapshot representation:

```ts
type StarterTemplateManifest = {
  version: string;
  sourceRepository: string;
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
- Spec requires source repository and commit provenance in the generated manifest.
- Starter manifest includes exactly the files of the pinned `samebase/base` commit.
- Required CI rejects a stale manifest, an unsafe standalone lockfile, or a failed standalone build.

## Test Cases and Scenarios

1. Creating a new samebase-managed repository yields exactly one starter-seeding commit.
2. Seeded repository builds and runs with the pinned `samebase/base` stack.
3. Infra provisioning still triggers and reaches ready state.
4. `pnpm run template:export` regenerates the manifest from the Git blobs of the pinned commit, and
   `--update` pins the current `main` of `samebase/base`.
5. Only files committed at the pinned commit enter the manifest.
6. A clean standalone install, supply-chain audit, and build pass with the starter's lockfile.

## Assumptions and Defaults

- Reliability is prioritized over runtime freshness for Iteration 1.
- Manifest freshness against the pinned commit is automatic in required CI.
- `samebase/base` is the public source and its `main` branch is append-only.

## Deferred / Future Iterations

- Consider preserving more of `samebase/base` history if generated repos need it after the v1
  single-commit flow.
- Evaluate preserving staged pedagogical commit history in generated repos.
- Use manual edition branches only when the public teaching artifact needs major stack re-curation.
  Routine updates are pull requests on `samebase/base`.
