# 072 Mobile Sidebar Interactive Drag Spec

## Document Control

- Status: Proposed
- Owner: Noter frontend
- Last updated: 2026-03-28
- Depends on:
  - `apps/noter/src/components/ui/sidebar.tsx`
  - `apps/noter/src/components/ui/sheet.tsx`
  - `apps/noter/src/hooks/use-touch-gestures.ts`
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/VaultDashboard.tsx`
  - `rfcs/067_DASHBOARD_SHARED_SIDEBAR_SPEC.md`

## Summary

Mobile sidebar open should feel attached to the finger instead of waiting for
the swipe to finish and then playing an entrance animation.

The mobile sidebar should be rendered off-canvas on the left at all times,
hidden with a transform when closed. An edge drag should reveal that already
mounted surface interactively, then settle open or closed on release.

CSS remains responsible for the visual motion, but CSS alone is not sufficient
for this interaction. A small pointer-driven state layer must update the drawer
offset while the gesture is in progress.

## Problem

Today mobile sidebar open is triggered by `useSwipeToOpenSidebar`, which only
calls `onOpen` during `touchend`. The actual sidebar surface is a Radix `Sheet`,
so the visible motion begins only after the gesture has already finished.

That makes the interaction feel delayed and indirect:

- the drawer does not track the finger during the swipe
- the user gets no progressive reveal feedback while deciding whether to commit
- the interaction feels more like a post-gesture animation than a drag

## Goals

1. Make mobile sidebar open feel continuous with the user’s finger movement.
2. Reuse the existing left sidebar content for file view and dashboard.
3. Keep the implementation dependency-light and compatible with the existing
   sidebar provider model.
4. Preserve accessible modal drawer behavior once the sidebar is committed open.

## Non-Goals

- Redesigning desktop sidebar behavior.
- Adding a gesture library just for this interaction.
- Introducing a second sidebar model separate from the existing provider state.
- Changing sidebar content structure in file view or dashboard.

## Current State

- Desktop sidebar already behaves like an off-canvas surface: it stays mounted
  and moves offscreen when collapsed.
- Mobile sidebar does not use that model. It switches to a `Sheet` that mounts
  portal content and animates between closed and open states.
- Mobile edge swipe is attached only in `FileView` and `VaultDashboard`.
- The gesture hook detects a horizontal swipe, but it does not expose live drag
  progress. It only decides at release time whether to call `onOpen`.

## Proposal

### 1. Always-mounted mobile drawer

On mobile, the sidebar should render as a fixed left drawer that remains mounted
even while closed.

Closed state:

- drawer is translated fully offscreen to the left
- overlay is visually hidden and non-interactive
- drawer content is inert and hidden from focus navigation

Open state:

- drawer is translated to `0`
- overlay is visible
- drawer content is interactive and focusable

Desktop continues to use the existing sidebar implementation unchanged.

### 2. Interactive edge drag

Replace the current open-only swipe detection with a drag session that tracks
pointer movement from the left screen edge.

Interaction model:

- a drag may begin only when the initial pointer down lands within a narrow left
  edge hit area
- once horizontal intent is clear, the drawer reveal follows the finger
  continuously
- the overlay opacity should scale with the reveal progress
- on release, the drawer snaps open or closed based on revealed distance and
  release velocity

This should support both:

- swipe-open from the closed state
- swipe-close from the open state

### 3. JS + CSS responsibility split

This interaction should not be described as "CSS-only."

Required split:

- JS owns ephemeral gesture state such as drag start, delta, velocity, and
  release threshold resolution
- CSS owns the actual rendering of the drawer and overlay via `transform`,
  opacity, transitions, and pointer-events gates

The drawer should be positioned with `transform`, not `left`, so the drag path
stays on the compositor-friendly path and avoids layout churn.

### 4. Sidebar state contract

The existing committed mobile state remains boolean: open or closed.

During a drag, the implementation may keep additional transient state such as:

- drag status
- reveal progress
- current translate offset

That transient state must not replace `openMobile`; it exists only to render the
interactive motion before the release settles to the normal committed state.

### 5. Accessibility and modal behavior

The drawer must preserve the accessibility expectations currently provided by
the mobile `Sheet` once the drawer is committed open.

Required behavior:

- escape closes the drawer when a keyboard is present
- tapping the overlay closes the drawer
- background content is not focusable while the drawer is open
- body/page scroll should not fight the drawer while it is actively dragging or
  open

While the drawer is only partially revealed during an opening drag, it may be
treated as a visual transition state rather than a fully interactive modal
surface.

### 6. Implementation direction

Preferred direction:

1. Keep the existing `SidebarProvider` and `openMobile` state shape.
2. Replace the current mobile `Sheet` branch inside `Sidebar` with an app-owned
   mobile drawer surface that stays mounted.
3. Replace `useSwipeToOpenSidebar` with a pointer-driven hook that exposes live
   drag progress instead of only an end-of-gesture callback.
4. Drive drawer position and overlay opacity through CSS variables or inline
   styles derived from that transient drag state.

This slice should avoid introducing a new dependency unless the in-house
pointer-based implementation proves materially more complex than expected.

## Validation

When implementation lands:

- add or update a mobile Playwright interaction test that performs an edge drag
  and verifies the drawer tracks during the gesture rather than only after
  release
- verify swipe-open and swipe-close in both `FileView` and `VaultDashboard`
- verify overlay tap, escape key, and trigger-button open/close still work
- verify vertical page scrolling near the edge does not incorrectly capture into
  a drawer drag

## Acceptance Criteria

- Mobile sidebar can be rendered closed while already mounted off-canvas on the
  left.
- A left-edge drag progressively reveals the drawer before release.
- Releasing the drag settles the drawer open or closed according to threshold
  and velocity, not just a binary swipe detector.
- The drawer uses transform-driven motion rather than layout-driven `left`
  updates for the interactive path.
- File view and dashboard share the same improved mobile sidebar behavior.
- Desktop sidebar behavior remains unchanged.
