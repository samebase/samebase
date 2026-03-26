# Mobile Editor History Controls Specification

## Document Control

- Status: Proposed
- Owner: Noter frontend/editor UX
- Last updated: 2026-03-26

## Summary

Expose mobile-first history controls so text editing in Noter does not depend on
a hardware keyboard.

This change adds visible `Undo` and `Redo` controls for mobile text-entry
surfaces, backed by the native history implementation of the active editor or
input:

1. CodeMirror/ProseMark files use CodeMirror history.
2. Monaco-backed files use Monaco model history.
3. Shared chat composers use the history model of the active input:
   - ProseMark chat uses CodeMirror history.
   - Simple textarea chat uses a linear local undo/redo stack.
4. Desktop keyboard behavior remains unchanged.

## Problem Statement

Today Noter relies on keyboard shortcuts such as `Cmd+Z` and `Shift+Cmd+Z` for
history navigation. That works on desktop, but on phones the same actions are
awkward or unavailable across both file editing and chat composition.

Literal `<` and `>` keybindings are not a good substitute because they collide
with real text entry in code and markdown files.

## Goals

1. Make undo/redo reachable on mobile with visible controls.
2. Keep desktop behavior unchanged.
3. Reuse each editor/input's existing history model when available instead of
   inventing a separate cross-editor stack.
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

For this pass, Noter should expose the active surface's undo/redo behavior
directly:

1. `Undo` means the same action as the editor's existing `Cmd+Z`.
2. `Redo` means the same action as the editor's existing `Shift+Cmd+Z`.
3. If a fresh edit clears redo in the current editor, the mobile control should
   reflect that immediately.
4. When a shared chat composer is using the simple textarea mode, keep a local
   linear undo/redo stack scoped to that draft.

This keeps semantics predictable and avoids layering a second history system on
top of CodeMirror and Monaco.

## UI Behavior

### Placement

1. File-editor controls appear in the repository workspace header on mobile
   only.
2. Chat-composer controls appear inside the shared chat input action cluster on
   mobile only.
3. File controls are visible only when the primary surface is an editable file
   editor.
4. Review, compare, media, and preview-only surfaces do not show file-history
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
- `apps/noter/src/components/ChatInput.tsx`
- `apps/noter/src/components/EditorHistoryControls.tsx`
- `apps/noter/src/lib/editorHistory.ts`

## Implementation Plan

1. Add a small shared `EditorHistoryControls` component for mobile history UI.
2. Add a typed editor-history bridge so `FileView` can receive:
   - the current `canUndo` / `canRedo` state
   - imperative `undo` / `redo` handlers for the active editor
3. Wire CodeMirror-backed editors to report history availability from the
   CodeMirror history extension.
4. Wire Monaco-backed editors to report history availability from the Monaco
   model.
5. Render file controls in `FileView` only when the editable editor surface is
   active on mobile.
6. Render chat controls from the shared `ChatInput` so both editor chat and
   graph chat reuse the same mobile behavior.
7. Add mobile screenshot coverage for the shipped file and chat surfaces.

## Validation Checklist

Mobile viewport:

1. Editable markdown file shows enabled `Undo` after a local edit.
2. Editable markdown file shows enabled `Redo` after undo.
3. Editable Monaco file shows the same behavior.
4. Mobile chat composer shows the same controls and history availability.
5. Switching to compare/review/media/graph removes file-history controls.

Desktop viewport:

1. Existing editor keyboard shortcuts still work.
2. No new controls appear in desktop header layout.

## Acceptance Criteria

1. Mobile users can trigger undo/redo in file editors and chat composers without
   a hardware keyboard.
2. The controls mirror the native history availability of the active editor or
   input.
3. Desktop layout and keyboard shortcuts remain unchanged.
4. Screenshot coverage exists for the shipped mobile control surfaces.
