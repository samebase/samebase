# Test Suite Audit

## Document Control

- Status: Research
- Owner: Noter testing/runtime
- Last updated: 2026-05-30
- Related files:
  - `package.json`
  - `.github/workflows/ci.yml`
  - `vite.config.ts`
  - `apps/noter/playwright.config.ts`
  - `apps/noter/playwright.live.config.ts`
  - `docs/test-suite-inventory.md`
  - `docs/playwright-visual-testing.md`
  - `specs/095_CONVEX_BACKEND_CONTRACT_TESTING_SPEC.md`

## Summary

The current test suite has useful coverage, but the expensive layer is carrying too many different
jobs at once. The Playwright visual suite protects real route, auth, storage, layout, touch, and
canvas behavior, but it also contains fixture snapshots, research fixtures, route-editor behavior
checks, and broad visual baselines in one default command. That makes failures harder to interpret
and makes every red run feel like a product incident even when the failure is setup, browser
context, or stale fixture drift.

The main improvement should be classification before deletion:

1. keep release-blocking behavior explicit,
2. move diagnostic coverage out of the default acceptance path,
3. rewrite important browser tests that are only using screenshots because that was convenient,
4. delete stale snapshots, skipped tests, and old research fixtures after each one has a named owner
   or no owner.

The maintained per-spec classification lives in `docs/test-suite-inventory.md`. Keep this research
document as evidence and context, not as the operator-facing inventory.

Status update: this branch now tags the first diagnostic group with `@diagnostic` and excludes it
from default Playwright acceptance unless `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1` is set.

## Evidence Sources

Local commands:

```bash
find apps/noter/e2e -name '*.spec.ts' -maxdepth 1 -print | sort
find . -path './node_modules' -prune -o -path './apps/noter/node_modules' -prune -o -path './.git' -prune -o \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' -o -name '*.spec.tsx' \) -print | sort
pnpm --filter noter exec playwright test -c playwright.config.ts --list
find apps/noter/e2e -maxdepth 1 -type d -name '*-snapshots' -print | sort | wc -l
find apps/noter/e2e -maxdepth 2 -type f \( -name '*.png' -o -name '*.snap' -o -name '*.txt' \) | wc -l
wc -l apps/noter/e2e/*.spec.ts | sort -nr | head -20
grep -RIn "test:ci\|test:acceptance\|test:visual:linux" package.json apps packages scripts .github docs skills specs rfcs research AGENTS.md
```

Delegated read-only lanes:

- Playwright/e2e inventory and stale/brittle candidate scan.
- Non-Playwright test inventory and command scan.
- Runtime, flake, CI/local mismatch, and saved report scan.

External primary references used for calibration:

- Playwright best practices: <https://playwright.dev/docs/best-practices>
- Playwright authentication: <https://playwright.dev/docs/auth>
- Playwright visual comparisons: <https://playwright.dev/docs/test-snapshots>
- Playwright parallelism: <https://playwright.dev/docs/test-parallel>
- Playwright sharding: <https://playwright.dev/docs/test-sharding>
- Testing Library guiding principles: <https://testing-library.com/docs/guiding-principles/>
- Google Testing Blog on fewer large end-to-end tests:
  <https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html>
- Cypress best practices: <https://docs.cypress.io/app/core-concepts/best-practices>
- Martin Fowler on the test pyramid: <https://martinfowler.com/bliki/TestPyramid.html>

## Current Test Surfaces

### Root Commands

- `pnpm check:ci` runs static/type/lint checks without Convex codegen.
- `pnpm test` runs the Vite+/Vitest projects from `vite.config.ts`.
- `pnpm test:convex` runs only the `convex` Vitest project.
- `pnpm test:visual:linux` runs Playwright inside the Docker Linux wrapper.
- `pnpm test:acceptance` now runs `pnpm check:ci`, `pnpm test`, and `pnpm test:visual:linux`.
- `pnpm test:ci` now points at `pnpm test:acceptance` so the old name no longer means native
  Playwright.

### GitHub CI

`.github/workflows/ci.yml` runs these on pull requests:

- supply-chain audit,
- `pnpm check:ci`,
- `pnpm test`.

Full Playwright and Windows sync smoke are push-only:

- Playwright matrix runs on main pushes with three shards.
- PR Playwright jobs are intentionally skipped, so a green PR does not prove browser coverage.

### Playwright Default Suite

`apps/noter/playwright.config.ts` lists `235` Chromium tests in `44` default files. The default
config ignores `*.live.spec.ts`.

Approximate shape from local inventory:

- `51` total Playwright spec files including live specs.
- `44` default Playwright files, `235` listed tests.
- `7` live specs, run by `apps/noter/playwright.live.config.ts`.
- `40` snapshot directories.
- `122` tracked PNG-style visual artifacts under `apps/noter/e2e`.
- `35` default files with screenshot or snapshot assertions.
- `34` default files that use `/visual-fixture` or fixture-style harnesses.
- `10` default files hit real routes rather than fixture-only pages.
- `6` default files require auth or local sign-in.
- `2` default files are serial; together they carry `83` listed tests.

The largest default Playwright files by line count:

- `apps/noter/e2e/route-url-editor.spec.ts`: `1864` lines, `43` listed tests.
- `apps/noter/e2e/public-landing-shell.spec.ts`: `1798` lines, `40` listed tests.
- `apps/noter/e2e/logo-iso-controls-visual.spec.ts`: `1049` lines, `30` listed tests.
- `apps/noter/e2e/vault-dashboard-visual.spec.ts`: `1020` lines, `23` listed tests.
- `apps/noter/e2e/workspace-sidebar-drag.spec.ts`: `703` lines, `14` listed tests.

### Non-Playwright Tests

Strict non-`apps/noter/e2e` test inventory found `207` files:

- `apps/noter`: `181`
- `packages/sure`: `16`
- `scripts`: `8`
- `packages/dependent`: `1`
- `packages/sync`: `1`

Suffix shape:

- `.test.ts`: `154`
- `.test.tsx`: `38`
- `.convex.test.ts`: `11`
- `.tsc_test.ts`: `3`
- `.type_test.ts`: `1`

The current Vite+ config already separates:

- `unit`: normal Node/jsdom/helper tests,
- `convex`: `apps/noter/convex/**/*.convex.test.ts` in `edge-runtime`.

## Runtime And Flake Evidence

The saved Docker Playwright report at `.tmp/playwright-linux/playwright-report/index.html` showed:

- `235` tests,
- `234` passed,
- `1` skipped,
- `0` unexpected failures,
- `4` workers,
- about `162.6s` runtime.

Slowest known local candidates from `.tmp/playwright-linux/summary.json`:

- `apps/noter/e2e/commit-review-visual.spec.ts:23`: about `80.6s`.
- `apps/noter/e2e/logo-iso-controls-visual.spec.ts:479`: about `42.5s`.
- `apps/noter/e2e/logo-snap-angles-visual.spec.ts:249`: about `29.6s`.
- `apps/noter/e2e/logo-iso-controls-visual.spec.ts:700`: about `16.0s`.
- `apps/noter/e2e/file-view-code-parity.spec.ts:101`: about `12.3s`.

The Docker wrapper now also writes `.tmp/playwright-linux/summary.json`, so future scans can read
totals, failures, worker count, duration, and slowest tests without scraping the HTML report or
terminal logs.

Recent failure classes:

- Docker context setup failure under the old 8-worker local wrapper default.
- Convex bootstrap timeout before `.env.local` had local deployment values.
- Auth-gated route failures after `/indexDB`, `/localStorage`, and `/logo/**` became admin-only.
- Native app Playwright report diverged from Docker Linux state; the Docker result is authoritative
  for screenshot acceptance.

## Findings

### 1. The expensive browser layer is over-broad

Playwright is protecting several distinct contracts:

- shipped route behavior,
- auth and local backend bootstrap,
- touch/drag/focus/layout mechanics,
- screenshot baselines,
- fixture-only component states,
- logo/canvas/raster diagnostics,
- research and text-heavy snapshots.

Those categories do not have the same release risk. Keeping them in one default suite makes every
failure cost more investigation than the product risk justifies.

### 2. The default command story was misleading

Before this audit, `pnpm test:ci` ran `pnpm test` plus native app Playwright. That was neither PR CI
nor the canonical Linux Docker visual surface. The new `pnpm test:acceptance` and `test:ci` alias
make the local command story explicit.

### 3. A few specs dominate maintenance load

The route URL editor, public landing shell, logo controls, vault dashboard, and workspace sidebar
drag specs carry large local helper stacks and many stateful cases. They should be split by product
contract and demoted where assertions can move to unit/component tests.

### 4. Some visual files are not visual contracts

The initial inventory found `app-boot-failure-visual.spec.ts` and `not-found-visual.spec.ts` with
visual naming but no screenshot or custom visual-diff assertion. This branch renames them to
`app-boot-failure.spec.ts` and `not-found.spec.ts` so the file names match their behavior
assertions.

### 5. There is stale or diagnostic residue

The initial inventory found an orphan snapshot directory:

- `apps/noter/e2e/file-view-monaco-drag.spec.ts-snapshots`

The matching spec file is not present. This branch deletes that directory and removes the stale
simple-view fixture entries.

Text-heavy research-style fixture snapshots are also diagnostic candidates:

- `codex-app-server-research-visual.spec.ts`
- `codex-thread-browser-visual.spec.ts`
- `codex-thread-history-visual.spec.ts`

This branch demotes those research fixtures, `file-view-code-parity.spec.ts`,
`logo-snap-angles-visual.spec.ts`, `logo-three-visual.spec.ts`, and the raster seam lab cases inside
`logo-iso-controls-visual.spec.ts` behind the diagnostic opt-in.

### 6. Backend contract coverage is improving but uneven

`specs/095_CONVEX_BACKEND_CONTRACT_TESTING_SPEC.md` defines the right direction. Current coverage is
stronger around vaults/users/deletion and thinner around registered-function or HTTP contracts for
file staging ownership, connected machines, chat approval/audit, MCP HTTP, and billing/webhooks if
active.

Three unsuffixed tests use `makeConvexTest()` outside the `.convex.test.ts` lane:

- `apps/noter/convex/infraProvisioning.test.ts`
- `apps/noter/convex/repositoryRefresh.test.ts`
- `apps/noter/convex/repositoryRefreshModel.test.ts`

Those should be split so real Convex contract coverage lives in `.convex.test.ts`, while pure helper
tests stay in `.test.ts`.

### 7. Small hygiene issues should not remain silent

The initial audit found:

- one skipped unit test in `packages/sure/src/__tests__/tuple.test.ts`, removed in this branch
  because it asserted runtime spread behavior for the deprecated `spread_NOT_IMPLEMENTED` helper,
- one excluded diagnostic type file at
  `packages/sure/src/__tests__/types/understandingInferGoodRaw.tsc_test.ts`,
- zero strict test files in `apps/domain-router`, `apps/workspace-layout-v2-solid`,
  `packages/agent-context`, and `packages/onboarding-video-tools`.

Zero tests are not automatically wrong for package shells, generated assets, or typechecked-only
tools. They should still be classified so the absence is intentional.

## Recommendation Set

### Immediate

1. Use `pnpm test:acceptance` as the one local command for full branch acceptance.
2. Keep `pnpm test:visual:linux` as the one authoritative visual acceptance surface.
3. Move the three unsuffixed `makeConvexTest()` files into clearer `.convex.test.ts` or `.test.ts`
   ownership.

### Playwright Pruning

Classify every Playwright spec as one of:

- `release-blocking`: route/auth/storage/layout/editor behavior users depend on.
- `visual-contract`: screenshot baseline for shipped UI where appearance is the behavior.
- `diagnostic`: useful for targeted work, not part of default acceptance.
- `rewrite`: important behavior currently tested at the wrong layer.
- `delete`: stale, duplicate, or no current product contract.

### Lower-Cost Coverage

Move assertions out of Playwright when the browser is not the behavior:

- route parsing and URL suggestions -> unit tests,
- search param defaults -> unit tests,
- pure logo math and raster geometry -> unit tests or focused component tests,
- Convex authorization and ownership -> `.convex.test.ts`,
- visual chrome and mobile/touch mechanics -> Playwright only when real browser layout matters.

### Runtime Visibility

Add a small machine-readable summary beside each Docker Playwright report:

- total tests,
- pass/fail/skip,
- actual workers,
- total duration,
- slowest tests,
- failure file list.

That would let future audits and agents inspect the last run without unpacking Playwright HTML.
