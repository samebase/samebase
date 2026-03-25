# Mobile Editor History Controls Specification

## Document Control

- Status: Proposed
- Owner: Noter frontend/editor UX
- Last updated: 2026-03-26

## Summary

Expose mobile-first editor history controls so file editing does not depend on a
hardware keyboard.

This change adds visible `Undo` and `Redo` controls for editable file surfaces
on mobile, backed by the native history implementation of the active editor:

1. CodeMirror/ProseMark files use CodeMirror history.
2. Monaco-backed files use Monaco model history.
3. Desktop keyboard behavior remains unchanged.

## Problem Statement

Today the editor relies on keyboard shortcuts such as `Cmd+Z` and `Shift+Cmd+Z`
for history navigation. That works on desktop, but on phones the same actions
are awkward or unavailable.

Literal `<` and `>` keybindings are not a good substitute because they collide
with real text entry in code and markdown files.

## Goals

1. Make undo/redo reachable on mobile with visible controls.
2. Keep desktop behavior unchanged.
3. Reuse each editor's existing history model instead of inventing a separate
   cross-editor stack.
4. Disable controls when the current editor cannot move further backward or
   forward.

## Non-Goals

1. Full Neovim-style undo-tree traversal UI.
2. Shared history across file switches.
3. New global keyboard shortcuts that repurpose printable characters.
4. Persisted user preferences for control placement.

## History Model

Neovim documents undo as a tree of text states, where `u` and `CTRL-R` move on
the current branch and `g-` / `g+` can traverse older or newer text states
across branches.

For this pass, Noter should expose the active editor's native undo/redo behavior
directly:

1. `Undo` means the same action as the editor's existing `Cmd+Z`.
2. `Redo` means the same action as the editor's existing `Shift+Cmd+Z`.
3. If a fresh edit clears redo in the current editor, the mobile control should
   reflect that immediately.

This keeps semantics predictable and avoids layering a second history system on
top of CodeMirror and Monaco.

## UI Behavior

### Placement

1. Controls appear in the repository workspace header on mobile only.
2. Controls are visible only when the primary surface is an editable file
   editor.
3. Review, compare, graph, media, and preview-only surfaces do not show the
   controls.

### Interaction

1. The left control triggers `Undo`.
2. The right control triggers `Redo`.
3. Disabled state reflects whether the current editor can move in that
   direction.
4. Triggering a control keeps focus in the active editor when possible.

## Source of Truth Files

- `apps/noter/src/components/FileView.tsx`
- `apps/noter/src/components/CodeEditor.tsx`
- `apps/noter/src/components/MonacoEditor.tsx`
- `apps/noter/src/components/EditorHistoryControls.tsx`
- `apps/noter/src/lib/editorHistory.ts`

## Implementation Plan

1. Add a small shared `EditorHistoryControls` component for the mobile header.
2. Add a typed editor-history bridge so `FileView` can receive:
   - the current `canUndo` / `canRedo` state
   - imperative `undo` / `redo` handlers for the active editor
3. Wire CodeMirror-backed editors to report history availability from the
   CodeMirror history extension.
4. Wire Monaco-backed editors to report history availability from the Monaco
   model.
5. Render the controls in `FileView` only when the editable editor surface is
   active on mobile.
6. Add at least one mobile screenshot fixture covering the shipped UI.

## Validation Checklist

Mobile viewport:

1. Editable markdown file shows enabled `Undo` after a local edit.
2. Editable markdown file shows enabled `Redo` after undo.
3. Editable Monaco file shows the same behavior.
4. Switching to compare/review/media/graph removes the controls.

Desktop viewport:

1. Existing editor keyboard shortcuts still work.
2. No new controls appear in desktop header layout.

## Acceptance Criteria

1. Mobile users can trigger undo/redo without a hardware keyboard.
2. The controls mirror the native history availability of the active editor.
3. Desktop layout and keyboard shortcuts remain unchanged.
4. A screenshot test covers the new mobile control surface.
