# 080 Workspace Layout V2 Route Migration And Framework Readiness Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/workspace shell
- Last updated: 2026-06-27
- Depends on:
  - `apps/samebase/index.html`
  - `apps/samebase/package.json`
  - `apps/samebase/vite.config.ts`
  - `apps/samebase/src/main.tsx`
  - `apps/samebase/src/bootstrap.ts`
  - `apps/samebase/src/App.tsx`
  - `apps/samebase/src/Layout.tsx`
  - `apps/samebase/src/SignInForm.tsx`
  - `apps/samebase/src/SignInForm.scrollRestore.test.tsx`
  - `apps/samebase/src/components/AppBuildStatusBar.tsx`
  - `apps/samebase/src/components/FileView.tsx`
  - `apps/samebase/src/components/LandingCopyVisualFixture.tsx`
  - `apps/samebase/src/components/RepositoryRouteConnectState.tsx`
  - `apps/samebase/src/components/vault-dashboard/VaultDashboard.tsx`
  - `apps/samebase/src/components/workspace-layout/RepositoryWorkspaceFrame.tsx`
  - `apps/samebase/src/components/workspace-layout/DashboardWorkspaceLayout.tsx`
  - `apps/samebase/src/components/workspace-layout/VaultDashboardWorkspaceScene.tsx`
  - `apps/samebase/src/components/workspace-layout/WorkspaceScene.tsx`
  - `apps/samebase/src/components/workspace-layout/WorkspaceSidebarShell.tsx`
  - `apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx`
  - `apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2PageFrame.tsx`
  - `apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame.tsx`
  - `apps/samebase/src/components/workspace-layout-v2/useWorkspaceLayoutV2DragSurface.ts`
  - `apps/samebase/src/components/useProsemarkMobilePaneDrag.ts`
  - `apps/samebase/src/lib/fastLandingBoot.ts`
  - `apps/samebase/src/lib/landingCopyShell.ts`
  - `apps/samebase/src/lib/pageMetadata.ts`
  - `apps/samebase/src/lib/publicLandingAuthState.ts`
  - `apps/samebase/src/lib/publicLandingScrollState.ts`
  - `apps/samebase/src/visualFixture.tsx`
  - `apps/samebase/e2e/public-landing-shell.spec.ts`
  - `apps/samebase/e2e/landing-copy-visual.spec.ts`
  - `specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md`
  - `specs/073_FILE_VIEW_PROSEMARK_MOBILE_PANE_DRAG_SPEC.md`
  - `specs/074_FILE_VIEW_MONACO_MOBILE_PANE_DRAG_SPEC.md`

## Summary

`AppPageFrame`, `WorkspaceLayoutV2FullPage`, and `WorkspaceLayoutV2PaneFrame` are now accepted app
and shell primitives, but the repo does not yet have an fully up-to-date accepted contract for how
real routes should migrate from the first workspace shell to the second one.

This spec defines that contract.

The correct migration seam is not a route-local rewrite. The correct migration seam is the existing
shared route layout layer:

- `RepositoryWorkspaceFrame`
- `DashboardWorkspaceLayout`
- `VaultDashboardWorkspaceScene`

Those shared wrappers should be reimplemented on top of `WorkspaceLayoutV2` while preserving each
route's current chrome, scroll ownership, focus behavior, touch behavior, and editor lifetime.

This spec also adds a framework-readiness constraint. Samebase still runs through a plain
`BrowserRouter` plus a monolithic `<Routes>` tree in `App.tsx`. Route shell work should not deepen
that coupling if the team decides to migrate to a Vite plus React Router framework architecture
next.

The strongest architectural reason to think about that framework migration now is not the `<Routes>`
tree by itself. The strongest reason is that the public landing experience still runs through a
separate bootstrap path:

- `index.html`
- `bootstrap.ts`
- handwritten DOM rendering and event binding
- delayed import of the real React app in `main.tsx`

That split-brain boot path is accepted today only as current state, not as a target architecture.

More specifically, the accepted route-level shell contract should line up with the likely future
layout-route boundaries:

- app shell root layout: `Layout.tsx`
- repository workspace layout route: `RepositoryWorkspaceFrame`
- dashboard workspace layout route: `DashboardWorkspaceLayout` and `VaultDashboardWorkspaceScene`

## Why

The current state is split in an awkward way:

1. The app-level shell already moved to `WorkspaceLayoutV2PageFrame` through `Layout.tsx`.
2. The route-level workspace shell still runs through
   `WorkspaceRouteFrame -> WorkspaceSidebarShell`.
3. `WorkspaceLayoutV2PaneFrame` exists, but it intentionally enforces a compact fixed-height header
   row.
4. `FileView` and `VaultDashboard` currently rely on taller, denser route-owned chrome that does not
   fit that compact pane-header contract.
5. Mobile editor drag in `FileView` still depends on the old shell-owned imperative bridge rather
   than the new v2 drag-surface contract.
6. The public landing surface still runs through a custom bootstrap path that renders raw HTML,
   binds DOM listeners manually, applies metadata outside the normal React tree, and only later
   imports the real app.

Without a spec, route migrations will drift toward the easiest local rewrite:

- compress route chrome just to fit `WorkspaceLayoutV2PaneFrame`
- duplicate layout logic per route
- bake migration decisions into one route and then treat that route as the template
- preserve the current `BrowserRouter`-centric route tree by accident rather than by deliberate
  choice
- preserve the current bootstrap split-brain by building around it instead of deleting it

That is the wrong direction. The route migration should preserve product behavior first, reduce
shell duplication second, and stay compatible with a future React Router framework migration the
whole time.

## Goals

1. Migrate all workspace routes onto `WorkspaceLayoutV2` without regressing current route chrome or
   interaction behavior.
2. Use shared route layout wrappers as the migration seam instead of route-local rewrites.
3. Preserve current scroll ownership, bottom-dock behavior, overlay behavior, keyboard behavior,
   focus behavior, and touch behavior during the shell swap.
4. Keep the migration compatible with a future Vite plus React Router framework migration.
5. Make the shared route wrappers suitable to become framework layout-route elements later without
   another shell rewrite.
6. Prefer architectural simplification and code deletion over carrying the bootstrap split-brain
   forward into a second implementation.
7. Remove the first shell implementation only after no runtime path depends on it.

## Non-Goals

1. Redesigning route chrome just because the outer shell changes.
2. Treating `WorkspaceLayoutV2PaneFrame` as the mandatory wrapper for every migrated pane.
3. Deleting `WorkspaceScene` in the same step as the outer shell migration.
4. Using a compact or newly rewritten route as the migration template for the rest of the app.
5. Committing the repo to a full React Router framework migration in this spec.
6. Blocking the shell contract on an immediate router rewrite before the contract is clear.
7. Preserving the fast-landing bootstrap architecture as a first-class target.

## Current State

### App shell

`Layout.tsx` already establishes the app-level v2 chrome contract:

- one `WorkspaceLayoutV2PageFrame`
- one optional `AppBuildStatusBar` in the `bottomBar` slot
- one route outlet area above it

That means the route migration problem is now route-level, not app-level.

### Router shape

The app still mounts through `BrowserRouter` in `main.tsx`, and `App.tsx` contains the live
`<Routes>` tree. That shape is valid today, but it is not a good reason to entrench route-local
shell rewrites.

If the team chooses to migrate to React Router framework mode later, the route layout components
introduced by this spec should survive that move.

The intended future mapping is:

- `Layout.tsx` becomes the root layout-route element
- repository routes render under a repository workspace layout boundary backed by
  `RepositoryWorkspaceFrame`
- dashboard routes render under a dashboard workspace layout boundary backed by
  `DashboardWorkspaceLayout` or `VaultDashboardWorkspaceScene`

The migration work in this spec should make that later route-module extraction easier, not harder.

### Bootstrap split-brain

The app currently has two frontend entry paths:

1. the real React app path: `main.tsx -> BrowserRouter -> App.tsx -> Layout.tsx -> routes`
2. the public landing bootstrap path:
   `index.html -> bootstrap.ts -> renderFastLandingShell() -> import("./main")`

The second path is the bigger architectural smell.

Today `bootstrap.ts` is responsible for work that ideally belongs to the normal route tree:

- deciding whether the landing page should bypass the app initially
- rendering public landing markup through string HTML rather than React
- binding event listeners directly against DOM nodes
- applying page metadata outside the normal React metadata path
- handing off scroll position and waitlist draft state from the fake shell to the real route

If the team adopts React Router framework mode, deleting that second path is a primary
simplification opportunity.

### Old route shell

The first shell implementation still owns the real route surfaces:

- `RepositoryWorkspaceFrame`
- `DashboardWorkspaceLayout`
- `VaultDashboardWorkspaceScene`
- `WorkspaceRouteFrame`
- `WorkspaceSidebarShell`

That old shell also still owns the mobile imperative drag bridge used by
`useProsemarkMobilePaneDrag`.

### Accepted v2 primitives

The v2 shell primitives already exist and are valid:

- `AppPageFrame` for app-level page framing
- `WorkspaceLayoutV2FullPage` for the shared route-level workspace shell
- `WorkspaceLayoutV2` for the workspace frame, including shared address chrome and pane viewport
  math
- `WorkspaceLayoutV2PaneFrame` for intentionally compact fixed-header panes
- `useWorkspaceLayoutV2DragSurface` for declarative shell drag opt-in inside child surfaces

The fixture proves those primitives work for compact panes. It does not mean that every shipped
route should be forced into the same compact chrome shape.

## Accepted Contract

### 1. One app-level page frame

`WorkspaceLayoutV2PageFrame` is the app-level shell. It should remain owned by `Layout.tsx`.

Accepted behavior:

- real routes rendered under `Layout` do not nest another `WorkspaceLayoutV2PageFrame`
- standalone visual fixtures may use `WorkspaceLayoutV2PageFrame` directly
- route migration work focuses on replacing the route-level workspace shell, not duplicating the
  page frame

### 2. Shared route wrappers are the migration seam

The migration must start by changing the implementations behind the existing shared route wrappers,
not by rewriting individual routes.

Required direction:

1. reimplement `RepositoryWorkspaceFrame` on top of `WorkspaceLayoutV2`
2. reimplement `DashboardWorkspaceLayout` on top of `WorkspaceLayoutV2`
3. let `VaultDashboardWorkspaceScene` adopt the new dashboard wrapper rather than inventing a second
   dashboard migration path
4. let `FileView`, `RepositoryRouteConnectState`, `VaultDashboard`, and the related fixtures keep
   consuming those shared wrappers

This keeps the migration consistent across runtime routes and fixtures, and it keeps the routing
layer from becoming the place where shell behavior is re-decided.

### 3. Shared address chrome is part of the workspace frame

`WorkspaceLayoutV2` is the canonical workspace frame. The left/main/right carousel or desktop flex
viewport is the pane region inside that frame, not the whole frame.

Shared address chrome such as the route URL editor belongs to `WorkspaceLayoutV2` as a first-class
region above the pane viewport. This preserves the single-layout contract while keeping global
navigation controls visible when mobile users move between side and main pane surfaces.

The layout shell owns the address region's sizing, stacking, and containment. It does not own
Samebase route intelligence. URL parsing, route readiness, access-aware path suggestions,
query-param suggestions, hash suggestions, preview/commit/restore semantics, and router integration
stay in the app-provided editor component.

Accepted address direction:

- `WorkspaceLayoutV2` exposes a named address chrome slot rather than a generic route-local top bar.
- `AppWorkspaceShell` always supplies Samebase's `RouteUrlEditorNext` to that slot for app routes
- fixture defaults may hide pane chrome and sidebars before route chrome registration, but they must
  not hide the shared address editor
- moving address chrome above the pane viewport must not create a second app shell outside
  `WorkspaceLayoutV2`
- sidebar toggles and route-owned pane header accessories remain pane chrome unless a separate
  accepted UX decision moves them into shared address chrome

### 4. Preserve route-owned pane chrome

`WorkspaceLayoutV2` owns the workspace frame and pane viewport. It does not require every pane to
use the same internal chrome.

Each `left`, `main`, and `right` prop should receive a complete route-owned pane surface that
preserves the route's current structure.

Accepted repository-route shape:

```tsx
<WorkspaceLayoutV2
  left={<RepositorySidebarPane header={leftSidebarHeader} body={leftSidebarBody} />}
  main={
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div data-testid={headerTestId}>{existingRepositoryHeader}</div>
      <WorkspaceScene {...existingSceneProps} />
    </div>
  }
  right={<RepositorySidebarPane header={rightSidebarHeader} body={rightSidebarBody} />}
/>
```

Accepted dashboard-route shape:

```tsx
<WorkspaceLayoutV2
  left={<DashboardSidebarPane header={leftSidebarHeader} body={leftSidebarBody} />}
  main={
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div data-testid="dashboard-layout-header">{existingDashboardHeader}</div>
      <WorkspaceScene {...existingSceneProps} />
    </div>
  }
  right={<DashboardSidebarPane header={rightSidebarHeader} body={rightSidebarBody} />}
/>
```

The shell swap is accepted only if the route still feels like the same route.

The same ownership rule now applies to the optional bottom panel region in
`WorkspaceLayoutV2FullPage`.

Accepted panel direction:

- the panel is the fourth shared workspace region, not route-local floating chrome
- desktop keeps that panel under the center editor column rather than stretching it under both
  sidebars
- mobile presents that same panel as a bottom sheet inside the workspace viewport
- the shared shell owns the panel open button, close affordance, and resize interaction
- callers provide panel content only; chat state, agent logic, and repository wiring stay outside
  the layout shell
- compact panel content may reuse `WorkspaceLayoutV2PaneFrame` when the panel genuinely fits the
  compact fixed-header contract

### 5. `WorkspaceLayoutV2PaneFrame` is compact-only

`WorkspaceLayoutV2PaneFrame` is a compact primitive, not the universal route adapter.

It is appropriate when the pane genuinely matches this contract:

- fixed `h-8` header row
- no taller route-owned header chrome
- one body region that should fill the remaining pane height

It is not appropriate when using it would require product compromises such as:

- removing route controls
- truncating or collapsing existing chrome purely to fit the primitive
- moving multi-row route header content into a single compact row without an accepted UX redesign

Compact panes and fixtures may keep using `WorkspaceLayoutV2PaneFrame`:

```tsx
<WorkspaceLayoutV2PaneFrame header={compactHeader}>{compactBody}</WorkspaceLayoutV2PaneFrame>
```

Real routes should use it only when the route already wants that compact shape.

### 6. `WorkspaceScene` stays in scope for the first pass

`WorkspaceScene` owns important route behavior today:

- single scroll container ownership
- optional overlay content
- bottom-dock inset handling

That behavior does not become invalid just because the outer shell changes.

Accepted first-pass direction:

- keep `WorkspaceScene` inside migrated main panes where it already owns the route body correctly
- treat outer shell migration and inner scene redesign as separate decisions
- only replace `WorkspaceScene` when there is a specific accepted contract for its responsibilities

### 7. `FileView` cannot migrate until the editor drag contract moves with it

`FileView` still depends on the old shell-owned imperative bridge through
`useProsemarkMobilePaneDrag`.

That means `FileView` is not ready for a correct v2 route migration until the editor surfaces
participate in the v2 drag model.

Required direction:

1. preserve the user-visible behavior already accepted in specs 073 and 074
2. stop depending on the first shell's imperative drag bridge
3. move the editor surfaces to the v2 drag-surface contract, or to a shared helper that is
   explicitly backed by that contract

The accepted v2 direction is declarative shell opt-in through `useWorkspaceLayoutV2DragSurface`, not
indefinite continued reliance on `useWorkspaceMobilePaneDrag`.

### 8. Empty panes must still be escapable on mobile

A migrated route may not strand the user inside an empty side pane on mobile.

Required behavior:

- if a side pane can be opened, that pane must expose a visible way back to the adjacent pane on
  mobile
- empty-pane placeholders still need usable navigation chrome
- relying on a hidden desktop-only trigger is not sufficient

This is a route-level contract, not a fixture-only concern.

### 9. Bootstrap split-brain removal is a primary simplification goal

If the team chooses to pursue React Router framework mode around this route contract work, the
landing bootstrap path should be treated as deletion candidate code, not as architecture to
preserve.

Required direction:

1. the public landing route should become a normal route or route module under the same app runtime
   as the rest of the product
2. route metadata should stop depending on bootstrap-only metadata application paths
3. the route tree should not rely on a handwritten DOM shell that later hands control to React
4. bootstrap-only parity fixtures or tests should not be preserved once the bootstrap path is gone

The route-level shell contract in this spec should make that deletion easier by keeping shared
wrappers reusable on either side of a framework migration.

### 10. Framework readiness is now a hard constraint

The repo currently uses `BrowserRouter` plus a monolithic `<Routes>` tree in `App.tsx`. That should
not shape the shell migration more than necessary.

Any layout work done under this spec must remain compatible with a future Vite plus React Router
framework migration.

Required direction:

1. keep shared route layout components pure and compositional
2. keep routing tables and route-matching concerns outside the shell primitives
3. keep data loading concerns outside the shell primitives
4. keep navigation, search-param, and route-param hooks out of shared workspace shell wrappers
5. pass route-owned content, resolved state, and event handlers into those wrappers as props
6. avoid route-local shell rewrites that would have to be discarded when routes move into framework
   route modules
7. treat `RepositoryWorkspaceFrame`, `DashboardWorkspaceLayout`, and `VaultDashboardWorkspaceScene`
   as the future layout-route seam, not as temporary SPA-only helpers

If the team later adopts React Router framework mode, the components introduced by this spec should
still be reusable as route-module layouts.

Accepted implication:

- the framework migration should be able to lift the existing shared wrappers into route modules
  with minimal API change
- the shell wrappers should not need to learn about loaders, actions, route matches, or redirects
  directly
- `App.tsx` can keep using those wrappers today, but it should not become the permanent home of
  route-shell decisions

### 11. Framework migration staging

If the team chooses to pursue Vite plus React Router framework mode soon, the accepted order is
still to stabilize the route-level shell contract first and then move route definitions.

Accepted staging:

1. finish defining the shared route wrapper contract under the current app
2. migrate those wrappers from the first shell implementation to `WorkspaceLayoutV2`
3. only then extract route modules or layout routes around the already-stable wrapper contract

This avoids stacking two moving targets at once:

- route-module extraction
- route-shell redesign

What should survive the framework migration is the shared wrapper contract, not the current
`App.tsx` organization.

### 12. Route adoption order

Accepted order:

1. migrate the shared repository wrapper implementation
2. migrate the shared dashboard wrapper implementation
3. migrate the mobile editor drag contract needed by `FileView`
4. let runtime routes and fixtures pick up the new shared wrappers
5. remove the first shell implementation only after all runtime consumers are off it

This keeps the largest migration logic in one place and avoids treating any single route as the
canonical template.

## Anti-Patterns

The following are explicitly out of contract:

1. Rewriting one route from scratch and then treating that route as the pattern for the rest of the
   app.
2. Compressing route-owned chrome to fit `WorkspaceLayoutV2PaneFrame` without an accepted route UX
   redesign.
3. Nesting `WorkspaceLayoutV2PageFrame` under `Layout`.
4. Deleting `WorkspaceScene` in the same step as the outer shell swap just because it belongs to the
   first implementation.
5. Leaving `FileView` on the first shell drag bridge while claiming the route has migrated to v2.
6. Shipping a migrated route where an open blank pane has no visible mobile exit affordance.
7. Hardening the current `BrowserRouter` plus `App.tsx` route tree by pushing shell logic down into
   route-local rewrites.
8. Teaching shared workspace wrappers about framework-only router concepts before route modules
   actually exist.
9. Rebuilding the bootstrap landing shell inside a new framework setup instead of deleting it.
10. Moving shared address chrome into an app wrapper above `WorkspaceLayoutV2`, which would make the
    pane layout canonical only by convention instead of by component structure.
11. Importing Samebase route registry, access, query-param, or suggestion logic into
    `workspace-layout-v2` to implement the address chrome slot.

## Simplification Opportunities

If the team adopts React Router framework mode as part of this broader route contract cleanup, the
following code becomes a direct deletion or reduction target.

### Direct deletions

These are tightly coupled to the current split bootstrap path:

1. `apps/samebase/src/bootstrap.ts`
2. `apps/samebase/src/lib/fastLandingBoot.ts`
3. `resolveBootstrapPageMetadata()` inside `apps/samebase/src/lib/pageMetadata.ts`
4. `shouldRenderFastLandingShell()` inside `apps/samebase/src/lib/publicLandingAuthState.ts`
5. `apps/samebase/e2e/public-landing-shell.spec.ts`

### Likely follow-on deletions

These should disappear once the landing page renders only through the real route tree and no longer
needs bootstrap parity:

1. `apps/samebase/src/lib/publicLandingScrollState.ts`
2. `apps/samebase/src/SignInForm.scrollRestore.test.tsx`
3. `apps/samebase/src/lib/landingCopyShell.ts`
4. the bootstrap parity mode inside `apps/samebase/src/components/LandingCopyVisualFixture.tsx`
5. the related parity-only modes inside `apps/samebase/src/visualFixture.tsx`
6. parity assertions in `apps/samebase/e2e/landing-copy-visual.spec.ts`

### Major reductions

These are strong simplification targets even if they are not deleted immediately:

1. `apps/samebase/src/App.tsx` should stop being the central pathname switchboard for special pages,
   auth branching, and route rendering
2. `apps/samebase/src/main.tsx` should be replaced by a much thinner framework entry client
3. `apps/samebase/index.html` should stop owning the document shell and should likely disappear in
   favor of a route-aware root entry
4. metadata resolution in `apps/samebase/src/lib/pageMetadata.ts` and
   `apps/samebase/src/lib/usePageMetadata.ts` should shrink once route modules own their metadata
   closer to the route

The route wrapper work in this spec is successful only if it moves the app toward fewer runtimes,
fewer ad hoc exceptions, and less duplicated shell code.

## Deletion Criteria

The first workspace shell implementation may be removed only when all of the following are true:

1. no runtime route depends on `WorkspaceRouteFrame`
2. no runtime route depends on `WorkspaceSidebarShell`
3. no runtime route depends on the first shell's resize handle implementation
4. no editor surface depends on the first shell's mobile drag bridge
5. repository and dashboard routes both run through v2-backed shared wrappers
6. route-level Playwright coverage confirms scroll, focus, touch, and pane escape behavior under the
   migrated shell
7. if framework mode is adopted as part of the migration, the public landing route no longer depends
   on a separate bootstrap shell path

Wrapper names such as `RepositoryWorkspaceFrame` and `DashboardWorkspaceLayout` may remain if their
implementations have moved to v2. What must be deleted is the first shell implementation, not the
route abstraction boundary itself.

## Acceptance Criteria

1. `Layout.tsx` remains the only app-level `WorkspaceLayoutV2PageFrame` owner for live routes.
2. `RepositoryWorkspaceFrame` and `DashboardWorkspaceLayout` become the shared v2 migration seam
   instead of per-route rewrites.
3. `FileView` and `VaultDashboard` preserve their current visible chrome density and control
   availability after migration.
4. `WorkspaceLayoutV2` owns the shared address chrome region above the pane viewport, while
   Samebase-specific URL editor behavior remains in the app-supplied editor content.
5. `WorkspaceLayoutV2PaneFrame` is used only where the compact fixed-header contract is actually
   intended.
6. `WorkspaceScene` remains in place for routes that still need its current scroll, dock, and
   overlay behavior.
7. `FileView` mobile editor drag remains correct under the migrated shell.
8. The resulting shared layout components remain suitable for a later React Router framework
   migration instead of tying the app more tightly to the current `BrowserRouter` route tree.
9. A later route-module extraction could adopt the shared wrappers as layout routes without
   redesigning the workspace shell again.
10. If a framework migration happens, the landing experience runs through the normal route tree
    rather than a bootstrap-only DOM shell.
