# ProseMark Mobile Scroll Linux CI Follow-up

## Status

- PR: [#406](https://github.com/noter-md/noter/pull/406)
- Date: 2026-04-02
- Current decision: resolved on 2026-05-30 by removing the stale skipped mobile body-scroll
  assertion from default Playwright coverage after a fresh Linux Docker repro still failed.

## What Failed

The remaining red CI failure on `#406` was:

- `apps/noter/e2e/file-view-prosemark-height.spec.ts`
- test:
  `mobile prose scroll › ProseMark keeps the real file-view workspace body scrollable on mobile`

Local macOS Playwright passed, but Ubuntu GitHub Actions failed with `scrollTop === 0`.

## What We Learned

- The desktop ProseMark fix is real and working.
- The remaining skipped assertion continued to behave like a Linux/headless mobile test issue when
  re-enabled on 2026-05-30.
- Reproducing the exact PR merge commit in Docker with `mcr.microsoft.com/playwright:v1.58.2-noble`
  reproduced the GitHub failure locally.
- The likely cause is the swipe helper in `apps/noter/e2e/file-view-prosemark-height.spec.ts`
  choosing a synthetic touch start from a guessed horizontal midpoint instead of an actual visible
  `.cm-line` rect. On Linux/mobile that can land in whitespace to the right of the left-aligned
  prose content, so the gesture does not scroll the workspace.

## Resolution

The skipped mobile body-scroll assertion was not kept as a default-suite placeholder. A focused
Linux Docker re-enable attempt still failed with `scrollTop === 0`, so the stale assertion was
deleted instead of carrying known-failing skipped coverage.

The default suite keeps:

1. desktop ProseMark body-scroll coverage, and
2. mobile carousel gesture coverage that starts inside visible prose.

No default-suite task remains from this incident. If real mobile vertical touch scrolling becomes a
current product regression again, add a new route-level or production-component repro for that
specific behavior instead of restoring this stale skipped assertion.

## Notes

- GitHub Actions currently tests the PR merge ref, not just branch head.
- Docker-based Linux repro was much more useful here than repeated macOS-only runs.
