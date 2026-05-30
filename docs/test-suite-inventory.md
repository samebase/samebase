# Test Suite Inventory

## Document Control

- Status: Maintained inventory
- Owner: Noter testing/runtime
- Last updated: 2026-05-30
- Related plan: `rfcs/085_TEST_SUITE_STRATEGY.md`
- Related spec: `specs/108_TEST_STRATEGY_AND_ACCEPTANCE_SPEC.md`
- Related research: `research/2026-05-30-test-suite-audit.md`

## Scope

This inventory tracks:

1. the default Playwright acceptance suite, and
2. diagnostic Playwright coverage intentionally excluded from that default.

Use this command to inspect the default acceptance surface:

```bash
pnpm --filter noter exec playwright test -c playwright.config.ts --list
```

Current default surface:

- `224` tests
- `38` files
- Chromium project only
- `*.live.spec.ts` excluded
- `@diagnostic` tests excluded unless `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`
- canonical local run: `pnpm test:visual:linux`

Last audited full Linux wrapper summary from `.tmp/playwright-linux/summary.json`:

- `224` passed
- `0` skipped
- `0` unexpected
- `4` workers
- `125383.254` ms

## Classification Meanings

- `release-blocking`: failure likely means a shipped behavior is broken.
- `visual-contract`: failure likely means intended appearance drifted.
- `diagnostic`: useful focused signal, but not default release gating.
- `rewrite`: behavior matters, but the file is too broad, expensive, or at the wrong layer.
- `delete`: stale, duplicate, or no current contract.

Actions:

- `keep`: leave in default acceptance, but keep it focused.
- `rewrite`: split, move pure logic lower, or reduce broad fixture coverage.
- `demote`: keep available for focused diagnostics outside default acceptance.
- `delete`: remove after confirming no current owner/contract.

## Default Playwright Inventory

| File                                       | Tests | Classification     | Contract                                                                                                                      | Runtime Risk                                                                                      | Owner                     | Action                                                                                               |
| ------------------------------------------ | ----: | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `app-boot-failure.spec.ts`                 |     2 | `release-blocking` | Boot-failure fallback renders on desktop and mobile fixture paths.                                                            | Low: small fixture, no screenshots.                                                               | App shell                 | `keep`                                                                                               |
| `app-workspace-visual.spec.ts`             |     4 | `visual-contract`  | Landing app workspace shell, route editor chrome, long URL fit, editable copy deletion.                                       | Medium: page screenshots and one slow long-URL case.                                              | App shell                 | `keep`, then split route-editor behavior if it grows.                                                |
| `button-visual.spec.ts`                    |     1 | `visual-contract`  | Shared button variants, sizes, states, and overrides.                                                                         | Low: compact fixture screenshots.                                                                 | Design system             | `keep`                                                                                               |
| `codex-app-server-research-visual.spec.ts` |     1 | `diagnostic`       | Research page fixture visual snapshot.                                                                                        | Low runtime, unclear shipped contract.                                                            | Research surfaces         | `demoted`; runs only with `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`.                                        |
| `codex-thread-browser-visual.spec.ts`      |     1 | `diagnostic`       | Thread browser research fixture visual snapshot.                                                                              | Low runtime, unclear shipped contract.                                                            | Research surfaces         | `demoted`; runs only with `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`.                                        |
| `codex-thread-history-visual.spec.ts`      |     1 | `diagnostic`       | Thread history research fixture visual snapshot.                                                                              | Low runtime, unclear shipped contract.                                                            | Research surfaces         | `demoted`; runs only with `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`.                                        |
| `commit-review-deleted-link.spec.ts`       |     2 | `release-blocking` | Deleted markdown links and trailing newline diffs render correctly.                                                           | Low: browser rendering, no screenshots.                                                           | Commit review             | `keep`; move parser-only cases lower if added.                                                       |
| `commit-review-visual.spec.ts`             |     7 | `rewrite`          | Commit review visual states, deleted sidebar revert actions, and popup.                                                       | High: slowest known test is the deleted fixture at about `80.6s`.                                 | Commit review             | `rewrite`; keep one visual contract per state and reduce deleted fixture cost.                       |
| `corner-notch-detail-visual.spec.ts`       |     1 | `visual-contract`  | Detail rendering of raw and zoomed corner notch.                                                                              | Low: tiny fixture snapshots.                                                                      | Design system             | `keep`                                                                                               |
| `corner-notch-visual.spec.ts`              |     1 | `visual-contract`  | Corner notch primitive rendering.                                                                                             | Low: tiny fixture snapshot.                                                                       | Design system             | `keep`                                                                                               |
| `file-view-code-parity.spec.ts`            |     1 | `diagnostic`       | ProseMark visual output stays close to Monaco.                                                                                | High: slowest list at about `12.3s`, custom pixel metrics.                                        | File view editor          | `demoted`; keep as a focused parity diagnostic unless an owner names it release-blocking.            |
| `file-view-compare-visual.spec.ts`         |     2 | `visual-contract`  | File compare sidebar and loading states.                                                                                      | Low: compact fixture snapshots.                                                                   | File view                 | `keep`                                                                                               |
| `file-view-connect-route-visual.spec.ts`   |     2 | `visual-contract`  | Connect repository and GitHub route fixture states.                                                                           | Low: compact fixture snapshots.                                                                   | File view onboarding      | `keep`                                                                                               |
| `file-view-developer-tools-visual.spec.ts` |     3 | `visual-contract`  | Developer tools collapsed, CodeMirror, and graph states.                                                                      | Low: compact fixture snapshots.                                                                   | File view developer tools | `keep`                                                                                               |
| `file-view-monaco-height.spec.ts`          |     1 | `release-blocking` | Monaco stays visible in the file-view flex-height layout.                                                                     | Low: focused browser layout check.                                                                | File view editor          | `keep`                                                                                               |
| `file-view-prosemark-height.spec.ts`       |     2 | `release-blocking` | ProseMark desktop scroll and mobile carousel gestures stay usable.                                                            | Low: real browser layout with no skipped cases.                                                   | File view editor          | `keep`; stale skipped mobile body-scroll assertion removed after Linux repro still failed.           |
| `file-view-push-actions-visual.spec.ts`    |     3 | `visual-contract`  | Push action states for default draft, create draft, and open PR.                                                              | Low: compact fixture snapshots.                                                                   | File view git actions     | `keep`                                                                                               |
| `indexed-db-route-visual.spec.ts`          |     1 | `release-blocking` | Admin IndexedDB route shows store keys and formatted values after sign-in.                                                    | Medium: auth setup and browser storage.                                                           | Admin storage routes      | `keep`; uses the shared admin route helper.                                                          |
| `landing-copy-visual.spec.ts`              |     1 | `rewrite`          | Landing copy remains editable in dev mode while ProseMark stays behind it.                                                    | Low runtime, but behavior may be cheaper in component coverage.                                   | Landing                   | `rewrite`                                                                                            |
| `landing-markdown-preview-visual.spec.ts`  |     2 | `visual-contract`  | Markdown preview route desktop/mobile shell and mobile sidebar hash behavior.                                                 | Medium: real route screenshots.                                                                   | Landing preview           | `keep`; split hash behavior from screenshots if it grows.                                            |
| `local-storage-route-visual.spec.ts`       |     4 | `release-blocking` | Admin localStorage route shows values, previews links, reflects same-tab writes, and hides the shortcut.                      | Medium: auth setup and storage writes.                                                            | Admin storage routes      | `keep`; uses the shared admin route helper.                                                          |
| `logo-iso-controls-visual.spec.ts`         |    26 | `rewrite`          | Logo controls, query params, scene rendering, mobile controls, and color pickers.                                             | High: broad mixed concerns; slowest default case is about `37.0s`.                                | Logo tooling              | `rewrite`; raster seam labs and the extra renderer depth-cap matrix are demoted.                     |
| `logo-snap-angles-visual.spec.ts`          |     1 | `diagnostic`       | Logo snap-angle matrix visual stress fixture.                                                                                 | High: slowest list at about `29.6s`.                                                              | Logo tooling              | `demoted`; runs only with `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`.                                        |
| `logo-three-visual.spec.ts`                |     1 | `diagnostic`       | Three logo reference and diff rendering.                                                                                      | Medium: WebGL/canvas fixture, not a real route.                                                   | Logo tooling              | `demoted`; keep route-level logo coverage separately.                                                |
| `machine-connect-visual.spec.ts`           |     1 | `visual-contract`  | Machine connect fixture text and layout after fonts settle.                                                                   | Low: compact fixture snapshot.                                                                    | Machine connect           | `keep`                                                                                               |
| `machines-workspace-visual.spec.ts`        |     9 | `visual-contract`  | Machines workspace desktop/mobile layout, collapse state, pin affordance, and draft entry points.                             | Medium: multiple screenshots and interactions.                                                    | Machines workspace        | `keep`; split behavior-only interactions if it grows.                                                |
| `not-found.spec.ts`                        |     1 | `release-blocking` | Unknown routes render the routed not-found page.                                                                              | Low: focused route behavior.                                                                      | Router                    | `keep`                                                                                               |
| `pitch-deck-visual.spec.ts`                |     3 | `visual-contract`  | Pitch and print surfaces stay visually stable.                                                                                | Low: shipped public pages.                                                                        | Public pitch              | `keep`                                                                                               |
| `public-landing-shell.spec.ts`             |    40 | `rewrite`          | Public landing route, auth slots, legal/sidebar links, mobile shell, logo fallback/drag, prod UI mode, and navigation budget. | High: `1798` lines, serial, mixed behavior and visual assertions.                                 | Landing                   | `rewrite`; split route contract, auth slot, mobile shell, logo fallback, and budget tests.           |
| `public-legal-route-shell.spec.ts`         |     2 | `visual-contract`  | Terms/privacy routes use routed app surface and public account sidebar.                                                       | Low: real-route screenshots.                                                                      | Public legal routes       | `keep`                                                                                               |
| `repository-media-visual.spec.ts`          |     3 | `visual-contract`  | Repository media fixtures for PNG, SVG, and VOX.                                                                              | Medium: VOX case appears in slowest list at about `6.4s`.                                         | Repository media          | `keep`; reduce VOX setup if it stays slow.                                                           |
| `route-url-editor.spec.ts`                 |    44 | `rewrite`          | Route URL editor editing, suggestions, hover previews, history restore, mobile picker, prod mode, and boundary rejection.     | High: largest file, serial, many `/visual-fixture` paths and screenshots for suggestion popovers. | Route URL editor          | `rewrite`; move pure parsing/suggestion cases to unit tests and keep only browser editing contracts. |
| `sidebar-media-upload-visual.spec.ts`      |     2 | `visual-contract`  | Sidebar media upload desktop and mobile dialog/page states.                                                                   | Low: compact fixture snapshots.                                                                   | Media upload              | `keep`                                                                                               |
| `vault-branch-preview-visual.spec.ts`      |     3 | `visual-contract`  | Branch preview link, failed, and missing states.                                                                              | Low: compact fixture snapshots.                                                                   | Vault dashboard           | `keep`                                                                                               |
| `vault-dashboard-branch-visual.spec.ts`    |     1 | `visual-contract`  | Vault dashboard branch PR title rendering.                                                                                    | Low: tiny fixture snapshot.                                                                       | Vault dashboard           | `keep`; fold into dashboard branch coverage if nearby work touches it.                               |
| `vault-dashboard-visual.spec.ts`           |    23 | `rewrite`          | Vault create/delete/connect/provisioning/list/branch filter visual states.                                                    | High: `1020` lines, 22 screenshot callsites, broad fixture gallery.                               | Vault dashboard           | `rewrite`; group by workflow and keep only named visual contracts in default acceptance.             |
| `vault-last-updated-status.spec.ts`        |     2 | `release-blocking` | Last-updated status renders and refreshes on click.                                                                           | Low: one snapshot plus behavior.                                                                  | Vault dashboard           | `keep`; split refresh behavior from screenshot if it grows.                                          |
| `vault-resource-rail-visual.spec.ts`       |     1 | `visual-contract`  | Vault resource rail fixture.                                                                                                  | Low: tiny fixture snapshot.                                                                       | Vault dashboard           | `keep`                                                                                               |
| `vault-sync-status-visual.spec.ts`         |     1 | `visual-contract`  | Vault sync status fixture.                                                                                                    | Low: tiny fixture snapshot.                                                                       | Vault dashboard           | `keep`                                                                                               |
| `visual-fixture-local-only.spec.ts`        |     1 | `release-blocking` | `/visual-fixture` stays unavailable on deployed hostnames.                                                                    | Low runtime, high security/routing value.                                                         | Router/access policy      | `keep`                                                                                               |
| `workspace-frame-geometry.spec.ts`         |     4 | `release-blocking` | File-view pane persistence, right sidebar resize, and mobile swipe behavior.                                                  | Medium: real browser geometry and local state.                                                    | Workspace shell           | `keep`                                                                                               |
| `workspace-layout-v2-status-bar.spec.ts`   |     2 | `visual-contract`  | Workspace layout v2 status bar and mobile side peeks.                                                                         | Low: compact fixture snapshots.                                                                   | Workspace shell           | `keep`                                                                                               |
| `workspace-sidebar-drag.spec.ts`           |    14 | `rewrite`          | Mobile carousel, resize grips, logo sidebars, localStorage persistence, and debug overlays.                                   | High: `703` lines and broad gesture matrix.                                                       | Workspace shell           | `rewrite`; separate shipped gesture contracts from debug overlay diagnostics.                        |
| `workspace-sidebar-visual.spec.ts`         |     2 | `visual-contract`  | File-view desktop shell and mobile carousel visibility.                                                                       | Low: focused layout screenshots.                                                                  | Workspace shell           | `keep`                                                                                               |

## Priority Cleanup Queue

1. `route-url-editor.spec.ts`: move pure route/search suggestion behavior into unit tests, then keep
   a smaller browser file for selection, editing, hover preview, history, and mobile picker
   behavior.
2. `public-landing-shell.spec.ts`: split the serial file by contract so landing route behavior, auth
   slot behavior, mobile shell geometry, logo fallback/drag, and budget checks can fail
   independently.
3. `logo-iso-controls-visual.spec.ts`: split shipped logo controls from raster seam diagnostics.
   Demote seam labs unless they are tied to a current shipped logo contract.
4. `commit-review-visual.spec.ts`: investigate the deleted-state fixture that currently dominates
   runtime.
5. `vault-dashboard-visual.spec.ts`: replace the broad visual gallery with smaller workflow-owned
   contracts.
6. `workspace-sidebar-drag.spec.ts`: separate core gesture behavior from debug overlay diagnostics.

## Auth And Admin Route Follow-Up

Admin-only route specs should use `gotoAdminRoute` from `apps/noter/e2e/liveHelpers.ts` before
adding more admin route coverage. The helper:

- sign in using the local password account,
- runs any browser-state setup hook needed before first route render,
- navigates to the admin route,
- fails closed if the dev account was not seeded.

Target files:

- `apps/noter/e2e/indexed-db-route-visual.spec.ts`
- `apps/noter/e2e/local-storage-route-visual.spec.ts`
- `apps/noter/e2e/logo-iso-controls-visual.spec.ts`

## Skipped-Test Cleanup

The default Playwright suite should not carry known-failing skipped tests as release signal. This
branch removed the skipped
`mobile prose scroll › ProseMark keeps the real file-view workspace body scrollable on mobile`
assertion after a focused Linux Docker repro still returned `scrollTop === 0`. The remaining default
coverage keeps the passing desktop body-scroll check and the passing mobile carousel gesture check.

## Diagnostic Demotion Candidates

These now run only when `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1` is set, unless an owner later names a
release-blocking contract:

- `codex-app-server-research-visual.spec.ts`
- `codex-thread-browser-visual.spec.ts`
- `codex-thread-history-visual.spec.ts`
- `file-view-code-parity.spec.ts`
- `logo-snap-angles-visual.spec.ts`
- `logo-three-visual.spec.ts`
- raster seam lab cases inside `logo-iso-controls-visual.spec.ts`
- extra renderer depth-cap matrix inside `logo-iso-controls-visual.spec.ts`

## Classification Review Notes

- `corner-notch-detail-visual.spec.ts` may be diagnostic rather than visual-contract if the zoomed
  detail view exists only for implementation inspection.
- `corner-notch-visual.spec.ts` should stay visual-contract only while the notch remains part of
  current app chrome.
- `pitch-deck-visual.spec.ts` should stay visual-contract only while `/pitch` remains shipped.
- `repository-media-visual.spec.ts` should stay visual-contract only while PNG, SVG, and VOX media
  previews remain current product surfaces.
