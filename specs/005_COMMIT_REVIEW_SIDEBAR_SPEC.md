# 005 Commit Review Placement & Stable Sidebar Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/editor
- Last updated: 2026-03-25

## Summary

Commit review should reuse the existing file tree instead of introducing a review-specific
navigation mode.

The `Review Changes` entrypoint belongs at the top left of the text editor surface, not in the
top-right global action cluster. The sidebar must stay stable across simple editor, code editor, and
review mode.

The only missing navigation case worth adding is deleted files: they must be visible in the normal
tree in both editor variants as red crossed-out file entries.

Compare-only pull request files still follow that same review contract. If a PR diff can render in
the inline merge surface, it should expose the same inline controls (`Show patch`, `Inline diffs`,
`Side by side`, `Syntax deleted`) that staged review files use, and leaving review from that state
must return to the real editor surface for the selected file when that file still exists outside
compare mode.

When the editor is in compare-only Changed Files mode without staged changes, the same top-left slot
should offer `Back to Editor` to clear compare mode rather than showing a disabled `Review Changes`
control.

## Problem

The earlier commit-review sidebar direction over-rotated toward a dedicated `Changes` navigation
mode.

That creates UI motion without adding much value because the standard editor sidebar already shows
staged-file colors in the normal tree. The main thing a user still needs during review is reliable
visibility for deleted files, not a second sidebar mode.

## Goals

1. Make `Review Changes` feel attached to the editor itself.
2. Keep the repository sidebar visually and behaviorally stable while entering and leaving review.
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
- Anchor it to the editor header region, aligned with the left edge of the editor content rather
  than the right-side action cluster.
- When review is open, the return action (`Back to Editor` or equivalent) remains in the same
  location so the control does not jump around.
- Compare-only Changed Files mode reuses that same location for `Back to Editor` when the user is
  already in a PR diff surface and there is no staged review session to enter.

### 2. Stable sidebar

- The sidebar is the single file-navigation surface in editor mode and review mode.
- Do not add or keep a `Changes` sidebar mode for commit review.
- Do not auto-switch sidebar state when entering review.
- Keep the user’s normal sidebar mode and folder expansion state unchanged while review is open.
- The sidebar should look and behave the same in the simple editor, the code editor, and commit
  review.

### 3. Staged file status in the normal tree

- Keep using the standard file tree to surface staged status.
- Added files use the existing green review color.
- Modified files use the existing blue review color.
- Renamed files use the existing amber review color.
- Deleted files use the existing red review color and a crossed-out treatment.
- Deleted files must remain present in the stable tree while staged for deletion, even though they
  no longer exist in the repository snapshot.

### 4. Deleted file behavior

- Deleted files must be visible in both the simple editor tree and the code editor tree.
- Deleted files render as red crossed-out file entries.
- Deleted files remain selectable from the same tree as every other file.
- Selecting a deleted file opens the review/deleted-file presentation for that path instead of
  trying to open a normal editable text surface.

### 5. Review surface scope

- The review surface focuses on the currently selected file diff.
- Review mode should not introduce its own duplicate file navigation panel.
- Markdown review may keep its file-level rich/inline/patch presentation rules, but those controls
  live inside the review surface, not in the sidebar model.
- Compare-only PR files that can render in the inline merge surface use that same control strip
  instead of a separate PR-only diff chrome.
- The control strip may switch between unified inline diff, side-by-side before/after preview, and
  raw patch, but those modes stay within the same review panel.

### 6. Return-to-editor behavior

- `Back to Editor` always returns to the normal editor surface for the selected file when one
  exists.
- When review was opened from a compare-only PR diff, leaving review must also exit the compare-only
  diff surface instead of landing in a read-only compare preview for files that still exist in the
  normal editor tree.
- When the user is already in compare-only editor mode and no staged review is available,
  `Back to Editor` clears compare mode directly from that editor state.
- Deleted compare-only PR entries stay in compare mode when leaving review or leaving the
  compare-only editor surface because there is no normal editor target to reopen.
- The return action should preserve the selected file path while clearing only the review/compare
  state that prevented the normal editor from opening.

## Acceptance Criteria

- `Review Changes` appears at the top left of the text editor surface.
- Entering review does not change sidebar mode, toggle state, or folder expansion state.
- The sidebar stays consistent between simple editor, code editor, and review.
- Added, modified, and renamed files continue to appear with their existing colors in the normal
  tree.
- Deleted files appear in that same tree as red crossed-out entries.
- Compare-only PR files that render inline show the same inline control strip as staged review
  files.
- Side-by-side before/after preview remains available from that same control strip.
- Leaving review from a compare-only PR file opens the normal editor for that file instead of a
  read-only compare preview when the file still exists outside compare mode.
- Compare-only Changed Files mode without staged changes shows `Back to Editor` instead of a
  disabled `Review Changes` button when the selected compare row can reopen in the normal editor.
- Deleted compare-only PR rows keep compare mode active instead of redirecting to a different file.
- No review-only `Changes` mode or duplicate `Staged Files` panel is required for commit review.

## Implementation Notes

- This spec intentionally replaces the earlier `Changes`-mode direction for this area.
- The existing file tree already carries most staged-status semantics; the main requirement is to
  keep that tree authoritative and ensure deleted files are represented there.
- This spec complements `rfcs/037_EDITOR_COMMIT_DIFF_RELIABILITY_SPEC.md` by narrowing the
  commit-review navigation and placement rules without changing the broader preview-pipeline goals.
