# 072 Mobile Sidebar Interactive Drag Spec

## Document Control

- Status: Implemented
- Owner: Samebase frontend
- Last updated: 2026-03-29
- Depends on:
  - `apps/samebase/src/components/DashboardWorkspaceLayout.tsx`
  - `apps/samebase/src/components/RepositoryWorkspaceFrame.tsx`
  - `apps/samebase/src/repository/editor/FileView.tsx`
  - `apps/samebase/src/repository/dashboard/RepositoryDashboard.tsx`
  - `apps/samebase/src/components/WorkspaceSidebarShell.tsx`
  - `rfcs/067_DASHBOARD_SHARED_SIDEBAR_SPEC.md`

## Summary

Mobile sidebar interaction should feel like dragging a horizontally pannable workspace, not like
triggering a drawer that only appears after the drag has already finished.

The sidebar and main view should live on the same visual plane inside one shared workspace shell. On
mobile, dragging should rely on the same immediate, continuous motion as native scrolling, with only
two snap positions: closed and open.

When the sidebar is open, the main pane should render through a lightweight scrim that sits above
it. That scrim should absorb taps before they reach the main view and add a subtle transparent black
tint so the open state reads like a standard mobile sidebar instead of an accidental half-pan.

The implementation should get simpler as this lands:

- one shared shell instead of separate mobile and desktop markup
- native pan/scroll behavior instead of a custom gesture engine
- a small amount of snap/open state instead of many mobile-only branches

## Problem

The original UX problem was straightforward: mobile drag felt delayed because the sidebar became
visible only after the gesture completed. That made the interaction look like it was stuttering or
catching up to the finger.

The attempted fix addressed the right symptom, live motion, but introduced too much complexity in
the process:

- custom document-level drag listeners
- separate mobile-specific shell markup
- many mobile-vs-desktop branches in layout components
- modal-drawer behavior layered onto a surface that is not conceptually modal
- fixture-heavy and screenshot-heavy validation that does not clearly protect the intended behavior

At the same time, the current shell still relies on click-capture logic on the main header and body
to close the sidebar. That works mechanically, but it does not make the interaction explicit in the
DOM, and it gives no visual signal that the main pane should be considered temporarily inactive
while the sidebar is open.

This spec resets the direction around a simpler model that keeps the good part, the live
translation, while removing the unnecessary machinery.

## Goals

1. Make the sidebar move immediately with the finger during drag.
2. Keep the sidebar and main view on the same level in the layout.
3. Use one shared shell structure across desktop and mobile.
4. Block accidental main-view interaction while the mobile sidebar is open.
5. Add subtle dimming so the open state reads like a standard sidebar.
6. Reduce implementation complexity by deleting custom gesture and modal code.
7. Preserve a simple committed state: sidebar open or closed.

## Non-Goals

- Introducing a separate modal drawer primitive for the mobile sidebar.
- Trapping focus or making background content inert while the sidebar is open.
- Maintaining separate mobile-only layout trees for dashboard and file view.
- Expanding screenshot fixtures as the main form of validation.
- Adding a gesture library unless the remaining implementation still proves too complex after
  simplification.

## Current State

- Desktop layout relies on a static workspace structure with a sidebar column and main content area.
- Mobile historically behaved more like a drawer: a gesture finished first, and only then did the
  sidebar visibly appear.
- Recent work improved the visual feel by translating the workspace during drag, but it did so with
  a large custom gesture layer and multiple structural branches.
- The shared shell now uses click-capture on the main header/body to close the sidebar, but there is
  no dedicated scrim element that owns pointer blocking or visual dimming for the open state.

The core insight to preserve is the translation motion itself, not the custom gesture system built
around it.

## Proposal

### 1. One Shared Workspace Shell

Dashboard and file view should render through one shared shell structure in both desktop and mobile
modes.

Preferred shape:

```tsx
<div className="workspace-shell">
  <div className="workspace-track">
    <aside className="workspace-sidebar" />
    <div className="workspace-main">
      <header />
      <main />
    </div>
  </div>
</div>
```

This does not require identical CSS across breakpoints, but it does require one shared DOM structure
and one shared mental model.

If a layout component needs a large `if (isMobile) ... else ...` block with different trees, that is
a sign the implementation is drifting away from this spec.

### 2. Drag Should Behave Like Native Horizontal Scrolling

On mobile, the workspace shell should behave like a horizontally pannable surface.

Preferred interaction model:

- the user drags horizontally
- the track moves immediately with the finger
- motion is driven by native pan/scroll behavior rather than custom pointer math
- release settles to one of two snap positions

The desired feel is "like scrolling the page, but sideways," with only one extra rule: we snap to
closed or open instead of resting at arbitrary offsets.

### 3. Snap Points, Not Gesture Heuristics

The mobile interaction should have two meaningful resting positions:

- closed
- open

Implementation should prefer browser-native scroll and snap mechanics where possible:

- horizontal overflow container
- track containing sidebar and main
- CSS scroll snap or an equivalent minimal settle mechanism
- programmatic `scrollTo(...)` for button-driven open/close

Custom velocity thresholds, touch session tracking, and document-level pointer capture should be
avoided unless a much smaller implementation truly cannot deliver the required feel.

### 4. Main-Pane Scrim While Open

When the mobile sidebar is open, the main pane should render under a dedicated scrim element.

Required behavior:

- the scrim sits above the main header/body surface, not above the sidebar
- the scrim absorbs pointer input before the main pane can receive it
- the scrim uses a subtle transparent black tint so the open state looks like a standard sidebar
- the scrim can close the sidebar when tapped
- the scrim is part of the shared workspace shell, not a separate drawer surface

Preferred styling:

- start from a light tint, roughly in the `bg-black/10` to `bg-black/20` range
- keep the main pane visible beneath it
- allow opacity to follow sidebar reveal progress during drag if that keeps the motion feeling more
  natural

This replaces "close on capture" as the primary interaction boundary. Capture handlers may still
exist as a defensive fallback during refactor, but the shipped UI should make the blocked main pane
explicit with a real scrim layer.

### 5. Same-Level Sidebar Semantics

The sidebar should not be treated like a separate modal drawer, even though the main pane now uses a
scrim while the sidebar is open.

Required behavior:

- no full-screen sheet-style overlay that owns the whole viewport
- no background inerting
- no focus trap
- no special dialog semantics layered on top of the translated track

The sidebar and main view are sibling surfaces on the same plane. When the sidebar is open, the main
view remains part of the same workspace composition under the scrim.

Normal document focus order is sufficient for this interaction.

### 6. State Contract

The committed sidebar state remains boolean: open or closed.

During motion, the UI may use transient state derived from scroll position or track offset, for
example:

- current horizontal offset
- reveal progress
- snapping/settling status
- scrim opacity / pointer-enabled state

That transient state exists only to render the live motion and settle to a snap position. It should
not grow into a separate mobile-only state machine.

### 7. Desktop Uses the Same Shell

Desktop should continue to present the sidebar as a stable layout column, but it should do so using
the same shell structure as mobile.

Allowed differences on desktop:

- panning disabled
- track pinned in place
- static grid or equivalent CSS that presents the same shell without horizontal interaction

Not allowed:

- separate desktop and mobile markup trees for the same workspace shell
- dashboard-specific or file-view-specific mobile interaction models

### 8. Implementation Direction

Preferred direction:

1. Unify dashboard and file-view workspace shells around one structure.
2. Express mobile-vs-desktop differences through CSS and a small amount of state, not separate JSX
   trees.
3. Prefer native horizontal scroll plus snap positions over a custom drag hook.
4. Add a dedicated scrim element above the main pane whenever the mobile sidebar is meaningfully
   open.
5. Keep JavaScript responsibilities narrow:
   - button-driven open/close
   - toggling the scrim's interactivity/opacity from reveal state
   - syncing committed open state
   - optionally settling to the nearest snap position if native snap alone is insufficient
6. Delete mobile-specific abstractions that exist only to support fixture or gesture complexity.

Specifically, avoid:

- document-level pointer/touch gesture engines
- screen-specific drag region modes
- modal drawer primitives for the mobile sidebar
- fixture-only force-mobile state layers

## Validation

When implementation lands:

- add or update a mobile interaction test that verifies the track visibly moves during the drag,
  before release
- verify releasing the drag settles to closed or open snap positions
- verify button-triggered open/close lands on the correct snap positions
- verify taps on the visible main pane do not activate underlying controls while the scrim is
  present
- verify the scrim appears with a subtle dark tint only while the mobile sidebar is open or
  meaningfully revealed
- verify dashboard and file view share the same shell behavior
- verify desktop still renders and toggles correctly through the same shell

Testing guidance:

- prefer behavior-oriented interaction tests over large screenshot suites
- keep screenshot coverage minimal and representative when a shipped visual surface materially
  changes
- do not add fixture complexity solely to prove the existence of the mobile shell model

## Acceptance Criteria

- Sidebar and main render through one shared workspace shell structure.
- On mobile, dragging moves the workspace immediately before release.
- Mobile interaction settles to open or closed snap positions.
- When the mobile sidebar is open, a lightweight main-pane scrim blocks underlying clicks and adds
  subtle dimming.
- The sidebar is not implemented as a separate modal drawer surface.
- Dashboard and file view do not maintain separate mobile-only shell models.
- Desktop continues to work through the same shell with simpler, static presentation.
