# Starter Template Strategy Specification (Iteration 1)

## Document Control

- Status: Draft for implementation.
- Owner: Noter backend/frontend
- Date: 2026-04-16
- Related specs:
  - `specs/022_AGENT_GRAPH_VIEW_SPEC.md`
- Related files:
  - `apps/noter/convex/starterSeed.ts`
  - `apps/noter/convex/starterSeedManifest.generated.ts`
  - `scripts/refresh-starter-manifest.ts`
  - dedicated source repo: `noter-md/convex-cloudflare-pages-stack`

## Summary

This spec captures the first real cut of a separate starter source repo.

For Iteration 1, the decision is:

- Keep Noter seeding behavior as one generated starter commit.
- Move the starter source of truth out of this monorepo into
  `noter-md/convex-cloudflare-pages-stack`.
- Treat `apps/noter/convex/starterSeedManifest.generated.ts` as a pinned latest
  snapshot exported from that repo.
- Defer commit-history replay and other multi-step seed mechanics.

## Problem Statement

The old Iteration 1 contract optimized for reliability by keeping the starter
inside this monorepo and exporting one manifest snapshot from
`apps/noter-starter-template`.

That no longer matches the product direction:

1. the starter should have its own dedicated repo in `noter-md`
2. the starter should be maintainable as a self-sustained full-stack repo
3. Noter should still seed deterministically without depending on a live GitHub
   fetch during repo creation

## Questions Raised (Captured From Discussion)

- Should Noter preserve the source repo's commit history in managed repos?
- Should GitHub template mode be part of the first implementation?
- How much cross-repo release machinery is worth taking on immediately?
- How do we keep the starter aligned with shared Vite Plus and scaffold config?

## Options Considered

### Option A: Keep starter source in the monorepo

Pros:

- lowest implementation cost
- no cross-repo refresh workflow

Cons:

- does not actually separate ownership
- keeps starter authoring coupled to unrelated monorepo work

Verdict:

- reject

### Option B: Dedicated source repo with latest-snapshot seeding (chosen)

Pros:

- clean source-of-truth separation
- preserves the current simple one-commit seed behavior
- keeps seeding deterministic through a committed generated artifact

Cons:

- requires an explicit refresh workflow
- does not preserve source repo history in managed repos

Verdict:

- choose for Iteration 1

### Option C: Dedicated repo plus commit-history replay

Pros:

- richer educational history in seeded repos

Cons:

- materially more tooling and release complexity
- unnecessary for the first implementation

Verdict:

- defer

## Iteration 1 Decision (Final)

- Canonical starter source lives in `noter-md/convex-cloudflare-pages-stack`.
- Noter seeds newly created repos from one pinned latest snapshot committed in
  `apps/noter/convex/starterSeedManifest.generated.ts`.
- New managed repos still receive one generated starter commit.
- The starter source repo itself is a monorepo with a single app in `apps/web`.
- GitHub templates and commit-history replay stay out of scope for Iteration 1.

## Source And Refresh Contract

- `scripts/refresh-starter-manifest.ts` is the only supported refresh path for
  the committed starter snapshot in this monorepo.
- The refresh script must:
  - read a local checkout of `convex-cloudflare-pages-stack`
  - exclude transient artifacts such as `.git`, `node_modules`, `dist`, and
    `*.tsbuildinfo`
  - record the source repo slug and exact git SHA in the generated manifest
- Refresh command:

```bash
pnpm run starter:refresh -- --source-dir <path-to-convex-cloudflare-pages-stack>
```

- `apps/noter-starter-template` is now transitional and must not be treated as
  the long-term authoring home for seeded starter content.

## Public API / Behavior Changes

### `vaultActions.createRepository`

Behavioral contract for Iteration 1:

- Seeds starter content in a single commit.
- Uses the pinned generated latest snapshot exported from the dedicated starter
  source repo.
- Does not replay the source repo's commit history.

### Infra Provisioning

- No contract change.
- Existing behavior remains: provisioning is still auto-scheduled for
  noter-managed vaults.

## Technical Contract For Iteration 1

- Source of truth: dedicated repo `noter-md/convex-cloudflare-pages-stack`
- Seed input in this monorepo: committed generated manifest snapshot
- Seed outcome in target repository:
  - one commit containing the full exported starter repo snapshot
- Reliability-first requirement:
  - no dependency on a live external template fetch during repo creation

## Important Changes To Interfaces And Types

Iteration 1 keeps the single-snapshot manifest shape, but the manifest now
records the source pin:

```ts
type StarterTemplateManifest = {
  version: string;
  commitMessage: string;
  source: {
    repository: string;
    commitSha: string;
  };
  files: Record<string, string>;
};
```

Out of scope for Iteration 1:

- staged replay manifests
- source-history preservation in managed repos
- automatic live sync from GitHub during seeding

## Acceptance Criteria

- The dedicated source repo exists in `noter-md`.
- This monorepo can refresh a pinned starter snapshot from that repo with one
  explicit command.
- The generated manifest records the exact source repo and commit SHA.
- Creating a new noter-managed vault still yields exactly one starter-seeding
  commit.
- Shared scaffold-critical config changes continue to update the starter source
  repo deliberately alongside the main app when relevant.

## Test Cases And Scenarios

1. Running `pnpm run starter:refresh -- --source-dir <checkout>` rewrites
   `apps/noter/convex/starterSeedManifest.generated.ts`.
2. The generated manifest includes:
   - root workspace files such as `package.json` and `pnpm-workspace.yaml`
   - starter app files such as `apps/web/package.json` and
     `apps/web/convex/schema.ts`
   - source metadata with the dedicated repo slug and git SHA
3. Creating a new noter-managed vault still yields exactly one starter-seeding
   commit.
4. Seeded repository build/startup uses the exported monorepo layout rather than
   the old flat-root starter layout.

## Assumptions And Defaults

- Default branch is `main`.
- Reliability is prioritized over runtime freshness during repo creation.
- Manual starter refresh is acceptable in this iteration.
- A human-readable source repo history can exist without becoming part of the
  first seeding contract.

## Deferred / Future Iterations

- Evaluate commit-history replay from the dedicated source repo.
- Evaluate GitHub template mode as an optional distribution path.
- Remove or repurpose `apps/noter-starter-template` after all remaining
  monorepo-only consumers are gone.
