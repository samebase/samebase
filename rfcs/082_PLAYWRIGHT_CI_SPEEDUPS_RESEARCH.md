# 082 Playwright CI Speedups Research

## Document Control

- Status: Partially implemented in this branch
- Owner: Noter CI / frontend
- Last updated: 2026-04-02
- Depends on:
  - `.github/workflows/ci.yml`
  - `apps/noter/playwright.config.ts`
  - `apps/noter/e2e/*`

## Summary

The current slowdown is mostly self-inflicted by how Noter runs Playwright in CI, not by a need to
replace GitHub Actions or move to a different CI/CD stack.

Verified current bottlenecks:

- the workflow serializes lint, unit tests, Playwright, and build inside one job
- Playwright rebuilds the app inside its `webServer` and the workflow builds it again afterward
- the visual suite is large enough that one shard leaves obvious idle time on the table
- browser install time can spike when Ubuntu mirror downloads for Playwright's Linux dependencies
  are slow

Recommended direction:

1. keep GitHub Actions
2. split fast checks from Playwright so they run in parallel
3. shard the Playwright suite across multiple jobs
4. reuse one build per shard instead of rebuilding inside `webServer`
5. leave third-party runner products and "use my laptop as a runner" as future options, not the
   first fix

## Verified Current State

### Recent CI timing snapshot

Observed on 2026-04-02 from recent `noter-md/noter` CI runs:

- 23 recent successful CI runs averaged about `9.05` minutes wall-clock
- most successful runs clustered around `8.25` to `8.82` minutes
- one recent successful outlier took `13.4` minutes

Two recent successful step breakdowns:

- run `23873397323`
  - bootstrap Convex: about `17s`
  - type check: about `72s`
  - install Playwright browser: about `28s`
  - run tests: about `5m16s`
  - build: about `47s`
- run `23874222810`
  - bootstrap Convex: about `16s`
  - type check: about `72s`
  - install Playwright browser: about `5m22s`
  - run tests: about `5m19s`
  - build: about `49s`

Conclusion:

- the normal path is already slower than it needs to be because it is mostly serialized
- the outlier came from Playwright dependency install time, not from the tests themselves

### Current suite shape

Observed locally on 2026-04-02:

- `41` Playwright spec files under `apps/noter/e2e`
- `30` visual spec files
- `8` non-live non-visual spec files
- `3` live spec files, ignored by the main CI config
- current branch listing under `CI=true` shows `116` Chromium tests in the main Playwright config
- with the sharded config in this branch, `--shard=1/2` and `--shard=2/2` each list `58` tests

Recent active-branch CI logs were slightly smaller at `85` tests, which means the suite is still
growing and the need for parallelism is only getting more real.

Most of the main CI suite targets `visual-fixture` and uses isolated snapshot-style pages. Only the
`.live.spec.ts` files carry explicit serial live flow behavior, and those are already excluded from
`apps/noter/playwright.config.ts`.

### Current workflow bottlenecks

Current `CI` workflow behavior before this branch:

1. `pnpm install`
2. Convex bootstrap
3. `pnpm lint:ci`
4. `playwright install --with-deps chromium`
5. `pnpm test:ci`
6. `pnpm build:ci`

That means the pass path waits for static checks, Playwright setup, unit tests, visual tests, and
build one after another in a single runner.

There is also duplicate build work:

- `pnpm test:ci` calls `pnpm --filter noter test:visual`
- `apps/noter/playwright.config.ts` runs `npm run build:ci` inside `webServer`
- the workflow then runs `pnpm build:ci` again afterward

## Why The Current Branch Chooses Sharding First

This branch uses normal GitHub Actions parallel jobs rather than changing platforms.

Reasons:

- it keeps the same CI product, repo settings model, and debugging flow
- it matches Playwright's recommended path for wider CI parallelization
- it avoids adding a second hosted runner vendor before we know the current workflow has been
  squeezed properly
- it respects the desire to keep local and CI stacks close instead of swapping in a materially
  different environment immediately

## Immediate Changes In This Branch

### 1. Split checks from Playwright

The workflow now runs:

- a fast `checks` job for Convex bootstrap, lint/typecheck, and unit tests
- a sharded `playwright` matrix job for the visual suite
- a tiny aggregate `ci (24.x)` job that preserves the existing required check name while failing if
  either parallel lane fails

This improves wall-clock time without asking branch protection to learn a brand new required check
name first.

### 2. Reuse the app build inside each shard

Each Playwright shard now builds `apps/noter` once up front and then starts `vite preview` without
rebuilding inside Playwright's `webServer`.

That removes the hidden "build before preview" duplication from the old `Run tests` step.

### 3. Use test-level sharding

`apps/noter/playwright.config.ts` now enables `fullyParallel` on CI.

That does not increase worker count on a single runner. Instead, it improves how Playwright balances
tests across shards by splitting at the individual test level instead of handing whole files to a
shard. This matters because several Noter visual files contain many scenario tests.

## What We Are Explicitly Not Doing Yet

### Caching Playwright browsers

Not recommended as a first fix.

Playwright's CI docs note that restoring cached browser binaries often takes about as long as
downloading them, and Linux system dependencies still have to be installed separately.

### Moving to Playwright's container image

This is promising, especially for the slow `--with-deps` Ubuntu apt path, but it does change the
execution environment more materially than the job/shard changes in this branch.

That should stay a second step if the current sharded GitHub Actions lane is still too slow.

### Switching to a shell-only Chromium download

Not shipping that in this branch.

The lower-download variant is attractive on paper, but Noter's visual fixture coverage is broad
enough that CI stability matters more than squeezing one more optimization out of the browser
install step.

### Using Blacksmith or another runner vendor

This remains a plausible future optimization if we decide faster hosted compute is worth the extra
dependency.

It is not necessary to get a meaningful speedup right now, and it would make the execution
environment less "plain GitHub-hosted runner" than the current stack.

### Using the operator laptop as an external Playwright environment

This is the most product-interesting future path, but not the simplest current fix.

If we want to push in that direction later, the most realistic version is:

1. keep GitHub Actions as the orchestrator
2. add an opt-in self-hosted runner or Noter-managed machine lane
3. restrict it to a dedicated visual lane where the operator wants identical local fonts/GPU/browser
   behavior
4. keep secrets, machine registration, and job routing explicit

That is future Noter/connected-machine work, not a small CI tune-up.

## Follow-Up Options

### Option A. Increase shard count from 2 to 3

Try this only after a few runs show whether two shards are balanced enough.

Two shards are the conservative first step because:

- the suite is about `85` tests today
- each extra shard duplicates Convex bootstrap, build, and browser install
- over-sharding can waste time if setup dominates the test body

### Option B. Move Playwright to the official container image

This is the best next "still GitHub Actions" option if dependency install latency remains noisy.

Expected benefit:

- fewer apt surprises during `--with-deps`
- more consistent Linux screenshot environment

Tradeoff:

- CI environment diverges a bit more from the plain hosted runner path

### Option C. Add a dedicated self-hosted visual lane

This could be a real operator machine or a stable long-lived self-hosted runner.

Best use:

- high-fidelity visual checks
- GPU/font-sensitive surfaces
- workloads where local parity matters more than generic hosted-runner speed

Tradeoff:

- machine availability, secrets, and queueing become part of the system design
- much more operational complexity than the current branch changes
