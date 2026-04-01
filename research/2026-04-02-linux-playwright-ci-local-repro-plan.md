# Linux Playwright CI Repro Plan

## Why

The ProseMark mobile scroll regression on
[#406](https://github.com/noter-md/noter/pull/406) showed that macOS-local
Playwright passes were not enough for mobile/headless confidence. The failure
only became trustworthy once it was reproduced against the PR merge commit
inside the Linux Playwright container.

This note turns that lesson into a concrete local workflow so future GitHub-only
Playwright failures can be debugged quickly without waiting on repeated Actions
runs.

## Goals

- reproduce GitHub Actions Playwright failures locally on Linux
- support the exact PR merge ref that Actions tests
- keep the loop small enough to use during bugfix work, not only incident
  cleanup
- make the repro path explicit enough that route-shell and visual bugs stop
  depending on macOS-only confidence

## Proposed Workflow

1. Fetch the PR merge ref locally.
2. Create a temporary worktree from that merge ref.
3. Run the target spec or visual command inside
   `mcr.microsoft.com/playwright:v1.58.2-noble`.
4. Bootstrap Convex inside the container using the same minimal CI flow.
5. Iterate on the failing test or implementation until the Linux container run
   passes.

## Candidate Command Shape

```bash
git fetch origin pull/<pr-number>/merge:pr-<pr-number>-merge
git worktree add /tmp/noter-pr-<pr-number>-merge pr-<pr-number>-merge

docker run --rm \
  -v /tmp/noter-pr-<pr-number>-merge:/work \
  -w /work \
  mcr.microsoft.com/playwright:v1.58.2-noble \
  bash -lc '
    set -euo pipefail
    corepack enable
    pnpm install
    # bootstrap Convex similarly to CI
    # run the target Playwright command
  '
```

## Proposed Repo Follow-up

### Short term

- add a documented script or `make` target for Linux Playwright repro
- prefer targeting one failing spec first rather than the entire visual suite
- save artifacts from the container run in the checked-out worktree so local
  inspection matches CI artifacts

### Medium term

- add a helper for fetching the PR merge ref automatically
- add a helper for running the same `Bootstrap Convex for CI` sequence outside
  GitHub Actions
- consider a command such as `make ci-visual-local PR=123 SPEC=...`

## Success Criteria

- a failing GitHub-only Playwright test can be reproduced locally in Linux
  within one command or one documented short workflow
- the repro path uses the PR merge ref, not only the branch head
- container repro artifacts are easy to compare with uploaded GitHub artifacts
- the mobile ProseMark scroll test can be re-enabled once its Linux hit-target
  issue is fixed

## Initial Target

Use this workflow first for the skipped mobile assertion in
`apps/noter/e2e/file-view-prosemark-height.spec.ts`.

Related note:
[research/2026-04-02-prosemark-mobile-scroll-linux-ci-follow-up.md](/Users/nicu/.codex/worktrees/cda7/noter/research/2026-04-02-prosemark-mobile-scroll-linux-ci-follow-up.md)
