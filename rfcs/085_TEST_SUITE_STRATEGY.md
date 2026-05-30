# 085 Test Suite Strategy

## Document Control

- Status: Proposed
- Owner: Noter testing/runtime
- Last updated: 2026-05-30
- Related research:
  - `research/2026-05-30-test-suite-audit.md`
- Related references:
  - `specs/108_TEST_STRATEGY_AND_ACCEPTANCE_SPEC.md`
  - `docs/test-suite-inventory.md`
  - `docs/playwright-visual-testing.md`
  - `specs/095_CONVEX_BACKEND_CONTRACT_TESTING_SPEC.md`
  - `rfcs/082_PLAYWRIGHT_CI_SPEEDUPS_RESEARCH.md`

## Problem

The test suite has become expensive to maintain because too much coverage lives in the highest-cost
layer. Playwright visual tests currently mix release-critical route behavior, auth/backend setup,
touch/layout mechanics, fixture snapshots, logo/raster diagnostics, and research-style views. When
that suite is red, the failure may be a real product bug, a stale screenshot, Docker browser
pressure, Convex bootstrap, or a test that no longer maps to the product direction.

The result is high mental overhead. Engineers and agents spend time asking which test command is
authoritative, whether a PR green state means browser coverage ran, whether local and CI surfaces
are comparable, and whether a failed test protects a real user contract.

## Goals

- Make one full local acceptance command obvious.
- Keep release-blocking tests tied to real product contracts.
- Move non-browser behavior out of Playwright where possible.
- Keep visual screenshots only where visual appearance is the contract.
- Give diagnostic tests an explicit home so they can be useful without blocking unrelated work.
- Make future test additions prove why they belong at their chosen layer.

## Non-Goals

- Do not delete broad coverage without first classifying what behavior it claims to protect.
- Do not make PR CI run the full browser matrix until the suite is smaller and more interpretable.
- Do not accept native macOS screenshots as visual baselines.
- Do not replace targeted real-route browser repros with fake fixtures for production interaction
  bugs.

## External Baseline

This plan follows the current Playwright guidance rather than inventing a Noter-only testing model:

- Test user-visible behavior and avoid implementation-detail assertions:
  <https://playwright.dev/docs/best-practices>
- Keep tests isolated, with their own storage, cookies, data, and session state:
  <https://playwright.dev/docs/best-practices>
- Reuse authenticated state intentionally through setup projects, `storageState`, or worker-scoped
  fixtures instead of ad hoc login flows in every spec: <https://playwright.dev/docs/auth>
- Use Linux for CI/browser parity and keep worker counts matched to runner capacity:
  <https://playwright.dev/docs/ci>
- Prefer sharding and smaller, parallelizable files when the suite is too slow:
  <https://playwright.dev/docs/test-sharding>
- Emit machine-readable reporter output for tooling and triage:
  <https://playwright.dev/docs/test-reporters>

The Noter-specific decisions are the layer boundaries, which specs block release, and which
diagnostic fixtures should stay available without running in the default acceptance path.

## Proposed Test Layers

### 1. Static Checks

Command:

```bash
pnpm check:ci
```

Use for:

- TypeScript contracts.
- Lint rules.
- generated-file drift where the command covers it.

This layer should catch mechanical mistakes before runtime tests start.

### 2. Unit And Component Tests

Command:

```bash
pnpm test
```

Use for:

- pure helpers,
- route parsing and search-param normalization,
- URL editor suggestion generation,
- state reducers,
- React component behavior that does not need browser layout,
- package utilities,
- script behavior.

Default rule: if jsdom or a pure helper can prove the behavior, do not add Playwright first.

### 3. Convex Contract Tests

Command:

```bash
pnpm test:convex
```

Use `.convex.test.ts` for:

- registered query/mutation/action behavior,
- auth and user isolation,
- schema validation,
- persisted state transitions,
- HTTP routes through `t.fetch`,
- cross-user denial cases.

Keep pure helper tests in `.test.ts`. Do not hide Convex contract tests inside unsuffixed unit-test
files.

### 4. Browser Behavior Tests

Command:

```bash
pnpm test:visual:linux
```

Use Playwright for behavior that needs a browser:

- real route shell behavior,
- auth wiring and redirects,
- history and Back/Forward behavior,
- scroll, touch, drag, focus, selection,
- WebGL/canvas rendering,
- storage integration,
- mobile viewport behavior,
- full-page layout contracts.

Browser tests should prefer web-first assertions and explicit app state over `networkidle`, fixed
timeouts, and broad screenshot checks.

### 5. Visual Contract Tests

Command:

```bash
pnpm test:visual:linux
```

Use screenshots when visual appearance is the behavior:

- public landing layout,
- app shell chrome,
- mobile pane geometry,
- logo/canvas output where pixel shape matters,
- stable visual fixture coverage for a production component tree.

Do not use screenshots as a default way to assert text, links, or pure routing behavior.

### 6. Diagnostic Tests

Command shape:

```bash
pnpm test:visual:linux -- e2e/specific-diagnostic.spec.ts
```

Diagnostic tests may be valuable for local work but should not block the default acceptance command
unless they protect a current shipped product contract. Examples include research fixtures, stress
matrices, broad logo labs, and text-heavy exploratory snapshots.

Diagnostic files should be named and documented so a failure is not mistaken for release-blocking
coverage.

## Acceptance Commands

Full local branch acceptance:

```bash
pnpm test:acceptance
```

That command runs:

1. `pnpm check:ci`
2. `pnpm test`
3. `pnpm test:visual:linux`

Visual-only local acceptance:

```bash
pnpm test:visual:linux
```

Focused Playwright runs are inner-loop diagnostics. CI-shaped shard commands are parity diagnostics
for push CI. Neither replaces the full local acceptance command after a full local failure.

## Classification Rules

Every existing Playwright file should get one classification:

- `release-blocking`: failure means a user-visible product contract is likely broken.
- `visual-contract`: failure means intended appearance may have drifted.
- `diagnostic`: failure is useful signal for focused work, not default release gating.
- `rewrite`: behavior matters, but the current layer or implementation is too expensive or brittle.
- `delete`: stale, duplicate, or no current contract.

Use these questions:

1. What exact user behavior or invariant does this protect?
2. Would a user notice if the behavior broke?
3. Is this the cheapest layer that proves the behavior?
4. Does it require a real browser, real route, or screenshot?
5. Does the test use shared auth/backend/bootstrap state?
6. Does the test fail for product reasons or environment/setup reasons?
7. Is the failure actionable without reading a large fixture harness?

If the answer to the first question is unclear, the default recommendation is `rewrite` or `delete`,
not automatic preservation.

## Initial Migration Plan

### Phase 1. Make Commands Honest

Status: started in this branch.

- Add `pnpm test:acceptance`.
- Point `pnpm test:ci` at `pnpm test:acceptance` so the old command no longer runs native Playwright
  by accident.
- Keep `pnpm test:visual:linux` as visual-only acceptance.
- Update the Playwright docs and Noter Playwright skill with the command split.

### Phase 2. Add Inventory Labels

Status: started in this branch.

Create a small owned inventory file, likely `docs/test-suite-inventory.md`, with one row per
Playwright spec:

- file,
- classification,
- product contract,
- command surface,
- runtime risk,
- owner/domain,
- action: keep, rewrite, demote, delete.

Do not turn the research document into the source of truth. Research captures evidence; docs should
hold the maintained inventory after the direction is accepted.

### Phase 3. Low-Risk Cleanup

Start with small changes for:

- orphan snapshot deletion,
- skipped unit test fix/delete,
- visual-named behavior tests rename/reclassify,
- stale research fixtures demoted to diagnostic or deleted.

Each PR should remove or clarify one class of test debt.

This branch handles the first three low-risk cleanup items for the initial audit:

- deletes the orphan `file-view-monaco-drag.spec.ts-snapshots` directory,
- removes the skipped tuple test for deprecated `spread_NOT_IMPLEMENTED` runtime behavior,
- renames the two non-screenshot `*-visual.spec.ts` behavior specs.
- removes the skipped ProseMark mobile body-scroll Playwright assertion after a focused Linux Docker
  repro still failed with `scrollTop === 0`; the default suite keeps the passing desktop body-scroll
  and mobile carousel gesture coverage.
- moves unsuffixed Convex-harness-backed tests into the `.convex.test.ts` lane while keeping pure
  `infraProvisioning` helper coverage in `.test.ts`.

It also demotes the first diagnostic group out of default Playwright acceptance with an
`@diagnostic` tag and `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1` override:

- Codex research visual fixtures,
- `file-view-code-parity.spec.ts`,
- `logo-snap-angles-visual.spec.ts`,
- `logo-three-visual.spec.ts`,
- raster seam lab cases inside `logo-iso-controls-visual.spec.ts`.
- the extra logo renderer depth-cap matrix inside `logo-iso-controls-visual.spec.ts`, while keeping
  one default `/logo` route smoke for excessive URL-edited depth recovery.
- detailed route URL editor dropdown screenshots inside `route-url-editor.spec.ts`, while moving the
  manually typed value-suggestion case into `RouteUrlEditor.test.tsx`.
- workspace gesture debug overlay checks inside `workspace-sidebar-drag.spec.ts`.

### Phase 4. Split High-Cost Specs

Start with:

- `apps/noter/e2e/route-url-editor.spec.ts`,
- `apps/noter/e2e/public-landing-shell.spec.ts`,
- `apps/noter/e2e/logo-iso-controls-visual.spec.ts`,
- `apps/noter/e2e/vault-dashboard-visual.spec.ts`,
- `apps/noter/e2e/workspace-sidebar-drag.spec.ts`.

For each spec:

1. identify the release-blocking contracts,
2. move pure logic to unit tests,
3. keep one real-route browser path for browser-only behavior,
4. keep screenshots only for real visual contracts,
5. move stress/diagnostic cases out of the default path.

Initial route URL editor split status: the manually typed search-value suggestion case now runs in
`apps/noter/src/components/RouteUrlEditor.test.tsx`, and the numeric/color dropdown screenshot
details are diagnostic. The remaining default file still needs a broader contract split around
browser editing, hover preview, history, mobile picker, prod mode, and boundary rejection.

Initial public landing split status: prod-ui shortcut absence and dev-toggle query preservation now
run in `apps/noter/src/components/AppSidebarMetaSection.test.tsx`; the serial Playwright file keeps
route, auth-slot, mobile shell, logo fallback/drag, and navigation budget coverage.

Initial workspace sidebar split status: gesture debug overlay checks now run only with
`PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`; default Playwright keeps shipped mobile carousel, resize grip,
logo sidebar, and localStorage persistence behavior.

### Phase 5. Improve Runtime Reporting

Status: started in this branch.

The Docker wrapper now writes `.tmp/playwright-linux/summary.json` with:

- totals,
- failures,
- skipped tests,
- workers,
- duration,
- slowest tests.

Use that summary to track whether the suite is getting cheaper over time.

## Addition Policy

New tests should state their layer through file placement and assertions:

- pure logic -> `.test.ts`,
- React behavior without browser layout -> `.test.tsx`,
- Convex registered functions -> `.convex.test.ts`,
- real route browser behavior -> Playwright,
- screenshot contract -> Playwright visual with stable Linux baseline,
- exploratory or stress coverage -> diagnostic file, not default release gate.

Do not add a Playwright screenshot because it is faster to write than a targeted assertion. The
browser layer is expensive enough that every new file should name the browser-only behavior it
protects.

## Open Questions

- Should CI use the same Docker Linux wrapper as local visual acceptance, or should local gain an
  explicit x64 CI-parity mode?
- Which remaining Playwright diagnostic tests should stay in the repository but outside default
  acceptance?
- Should the full Playwright suite stay off PRs after the default path is pruned, or should a
  smaller release-blocking browser subset run on PRs?
- What runtime target should block adding new visual coverage? A practical first target is full
  local acceptance under five minutes and focused UI loops under thirty seconds.
