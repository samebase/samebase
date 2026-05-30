# Test Suite Inventory

## Document Control

- Status: Maintained retention inventory
- Owner: Noter testing/runtime
- Last updated: 2026-05-31
- Related plan: `rfcs/085_TEST_SUITE_STRATEGY.md`
- Related spec: `specs/108_TEST_STRATEGY_AND_ACCEPTANCE_SPEC.md`
- Related research: `research/2026-05-30-test-suite-audit.md`

## Scope

This inventory answers which Playwright tests are worth keeping in default acceptance, which are
only temporary default coverage while they are rewritten, and which are not worth default release
gating.

It tracks:

1. the default Playwright acceptance suite, and
2. diagnostic Playwright coverage intentionally excluded from that default.

Use this command to inspect the default acceptance surface:

```bash
pnpm --filter noter exec playwright test -c playwright.config.ts --list
```

Current default surface:

- `205` tests
- `35` files
- Chromium project only
- `*.live.spec.ts` excluded
- `@diagnostic` tests excluded unless `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`
- canonical local run: `pnpm test:visual:linux`

Diagnostic opt-in surface:

- `227` tests
- `43` files

Last audited full Linux wrapper summary from `.tmp/playwright-linux/summary.json`:

- `205` passed
- `0` skipped
- `0` unexpected
- `4` workers
- `109359.949` ms

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

## Retention Decision Summary

The retained default suite should protect shipped behavior that needs a browser, not every behavior
that can be reached in a browser.

| Decision                                  | Current Surface                                                                                                                                                                                                                               | Why                                                                                                                                                  | Next Action                                                                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worth keeping in default                  | `release-blocking` rows, focused `visual-contract` rows, and the browser-only groups inside broad `rewrite` files.                                                                                                                            | These prove shipped route behavior, browser storage/auth wiring, WebGL/canvas output, real scroll/touch/drag/focus behavior, or intentional visuals. | Keep, but keep each file focused enough that a failure names one product contract.                                                                         |
| Worth keeping only temporarily in default | `route-url-editor.spec.ts`, `public-landing-shell.spec.ts`, `logo-iso-controls-visual.spec.ts`, `vault-dashboard-visual.spec.ts`, and `workspace-sidebar-drag.spec.ts`.                                                                       | The behavior matters, but each file mixes multiple contracts or contains cases that cheaper unit/component tests can own.                            | Rewrite by contract; every moved behavior needs lower-layer coverage before the browser case is deleted or demoted.                                        |
| Not worth default release gating          | All `@diagnostic` tests: research fixtures, implementation-detail fixture galleries, stress matrices, raster seam labs, debug overlays, detailed dropdown screenshots, and duplicate mobile-only visual variants already covered lower.       | They are useful while debugging a narrow area but create unrelated default-suite cost and failure noise.                                             | Keep opt-in only while actively useful; delete when no owner can name a current debugging use.                                                             |
| Not worth keeping once covered lower      | Pure route parsing, suggestion filtering, query defaulting, preset data, logo math/raster geometry, component dialog state, resource-row behavior, and static copy rendering that can be proven by unit, component, or Convex contract tests. | A browser adds runtime and flake surface without increasing confidence for those contracts.                                                          | Move to unit/component/Convex tests, then delete the duplicate Playwright case.                                                                            |
| Not worth keeping at all                  | Orphan snapshots, skipped known-failing assertions, duplicate browser cases with existing lower-layer coverage, and research/demo surfaces with no current owner.                                                                             | These do not provide release signal or focused diagnostic value.                                                                                     | Delete rather than demote. This branch already removed the orphan Monaco snapshots, dead skipped tuple test, stale ProseMark skip, and several duplicates. |

## Rewrite Decisions For Broad Files

These files stay in the default suite only as transitional coverage. The long-term goal is to keep
the browser-only rows and move or remove the rest.

| File                               | Keep As Default                                                                                                                                                                                                 | Move Lower Or Demote                                                                                                                                                                                                                                                                                  | Delete When Safe                                                                                                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route-url-editor.spec.ts`         | Selection/editing across origin and route boundaries, focus behavior, hover-preview history writes, hard-refresh history restore, mobile picker geometry, and browser rejection of pasted external origins.     | Path/search suggestion filtering, numeric/color value generation, auth-flow recommendations, prod-ui/local-only filtering, and detailed dropdown screenshots. Lower coverage already exists in `RouteUrlEditor.test.tsx`, `routeUrlEditorSuggestions.test.ts`, and `routeUrlPathSuggestions.test.ts`. | Browser duplicates for suggestion data after component/helper coverage proves the same contract. The auth-flow suggestion duplicate and prod-ui path-filter case were already deleted. |
| `public-landing-shell.spec.ts`     | Real routed landing render, auth slot states, legal/sidebar rail behavior, mobile shell geometry, logo drag/fallback/WebGL behavior, production-host behavior, localStorage-denied boot, and navigation budget. | Static landing copy, dev shortcut/query behavior, route-link hover state, and other rail mechanics that component tests can own. `LandingCopy.test.tsx`, `landingCopy.test.ts`, `landingDevMode.test.ts`, and `AppSidebarMetaSection.test.tsx` now own several of these.                              | Repeated visual restatements of copy/link layout once a smaller route smoke and focused component tests cover them.                                                                    |
| `logo-iso-controls-visual.spec.ts` | Public `/logo` route smoke, Three/WebGL rendering, responsive preview behavior, URL-edited depth recovery on a real page, and shipped desktop control interactions that depend on rendered browser state.       | Raster seam labs, seam-stress presets, renderer matrices, route parsing, preset data, color math, drag math, static SVG generation, and mixed mobile boot smoke. These belong in existing logo unit tests or opt-in diagnostics.                                                                      | Any admin-only or implementation-detail browser case that only restates `logoRouteSearch.test.ts`, `logoPresets.test.ts`, `logoRasterProjection.test.ts`, or renderer unit coverage.   |
| `vault-dashboard-visual.spec.ts`   | Visual workflow states whose layout is the product: create/connect/provisioning dialogs, mobile/desktop list spacing, branch filter chrome, sticky repository header, and bottom-target scroll alignment.       | Cleanup defaults, provider row grouping/actions, resource rail behavior, and text/state combinations that component tests can own. `VaultDashboard.test.tsx` and `VaultResourceRail.test.tsx` already cover many of these.                                                                            | Gallery snapshots that only restate component-state coverage after the matching workflow keeps one visual smoke.                                                                       |
| `workspace-sidebar-drag.spec.ts`   | Real mobile carousel movement, touch/drag resize behavior, merged sidebars, logo sidebar persistence through reload, and cross-pane handoff behavior.                                                           | Pure min/max size clamps, debug overlays, and any resize math that can be covered in `WorkspaceLayoutV2.mobile.test.tsx` or `workspacePaneSizes.test.ts`.                                                                                                                                             | Browser resize cases that no longer exercise real pointer/touch/scroll behavior. The mobile minimum clamp duplicate was already deleted.                                               |

## Specific Retention Decisions

The table below is the current answer to "which tests are worth keeping?" for the highest-cost
areas. Line numbers are intentionally omitted here because this document owns stable decisions; use
the test names in the table to locate the current implementation.

| Area                      | Keep In Default                                                                                                                                                                                                                                     | Move Lower                                                                                                                                                                                                                                                                                                                                                    | Demote To Diagnostic                                                                                                                               | Delete Candidate                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Route URL editor          | Browser integration smoke, hard-refresh history restore, one hover/arrow history preview path, boundary selection behavior that crosses origin/route text, mobile picker/touch, and iOS 16px focus-zoom guard.                                      | Suggestion enumeration, section switching, value examples, follow-up params, prod-ui/local-only filtering, and most boundary normalization. Lower coverage exists in `RouteUrlEditor.test.tsx`, `routeUrlEditorSuggestions.test.ts`, `routeUrlPathSuggestions.test.ts`, and `routeUrlEditor.test.ts`.                                                         | Detailed dropdown screenshots, numeric/color sample visual proofs, and mobile last-option geometry details.                                        | Duplicate suggestion-data browser cases after lower-layer coverage proves the same contract.                                      |
| Public landing            | Direct routed landing smoke, legal/status sidebar rail, desktop/mobile shell geometry, localStorage-denied boot, one auth-slot route smoke, logo WebGL/drag/fallback, production-host route smoke, and navigation budget while it is a product SLO. | Sign-in state variants, closed signup state, prod-ui password-auth hiding, dev-mode query behavior, static landing copy, and sidebar rail hover mechanics. Existing lower coverage includes `PublicLandingAccountSection.test.tsx`, `publicLandingAuthState.test.ts`, `LandingCopy.test.tsx`, `landingDevMode.test.ts`, and `AppSidebarMetaSection.test.tsx`. | Frame-by-frame layout probes, no-bundled-font diagnostics, pixel/detail separator checks, and any performance probe not accepted as a release SLO. | Pure styling assertions such as pointer cursor, omitted divider class, or footer underline unless a named design contract exists. |
| Logo tooling              | Public `/logo` smoke, Three/WebGL rendering, responsive preview behavior, URL-edited depth recovery on a real route, and shipped control interactions that need rendered browser state.                                                             | Route parsing, preset data, depth caps by renderer, raster projection math, color conversion, static SVG generation, and drag math. Existing lower coverage includes `logoRouteSearch.test.ts`, `logoPresets.test.ts`, `logoRasterProjection.test.ts`, `logoTailwindColors.test.ts`, `logoStaticSvgAsset.test.ts`, and `logoViewDrag.test.ts`.                | Raster seam labs, face-on seam screenshots, snap-angle matrices, all-renderer stress matrices, and mixed mobile boot smoke.                        | Admin-only or implementation-detail browser cases that only restate the lower logo tests.                                         |
| Repository media          | PNG/SVG/VOX browser rendering and screenshot output while those previews are shipped.                                                                                                                                                               | File-path/media classification. Existing lower coverage in `repositoryMedia.test.ts` does not prove image decode, SVG rendering, VOX canvas readiness, or visual layout.                                                                                                                                                                                      | None currently.                                                                                                                                    | None currently.                                                                                                                   |
| Workspace shell           | `workspace-frame-geometry.spec.ts`, focused `workspace-sidebar-visual.spec.ts`, and browser cases for carousel movement, touch/drag resize, merged sidebars, reload persistence, and cross-pane handoff.                                            | Size clamps, resize math, and persistence serialization. Existing lower coverage includes `WorkspaceLayoutV2.mobile.test.tsx`, `workspacePaneSizes.test.ts`, `useLocalStorageWorkspaceSidebarState.test.tsx`, and `usePersistedWorkspaceSidebarState.test.tsx`.                                                                                               | Gesture debug overlay checks.                                                                                                                      | Browser resize cases that stop exercising real pointer/touch/scroll behavior.                                                     |
| Admin storage             | IndexedDB/localStorage route specs stay default because they combine auth, route access, real browser storage APIs, and sidebar integration.                                                                                                        | Page markup for formatted entries, empty/unavailable states, and storage sidebar link state after component coverage exists.                                                                                                                                                                                                                                  | None currently.                                                                                                                                    | None until component rendering and sidebar-link coverage exists.                                                                  |
| Vault dashboard           | Browser layout contracts: mobile Cloudflare select, mobile/desktop list spacing, bottom-target scroll, sticky repository header, branch filters popover/sheet, mobile branch alignment, and at most one smoke per major dialog workflow.            | Dialog content, provider row state, URLs, labels, disabled states, cleanup defaults, and resource rail behavior. Existing lower coverage includes `VaultDashboard.test.tsx`, `VaultResourceRail.test.tsx`, and Convex vault contract tests.                                                                                                                   | Mobile delete-dialog screenshot and resource rail gallery.                                                                                         | Branch PR labels snapshot and broad gallery snapshots after lower coverage and one nearby visual smoke remain.                    |
| Convex/unit/package lanes | Keep in `pnpm test:acceptance`; these are the right layer for persistence, auth/user isolation, provider setup, cleanup, destructive workflows, pure helpers, scripts, and package utilities.                                                       | Do not move these upward into Playwright.                                                                                                                                                                                                                                                                                                                     | Not applicable.                                                                                                                                    | Only delete dead/skipped/deprecated behavior or tests with no source-of-truth contract.                                           |

## Prerequisites Before More Pruning

Do not delete the related browser coverage until these lower-layer gaps exist:

- Add component tests for `LocalStorageWorkspacePage` and `IndexedDbWorkspacePage` rendering
  formatted entries plus empty/unavailable states.
- Add component tests for the storage sidebar link set and active route state before pruning the
  localStorage hover-preview browser case.
- Add component tests for `VaultBranchFiltersControl`: reset, label search, label/no-label toggles,
  draft toggle, and `onChange` payloads.
- Add Convex coverage for `getUserVaultBranchFilters` and `setVaultBranchFilters` before trimming
  branch-filter persistence/browser coverage.
- Keep one route-level landing auth smoke until lower auth-state tests and route shell behavior are
  both trusted enough to remove duplicate browser variants.
- Keep one route-level route URL editor boundary-selection smoke until component tests cover the
  same native selection edge cases across origin and path text.

## Default Keep Groups

These groups are worth keeping in default acceptance because the browser itself is part of the
contract:

- app boot, not-found routing, visual-fixture access control, and workspace shell boot behavior,
- admin storage routes, because they combine authentication, browser storage APIs, and route access,
- file editor height, scroll, touch, Monaco, and ProseMark behavior,
- workspace mobile carousel, touch, drag, pane persistence, and localStorage behavior,
- public landing, legal, pitch, machine, media, vault, and commit-review visual contracts that are
  current shipped surfaces,
- logo route WebGL/canvas rendering, browser-sized responsiveness, and controls that affect the
  rendered scene,
- browser navigation, focus, selection, history, hover preview, and mobile picker behavior in the
  route URL editor.

## Current Delete Or Demote Decisions

These are not worth keeping in default acceptance:

- research-only fixture snapshots,
- raw implementation-detail snapshots such as `corner-notch-detail-visual.spec.ts`,
- parity/stress diagnostics such as ProseMark-vs-Monaco pixel parity and logo snap-angle matrices,
- raster seam labs and seam-stress preset browser screenshots,
- route URL editor dropdown screenshots whose data contracts are already covered lower,
- vault resource rail gallery coverage whose row/action behavior is covered by component tests,
- workspace gesture debug overlay checks,
- skipped known-failing assertions and orphan snapshot directories.

## Default Playwright Inventory

| File                                       | Tests | Classification     | Contract                                                                                                                      | Runtime Risk                                                                                     | Owner                     | Action                                                                                     |
| ------------------------------------------ | ----: | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------ |
| `app-boot-failure.spec.ts`                 |     2 | `release-blocking` | Boot-failure fallback renders on desktop and mobile fixture paths.                                                            | Low: small fixture, no screenshots.                                                              | App shell                 | `keep`                                                                                     |
| `app-workspace-visual.spec.ts`             |     4 | `visual-contract`  | Landing app workspace shell, route editor chrome, long URL fit, editable copy deletion.                                       | Medium: page screenshots and one slow long-URL case.                                             | App shell                 | `keep`, then split route-editor behavior if it grows.                                      |
| `button-visual.spec.ts`                    |     1 | `visual-contract`  | Shared button variants, sizes, states, and overrides.                                                                         | Low: compact fixture screenshots.                                                                | Design system             | `keep`                                                                                     |
| `codex-app-server-research-visual.spec.ts` |     1 | `diagnostic`       | Research page fixture visual snapshot.                                                                                        | Low runtime, unclear shipped contract.                                                           | Research surfaces         | `demoted`; runs only with `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`.                              |
| `codex-thread-browser-visual.spec.ts`      |     1 | `diagnostic`       | Thread browser research fixture visual snapshot.                                                                              | Low runtime, unclear shipped contract.                                                           | Research surfaces         | `demoted`; runs only with `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`.                              |
| `codex-thread-history-visual.spec.ts`      |     1 | `diagnostic`       | Thread history research fixture visual snapshot.                                                                              | Low runtime, unclear shipped contract.                                                           | Research surfaces         | `demoted`; runs only with `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`.                              |
| `commit-review-deleted-link.spec.ts`       |     2 | `release-blocking` | Deleted markdown links and trailing newline diffs render correctly.                                                           | Low: browser rendering, no screenshots.                                                          | Commit review             | `keep`; move parser-only cases lower if added.                                             |
| `commit-review-visual.spec.ts`             |     7 | `visual-contract`  | Commit review visual states, deleted sidebar revert actions, and popup.                                                       | Low: focused Linux rerun passed in `6.9s`; earlier `80.6s` evidence is stale.                    | Commit review             | `keep`; revisit only if it regresses in a full-suite slowest list.                         |
| `corner-notch-detail-visual.spec.ts`       |     1 | `diagnostic`       | Raw and zoomed corner notch implementation detail fixture.                                                                    | Low: tiny fixture snapshots; not a shipped route.                                                | Design system             | `demoted`; runs only with `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`.                              |
| `corner-notch-visual.spec.ts`              |     1 | `visual-contract`  | Corner notch primitive rendering.                                                                                             | Low: tiny fixture snapshot.                                                                      | Design system             | `keep`                                                                                     |
| `file-view-code-parity.spec.ts`            |     1 | `diagnostic`       | ProseMark visual output stays close to Monaco.                                                                                | High: slowest list at about `12.3s`, custom pixel metrics.                                       | File view editor          | `demoted`; keep as a focused parity diagnostic unless an owner names it release-blocking.  |
| `file-view-compare-visual.spec.ts`         |     2 | `visual-contract`  | File compare sidebar and loading states.                                                                                      | Low: compact fixture snapshots.                                                                  | File view                 | `keep`                                                                                     |
| `file-view-connect-route-visual.spec.ts`   |     2 | `visual-contract`  | Connect repository and GitHub route fixture states.                                                                           | Low: compact fixture snapshots.                                                                  | File view onboarding      | `keep`                                                                                     |
| `file-view-developer-tools-visual.spec.ts` |     3 | `visual-contract`  | Developer tools collapsed, CodeMirror, and graph states.                                                                      | Low: compact fixture snapshots.                                                                  | File view developer tools | `keep`                                                                                     |
| `file-view-monaco-height.spec.ts`          |     1 | `release-blocking` | Monaco stays visible in the file-view flex-height layout.                                                                     | Low: focused browser layout check.                                                               | File view editor          | `keep`                                                                                     |
| `file-view-prosemark-height.spec.ts`       |     2 | `release-blocking` | ProseMark desktop scroll and mobile carousel gestures stay usable.                                                            | Low: real browser layout with no skipped cases.                                                  | File view editor          | `keep`; stale skipped mobile body-scroll assertion removed after Linux repro still failed. |
| `file-view-push-actions-visual.spec.ts`    |     3 | `visual-contract`  | Push action states for default draft, create draft, and open PR.                                                              | Low: compact fixture snapshots.                                                                  | File view git actions     | `keep`                                                                                     |
| `indexed-db-route-visual.spec.ts`          |     1 | `release-blocking` | Admin IndexedDB route shows store keys and formatted values after sign-in.                                                    | Medium: auth setup and browser storage.                                                          | Admin storage routes      | `keep`; uses the shared admin route helper.                                                |
| `landing-markdown-preview-visual.spec.ts`  |     2 | `visual-contract`  | Markdown preview route desktop/mobile shell and mobile sidebar hash behavior.                                                 | Medium: real route screenshots.                                                                  | Landing preview           | `keep`; split hash behavior from screenshots if it grows.                                  |
| `local-storage-route-visual.spec.ts`       |     4 | `release-blocking` | Admin localStorage route shows values, previews links, reflects same-tab writes, and hides the shortcut.                      | Medium: auth setup and storage writes.                                                           | Admin storage routes      | `keep`; uses the shared admin route helper.                                                |
| `logo-iso-controls-visual.spec.ts`         |    22 | `rewrite`          | Logo controls, query params, scene rendering, mobile controls, and color pickers.                                             | High: broad mixed concerns; slowest default case is about `24.0s`.                               | Logo tooling              | `rewrite`; seam, raster geometry, and mixed mobile boot diagnostics demoted.               |
| `logo-snap-angles-visual.spec.ts`          |     1 | `diagnostic`       | Logo snap-angle matrix visual stress fixture.                                                                                 | High: slowest list at about `29.6s`.                                                             | Logo tooling              | `demoted`; runs only with `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`.                              |
| `logo-three-visual.spec.ts`                |     1 | `diagnostic`       | Three logo reference and diff rendering.                                                                                      | Medium: WebGL/canvas fixture, not a real route.                                                  | Logo tooling              | `demoted`; keep route-level logo coverage separately.                                      |
| `machine-connect-visual.spec.ts`           |     1 | `visual-contract`  | Machine connect fixture text and layout after fonts settle.                                                                   | Low: compact fixture snapshot.                                                                   | Machine connect           | `keep`                                                                                     |
| `machines-workspace-visual.spec.ts`        |     9 | `visual-contract`  | Machines workspace desktop/mobile layout, collapse state, pin affordance, and draft entry points.                             | Medium: multiple screenshots and interactions.                                                   | Machines workspace        | `keep`; split behavior-only interactions if it grows.                                      |
| `not-found.spec.ts`                        |     1 | `release-blocking` | Unknown routes render the routed not-found page.                                                                              | Low: focused route behavior.                                                                     | Router                    | `keep`                                                                                     |
| `pitch-deck-visual.spec.ts`                |     3 | `visual-contract`  | Pitch and print surfaces stay visually stable.                                                                                | Low: shipped public pages.                                                                       | Public pitch              | `keep`                                                                                     |
| `public-landing-shell.spec.ts`             |    37 | `rewrite`          | Public landing route, auth slots, legal/sidebar links, mobile shell, logo fallback/drag, prod UI mode, and navigation budget. | High: `1755` lines, serial, mixed behavior and visual assertions.                                | Landing                   | `rewrite`; prod-ui shortcut/dev-toggle query behavior moved to component coverage.         |
| `public-legal-route-shell.spec.ts`         |     2 | `visual-contract`  | Terms/privacy routes use routed app surface and public account sidebar.                                                       | Low: real-route screenshots.                                                                     | Public legal routes       | `keep`                                                                                     |
| `repository-media-visual.spec.ts`          |     3 | `visual-contract`  | Repository media fixtures for PNG, SVG, and VOX.                                                                              | Medium: VOX case appears in slowest list at about `4.2s`.                                        | Repository media          | `keep`; reduce VOX setup if it stays slow.                                                 |
| `route-url-editor.spec.ts`                 |    39 | `rewrite`          | Route URL editor editing, suggestions, hover previews, history restore, mobile picker, and boundary rejection.                | High: largest file, serial, many `/visual-fixture` paths; focused Linux rerun passed in `24.4s`. | Route URL editor          | `rewrite`; suggestion duplicates, prod UI filtering, and screenshots moved lower/demoted.  |
| `sidebar-media-upload-visual.spec.ts`      |     2 | `visual-contract`  | Sidebar media upload desktop and mobile dialog/page states.                                                                   | Low: compact fixture snapshots.                                                                  | Media upload              | `keep`                                                                                     |
| `vault-branch-preview-visual.spec.ts`      |     3 | `visual-contract`  | Branch preview link, failed, and missing states.                                                                              | Low: compact fixture snapshots.                                                                  | Vault dashboard           | `keep`                                                                                     |
| `vault-dashboard-branch-visual.spec.ts`    |     1 | `visual-contract`  | Vault dashboard branch PR title rendering.                                                                                    | Low: tiny fixture snapshot.                                                                      | Vault dashboard           | `keep`; fold into dashboard branch coverage if nearby work touches it.                     |
| `vault-dashboard-visual.spec.ts`           |    22 | `rewrite`          | Vault create/delete/connect/provisioning/list/branch filter visual states.                                                    | High: `1020` lines, broad fixture gallery; focused Linux rerun passed in `9.1s`.                 | Vault dashboard           | `rewrite`; mobile delete dialog is diagnostic after lower-layer cleanup default coverage.  |
| `vault-last-updated-status.spec.ts`        |     2 | `release-blocking` | Last-updated status renders and refreshes on click.                                                                           | Low: one snapshot plus behavior.                                                                 | Vault dashboard           | `keep`; split refresh behavior from screenshot if it grows.                                |
| `vault-resource-rail-visual.spec.ts`       |     1 | `diagnostic`       | Vault resource rail fixture gallery.                                                                                          | Low: tiny fixture snapshot; lower-layer component/dashboard coverage owns behavior.              | Vault dashboard           | `demoted`; runs only with `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`.                              |
| `vault-sync-status-visual.spec.ts`         |     1 | `visual-contract`  | Vault sync status fixture.                                                                                                    | Low: tiny fixture snapshot.                                                                      | Vault dashboard           | `keep`                                                                                     |
| `visual-fixture-local-only.spec.ts`        |     1 | `release-blocking` | `/visual-fixture` stays unavailable on deployed hostnames.                                                                    | Low runtime, high security/routing value.                                                        | Router/access policy      | `keep`                                                                                     |
| `workspace-frame-geometry.spec.ts`         |     4 | `release-blocking` | File-view pane persistence, right sidebar resize, and mobile swipe behavior.                                                  | Medium: real browser geometry and local state.                                                   | Workspace shell           | `keep`                                                                                     |
| `workspace-layout-v2-status-bar.spec.ts`   |     2 | `visual-contract`  | Workspace layout v2 status bar and mobile side peeks.                                                                         | Low: compact fixture snapshots.                                                                  | Workspace shell           | `keep`                                                                                     |
| `workspace-sidebar-drag.spec.ts`           |    11 | `rewrite`          | Mobile carousel, resize grips, logo sidebars, and localStorage persistence.                                                   | High: `664` lines and broad gesture matrix.                                                      | Workspace shell           | `rewrite`; debug overlay checks are diagnostic; mobile minimum clamp moved lower.          |
| `workspace-sidebar-visual.spec.ts`         |     2 | `visual-contract`  | File-view desktop shell and mobile carousel visibility.                                                                       | Low: focused layout screenshots.                                                                 | Workspace shell           | `keep`                                                                                     |

## Priority Cleanup Queue

1. `route-url-editor.spec.ts`: continue moving pure route/search suggestion behavior into unit
   tests, then keep a smaller browser file for selection, editing, hover preview, history, and
   mobile picker behavior. This branch moved the manually typed value-suggestion case to component
   coverage, deleted the auth-flow suggestion duplicate after confirming lower-layer coverage, moved
   prod UI local-route filtering to component coverage, and demoted two detailed dropdown screenshot
   checks.
2. `public-landing-shell.spec.ts`: split the serial file by contract so landing route behavior, auth
   slot behavior, mobile shell geometry, logo fallback/drag, and budget checks can fail
   independently. This branch moved prod-ui shortcut/dev-toggle query behavior to component
   coverage, and moved the separate landing copy static/editable rendering check into
   `LandingCopy.test.tsx`.
3. `logo-iso-controls-visual.spec.ts`: split shipped logo controls from raster seam diagnostics.
   Seam labs, seam-stress preset checks, and the raster distance/depth geometry screenshot are
   diagnostic unless an owner names a current shipped logo contract. Preset data and route URL
   editor values stay covered lower in `logoPresets.test.ts` and
   `routeUrlEditorSuggestions.test.ts`. The mixed mobile boot smoke is diagnostic because workspace
   mobile boot, iso route search, and desktop iso controls have more focused coverage.
4. `vault-dashboard-visual.spec.ts`: replace the broad visual gallery with smaller workflow-owned
   contracts. This branch moved delete-dialog cleanup default-state coverage into
   `VaultDashboard.test.tsx` and demoted the duplicate mobile delete-dialog screenshot.
5. `workspace-sidebar-drag.spec.ts`: continue separating core gesture behavior from diagnostics; the
   debug overlay checks now run only with `PLAYWRIGHT_INCLUDE_DIAGNOSTICS=1`, and the duplicate
   mobile sidebar minimum clamp browser case moved to `WorkspaceLayoutV2.mobile.test.tsx`.

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
- `corner-notch-detail-visual.spec.ts`
- `file-view-code-parity.spec.ts`
- `logo-snap-angles-visual.spec.ts`
- `logo-three-visual.spec.ts`
- raster seam lab cases, seam-stress preset checks, and the face-on seam screenshot inside
  `logo-iso-controls-visual.spec.ts`
- raster distance/depth geometry screenshot inside `logo-iso-controls-visual.spec.ts`
- mixed logo iso mobile boot smoke inside `logo-iso-controls-visual.spec.ts`
- extra renderer depth-cap matrix inside `logo-iso-controls-visual.spec.ts`
- detailed route URL editor dropdown screenshots inside `route-url-editor.spec.ts`
- mobile delete dialog screenshot inside `vault-dashboard-visual.spec.ts`
- `vault-resource-rail-visual.spec.ts`
- workspace gesture debug overlay checks inside `workspace-sidebar-drag.spec.ts`

## Classification Review Notes

- `corner-notch-visual.spec.ts` should stay visual-contract only while the notch remains part of
  current app chrome.
- `pitch-deck-visual.spec.ts` should stay visual-contract only while `/pitch` remains shipped.
- `repository-media-visual.spec.ts` should stay visual-contract only while PNG, SVG, and VOX media
  previews remain current product surfaces.
