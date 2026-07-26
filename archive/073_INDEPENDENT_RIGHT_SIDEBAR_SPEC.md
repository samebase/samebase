# 073 Independent Right Sidebar Spec

> Archived 2026-07-26: current workspace layout contracts supersede this proposal, and its chat-dock
> assumptions no longer exist.

## Document Control

- Status: Proposed
- Owner: Noter frontend
- Last updated: 2026-03-30
- Depends on:
  - `apps/noter/src/components/WorkspaceSidebarShell.tsx`
  - `apps/noter/src/components/DashboardWorkspaceLayout.tsx`
  - `apps/noter/src/components/RepositoryWorkspaceFrame.tsx`
  - `apps/noter/src/components/VaultDashboardWorkspaceScene.tsx`
  - `apps/noter/src/components/ui/sidebar.tsx`
  - `apps/noter/src/components/EditorChatDock.tsx`
  - `rfcs/067_DASHBOARD_SHARED_SIDEBAR_SPEC.md`
  - `rfcs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md`

## Summary

Noter should support two independent workspace sidebars:

- the existing left sidebar
- a new right sidebar with the same structural behavior from the opposite edge

This RFC is intentionally narrow. It defines the shell and interaction model first, not the final
product feature that fills the right sidebar.

The goal is to make right-edge sidebar work a first-class layout capability without regressing the
current shared-shell behavior across dashboard and file view.

For the first slice, the right sidebar is a layout capability rather than a new product surface. It
does not yet need a committed feature owner or shipped default content.

## Why

The current workspace shell assumes there is exactly one sidebar and that it always lives on the
left. That assumption is now baked into:

- the shell API, which accepts one `sidebarHeader` and one `sidebarContent`
- the desktop grid layout, which reserves one left column and one main column
- the mobile pan model, which uses one horizontal track and one `scrollLeft` contract for open vs
  closed
- the sidebar provider state, which exposes one `open` and one `openMobile` state for the whole
  workspace
- the geometry tests, which assert that the sidebar seam is always the left seam

If Noter needs a true right sidebar, we should make that explicit in the shell instead of forcing
product features to fake it with overlays or ad hoc fixed panels.

## Goals

1. Keep the existing left sidebar behavior intact.
2. Add a second independent right sidebar for workspace screens.
3. Let either sidebar open or close without implicitly controlling the other.
4. Keep dashboard and file view on one shared shell model.
5. Avoid treating the right sidebar as a special-case overlay if the left sidebar is a first-class
   layout surface.
6. Keep mobile-web as a first-class target for the initial design, not a desktop-only afterthought.

## Non-Goals

- Choosing the long-term product owner of the right sidebar content.
- Shipping a specific right-sidebar feature in this RFC by default.
- Replacing the mobile chat dock with the right sidebar without an explicit follow-up decision.
- Generalizing every app page in the repo to support dual sidebars on day one.

## Current State

- `WorkspaceSidebarShell` is a one-sidebar layout model. The desktop grid is effectively
  `left-column + main-column`.
- Mobile interaction assumes one pannable sidebar track from the left edge.
- `SidebarProvider` stores one open/closed state pair, not one per side.
- The app already has right-edge UI pressure from `EditorChatDock`, which means the right sidebar
  cannot be designed in isolation from existing docked or floating surfaces.

## Decisions So Far

- The first shipped slice is about dual-sidebar capability, not a committed right-sidebar feature
  with default content.
- Desktop may keep both sidebars open at the same time.
- The capability should be available on both dashboard and file view from the start.
- `EditorChatDock` stays bottom-owned by the main workspace area in the first slice; the sidebars do
  not absorb it.
- Mobile support is required in the first slice.
- On mobile, the layout should be thought of as sibling smartphone-like screens in a carousel, not
  modal open/closed drawers.
- The first PR may ship a visible right-sidebar trigger and an otherwise empty right sidebar.
- `Cmd/Ctrl+B` remains left-sidebar only. The first slice does not need a right sidebar keyboard
  shortcut.
- The right-sidebar trigger should live on the same header bar as the left trigger, aligned on the
  right side.
- Desktop should use the same default width for the right sidebar as the left sidebar.
- Mobile should not render visible sidebar triggers in the first slice.
- The first-slice right sidebar may remain visually blank.
- On mobile, tapping the main workspace should keep using the current close behavior already used
  for the left sidebar today.
- On mobile, tapping the main workspace should settle the carousel back to the middle `main` screen
  from either sidebar side.
- On mobile, accessibility may use screen-reader-only controls even though the visual sidebar
  triggers are hidden.
- On mobile, carousel movement should settle screen-by-screen rather than skipping directly across
  the middle screen.
- On desktop, the first slice should preserve both sidebars as long as possible rather than
  auto-collapsing one side early.

## Proposal

### 1. Two explicit sidebar slots

The shared workspace shell should expose two separate optional sidebar slots:

- `leftSidebarHeader`
- `leftSidebarContent`
- `rightSidebarHeader`
- `rightSidebarContent`

This keeps the existing left surface explicit and avoids overloading a single `side` prop on one
sidebar payload.

### 2. Independent state per side

Sidebar state should become side-specific.

Required desktop/mobile state shape:

- left desktop open/closed
- right desktop open/closed
- left mobile open/closed
- right mobile open/closed

The final storage shape does not need to match that exact object literally, but product code must be
able to open, close, and inspect each side independently.

### 3. Desktop layout model

Desktop should treat the workspace as up to three columns:

- left sidebar column
- main content column
- right sidebar column

Either sidebar may be absent. Either sidebar may be collapsed. The main content must remain the
center column and should expand into any collapsed space.

Both sidebars may remain open at the same time on desktop.

### 4. Mobile interaction model

Mobile should treat the left sidebar, main workspace, and right sidebar as three sibling screens in
one horizontal carousel:

- left sidebar screen
- main workspace screen
- right sidebar screen

This is not a drawer model. The surfaces should behave more like adjacent smartphone screens inside
one horizontally navigable workspace.

That means the state model on mobile should not be described primarily as `open`/`closed`. It is
better modeled as a current active mobile pane with three positions:

- `left`
- `main`
- `right`

The implementation may still derive boolean helper state where needed, but the product model is a
three-stop mobile carousel.

In the first slice:

- mobile should not render visible left/right sidebar trigger buttons
- movement between screens should primarily happen by horizontal dragging
- tapping the main workspace should preserve the existing close behavior already used for the left
  sidebar today
- accessibility should provide a non-drag path, such as screen-reader-only controls that move to the
  left or right screen
- carousel navigation should settle one screen at a time

### 5. Trigger model

Each sidebar needs its own trigger surface and accessible name.

Minimum requirement:

- a left trigger that only controls the left sidebar
- a right trigger that only controls the right sidebar

The current generic `Toggle Sidebar` naming is not sufficient once both sides exist.

Desktop should render both triggers in the shared header bar:

- left trigger in the left cluster
- right trigger in the right cluster

Mobile should not render those triggers visibly in the first slice. Mobile accessibility may expose
equivalent screen-reader-only controls even when the visible triggers are hidden.

### 6. Persistence model

The existing cookie-based `sidebar_state` persistence is too narrow for dual sidebars. The
implementation should either:

- replace it with side-specific persisted state
- or intentionally drop persistence for the right sidebar in the first slice

The shipped choice must be explicit.

For the first slice, persistence is deferred. The implementation should prefer simple in-session
behavior over introducing a new persistence contract too early.

### 7. Interaction with existing right-edge surfaces

For the first slice, `EditorChatDock` should remain attached to the bottom of the main workspace
area and should not be moved into either sidebar.

This keeps the right sidebar architecture separate from chat-product decisions, but it still means
the implementation must verify that the existing dock can coexist visually with a right sidebar on
both dashboard and file view.

## Suggested Implementation Order

1. Refactor shell props from singular sidebar slots to left/right slots.
2. Introduce side-specific sidebar state in the app-owned sidebar wrapper.
3. Land desktop dual-sidebar layout support first.
4. Add route-level support for an optional right sidebar on both dashboard and file view, even if no
   route ships committed right-sidebar content yet.
5. Add mobile behavior in the same design pass using an explicit three-stop carousel model.

## Open Questions

No blocking open questions remain for the first RFC slice. Follow-up questions about richer mobile
affordances, placeholder content, or responsive collapse policy can wait until implementation or
product content exists.

## Acceptance Criteria

- The shared workspace shell can render left and right sidebars independently.
- Desktop can show either sidebar alone or both together without layout breakage.
- Side-specific triggers and labels exist for each sidebar.
- The implementation does not regress current left-sidebar behavior on shipped routes.
- The mobile story for the right sidebar is explicitly chosen rather than implied by the desktop
  architecture.
