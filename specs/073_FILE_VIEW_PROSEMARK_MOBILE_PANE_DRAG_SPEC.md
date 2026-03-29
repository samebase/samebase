# 073 File View ProseMark Mobile Pane Drag Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/editor UX
- Last updated: 2026-03-30
- Depends on:
  - `apps/noter/src/components/WorkspaceSidebarShell.tsx`
  - `apps/noter/src/components/RepositoryWorkspaceFrame.tsx`
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/ProsemarkMergeEditor.tsx`
  - `apps/noter/src/components/ProsemarkReadOnly.tsx`
  - `apps/noter/src/components/sidebar.tsx`
  - `specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md`
  - `rfcs/073_INDEPENDENT_RIGHT_SIDEBAR_SPEC.md`

## Summary

On mobile, dragging horizontally from anywhere inside a FileView ProseMark main
surface should move the shared workspace carousel immediately.

This spec defines a narrow implementation slice:

1. support FileView's ProseMark-powered surfaces first,
2. make the gesture bidirectional so it works with both left and right sidebars,
3. preserve normal editor behavior when the gesture is vertical or tap-like,
4. leave Monaco and the plain code editor out of scope.

The rebased shell model matters here. Mobile is no longer a one-sidebar
open/closed drawer. It is a three-stop workspace carousel with `left`, `main`,
and `right` panes. The ProseMark behavior must participate in that existing
shell model rather than trying to reintroduce left-only drawer logic.

## Why

The current FileView behavior is inconsistent:

1. the main workspace shell supports live mobile dragging,
2. the same gesture can fail once the pointer starts inside a ProseMark editor
   surface,
3. users experience that as "dragging works in the main view except in
   ProseMark", even though ProseMark is part of the main view.

The earlier concern about right-sidebar support does not invalidate the feature.
It only changes the contract:

- dragging right from the main pane should reveal the left sidebar,
- dragging left from the main pane should reveal the right sidebar.

The other important correction is that ProseMark is not only a read-only viewer
in FileView. The editable markdown path uses `ProsemarkMergeEditor`, so the spec
must cover editable ProseMark behavior rather than treating this as a read-only
preview-only problem.

## Scope

### In scope

1. Mobile FileView surfaces backed by ProseMark.
2. `ProsemarkMergeEditor` when rendered as the FileView main editing surface.
3. FileView compare/preview ProseMark surfaces where parity is cheap and does
   not complicate the first slice.
4. Bidirectional handoff into the existing left/main/right workspace carousel.
5. A line-wrapped, no-horizontal-file-scroll contract for the ProseMark surfaces
   in scope.

### Out of scope

1. Monaco main-view drag support.
2. Plain code-editor main-view drag support.
3. Desktop changes.
4. Landing page, sign-in, chat bubble, or other non-FileView ProseMark usages.
5. Replacing the shell's current mobile settle model.

## Current State

### Shell

The rebased workspace shell now models mobile as a three-stop carousel:

- `left`
- `main`
- `right`

The shell computes pane anchors from both sidebar widths and settles to the
nearest pane based on `scrollLeft`.

Relevant implementation points:

- `WorkspaceSidebarShell` tracks mobile pane anchors and nearest-pane settling.
- `RepositoryWorkspaceFrame` renders both left and right sidebar triggers.
- `FileView` already mounts a right sidebar slot, even if the content is still a
  lightweight placeholder.

### FileView ProseMark

FileView uses two different ProseMark surfaces:

1. `ProsemarkMergeEditor` for editable markdown and merge/diff editing.
2. `ProsemarkReadOnly` for read-only inline compare and related rendering.

Important details:

- `ProsemarkMergeEditor` already opts into `EditorView.lineWrapping`.
- `ProsemarkReadOnly` does not explicitly add `EditorView.lineWrapping` today.
- `CodeEditor` is different: it has its own scroll model, including horizontal
  overflow behavior, which is exactly why this spec does not try to solve
  Monaco/plain code editor in the same change.

## Problem Statement

Inside ProseMark, the editor surface can win pointer/touch ownership before the
outer workspace shell gets to express its horizontal pan behavior.

That causes a broken mental model:

1. the main workspace looks horizontally draggable,
2. the user drags from a visible part of the main workspace,
3. the drag stops working because the gesture started on ProseMark content.

Now that mobile supports both left and right panes, a left-only fix would also
be wrong. The correct behavior is not "open the sidebar". It is "move the
current workspace pane horizontally in whichever direction the gesture is
traveling".

## Goals

1. Drag horizontally from anywhere inside FileView ProseMark surfaces on mobile.
2. Reuse the existing shell carousel instead of inventing editor-local pane
   state.
3. Support both drag directions so the main pane can move toward either sidebar.
4. Preserve vertical scroll, taps, focus, caret placement, and normal editing
   when the gesture is not clearly horizontal.
5. Guarantee that the ProseMark surfaces in scope do not need internal
   horizontal file scrolling.
6. Keep the first implementation slice ProseMark-only.

## Non-Goals

1. Full-surface drag parity for Monaco in the same patch.
2. A generic gesture engine for every CodeMirror surface in the repo.
3. New shell snap points or a different mobile pane state model.
4. Broad product changes to right-sidebar content.

## UX Contract

### Main behavior

On mobile, when the current pane is `main` and the gesture starts inside a
FileView ProseMark surface:

1. dragging right moves the workspace toward the left sidebar,
2. dragging left moves the workspace toward the right sidebar,
3. movement should feel immediate and continuous, matching the existing shell
   motion as closely as possible,
4. release should settle using the shell's existing nearest-pane behavior.

### Gesture classification

The editor should not surrender every pointer interaction to the shell. The
gesture must classify first.

Required contract:

1. a small slop threshold exists before classification,
2. if horizontal delta becomes dominant first, the gesture is treated as shell
   drag for the rest of that touch session,
3. if vertical delta becomes dominant first, the editor keeps normal behavior,
4. a tap or very short movement still behaves like normal editor interaction.

### Editing safety

Editable ProseMark must remain usable:

1. taps should still place the caret,
2. ordinary text selection should still work when the gesture is not classified
   as shell drag,
3. vertical movement inside tall content should still scroll vertically,
4. once a gesture is classified as shell drag, the shell wins for that gesture.

## Design Decisions

### 1. Bidirectional shell participation

This feature is defined in terms of the shell's existing left/main/right pane
model, not in terms of a single "open sidebar" action.

That means ProseMark should not contain left-specific logic such as:

- "if horizontal drag, open left sidebar"
- "if open, close to main"

Instead, ProseMark should delegate horizontal motion into the shell's current
carousel offset, and let the shell remain the source of truth for which pane is
nearest.

### 2. ProseMark-only first slice

The first implementation slice should target FileView ProseMark surfaces only.

Rationale:

1. `ProsemarkMergeEditor` already wraps lines and does not rely on horizontal
   code scrolling.
2. FileView's editable markdown path is the most important missing surface.
3. Monaco/plain code editor still has a stronger claim on horizontal editor
   behavior and should remain a separate decision.

### 3. Wrapped-line guarantee

The first slice assumes that the ProseMark surfaces in scope do not need
horizontal file scrolling.

Required contract:

1. lines wrap,
2. the user does not horizontally scroll file content inside these surfaces,
3. any future deviation from that rule requires an explicit follow-up decision
   before extending this feature.

For implementation, this means:

1. preserve `EditorView.lineWrapping` on `ProsemarkMergeEditor`,
2. add the same wrapping contract to `ProsemarkReadOnly` if it participates in
   the drag slice,
3. do not introduce an internal horizontal overflow affordance for these
   surfaces.

### 4. Shell-owned imperative bridge

The shell should stay responsible for actual pane motion.

To avoid editor components querying DOM ancestors ad hoc, the implementation
should add an app-owned bridge from `WorkspaceSidebarShell` to descendant
surfaces.

The bridge should expose only what editor surfaces need:

1. whether the current layout is a draggable mobile shell,
2. an imperative way to adjust mobile scroll position during an active
   horizontal gesture,
3. an imperative way to request settle-to-nearest-pane at gesture end if needed.

The editor components should not recreate shell anchor math or maintain their
own pane state.

### 5. Editor-surface delegation helper

The ProseMark behavior should live in a shared helper used by the ProseMark
components in scope.

Preferred shape:

1. a small hook or CodeMirror extension factory shared by `ProsemarkMergeEditor`
   and `ProsemarkReadOnly`,
2. mobile-only activation,
3. primary-touch/pointer only,
4. axis-lock behavior with a small classification threshold,
5. no dependency on document-level gesture listeners.

This is intentionally not a general-purpose gesture system. It is a narrow
delegation layer that lets ProseMark cooperate with the already-implemented
shell.

## Proposed Implementation

### Step 1. Add a shell drag bridge

Add an app-owned context or equivalent bridge inside
`WorkspaceSidebarShell.tsx`.

Responsibilities:

1. register the mobile scroll container once,
2. expose a narrow descendant API for horizontal drag delegation,
3. keep pane anchors and nearest-pane logic in the shell, not in editors.

Preferred bridge API shape:

- `isMobileShellDragAvailable`
- `dragMobileShellBy(deltaX: number)`
- `settleMobileShell()`

The exact names can differ, but the ownership boundary should remain the same.

### Step 2. Build ProseMark drag delegation

Create a shared helper for ProseMark surfaces.

Behavior:

1. watch the initial touch/pointer movement,
2. classify the gesture after a small threshold,
3. if horizontal wins, delegate movement to the shell bridge,
4. if vertical wins, let the editor keep normal behavior,
5. on end/cancel, ask the shell to settle if the gesture became shell drag.

The helper should be opt-in so FileView can enable it deliberately instead of
silently changing every existing ProseMark usage in the app.

### Step 3. Wire FileView editable ProseMark first

Enable the helper for `ProsemarkMergeEditor` in FileView's editable markdown
path first.

This is the minimum slice that fixes the real user problem:

- the main markdown editing surface in FileView should drag like the rest of the
  main pane.

### Step 4. Add read-only parity only if it stays simple

If the same helper works cleanly for `ProsemarkReadOnly` in FileView compare
surfaces, wire it there in the same patch.

If read-only parity complicates the first change materially, keep the shipped
scope to editable `ProsemarkMergeEditor` and track read-only parity as a
follow-up.

### Step 5. Make wrapping explicit

Lock in the wrapped-line contract for ProseMark surfaces in scope.

Required work:

1. keep `EditorView.lineWrapping` on `ProsemarkMergeEditor`,
2. add `EditorView.lineWrapping` to `ProsemarkReadOnly` if that component is in
   scope for the first patch,
3. verify no internal horizontal file scroll affordance remains on those
   surfaces.

## Testing Strategy

### Automated coverage

Add focused coverage that exercises the shipped behavior rather than a fixture-
only abstraction.

Required areas:

1. shell-level mobile pane movement still settles correctly left/main/right,
2. editable FileView ProseMark can drag toward the left sidebar from the main
   pane,
3. editable FileView ProseMark can drag toward the right sidebar from the main
   pane,
4. vertical dragging in editable ProseMark still behaves like vertical editor
   interaction rather than pane motion,
5. tap-to-focus or caret placement still works in editable ProseMark.

Preferred test shape:

1. a focused visual or interaction fixture that renders FileView with:
   - left sidebar,
   - main editable ProseMark surface,
   - right sidebar present,
2. Playwright coverage that performs real drag gestures on the ProseMark content
   area.

### Manual validation

Manual checks on mobile viewport should verify:

1. rightward drag from editable ProseMark reveals the left pane,
2. leftward drag from editable ProseMark reveals the right pane,
3. release snaps to a whole pane instead of resting between panes,
4. tapping still focuses the editor,
5. vertical drag still scrolls tall markdown content,
6. no horizontal file-content scrolling appears in the ProseMark surface.

## Acceptance Criteria

1. On mobile, a horizontal drag that starts inside FileView's editable ProseMark
   surface moves the shared workspace shell immediately.
2. The same surface can move toward either sidebar depending on drag direction.
3. Release settles through the shell's existing nearest-pane behavior.
4. Vertical interactions still feel like normal editor behavior.
5. Taps still focus or place the caret in editable ProseMark.
6. The first slice does not change Monaco/plain code editor behavior.

## Risks And Mitigations

1. Risk: horizontal-drag classification interferes with caret placement or text
   selection. Mitigation: use a small threshold and only commit to shell drag
   once horizontal dominance is clear.
2. Risk: editor code duplicates shell state or anchor logic. Mitigation: keep an
   explicit shell-owned drag bridge and forbid editor-local pane math.
3. Risk: read-only and editable ProseMark diverge. Mitigation: share one helper
   where possible and scope the first patch explicitly if parity is deferred.
4. Risk: the feature grows into a generic CodeMirror gesture framework.
   Mitigation: keep the first slice FileView ProseMark-only and leave Monaco out
   of scope.

## Follow-Ups

1. Decide whether FileView read-only ProseMark parity belongs in the first patch
   or an immediate follow-up.
2. Revisit Monaco/plain code editor only after ProseMark behavior is stable.
3. If the bridge proves clean, consider whether other main-pane markdown
   surfaces should opt in explicitly later.
