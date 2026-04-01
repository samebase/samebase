# 081 Connected Machines Workspace Route Research

## Document Control

- Status: Proposed
- Owner: connected machine UI
- Last updated: 2026-04-01
- Related docs:
  - `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`
  - `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`
  - `rfcs/080_SHARED_WORKSPACE_LAYOUT_REFACTOR_PLAN.md`
  - `rfcs/067_DASHBOARD_SHARED_SIDEBAR_SPEC.md`

## Summary

The connected-machine control surface should move onto the same shared workspace
shell used by dashboard and file view.

The recommended next UI slice is:

1. add a new workspace route at `/machines`
2. keep `/machines/connect` as the onboarding flow
3. keep the current machine live-control route as the state source during the
   migration, but stop treating its page layout as the final product surface
4. ship the first slice as a sidebar-first route:
   - connected machine selection in route state
   - Codex-style thread inventory in the left sidebar
   - placeholder main pane for now

This matches the recent `workspace-layout` refactor, reuses the existing mobile
sidebar behavior, and sets up the later transcript-plus-composer work without
locking that future UI into the current `CodexThreadBrowserView` card layout.

## Why This Research Exists

The product direction for connected machines is no longer "one onboarding page,
then one isolated live-control page." The user wants a real workspace surface
that feels closer to Codex Desktop:

1. one stable app shell
2. thread inventory on the left
3. transcript in the middle
4. composer docked at the bottom

The repo now has the shared layout primitives to do that work cleanly:

- `apps/noter/src/components/workspace-layout/WorkspaceRouteFrame.tsx`
- `apps/noter/src/components/workspace-layout/WorkspaceScene.tsx`
- `apps/noter/src/components/workspace-layout/WorkspaceSidebarShell.tsx`
- `apps/noter/src/components/workspace-layout/DashboardWorkspaceLayout.tsx`
- `apps/noter/src/components/workspace-layout/RepositoryWorkspaceFrame.tsx`

So the question is no longer "can we make a machine page?" It is "which route
and component seams let connected machines adopt the shared shell without
dragging along the old research-page composition?"

## Current Repo State

### Shipped routes

Today the authenticated app ships:

1. `/machines/connect`
   - browser approval and machine bootstrap instructions
   - implemented by `apps/noter/src/components/MachineConnectPage.tsx`
2. `/machines/:machineId/live`
   - machine-scoped thread browser and turn submit flow
   - implemented by `apps/noter/src/components/MachineLiveControlPage.tsx`

There is no dedicated `/machines` workspace route yet.

### Layout mismatch

`MachineLiveControlPage` already has important state and data logic:

1. machine readiness checks
2. machine-control token issuance
3. local thread inventory reads
4. selected-thread query-param handling
5. turn submission

But it still renders through `AppPageScrollShell` and `CodexThreadBrowserView`,
which means:

1. it bypasses the shared workspace shell used by dashboard and file view
2. it owns a full-page two-column card layout inside the view component itself
3. it cannot naturally share the app-level sidebar/mobile pane behavior the user
   now wants

### Existing prior art that matters

The repo already has the exact building blocks this route needs:

1. `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md` already
   locks the machine-scoped thread inventory contract
2. `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md` already defines the
   phone-facing "Machines page" product direction
3. `apps/noter/src/components/CodexThreadBrowserView.tsx` already proves the
   desired thread grouping, row density, and selected-thread behaviors
4. `apps/noter/src/components/workspace-layout/*` already owns the route shell
   that dashboard and file view share

The missing piece is composition, not protocol research.

## What The Codex Reference Gets Right

The provided Codex screenshot is useful as a layout reference even though Noter
should not copy it literally.

The important cues are:

1. the left rail is the primary navigation for thread selection
2. the main pane is not boxed into a card inside a page scroll shell
3. the composer belongs to the bottom of the workspace, not to a floating modal
   or a separate page section
4. timestamps, pin state, and thread density matter more than decorative chrome

Noter should borrow that information hierarchy, not the exact top-level Codex
app navigation (`Plugins`, `Automations`, and so on).

## Route Options Considered

### Option 1. Keep extending `/machines/:machineId/live`

Pros:

1. already exists
2. no new top-level route helper needed

Cons:

1. keeps the UI machine-scoped in the pathname even though the desired
   experience is a single workspace that can switch machines and threads in
   place
2. makes the future sidebar selection model feel bolted onto a detail route
3. preserves the current mental model of "open machine live control" instead of
   "open the Machines workspace"

Recommendation: not preferred as the canonical product route.

### Option 2. Add `/machines` and store machine/thread selection in query params

Pros:

1. matches the requested product surface
2. coexists cleanly with `/machines/connect`
3. lets the route behave like one stable workspace while selection changes
   inside it
4. avoids immediate nested-route complexity while the main pane is still in flux

Cons:

1. needs route helpers for selection state
2. requires a redirect or compatibility story for the current live route

Recommendation: preferred for the next slice.

### Option 3. Add `/machines/:machineId`

Pros:

1. clean machine-specific pathname
2. easy deep-linking to a selected machine

Cons:

1. still makes machine switching feel like route replacement rather than normal
   workspace state
2. does not help enough with thread selection, which would still need query
   params or deeper nested paths

Recommendation: acceptable later if we need canonical machine URLs, but not the
best first move.

## Recommendation

Ship a new route at `/machines` and treat it as the connected-machines
workspace.

Use query params for the current selection:

1. `machineId`
2. `threadId`
3. later, if needed, `search`

Keep these routes alongside it:

1. `/machines/connect` for onboarding
2. `/machines/:machineId/live` as a temporary compatibility path that can
   eventually redirect into `/machines?machineId=...&threadId=...`

This gives connected machines the same product shape as the shared dashboard and
file-view shells: one route-level frame, selection state inside the route, and
route-local panes inside the shell.

## Layout Recommendation

### Use the shared workspace shell directly

The new route should render inside:

1. `SidebarProvider`
2. a new thin adapter such as
   `apps/noter/src/components/workspace-layout/MachinesWorkspaceLayout.tsx`
3. `WorkspaceScene`

Why a new thin adapter instead of reusing `DashboardWorkspaceLayout` directly:

1. `DashboardWorkspaceLayout` still carries dashboard-specific naming and test
   ids
2. machines needs its own stable fixture/test hooks
3. the shared layout folder is explicitly meant to make a third route possible
   without pretending that route is the dashboard

### Do not preserve `CodexThreadBrowserView` as the shipped page layout

`CodexThreadBrowserView` is still valuable, but as a reference surface:

1. keep its thread row density and grouping ideas
2. keep its selection semantics
3. do not keep its top-level card grid as the product shell

The route shell should own page composition. The thread-browser view should be
split so the sidebar inventory and main detail pane can live inside the shared
workspace frame instead of inside one monolithic component.

## Sidebar-First Slice

The first implementation slice should intentionally stop after the left rail is
real.

### Left sidebar header

The left sidebar header should include:

1. a machine switcher or machine summary for the selected machine
2. a `Connect machine` affordance
3. the route title, for example `Machines`

This keeps machine selection tied to the workspace without spending the first
slice on the full transcript pane.

### Left sidebar content

The left sidebar content should include:

1. thread search
2. pinned threads
3. grouped thread inventory by project root
4. row metadata:
   - title
   - preview line
   - relative updated time
   - loaded-state cue
   - optional worktree / branch context when available

This is the part that should look closest to the Codex reference.

### Main pane for slice 1

For the first shipping slice, the main pane can stay intentionally simple:

1. selected machine heading
2. selected thread heading or placeholder copy
3. no final transcript/composer behavior yet

That keeps the scope aligned with the user's request to focus on the sidebar
first.

## State And Extraction Plan

The current `MachineLiveControlPage` has the right data flow, but the wrong
layout boundary.

The recommended extraction order is:

1. move thread inventory utilities out of `MachineLiveControlPage`
   - `dedupeThreadsById`
   - `buildThreadGroups`
   - selected-thread search helpers
2. keep machine-control token issuance and request plumbing near the route
3. render the new `/machines` route from the extracted state plus the shared
   workspace shell

Suggested file targets:

1. `apps/noter/src/components/MachinesWorkspacePage.tsx`
2. `apps/noter/src/components/MachinesWorkspaceSidebar.tsx`
3. `apps/noter/src/components/workspace-layout/MachinesWorkspaceLayout.tsx`
4. `apps/noter/src/lib/machineThreadInventory.ts`
5. `apps/noter/src/lib/noterSync.ts`
   - add route helpers for `/machines`
6. `apps/noter/src/App.tsx`
   - register the new route

## Suggested Incremental Delivery

### Phase 1. Route scaffold

1. add `/machines`
2. render the shared workspace shell
3. load connected machines
4. select one machine in route state
5. show a placeholder main pane

### Phase 2. Sidebar data and visuals

1. extract thread grouping/search logic from `MachineLiveControlPage`
2. render the thread list in the left sidebar
3. make selection update route query params
4. keep the existing main pane minimal

### Phase 3. Main thread pane

1. move thread detail rendering into the workspace main pane
2. dock the composer at the bottom through `WorkspaceScene`
3. preserve mobile inset handling the same way dashboard/file view already do

### Phase 4. Compatibility cleanup

1. decide whether `/machines/:machineId/live` becomes a redirect
2. remove layout duplication that is no longer needed

## Validation

When implementation starts, the route should ship with:

1. a dedicated visual fixture for the `/machines` workspace
2. at least one screenshot spec that covers the sidebar-first shipped surface
3. route/helper tests for machine/thread selection params

This is especially important because the shared shell already has mobile and
sidebar behavior that can regress even when the new route looks correct on
desktop.

## Locked Recommendations From This Research

1. The canonical product surface should move to `/machines`.
2. The route should use the shared `workspace-layout` shell, not
   `AppPageScrollShell`.
3. The first UI slice should stop after the left sidebar is real.
4. `CodexThreadBrowserView` should inform the redesign, not remain the top-level
   shipped page layout.
5. `/machines/connect` should stay separate as the onboarding flow.
