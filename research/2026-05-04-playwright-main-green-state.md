# Playwright Main Green State Research

## Document Control

- Status: Research
- Owner: Noter frontend/test infrastructure
- Created: 2026-05-04
- Current main CI run:
  [25351238018](https://github.com/noter-md/noter/actions/runs/25351238018)
- Related files:
  - `.github/workflows/ci.yml`
  - `apps/noter/playwright.config.ts`
  - `apps/noter/playwright.live.config.ts`
  - `apps/noter/e2e/`
  - `apps/noter/src/visualFixture.tsx`
  - `apps/noter/src/index.css`
  - `apps/noter/tailwind.config.ts`
  - `research/2026-04-02-prosemark-mobile-scroll-linux-ci-follow-up.md`

## Goal

Bring Playwright back to a green, useful, development-facing state on `main`.

The suite should be stable enough that failures mean either a real product
regression or an intentional UI change that deserves visual review. It should
not encode compatibility with old macOS screenshots, stale intermediate UI
states, or local worktree-only behavior that is not present in CI.

This is the durable direction to preserve through future context compactions:

1. Make Linux CI the single canonical visual baseline for required Playwright
   screenshots.
2. Remove macOS/Darwin fallback baselines from the required suite unless a
   product surface is intentionally OS-specific.
3. Fix root causes for cross-platform rendering differences instead of keeping
   parallel snapshot sets.
4. Triage every failing test as one of:
   - keep and fix product behavior
   - keep and update the test/snapshot
   - delete because it no longer protects a useful contract
5. Prefer production component trees over invented visual-only shells.

## Operator Direction

The user does not want backwards compatibility with macOS-specific baselines.
Those were added as a plan B when the repo guidance was less strict about fixing
root causes and keeping test infrastructure simple.

The expected product direction is that the web app should look the same across
platforms. If Linux and macOS differ because of fonts, the root fix is to use
intentional bundled fonts or otherwise constrain rendering, not to maintain two
sets of screenshot truth.

The move from GitHub-hosted runners to Blacksmith may change the Linux runtime
details, but it does not change the target: the required CI environment should
own the canonical screenshots, and local macOS runs should not create a second
required baseline.

The user also wants production component reuse to be a test invariant. Creating
new visual fixtures is not automatically good coverage. If a fixture stops using
the components and shells that production uses, the test can become a mock
visual rather than product evidence. The baseline for workspace-like surfaces
should be `WorkspaceLayoutV2`; even a single-main-pane scenario should use the
same standard shell instead of a custom substitute.

## Current CI Shape

Initial failing `main` push inspected during this research:

- Run: `25321219066`
- Commit: `d33c30fcadcd7581ada808d159cfd6253cbe081c`
- Checks/unit tests: green
- Windows smoke: green
- Playwright: red on all three shards
- Aggregate result: red because Playwright is red

The Playwright workflow is currently push-only:

```yaml
if: ${{ github.event_name == 'push' }}
```

That means PRs can merge without browser coverage, and failures can accumulate
on `main`. This made the suite drift long enough that it needed a holistic reset
rather than a one-test patch.

This push-only shape is intentional for now because the full Playwright shard
matrix is too expensive to run on every PR. Do not re-enable the full PR matrix
as a default stabilization fix unless the cost tradeoff changes. Prefer local
Linux/Testbox reproduction, targeted PR smoke coverage, or narrower changed-area
browser checks when looking for pre-merge signal.

As of 2026-05-05, after [`#705`](https://github.com/noter-md/noter/pull/705),
the next `main` CI push was green:

- Run:
  [`25351238018`](https://github.com/noter-md/noter/actions/runs/25351238018)
- Commit: `96765c067301391cbc84c288ac582d5cfe249c99`
- Playwright: green on shards `1/3`, `2/3`, and `3/3`
- Failure artifacts: none

That failing run reported:

- shard 1: 12 failed, 40 passed, 1 skipped
- shard 2: 25 failed
- shard 3: 9 failed, 44 passed
- total observed failures: 46

The CI artifacts were downloaded locally during this investigation. Temporary
report servers were started at:

- `http://127.0.0.1:9321`
- `http://127.0.0.1:9322`
- `http://127.0.0.1:9323`

Those links are diagnostic only; rerun/download artifacts again if the local
server processes are gone.

## Baseline Drift Findings

The repo has explicit platform-suffixed screenshot names in required tests.
Examples:

- `landing-markdown-preview-desktop-darwin.png`
- `public-layout-landing-darwin.png`
- `workspace-layout-v2-status-bar-linux.png`
- `machines-workspace-header-darwin.png`
- `machines-workspace-header-linux.png`
- `machine-connect-page-darwin.png`
- `machine-connect-page-linux.png`
- `machine-connect-page-win32.png`

Specs currently compute snapshot names from `process.platform` in several
places:

- `apps/noter/e2e/file-view-connect-route-visual.spec.ts`
- `apps/noter/e2e/landing-markdown-preview-visual.spec.ts`
- `apps/noter/e2e/machine-connect-visual.spec.ts`
- `apps/noter/e2e/machines-workspace-visual.spec.ts`
- `apps/noter/e2e/public-layout-visual.spec.ts`
- `apps/noter/e2e/workspace-layout-v2-status-bar.spec.ts`

This creates three problems:

1. macOS updates do not reliably update Linux CI baselines.
2. Linux CI can fail with missing snapshots even when the visual state is
   acceptable.
3. Reviewers must reason about two visual truths for one web app.

Several current failures are exactly this class:

- missing `landing-markdown-preview-*-linux.png`
- missing `public-layout-landing-linux.png`
- missing `public-layout-landing-dev-linux.png`
- missing `workspace-layout-v2-status-bar-mobile-linux.png`

## Font Findings

Font drift is still the most plausible original reason for Linux/macOS snapshot
splits.

Original evidence:

- `apps/noter/src/visualFixture.tsx` imports IBM Plex Sans weights from
  `@fontsource/ibm-plex-sans`.
- Some individual fixtures force IBM Plex Sans with local CSS, such as
  `MachineConnectVisualFixture` and `SidebarMediaUploadVisualFixture`.
- App chrome still uses Tailwind `font-sans`, and the current Tailwind config
  does not override `fontFamily.sans`. That means many app surfaces rely on the
  browser/system sans stack.
- Inline code and editor surfaces intentionally use platform-dependent monospace
  stacks in places, which can be acceptable for semantic/editor tests but is
  risky for strict screenshot assertions.

Implementation status on 2026-05-05:

- `apps/noter/src/index.css` now imports the latin IBM Plex Sans weights used by
  the app and makes Tailwind `font-sans` resolve to IBM Plex Sans before the
  system fallback stack.
- `apps/noter/src/visualFixture.tsx` no longer carries fixture-only IBM Plex
  imports; visual fixtures inherit the same app CSS as production routes.
- `apps/noter/src/main.tsx` waits briefly for the bundled app font weights
  before the first React mount so delayed font files do not reflow landing or
  workspace chrome after first paint.
- A Blacksmith Testbox full run against the refreshed Linux baselines passed
  with 158 passed and 1 skipped.
- A local macOS full run against the Linux baselines still fails screenshot
  comparisons because Chromium text rasterization is not pixel-identical across
  operating systems. This supports Linux-only visual truth for required
  screenshots while keeping macOS useful for semantic/targeted checks.
- A focused machines-workspace header experiment confirmed that the remaining
  macOS/Linux visual difference is not a font-loading failure. The same bundled
  IBM Plex Sans WOFF is used, `document.fonts` reports loaded, computed
  `font-family`, `font-size`, `font-weight`, `line-height`, and the header
  screenshot dimensions match. The macOS capture still paints a denser glyph
  mask: 2,534 dark pixels in the header versus 1,683 in the Linux/Testbox
  baseline, while the dark-pixel y-range is effectively the same. Chromium flags
  such as `--disable-font-subpixel-positioning`, `--font-render-hinting=none`,
  and `--disable-lcd-text` did not change the macOS output; forcing
  `-webkit-font-smoothing: antialiased` reduced macOS glyph density slightly but
  did not make the screenshot match Linux. Treat this as platform text rendering
  behavior, not a missing app font.

The root-cause direction should be:

1. Pick the intended app font for visual surfaces.
2. Wire it through the app/theme instead of patching fixtures one by one.
3. Keep editor/Monaco/CodeMirror visual tests tolerant or semantic where text
   rasterization is not the actual contract.

## Failure Buckets

### Acceptable Visual Changes To Review

Many failures are screenshot dimension or pixel drift after recent UI/layout
work. These are candidates for human review and baseline refresh if the current
rendered UI is desired.

Examples from the latest run:

- `codex-app-server-research-visual.spec.ts`
- `file-view-monaco-height.spec.ts`
- `file-view-prosemark-height.spec.ts` desktop screenshot
- `machine-connect-visual.spec.ts`
- `machines-workspace-visual.spec.ts`
- `repository-media-visual.spec.ts`
- `sidebar-media-upload-visual.spec.ts`
- `vault-branch-preview-visual.spec.ts`
- `vault-dashboard-visual.spec.ts`
- `workspace-layout-v2-status-bar.spec.ts`

The correct action is not blanket snapshot update. Use the Playwright report
expected/actual/diff views, accept intentional UI changes, and fix the product
when the diff reveals broken layout.

### Missing Linux Baselines

These failures are infrastructure debt, not product bugs:

- `landing-markdown-preview-visual.spec.ts`
- `public-layout-visual.spec.ts`
- `workspace-layout-v2-status-bar.spec.ts` mobile screenshot

Near-term unblock:

- Refresh canonical Linux snapshots in CI-equivalent Linux.

Permanent cleanup:

- Remove platform suffixes and keep a single snapshot name per required visual
  assertion.

### Stale Or Questionable Behavioral Assertions

These should be triaged before updating snapshots:

- `not-found-visual.spec.ts` expects a `Go home` link that is no longer present.
- `pitch-deck-visual.spec.ts` expects `Desktop PDF` and `Mobile PDF` links that
  are no longer present.
- `public-landing-shell.spec.ts` expects local password-auth UI in a CI preview
  route.
- `public-landing-shell.spec.ts` expects duplicate synthetic clicks on the dev
  toggle to land on `/?dev`; current behavior remains `/`.
- `public-landing-shell.spec.ts` expects a hidden `/logo` status-bar link that
  is no longer found.
- `file-view-prosemark-height.spec.ts` mobile swipe still expects a pane change
  from `main` to `left`; the app now stays on `main` in the inspected run.

These should not be solved by loosening assertions. Either the product behavior
is still required and should be fixed, or the tests should be updated/deleted
because they protect stale contracts.

### Harness Noise

`public-layout-visual.spec.ts` has a ProseMark deletion regression test that
expects no console errors after deleting all landing copy. In CI it captured:

```txt
WebSocket connection to 'ws://127.0.0.1:3210/api/1.36.1/sync' failed:
Error in connection establishment: net::ERR_CONNECTION_REFUSED
```

That console error is unrelated to the ProseMark crash the test wants to catch.
The test should filter expected environment transport noise or run against a
fixture that does not open a Convex subscription. The assertion should still
fail on real app crash surfaces and `pageerror`.

## Recommended Recovery Plan

### Phase 0: Preserve The Decision

Keep this research document and the test policy in the branch before starting
the larger cleanup. The important durable decisions are:

- Linux CI is the canonical visual baseline.
- macOS/Darwin visual compatibility is not a goal.
- Human review decides whether changed screenshots are good product UI.
- Test infrastructure can decide Linux/macOS duplication, stale platform
  suffixes, and missing canonical baselines without human visual judgment.
- Workspace-like visual coverage should use `WorkspaceLayoutV2` or the closest
  production wrapper, not a bespoke shell.

### Phase 1: Restore Signal

1. Keep Playwright artifact report access easy while triaging. The existing CI
   upload of `apps/noter/e2e/playwright-report` and
   `apps/noter/e2e/test-results` is valuable.
2. For each red test, classify it into the buckets above.
3. Fix stale behavioral tests first so snapshot refreshes do not hide product
   contract changes.
4. Do not add new platform-specific snapshots during this phase.

Agent-owned work in this phase:

- classify failures
- fix stale assertions and harness noise
- delete tests that only preserve obsolete behavior
- keep report URLs/screenshots easy for the user to review

User-owned work in this phase:

- approve or reject changed screenshots as desired product UI

### Phase 2: Make A Local Linux Loop

Use a Linux container as the primary local reproduction path for visual
snapshots. `act` is useful for checking workflow wiring, but it is not the best
source of screenshot truth because it simulates GitHub Actions through Docker
and still needs runner-label image mapping for Blacksmith labels. A pinned
Playwright Docker image is a clearer visual loop.

Current repo facts:

- Playwright version: `1.58.2`
- CI runner: `blacksmith-4vcpu-ubuntu-2404`
- Blacksmith documents the Ubuntu runners as drop-in runner-image replacements
  for GitHub-hosted runner images.
- Playwright documents that Docker image versions should match the project
  Playwright version, and recommends `--ipc=host` for Chromium.

Preferred command shape:

```bash
docker run --rm --init --ipc=host \
  -v "$PWD":/work \
  -w /work \
  -e CI=1 \
  -e PLAYWRIGHT_SKIP_BUILD=1 \
  -e PLAYWRIGHT_VITE_PORT=43121 \
  mcr.microsoft.com/playwright:v1.58.2-noble \
  bash -lc 'corepack enable && pnpm install --frozen-lockfile && PLAYWRIGHT_SKIP_BUILD=1 PLAYWRIGHT_VITE_PORT=43121 pnpm --filter noter exec playwright test -c playwright.config.ts --shard=1/3'
```

Keep an `act` path only as a workflow smoke tool. For this workflow it would
need explicit platform mapping such as:

```bash
act push \
  -j playwright \
  -P blacksmith-4vcpu-ubuntu-2404=mcr.microsoft.com/playwright:v1.58.2-noble
```

That can validate step ordering, environment variables, artifact upload shape,
and shell behavior. It should not decide whether a screenshot is canonical.

### Phase 3: Canonicalize Visual Baselines

1. Use the Linux container or Blacksmith CI to update screenshot baselines.
2. Rename required visual snapshots to platform-neutral names.
3. Remove `process.platform` snapshot name branching from the required suite.
4. Delete obsolete Darwin and Windows screenshot baselines unless the product
   intentionally renders OS-specific UI.
5. Keep a narrow local macOS smoke path only if it asserts semantics, layout
   metrics, or accessibility contracts instead of screenshots.

This is mostly agent-owned. The user does not need to review Linux-vs-macOS
mechanics; the suite should have one required baseline. The user only needs to
review the resulting visual diffs when the actual UI changes.

### Phase 4: Fix Font Root Cause

1. Decide whether the app should use IBM Plex Sans globally or another bundled
   brand font.
2. Configure Tailwind/app base styles so `font-sans` resolves to the intended
   bundled font.
3. Remove one-off fixture font patches once global font behavior is stable.
4. Keep editor text rasterization tests tolerant or replace them with geometry
   assertions when glyph pixels are not the contract.

### Phase 5: Move Fixtures Toward Production Trees

1. Audit visual fixtures by product surface.
2. Move workspace-like fixtures to `WorkspaceLayoutV2` before refreshing those
   snapshots.
3. Where production components cannot yet be reused directly, feed deterministic
   view models into the closest production wrapper and document the gap.
4. Delete invented visual-only shells once production component seams make them
   unnecessary.

This does not have to block the first green-state PR for every fixture. It
should block any snapshot refresh where the current fixture is clearly testing a
mock layout instead of the shipped surface.

### Phase 6: Make Playwright Part Of Development Again

1. Re-enable a smaller PR Playwright gate after `main` is green.
2. Keep the full visual matrix on `main` if budget requires it, but require at
   least smoke/critical browser coverage on PRs.
3. Add a documented local Linux visual-refresh workflow so snapshot updates do
   not depend on guessing from macOS.
4. Consider splitting tests by intent:
   - route behavior
   - interaction/gesture behavior
   - visual snapshots
   - live/manual repro tests

## Opinionated Test Policy

Use screenshots for:

- page chrome that should remain visually stable
- layout density/spacing regressions that are hard to express semantically
- component states where exact visual review is meaningful

Avoid screenshots for:

- text-heavy surfaces where copy changes often
- editor glyph rasterization unless editor appearance is the feature
- local-only auth/dev affordances that do not exist in CI
- hidden elements whose presence is not a user-visible contract

Prefer semantic assertions for:

- links and buttons existing
- route/search-param transitions
- scroll ownership
- pane state
- keyboard/focus/touch behavior

Delete tests when:

- the protected behavior is no longer desired
- the test only preserves a temporary migration state
- the assertion duplicates a stronger route/component test
- the only remaining value is keeping an obsolete screenshot alive

## Production Fixture Invariant

Playwright coverage should default to actual production components, not
visual-only mock assemblies.

This matters most for app chrome and workspace surfaces. When a scenario needs a
workspace route, pane, editor surface, sidebar, status bar, or route shell, the
fixture should mount the real production tree or the closest production wrapper.
For workspace-like surfaces, the default shell is `WorkspaceLayoutV2`, even when
the test only needs one main pane.

Acceptable fixture code should:

- provide deterministic data to production components
- isolate external services when needed
- keep the same shell, layout, scrolling, focus, and pane mechanics as the app
- add only the minimum wrapper required to make the production surface testable

Avoid fixture code that:

- rebuilds a production layout with bespoke `div` scaffolding
- screenshots a component in a custom shell that production never uses
- invents headers, sidebars, spacing, or scroll containers for test convenience
- hides bugs by simplifying the very chrome the test claims to protect

When a current fixture is too mock-like, prefer moving it toward the production
tree before refreshing snapshots. Updating a mock snapshot can make the suite
green while preserving the wrong contract.

## Immediate Next Implementation Checklist

1. Open the latest Playwright reports and mark each failure as
   accept/fix/delete.
2. Patch stale behavior tests:
   - not-found home link
   - pitch PDF links
   - local password auth slot in CI
   - duplicate dev-toggle expectation
   - hidden `/logo` link expectation
   - ProseMark mobile swipe expectation
   - Convex WebSocket console-noise filter
3. Generate Linux snapshots for accepted current UI.
4. Remove platform suffix branching from required visual specs.
5. Delete stale Darwin/Windows baselines.
6. Audit visual fixtures for production-shell fidelity, especially workspace
   surfaces that should use `WorkspaceLayoutV2`.
7. Run the full Playwright suite with the CI command:

```bash
PLAYWRIGHT_VITE_PORT=43121 pnpm --filter noter test:visual
```

When running from a worktree before dev/lint/test workflows, use `pnpm anon` per
repo startup rules if the local backend/setup is required.

## Decision Summary

Canonical required Playwright screenshots should be Linux CI snapshots. macOS
backwards compatibility baselines are not a goal. Cross-platform rendering
differences should be fixed at the app/font/test-design level, not preserved as
parallel screenshot truth.
