# 080 Shared Workspace Layout Refactor Plan

> Archived 2026-07-26: current workspace layout contracts supersede this plan, and its bottom chat
> dock no longer exists.

## Document Control

- Status: Proposed
- Owner: Noter frontend
- Last updated: 2026-03-31
- Depends on:
  - `apps/noter/src/components/WorkspaceSidebarShell.tsx`
  - `apps/noter/src/components/RepositoryWorkspaceFrame.tsx`
  - `apps/noter/src/components/DashboardWorkspaceLayout.tsx`
  - `apps/noter/src/components/VaultDashboardWorkspaceScene.tsx`
  - `apps/noter/src/components/sidebar.tsx`
  - `apps/noter/src/hooks/use-sidebar.ts`
  - `apps/noter/src/components/workspaceMobilePaneDrag.tsx`
  - `apps/noter/src/components/workspaceMobilePaneDragContext.ts`
  - `apps/noter/src/components/useWorkspaceMobilePaneDrag.ts`
  - `apps/noter/src/components/useProsemarkMobilePaneDrag.ts`
  - `apps/noter/src/components/EditorChatDock.tsx`
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
  - `apps/noter/src/lib/workspaceSidebar.ts`
  - `apps/noter/src/lib/fileViewSidebarLayout.ts`
  - `rfcs/067_DASHBOARD_SHARED_SIDEBAR_SPEC.md`
  - `specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md`
  - `specs/073_FILE_VIEW_PROSEMARK_MOBILE_PANE_DRAG_SPEC.md`
  - `specs/074_FILE_VIEW_MONACO_MOBILE_PANE_DRAG_SPEC.md`

## Summary

Dashboard and FileView already rely on the same underlying workspace shell:

- three desktop columns with left sidebar, main pane, and right sidebar
- one mobile carousel with `left`, `main`, and `right` snap points
- a docked bottom panel that lives inside the main pane and changes mobile scroll padding when open

What is not standardized yet is the route-level composition around that shell. Today the behavior is
split across:

- `WorkspaceSidebarShell`
- `RepositoryWorkspaceFrame`
- `DashboardWorkspaceLayout`
- `VaultDashboardWorkspaceScene`
- duplicated route-local `mobileEditorChatDockInset` wiring in `FileView` and `VaultDashboard`

This plan turns that layout into one owned `workspace-layout` surface so a new route can opt into
the full shell, sidebars, and mobile drag behavior without copying the current dashboard/file-view
assembly.

## Goals

1. Give the shared workspace shell one clear home in its own folder.
2. Standardize the route API for sidebars, header, main scroll body, and bottom dock/overlay
   content.
3. Preserve the current mobile drag contract, including editor-surface handoff from ProseMark and
   Monaco into the shell.
4. Preserve current geometry, test ids, and screenshot baselines while the code is being
   reorganized.
5. Make it straightforward for a third route to reuse the same layout without needing
   FileView-specific or Dashboard-specific wrappers.

## Non-Goals

1. Redesigning the dashboard or file-view UX.
2. Changing mobile pane semantics or snap behavior.
3. Reworking chat product behavior beyond extracting shared layout plumbing.
4. Changing right-sidebar product ownership or FileView tree placement.
5. Removing route-specific wrappers in the same patch if they still help keep the migration
   low-risk.

## Dependency Inventory

### Core shell and state

- `WorkspaceSidebarShell.tsx` owns the shared DOM structure, desktop grid, mobile carousel, width
  measurement, native scroll settling, and gesture debug overlay.
- `sidebar.tsx` owns `SidebarProvider` and `SidebarTrigger`, including desktop open state, mobile
  pane state, keyboard shortcut routing, and the current cookie write behavior.
- `use-sidebar.ts` defines the shared shell state contract consumed by the shell and trigger
  components.
- `workspaceSidebar.ts` owns mobile pane anchor math and settle logic.
- `workspaceMobilePaneDrag.tsx`, `workspaceMobilePaneDragContext.ts`, and
  `useWorkspaceMobilePaneDrag.ts` expose the imperative bridge that lets editor surfaces drag the
  mobile shell.

### Editor-surface drag dependents

- `useProsemarkMobilePaneDrag.ts` is the shared editor-side gesture classifier.
- `CodeEditor.tsx`, `MonacoEditorSurface.tsx`, `ProsemarkMergeEditor.tsx`, and
  `ProsemarkReadOnly.tsx` depend on that drag bridge staying stable.
- `useProsemarkMobilePaneDrag.test.tsx` covers the helper directly.
- `file-view-prosemark-drag.spec.ts` and `file-view-monaco-drag.spec.ts` cover real mobile drag
  handoff through shipped editor surfaces.

### Route-level wrappers

- `RepositoryWorkspaceFrame.tsx` is the FileView-oriented wrapper around the shell. It owns the
  repository-style header layout, quick-open button, and sidebar trigger placement.
- `DashboardWorkspaceLayout.tsx` is the dashboard-oriented wrapper around the same shell. It mostly
  forwards slots and test ids.
- `VaultDashboardWorkspaceScene.tsx` adds the dashboard scroll container and bottom overlay slot.
- `FileView.tsx` duplicates a similar scene shape inline instead of going through a shared scene
  wrapper.

### Bottom dock plumbing

- `EditorChatDock.tsx` reports mobile inset through `onMobileDockInsetChange`.
- `FileView.tsx` and `VaultDashboard.tsx` each:
  - own local `mobileEditorChatDockInset` state,
  - add `paddingBottom` plus `scrollPaddingBottom` to the main scroll surface,
  - render `EditorChatDock` at the bottom of the main pane in `desktopMode="inline"`.

This is the most obvious duplicated route-level seam that should become part of the standard layout
contract.

### Route consumers and visual fixtures

- Live routes:
  - `FileView.tsx`
  - `VaultDashboard.tsx`
- FileView fixtures:
  - `FileViewLayoutVisualFixture.tsx`
  - `FileViewDeveloperToolsVisualFixture.tsx`
  - `FileViewCodeParityVisualFixture.tsx`
  - `FileViewMonacoDragVisualFixture.tsx`
  - `FileViewProsemarkDragVisualFixture.tsx`
  - `RepositoryMediaVisualFixture.tsx`
- Dashboard fixtures:
  - `VaultDashboardVisualFixture.tsx`
  - `use-vault-dashboard-visual-mobile-shell-view-model.tsx`
- Fixture entrypoint:
  - `visualFixture.tsx`

### Existing validation surface

- Geometry and state retention:
  - `apps/noter/e2e/workspace-frame-geometry.spec.ts`
- Shared shell screenshots and mobile sidebar behavior:
  - `apps/noter/e2e/workspace-sidebar-visual.spec.ts`
  - `apps/noter/e2e/workspace-sidebar-drag.spec.ts`
- Dashboard shell screenshot coverage:
  - `apps/noter/e2e/vault-dashboard-visual.spec.ts`
- FileView editor drag coverage:
  - `apps/noter/e2e/file-view-prosemark-drag.spec.ts`
  - `apps/noter/e2e/file-view-monaco-drag.spec.ts`

## Refactor Target

Create a dedicated folder:

`apps/noter/src/components/workspace-layout/`

The folder should become the canonical home for the shared route shell and its mobile drag pieces.
The likely contents are:

- `WorkspaceSidebarShell.tsx`
- `WorkspaceRouteFrame.tsx` or `WorkspaceRouteLayout.tsx`
- `WorkspaceScene.tsx`
- `SidebarProvider.tsx` plus `SidebarTrigger.tsx`, or a thin local wrapper that continues to export
  the existing names
- `workspaceMobilePaneDrag.tsx`
- `workspaceMobilePaneDragContext.ts`
- `useWorkspaceMobilePaneDrag.ts`
- `index.ts`

The key design point is not the exact filenames. It is that the layout-owned behavior lives together
and exposes one standard route-facing API.

## Proposed Standard API Shape

The extracted standard layout should support:

1. explicit left and right sidebar header/content slots
2. shared route header content
3. a main pane body
4. a shared scroll container wrapper around the body
5. optional bottom dock or overlay content
6. automatic mobile scroll-padding updates when the dock is open
7. route-controlled defaults for:
   - primary sidebar side
   - default desktop-open state
   - right-sidebar default-open state

Two thin route-specific adapters can remain during migration:

- FileView adapter for repository header chrome and quick-open
- Dashboard adapter for dashboard header styling

That keeps the public route code readable while moving the real behavior into one folder.

## Safe Refactor Plan

### Phase 1. Move layout-owned primitives without behavior changes

1. Create `workspace-layout/`.
2. Move the core shell pieces into that folder:
   - `WorkspaceSidebarShell`
   - mobile pane drag context/provider/hook
   - sidebar provider/trigger and related state contract
3. Keep temporary top-level compatibility files that re-export from the new folder so imports do not
   need to change in one sweep.
4. Preserve current test ids, DOM order, and CSS classes in this phase.

Why first:

- it creates the new ownership boundary immediately
- it keeps the first patch largely mechanical
- it gives us a place to build the standardized route API without mixing move and behavior changes
  together

### Phase 2. Introduce one neutral route frame

1. Add `WorkspaceRouteFrame` in `workspace-layout/`.
2. Move the shared shell props into that neutral wrapper.
3. Re-implement `RepositoryWorkspaceFrame` and `DashboardWorkspaceLayout` as thin adapters over the
   new frame.
4. Leave route call sites unchanged at first.

This phase keeps the surface stable while proving that both existing wrappers can share one
route-level primitive.

### Phase 3. Standardize the scroll body and bottom dock contract

1. Extract a neutral `WorkspaceScene` that owns:
   - scroll container markup
   - optional `overlayContent` or `bottomDock`
   - mobile bottom inset plumbing
2. Move the duplicated `mobileEditorChatDockInset` pattern out of `FileView.tsx` and
   `VaultDashboard.tsx`.
3. Re-implement `VaultDashboardWorkspaceScene` as a thin adapter over the new scene.
4. Introduce a FileView scene adapter instead of keeping the same structure inline in
   `FileView.tsx`.

This is the phase that turns the bottom panel into part of the standard layout instead of
route-local glue.

### Phase 4. Migrate fixtures before live routes

1. Update the visual fixtures to consume the new folder exports first.
2. Keep their public fixture modes and test ids unchanged.
3. Verify geometry, mobile drag, and screenshots before touching the live routes.

Fixtures are the safest proving ground because they cover:

- shell geometry
- desktop collapse behavior
- mobile pane drag
- editor-surface drag handoff
- dashboard shell screenshots

### Phase 5. Migrate live routes

1. Migrate `VaultDashboard.tsx` onto the standardized scene API.
2. Migrate `FileView.tsx` onto the same scene API.
3. Keep route-specific content ownership local:
   - FileView still owns repository controls and editor body
   - Dashboard still owns repository list and provider panel
4. Only after both routes are migrated should the old top-level wrappers become cleanup candidates.

### Phase 6. Remove compatibility shims

1. Switch all imports to the `workspace-layout` folder.
2. Remove temporary re-export files.
3. Collapse route wrappers only if doing so improves readability and no longer increases migration
   risk.

## Guardrails

### Guardrail 1. Preserve the editor drag bridge contract

Do not change the runtime behavior of:

- `useWorkspaceMobilePaneDrag`
- `useProsemarkMobilePaneDrag`
- the shell-owned `dragMobileShellBy(...)` and `settleMobileShell()` bridge

until the folder move is complete and the same tests are green.

### Guardrail 2. Preserve shell geometry before renaming APIs

The most fragile part of this refactor is not component names. It is the exact header/body/sidebar
alignment and mobile pane behavior. That means geometry and layout tests should stay green before
any cleanup rename is considered done.

### Guardrail 3. Keep compatibility shims for one migration window

A short-lived re-export layer is preferable to a big-bang move because:

- it shortens each patch
- it keeps route diffs readable
- it lets fixtures and live routes migrate independently

### Guardrail 4. Treat chat inset plumbing as layout behavior

The docked chat is not just route content. Its open height changes the scroll contract on mobile.
That inset wiring belongs in the standard layout API, not in route-local duplicate state.

## Validation Plan

At minimum, the implementation refactor should keep these checks green:

1. `apps/noter/src/components/useProsemarkMobilePaneDrag.test.tsx`
2. `apps/noter/e2e/workspace-frame-geometry.spec.ts`
3. `apps/noter/e2e/workspace-sidebar-visual.spec.ts`
4. `apps/noter/e2e/workspace-sidebar-drag.spec.ts`
5. `apps/noter/e2e/file-view-prosemark-drag.spec.ts`
6. `apps/noter/e2e/file-view-monaco-drag.spec.ts`
7. `apps/noter/e2e/vault-dashboard-visual.spec.ts`

The refactor should also add at least one new fixture or screenshot assertion covering the
standardized route scene once the shared scroll-plus-dock wrapper exists.

## Open Decisions

1. Whether `SidebarProvider` should move physically into `workspace-layout/` or remain in
   `components/sidebar.tsx` as a public alias backed by the new folder.
2. Whether the standardized scene should own `EditorChatDock` directly or only own dock inset
   plumbing plus a generic bottom-slot API.
3. Whether the neutral route wrapper should replace the existing `RepositoryWorkspaceFrame` and
   `DashboardWorkspaceLayout` names immediately or only after the migration lands cleanly.

## Acceptance Criteria

1. A new route can adopt the shared workspace layout without copying dashboard or file-view layout
   code.
2. The three-column desktop shell and the mobile left/main/right carousel still behave exactly as
   they do today.
3. ProseMark and Monaco mobile drag handoff still works through the extracted shared layout folder.
4. The bottom dock contract is standardized instead of duplicated in route components.
5. Dashboard and FileView can both render through the extracted layout package with existing
   screenshots and geometry checks still passing.
