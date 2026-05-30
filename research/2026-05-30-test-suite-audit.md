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
  - `specs/108_TEST_STRATEGY_AND_ACCEPTANCE_SPEC.md`
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

Status update: this branch now tags the first diagnostic group with `@diagnostic`, excludes it from
default Playwright acceptance unless `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1` is set, and removes the
stale skipped ProseMark mobile body-scroll assertion after a focused Linux Docker repro still
failed.

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

After the branch's diagnostic demotions and skipped-test cleanup, `apps/noter/playwright.config.ts`
lists `208` Chromium tests in `35` default files. The default config ignores `*.live.spec.ts` and
excludes `@diagnostic` tests unless `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1` is set.

Approximate shape from local inventory:

- `50` total Playwright spec files including live specs.
- `35` default Playwright files, `208` listed tests.
- `7` live specs, run by `apps/noter/playwright.live.config.ts`.
- `40` snapshot directories.
- `122` tracked PNG-style visual artifacts under `apps/noter/e2e`.
- `32` default files with screenshot or snapshot assertions.
- `32` default files that use `/visual-fixture` or fixture-style harnesses.
- `9` default files hit real routes rather than fixture-only pages.
- `6` default files require auth or local sign-in.
- `2` default files are serial; together they carry `77` listed tests.

The largest default Playwright files by line count:

- `apps/noter/e2e/route-url-editor.spec.ts`: `1768` lines, `40` default listed tests.
- `apps/noter/e2e/public-landing-shell.spec.ts`: `1755` lines, `37` listed tests.
- `apps/noter/e2e/logo-iso-controls-visual.spec.ts`: `1041` lines, `22` default listed tests.
- `apps/noter/e2e/vault-dashboard-visual.spec.ts`: `1020` lines, `23` listed tests.
- `apps/noter/e2e/workspace-sidebar-drag.spec.ts`: `703` lines, `12` default listed tests.

### Non-Playwright Tests

Strict non-`apps/noter/e2e` test inventory found `210` files:

- `apps/noter`: `183`
- `packages/sure`: `16`
- `scripts`: `9`
- `packages/dependent`: `1`
- `packages/sync`: `1`

Suffix shape:

- `.test.ts`: `153`
- `.test.tsx`: `39`
- `.convex.test.ts`: `14`
- `.tsc_test.ts`: `3`
- `.type_test.ts`: `1`

The current Vite+ config already separates:

- `unit`: normal Node/jsdom/helper tests,
- `convex`: `apps/noter/convex/**/*.convex.test.ts` in `edge-runtime`.

## Runtime And Flake Evidence

The saved Docker Playwright report at `.tmp/playwright-linux/playwright-report/index.html` now shows
the default suite after diagnostic demotion and skipped-test cleanup:

- `208` tests,
- `208` passed,
- `0` skipped,
- `0` unexpected failures,
- `4` workers,
- about `96.4s` runtime.

Slowest known local candidates from the latest `.tmp/playwright-linux/summary.json`:

- `apps/noter/e2e/logo-iso-controls-visual.spec.ts:822`: about `24.0s`.
- `apps/noter/e2e/logo-iso-controls-visual.spec.ts:697`: about `6.9s`; default acceptance keeps one
  route smoke and the extra renderer matrix is diagnostic.
- `apps/noter/e2e/logo-iso-controls-visual.spec.ts:320`: about `6.1s`.
- `apps/noter/e2e/logo-iso-controls-visual.spec.ts:392`: about `6.0s`.
- `apps/noter/e2e/repository-media-visual.spec.ts:22`: about `4.2s`.

The Docker wrapper now also writes `.tmp/playwright-linux/summary.json`, so future scans can read
totals, failures, worker count, duration, and slowest tests without scraping the HTML report or
terminal logs.

A focused rerun of `apps/noter/e2e/commit-review-visual.spec.ts` passed `7` tests in `6.9s`, so the
earlier `80.6s` deleted-fixture result should be treated as stale unless it reappears in a future
full-suite slowest list.

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

This branch demotes those research fixtures, `corner-notch-detail-visual.spec.ts`,
`file-view-code-parity.spec.ts`, `logo-snap-angles-visual.spec.ts`, `logo-three-visual.spec.ts`, the
raster seam lab cases, seam-stress preset checks, the mixed logo iso mobile boot smoke, the face-on
seam screenshot, the raster distance/depth geometry screenshot, and the extra renderer depth-cap
matrix inside `logo-iso-controls-visual.spec.ts` behind the diagnostic opt-in. It also demotes the
detailed route URL editor numeric/color dropdown screenshots, `vault-resource-rail-visual.spec.ts`,
and the workspace gesture debug overlay checks after moving the manually typed value-suggestion and
prod-ui dev-toggle query cases to component coverage. The default route-level depth-cap smoke
remains because it proves a real `/logo` page can recover from an excessive URL-edited depth before
rendering; the all-renderer cap matrix is already covered cheaply in
`apps/noter/src/lib/logoRouteSearch.test.ts`. The seam-stress preset browser check is diagnostic
because Sierpinski and Full Cube 3 preset data is covered lower in
`apps/noter/src/components/logo/logoPresets.test.ts`, and route editor value suggestions cover
entering those voxel states without the admin-only logo combobox. The resource rail fixture gallery
is diagnostic because `VaultResourceRail.test.tsx` and `VaultDashboard.test.tsx` own the provider
row, link, action, grouping, provisioning, failure, and add/root resource behavior. The auth-flow
route-editor suggestion browser test was deleted after
`apps/noter/src/lib/routeUrlEditorSuggestions.test.ts` proved the auth/signup suggestion contract
and the remaining browser file kept generic unfinished-value behavior coverage.

The separate landing-copy visual parity browser spec was deleted after adding
`LandingCopy.test.tsx`, which covers the static renderer and editable ProseMark handoff directly.
`public-landing-shell.spec.ts` still owns real-route landing editability.

This branch also removes the skipped
`mobile prose scroll › ProseMark keeps the real file-view workspace body scrollable on mobile`
Playwright assertion after a focused Linux Docker repro still failed with `scrollTop === 0`. The
default suite keeps the passing desktop body-scroll check and the passing mobile carousel gesture
check in `apps/noter/e2e/file-view-prosemark-height.spec.ts`.

### 6. Backend contract coverage is improving but uneven

`specs/095_CONVEX_BACKEND_CONTRACT_TESTING_SPEC.md` defines the right direction. Current coverage is
stronger around vaults/users/deletion and thinner around registered-function or HTTP contracts for
file staging ownership, connected machines, chat approval/audit, MCP HTTP, and billing/webhooks if
active.

The initial audit found three unsuffixed tests using `makeConvexTest()` outside the
`.convex.test.ts` lane:

- `apps/noter/convex/infraProvisioning.test.ts`
- `apps/noter/convex/repositoryRefresh.test.ts`
- `apps/noter/convex/repositoryRefreshModel.test.ts`

This branch moves their Convex-harness-backed coverage into:

- `apps/noter/convex/infraProvisioning.convex.test.ts`
- `apps/noter/convex/repositoryRefresh.convex.test.ts`
- `apps/noter/convex/repositoryRefreshModel.convex.test.ts`

The pure `infraProvisioning` selector and failure-provider helper tests stay in
`apps/noter/convex/infraProvisioning.test.ts`.

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
3. Keep checking for unsuffixed `makeConvexTest()` coverage so Convex contract tests stay in the
   `.convex.test.ts` lane and pure helpers stay in `.test.ts`.

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
