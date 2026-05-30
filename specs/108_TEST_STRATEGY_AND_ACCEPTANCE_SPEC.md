# 108 Test Strategy And Acceptance Spec

## Document Control

- Status: Accepted
- Owner: Noter testing/runtime
- Last updated: 2026-05-30
- Related files:
  - `package.json`
  - `apps/noter/playwright.config.ts`
  - `docs/playwright-visual-testing.md`
  - `docs/test-suite-inventory.md`
  - `rfcs/085_TEST_SUITE_STRATEGY.md`
  - `research/2026-05-30-test-suite-audit.md`
  - `specs/095_CONVEX_BACKEND_CONTRACT_TESTING_SPEC.md`

## Summary

Noter uses one explicit local acceptance command for branch confidence and a smaller set of focused
commands for local diagnosis. The accepted direction is to keep tests at the cheapest layer that can
prove the product contract, and to keep Playwright default acceptance limited to browser-required or
visual-contract behavior.

This spec promotes the stable policy from `rfcs/085_TEST_SUITE_STRATEGY.md`. The RFC remains the
migration plan, `docs/test-suite-inventory.md` remains the maintained per-file Playwright inventory,
and `docs/playwright-visual-testing.md` remains the operator runbook.

## External Baseline

This policy follows common test-suite guidance:

- Playwright recommends testing user-visible behavior, isolating each test's storage/session/data,
  using Linux on CI, using sharding when the suite is large, and keeping visual regression runs on
  the same operating system and browser versions.
- Testing Library's guiding principle is that tests should resemble how the software is used.
- Google's Testing Blog and the test pyramid both argue against putting most confidence in large
  end-to-end tests because they are slower, less isolated, and harder to debug.

The Noter-specific choices are the exact command names, the Linux Docker ARM64 baseline, the
classification labels, and which product contracts are allowed to block release.

## Acceptance Commands

The full local branch acceptance command is:

```bash
pnpm test:acceptance
```

That command runs:

1. `pnpm check:ci`
2. `pnpm test`
3. `pnpm test:visual:linux`

`pnpm test:ci` is an alias for the same local acceptance surface. A green pull request does not
prove the Playwright suite ran unless the PR workflow explicitly includes that job.

The visual-only acceptance command is:

```bash
pnpm test:visual:linux
```

Focused Playwright runs, CI-shaped shards, Testbox checks, worker-count overrides, and diagnostic
grep runs are useful evidence for the specific surface they exercise. They do not replace the full
unmodified local acceptance command after a full local failure.

## Test Layers

Choose the lowest-cost layer that proves the current product contract.

1. Static checks: TypeScript, lint, and generated-file drift.
2. Unit/component tests: pure helpers, route parsing, URL editor suggestions, React behavior that
   does not need browser layout, package utilities, and script behavior.
3. Convex contract tests: registered query/mutation/action behavior, auth/user isolation, schema
   validation, persisted state transitions, and HTTP routes through `t.fetch`.
4. Playwright browser behavior: real route shell behavior, auth wiring, history, scroll, touch,
   drag, focus, selection, WebGL/canvas, storage integration, and mobile viewport behavior.
5. Playwright visual contracts: screenshots only when rendered appearance is itself the contract.
6. Diagnostic tests: stress fixtures, research views, and exploratory coverage that should stay
   available but should not block unrelated branches.

Do not add a Playwright screenshot because it is faster to write than a targeted assertion. If a
unit, component, or Convex contract test can prove the behavior, use that layer first.

## Playwright Acceptance Policy

Playwright default acceptance should include only tests with one of these classifications:

- `release-blocking`: failure likely means a shipped user behavior is broken.
- `visual-contract`: failure likely means intended appearance drifted.
- `rewrite`: behavior matters, but the current test is too broad, brittle, expensive, or at the
  wrong layer. These stay temporarily only while being split or moved.

Tests classified as `diagnostic` must be opt-in. They can run with
`PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`, a focused file, or a focused grep, but they must not block the
default acceptance command unless an owner reclassifies them as a shipped contract.

Tests classified as `delete` should be removed after confirming that they protect no current product
contract or duplicate cheaper coverage.

When a test has unclear ownership or no named user-visible contract, the default action is
`rewrite`, `demote`, or `delete`, not preservation.

## Visual Baseline Policy

Linux Docker ARM64 is the authoritative surface for screenshot acceptance and baseline creation.
Native macOS browser runs are diagnostic only. Snapshot refreshes must use `pnpm test:visual:linux`
or a focused command through that wrapper.

The wrapper's default worker and parallelism settings are part of the accepted local visual surface.
Worker overrides and shard commands are diagnostics for their exact shape.

## Admin And Auth Policy

Tests for admin-only app routes must authenticate through the seeded local password account rather
than weakening route access. Use the shared Playwright admin route helper for admin routes so route
setup, sign-in, and first navigation happen in one consistent path.

If Docker or CI-like Playwright cannot sign in, debug the local auth bootstrap chain before changing
product access policy.

## Inventory Policy

`docs/test-suite-inventory.md` owns the maintained Playwright classification. It must be updated
when a Playwright spec is added, deleted, demoted, promoted, renamed, or materially rewritten.

Each row should name:

- file,
- test count or relevant diagnostic count,
- classification,
- product contract,
- runtime risk,
- owner/domain,
- current action.

`research/` may contain audit evidence and incident notes, but it is not the source of truth for the
current accepted test surface.

## Addition Rules

New tests should make their layer clear through file placement and assertions:

- pure logic -> `.test.ts`
- React behavior without browser layout -> `.test.tsx`
- Convex registered functions -> `.convex.test.ts`
- real route browser behavior -> Playwright
- screenshot contract -> Playwright visual with a stable Linux baseline
- exploratory or stress coverage -> diagnostic Playwright test, excluded from default acceptance

Every new Playwright test should name the browser-only behavior it protects. Broad fixture
galleries, mixed behavior/screenshot files, and tests that require reading a large harness to
understand a failure should be split before they become default acceptance debt.
