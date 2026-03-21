# 005 Commit Review Placement & Stable Sidebar Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/editor
- Last updated: 2026-03-21

## Summary

Commit review should reuse the existing file tree instead of introducing a
review-specific navigation mode.

The `Review Changes` entrypoint belongs at the top left of the text editor
surface, not in the top-right global action cluster. The sidebar must stay
stable across simple editor, code editor, and review mode.

The only missing navigation case worth adding is deleted files: they must be
visible in the normal tree in both editor variants as red crossed-out file
entries.

## Problem

The earlier commit-review sidebar direction over-rotated toward a dedicated
`Changes` navigation mode.

That creates UI motion without adding much value because the standard editor
sidebar already shows staged-file colors in the normal tree. The main thing a
user still needs during review is reliable visibility for deleted files, not a
second sidebar mode.

## Goals

1. Make `Review Changes` feel attached to the editor itself.
2. Keep the repository sidebar visually and behaviorally stable while entering
   and leaving review.
3. Reuse the existing colored file tree for change navigation.
4. Ensure deleted files are visible and selectable from the same stable tree.

## Non-Goals

- Adding a review-only sidebar mode.
- Auto-switching sidebar state when review opens.
- Rendering a second in-panel `Staged Files` list.
- Redesigning the existing `Simple View` / `All Files` model.

## Product Decisions

### 1. `Review Changes` placement

- Show `Review Changes` at the top left of the text editor area.
- Anchor it to the editor header region, aligned with the left edge of the
  editor content rather than the right-side action cluster.
- When review is open, the return action (`Back to Editor` or equivalent)
  remains in the same location so the control does not jump around.

### 2. Stable sidebar

- The sidebar is the single file-navigation surface in editor mode and review
  mode.
- Do not add or keep a `Changes` sidebar mode for commit review.
- Do not auto-switch sidebar state when entering review.
- Keep the user’s normal sidebar mode and folder expansion state unchanged while
  review is open.
- The sidebar should look and behave the same in the simple editor, the code
  editor, and commit review.

### 3. Staged file status in the normal tree

- Keep using the standard file tree to surface staged status.
- Added files use the existing green review color.
- Modified files use the existing blue review color.
- Renamed files use the existing amber review color.
- Deleted files use the existing red review color and a crossed-out treatment.
- Deleted files must remain present in the stable tree while staged for
  deletion, even though they no longer exist in the repository snapshot.

### 4. Deleted file behavior

- Deleted files must be visible in both the simple editor tree and the code
  editor tree.
- Deleted files render as red crossed-out file entries.
- Deleted files remain selectable from the same tree as every other file.
- Selecting a deleted file opens the review/deleted-file presentation for that
  path instead of trying to open a normal editable text surface.

### 5. Review surface scope

- The review surface focuses on the currently selected file diff.
- Review mode should not introduce its own duplicate file navigation panel.
- Markdown review may keep its file-level rich/inline/patch presentation rules,
  but those controls live inside the review surface, not in the sidebar model.

## Acceptance Criteria

- `Review Changes` appears at the top left of the text editor surface.
- Entering review does not change sidebar mode, toggle state, or folder
  expansion state.
- The sidebar stays consistent between simple editor, code editor, and review.
- Added, modified, and renamed files continue to appear with their existing
  colors in the normal tree.
- Deleted files appear in that same tree as red crossed-out entries.
- No review-only `Changes` mode or duplicate `Staged Files` panel is required
  for commit review.

## Implementation Notes

- This spec intentionally replaces the earlier `Changes`-mode direction for this
  area.
- The existing file tree already carries most staged-status semantics; the main
  requirement is to keep that tree authoritative and ensure deleted files are
  represented there.
- This spec complements `specs/037_EDITOR_COMMIT_DIFF_RELIABILITY_SPEC.md` by
  narrowing the commit-review navigation and placement rules without changing
  the broader preview-pipeline goals.
