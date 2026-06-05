# 074 File View Monaco Mobile Pane Drag Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/editor UX
- Last updated: 2026-03-30
- Depends on:
  - `apps/noter/src/components/WorkspaceSidebarShell.tsx`
  - `apps/noter/src/components/CodeEditor.tsx`
  - `apps/noter/src/components/MonacoEditor.tsx`
  - `apps/noter/src/components/sidebar.tsx`
  - `rfcs/037_MONACO_MOBILE_FULL_BLEED_SPEC.md`
  - `specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md`
  - `specs/073_FILE_VIEW_PROSEMARK_MOBILE_PANE_DRAG_SPEC.md`

## Summary

On mobile, dragging horizontally from anywhere inside FileView's Monaco surface should move the
shared workspace carousel immediately, using the same shell handoff model already shipped for
ProseMark.

This spec defines a narrow follow-up slice:

1. support FileView's Monaco-backed editing surface,
2. keep the gesture touch-only so mouse selection behavior remains unchanged,
3. preserve Monaco's normal vertical editing and scrolling behavior,
4. rely on mobile line wrapping so internal horizontal file scrolling is not needed.

## Why

After the ProseMark change, FileView still behaves inconsistently on mobile:

1. horizontal drag works in the shell,
2. horizontal drag works inside ProseMark-backed files,
3. the same gesture fails in Monaco-backed files.

That leaves users with a file-type-specific interaction model inside the same main pane. Because
Monaco already wraps lines on mobile, this follow-up can adopt the same shell-driven drag contract
without fighting a required horizontal-scroll affordance.

## Scope

### In scope

1. Monaco-backed FileView editing surfaces rendered through `CodeEditorWrapper`.
2. Mobile-only drag delegation from Monaco into the shared workspace shell.
3. Bidirectional drag behavior that can move the main pane toward either sidebar.
4. Monaco mobile configuration updates required to make the no-horizontal-scroll contract explicit.
5. Focused visual and interaction coverage for the shipped Monaco surface.

### Out of scope

1. Desktop Monaco interactions.
2. ProseMark behavior changes.
3. A generic drag system for every editor-like surface in the app.
4. New shell snap points or shell-state changes.
5. Reworking Monaco's selection model beyond what is required to preserve current touch-vs-mouse
   behavior.

## Current State

### Shell

The workspace shell already owns mobile pane drag and settle behavior through a shared descendant
bridge in `WorkspaceSidebarShell`.

That bridge exposes:

1. whether drag delegation is currently available,
2. an imperative `dragMobileShellBy(deltaX)` motion API,
3. an imperative settle API for gesture end.

### Monaco

`CodeEditorWrapper` routes non-prose files into `MonacoEditor`.

Important Monaco details today:

1. mobile already enables `wordWrap: "on"`,
2. the outer Monaco wrapper does not participate in the mobile pane-drag bridge,
3. Monaco still advertises a horizontal scrollbar size even on mobile,
4. there is no Monaco-specific drag fixture or Playwright coverage for mobile pane motion.

## Problem Statement

The workspace shell can only respond to a drag if the editor surface delegates that gesture.
ProseMark now does that; Monaco does not.

As a result:

1. the main pane appears to support horizontal drag everywhere,
2. Monaco-backed files break that expectation,
3. users have to discover a different gesture contract based only on file type.

## Goals

1. Horizontal touch drags from Monaco move the shell immediately on mobile.
2. The same bidirectional drag contract applies as ProseMark:
   - drag right toward the left sidebar,
   - drag left toward the right sidebar.
3. Mouse drag-selection remains Monaco-owned.
4. Vertical touch movement remains Monaco-owned.
5. Monaco mobile mode keeps a wrapped, no-horizontal-file-scroll contract.

## Non-Goals

1. Mouse-driven pane dragging.
2. Introducing horizontal file scrolling in Monaco mobile mode.
3. A second shell drag implementation specialized for Monaco.
4. Solving every Monaco mobile ergonomics issue in this patch.

## UX Contract

### Main behavior

When the current mobile pane is `main` and a touch gesture starts inside the Monaco editing surface:

1. horizontal drag should move the shared shell live,
2. release should settle through the shell's existing nearest-pane behavior,
3. drag classification should happen after a small threshold, not on touch start.

### Editing safety

The Monaco surface must remain usable:

1. taps still place focus/caret,
2. vertical drag still scrolls the editor,
3. mouse drag-selection still selects text instead of moving the shell,
4. once a touch gesture is classified as shell drag, the shell owns the rest of that gesture.

## Design Decisions

### 1. Reuse the existing shell bridge

Monaco should delegate into the same shell bridge already used by the shipped ProseMark change. This
keeps the shell as the only source of truth for pane motion and settle behavior.

### 2. Touch-only handoff

Unlike an edge-only affordance, this feature keeps the full-surface drag model, but only for touch
gestures. Mouse interactions remain editor-local so Monaco selection and desktop behavior are not
regressed.

### 3. Wrapped, no-horizontal-scroll mobile contract

This follow-up explicitly leans on mobile wrapping:

1. keep `wordWrap: "on"` for Monaco on mobile,
2. hide the mobile horizontal scrollbar affordance,
3. do not treat horizontal file scrolling as a required Monaco mobile behavior in the shipped scope.

### 4. Wrapper-level integration

The first implementation should attach the drag delegation to Monaco's outer React wrapper rather
than patching Monaco internals. If capture-phase handling on the wrapper is sufficient, do not add
editor-instance-specific gesture code.

## Proposed Implementation

### Step 1. Reuse the existing editor drag helper

Use the current touch-only pane-drag helper for Monaco as well as ProseMark.

The helper should continue to provide:

1. capture-phase pointer handlers,
2. touch listeners for mixed pointer/touch browser behavior,
3. `touchAction: "pan-y"` while enabled.

### Step 2. Wire Monaco's outer wrapper into the helper

Apply the helper's `containerProps` and `touchAction` to the outer Monaco wrapper in `MonacoEditor`.

The wrapper should be the first integration point. Do not add Monaco-specific gesture code unless
wrapper-level capture proves insufficient.

### Step 3. Make the mobile no-horizontal-scroll contract explicit

Update Monaco mobile options so the shipped interaction model is coherent:

1. keep wrapping enabled,
2. hide the mobile horizontal scrollbar,
3. avoid signaling a horizontal-scroll affordance that the mobile shell drag is intentionally
   reclaiming.

### Step 4. Add Monaco-specific fixture coverage

Add a focused FileView Monaco drag visual fixture with:

1. left sidebar content,
2. main Monaco editing surface,
3. right sidebar content,
4. stable text that wraps on mobile and makes drag behavior easy to inspect.

### Step 5. Add Playwright coverage

Add focused Playwright coverage that exercises the real Monaco surface on a mobile viewport.

Required checks:

1. fixture screenshot coverage,
2. drag right from Monaco opens the left pane,
3. drag left from Monaco opens the right pane if the fixture keeps that coverage stable enough.

## Acceptance Criteria

1. On mobile, a horizontal touch drag starting inside Monaco moves the shared shell immediately.
2. Release settles through the shell's existing nearest-pane behavior.
3. Monaco mouse drag-selection still works because mouse pointers are not handed to the shell.
4. Monaco mobile mode keeps line wrapping and does not expose horizontal file scrolling as the
   primary interaction.
5. The change ships with screenshot coverage and focused Monaco drag coverage.

## Risks And Mitigations

1. Risk: Monaco captures touch events before the wrapper can delegate them. Mitigation: integrate at
   the wrapper capture phase first and validate on a real Monaco fixture in Playwright.
2. Risk: mouse selection regresses. Mitigation: keep the helper touch-only and add focused test
   coverage for that behavior in the shared helper.
3. Risk: mobile layout still implies horizontal code scrolling. Mitigation: hide Monaco's horizontal
   scrollbar affordance on mobile and keep wrapping on.
4. Risk: the fixture depends on real project-file loading. Mitigation: render a standalone Monaco
   surface with an empty tree so the fixture stays stable.
