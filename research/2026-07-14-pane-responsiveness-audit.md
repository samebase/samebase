# Pane Responsiveness Audit

## Document Control

- Status: Completed audit; conversions landed
- Date: 2026-07-14
- Context: `WorkspaceLayoutV2PaneFrame` now declares the anonymous CSS container on its content
  scroller, and `docs/code-guardrails.md` plus `AGENTS.md` record the standard: workspace pane
  content uses container variants (`@2xl:`, `@3xl:`, `cqw`) against the pane, never viewport
  `sm:`/`md:`/`vw`. This audit classifies every existing viewport-relative usage in
  `apps/samebase/src` before the conversions landed.

## Architecture Fact

`AppRootClient.tsx` wraps every route in `AppWorkspaceShell`, whose content always renders inside
`WorkspaceLayoutV2PaneFrame`. There are no standalone routes: all page content is pane content, so
the standard applies app-wide. The landing overview is the first converted consumer.

## Conversion Outcome (landed the same day)

The convert list below shipped in one sweep with three decisions worth keeping:

1. Touch proxies became pointer variants, not width variants. `FileTree` row density,
   `FileViewSidebar` button sizes, the FileView header text size, the dashboard sidebar row icons,
   and `MonacoEditorSurface` chrome (scrollbars, folding, ruler, line numbers) all used `md:` or
   `useIsMobile` to mean "not a touch device". Converting those to container variants would have
   inverted desktop rendering in narrow panes (a 240px file tree or 288px sidebar is always below
   `@3xl`), so they use `pointer-fine:` classes and the renamed `useCoarsePointer` hook instead,
   which preserves current phone and desktop rendering exactly.
2. Heights stay viewport-relative. Container length units for the block axis (`cqh`) do not resolve
   against an inline-size container, so `100vh`/`60vh`/`svh`/`dvh` usages keep their viewport units
   (`CodexThreadBrowserView` scroll cap, `AgentsConnectRoutePage` centering, `LogoPreviewPage`
   panel, markdown media cap, walkthrough hero).
3. Pitch deck: only the interactive mode converted (including `7vw` to `7cqw` on the title). The
   print and printMobile surfaces render at fixed page dimensions, and the shared `MetricBlock`
   keeps its viewport variant because print output must not change.

## Converted surfaces (original audit findings)

1. `components/FileView/FileView.tsx`: `md:grid-cols-2 md:divide-x` diff split renders side-by-side
   in a narrow main pane between two open sidebars; also `md:text-sm`.
2. `components/FileView/FileViewSidebar.tsx` and `components/FileTree.tsx`: left-pane control and
   row density keyed on `md:`, which is always true on desktop regardless of the ~240px pane.
   Caution: `md:` there is also a touch-target proxy; converting changes mobile ergonomics and needs
   explicit touch-size decisions.
3. `components/MonacoEditorSurface.tsx`: `useIsMobile` gates line numbers, folding, and scrollbars
   by viewport; a narrow desktop pane gets cramped editor chrome. Needs the ResizeObserver-vs-pane
   pattern (see `useCanLoadZoneMarkScene` in `LandingPreviewPage.tsx`), threading a pane ref, and
   care for focus/scroll/touch behavior.
4. `components/PitchDeckPage.tsx` (interactive branches only): `text-[clamp(3.3rem,7vw,5.5rem)]`
   title repeats the landing bug; grids reflow on `sm:`/`md:`. The print and printMobile branches
   intentionally lock dimensions for PDF output and must stay viewport/fixed.
5. `components/ConnectRepository.tsx`, `components/MachineConnectPage.tsx`: user-facing onboarding
   headers reflow at `sm:`/`md:`.
6. Heading-scale cluster (`sm:text-2xl` and similar, low risk): `UserSettingsPage`,
   `ProviderConnectionsPage`, `NewAppPage`, `AccountDeletionPage`, `AccountDeletionBrowserBoundary`,
   `AdminAccountDeletionsPage`.
7. `components/MarkdownLandingDocument.tsx` line ~530: `sm:px-6 lg:py-14` converts together with the
   `lg:pb-[calc(100svh-4rem)]` scroll-end compensation on `DOCS_DOCUMENT_CLASS_NAME` in
   `LandingPreviewPage.tsx`; the `svh` value itself stays viewport-based.
8. Internal surfaces, low priority: `codex/CodexAppServerResearchPage.tsx`,
   `codex/CodexThreadBrowserView.tsx` (also `100vh` scroll area), logo lab pages
   (`LogoRasterSeamLabPage`, `LogoStaticSvgPage`, `LogoSingleCubeStudyPage`,
   `LogoTransitionLabPage`, `LogoTransitionTransformsLabPage`, `LogoPreviewPage` floating panel),
   `AgentsConnectRoutePage.tsx` (`min-h-[60vh]`), `vault-dashboard/VaultDashboardChrome.tsx`,
   `editorChatLayout.ts` (`sm:px-8`), `routes/walkthrough-cloudflare-worker-builds.tsx` (embedded
   media-query CSS).

## Keep Viewport-Relative (correct as-is)

- Workspace layout chrome mobile/desktop switching: `WorkspaceLayoutV2Viewports.tsx`,
  `WorkspacePaneRuntime.tsx`, pane-frame/full-page desktop-only header toggles, and
  `WorkspaceLayoutV2Prehydration.ts` (prehydration parity).
- Portaled overlays sized to the window: `AppDialogContent.tsx`, `GetStartedDialog.tsx`,
  `CommandPalette.tsx`, `VaultBranchFilters.tsx` sheet, creation/upload dialogs picking
  dialog-vs-sheet via `useIsMobile`.
- True viewport units: `svh` scroll-end space on docs documents, `72svh` markdown media cap,
  `RouteUrlEditorNext.tsx` address-bar chrome.
- Non-width media queries: `PublicLandingLogo.tsx` `prefers-reduced-motion`.
- Infra hooks: `hooks/use-mobile.tsx`, `useCoarsePointer.ts`, theme/head helpers.
- `AppBootFailureState.tsx`: renders when the shell itself fails to boot; no pane exists.
- `components/ui/*`: shadcn-generated, read-only by repo rule.
- Visual fixtures (`*VisualFixture.tsx`, `/visual-fixture` harness): pinned baselines, dev-only.

## workspace-layout-v3

Dormant experiment: one commit (`08b878e8`, verbatim copy plus rename, #1151), referenced only by
dev fixtures, no live route. It predates the container hoist, so `WorkspaceLayoutV3PaneFrame.tsx`
does not declare `@container`. If v3 is revived, the identical hoist plus pane-content conversion is
a revival prerequisite.
