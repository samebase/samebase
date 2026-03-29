# 072 Mobile Sidebar Interactive Drag Spec

## Document Control

- Status: Proposed
- Owner: Noter frontend
- Last updated: 2026-03-29
- Depends on:
  - `apps/noter/src/components/DashboardWorkspaceLayout.tsx`
  - `apps/noter/src/components/RepositoryWorkspaceFrame.tsx`
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/VaultDashboard.tsx`
  - `rfcs/067_DASHBOARD_SHARED_SIDEBAR_SPEC.md`

## Summary

Mobile sidebar interaction should feel like dragging a horizontally pannable
workspace, not like triggering a modal drawer that only appears after the drag
has already finished.

The sidebar and main view should live on the same visual plane inside one shared
workspace shell. On mobile, dragging should rely on the same immediate,
continuous motion as native scrolling, with only two snap positions: closed and
open.

The implementation should get simpler as this lands:

- one shared shell instead of separate mobile and desktop markup
- native pan/scroll behavior instead of a custom gesture engine
- a small amount of snap/open state instead of many mobile-only branches

## Problem

The original UX problem was straightforward: mobile drag felt delayed because
the sidebar became visible only after the gesture completed. That made the
interaction look like it was stuttering or catching up to the finger.

The attempted fix addressed the right symptom, live motion, but introduced too
much complexity in the process:

- custom document-level drag listeners
- separate mobile-specific shell markup
- many mobile-vs-desktop branches in layout components
- modal-drawer behavior layered onto a surface that is not conceptually modal
- fixture-heavy and screenshot-heavy validation that does not clearly protect
  the intended behavior

This spec resets the direction around a simpler model that keeps the good part,
the live translation, while removing the unnecessary machinery.

## Goals

1. Make the sidebar move immediately with the finger during drag.
2. Keep the sidebar and main view on the same level in the layout.
3. Use one shared shell structure across desktop and mobile.
4. Reduce implementation complexity by deleting custom gesture and modal code.
5. Preserve a simple committed state: sidebar open or closed.

## Non-Goals

- Introducing modal overlay behavior for the mobile sidebar.
- Trapping focus or making background content inert while the sidebar is open.
- Maintaining separate mobile-only layout trees for dashboard and file view.
- Expanding screenshot fixtures as the main form of validation.
- Adding a gesture library unless the remaining implementation still proves too
  complex after simplification.

## Current State

- Desktop layout relies on a static workspace structure with a sidebar column
  and main content area.
- Mobile historically behaved more like a drawer: a gesture finished first, and
  only then did the sidebar visibly appear.
- Recent work improved the visual feel by translating the workspace during drag,
  but it did so with a large custom gesture layer and multiple structural
  branches.

The core insight to preserve is the translation motion itself, not the custom
gesture system built around it.

## Proposal

### 1. One Shared Workspace Shell

Dashboard and file view should render through one shared shell structure in both
desktop and mobile modes.

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

This does not require identical CSS across breakpoints, but it does require one
shared DOM structure and one shared mental model.

If a layout component needs a large `if (isMobile) ... else ...` block with
different trees, that is a sign the implementation is drifting away from this
spec.

### 2. Drag Should Behave Like Native Horizontal Scrolling

On mobile, the workspace shell should behave like a horizontally pannable
surface.

Preferred interaction model:

- the user drags horizontally
- the track moves immediately with the finger
- motion is driven by native pan/scroll behavior rather than custom pointer math
- release settles to one of two snap positions

The desired feel is "like scrolling the page, but sideways," with only one extra
rule: we snap to closed or open instead of resting at arbitrary offsets.

### 3. Snap Points, Not Gesture Heuristics

The mobile interaction should have two meaningful resting positions:

- closed
- open

Implementation should prefer browser-native scroll and snap mechanics where
possible:

- horizontal overflow container
- track containing sidebar and main
- CSS scroll snap or an equivalent minimal settle mechanism
- programmatic `scrollTo(...)` for button-driven open/close

Custom velocity thresholds, touch session tracking, and document-level pointer
capture should be avoided unless a much smaller implementation truly cannot
deliver the required feel.

### 4. Same-Level Sidebar Semantics

The sidebar is not an overlay and should not be treated like one.

Required behavior:

- no modal overlay
- no background inerting
- no focus trap
- no special modal semantics layered on top of the translated track

The sidebar and main view are sibling surfaces on the same plane. When the
sidebar is open, the main view remains part of the same workspace composition.

Normal document focus order is sufficient for this interaction.

### 5. State Contract

The committed sidebar state remains boolean: open or closed.

During motion, the UI may use transient state derived from scroll position or
track offset, for example:

- current horizontal offset
- reveal progress
- snapping/settling status

That transient state exists only to render the live motion and settle to a snap
position. It should not grow into a separate mobile-only state machine.

### 6. Desktop Uses the Same Shell

Desktop should continue to present the sidebar as a stable layout column, but it
should do so using the same shell structure as mobile.

Allowed differences on desktop:

- panning disabled
- track pinned in place
- static grid or equivalent CSS that presents the same shell without horizontal
  interaction

Not allowed:

- separate desktop and mobile markup trees for the same workspace shell
- dashboard-specific or file-view-specific mobile interaction models

### 7. Implementation Direction

Preferred direction:

1. Unify dashboard and file-view workspace shells around one structure.
2. Express mobile-vs-desktop differences through CSS and a small amount of
   state, not separate JSX trees.
3. Prefer native horizontal scroll plus snap positions over a custom drag hook.
4. Keep JavaScript responsibilities narrow:
   - button-driven open/close
   - syncing committed open state
   - optionally settling to the nearest snap position if native snap alone is
     insufficient
5. Delete mobile-specific abstractions that exist only to support fixture or
   gesture complexity.

Specifically, avoid:

- document-level pointer/touch gesture engines
- screen-specific drag region modes
- modal drawer primitives for the mobile sidebar
- fixture-only force-mobile state layers

## Validation

When implementation lands:

- add or update a mobile interaction test that verifies the track visibly moves
  during the drag, before release
- verify releasing the drag settles to closed or open snap positions
- verify button-triggered open/close lands on the correct snap positions
- verify dashboard and file view share the same shell behavior
- verify desktop still renders and toggles correctly through the same shell

Testing guidance:

- prefer behavior-oriented interaction tests over large screenshot suites
- keep screenshot coverage minimal and representative when a shipped visual
  surface materially changes
- do not add fixture complexity solely to prove the existence of the mobile
  shell model

## Acceptance Criteria

- Sidebar and main render through one shared workspace shell structure.
- On mobile, dragging moves the workspace immediately before release.
- Mobile interaction settles to open or closed snap positions.
- The sidebar is not implemented as a modal overlay surface.
- Dashboard and file view do not maintain separate mobile-only shell models.
- Desktop continues to work through the same shell with simpler, static
  presentation.
