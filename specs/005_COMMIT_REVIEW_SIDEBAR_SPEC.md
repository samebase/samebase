# 005 Commit Review Sidebar Spec

## Goal

Reduce duplicated file-path labels in commit review and make the sidebar the
single place for navigating staged changes.

## Current Problems

- The current file path is repeated in three places on mobile:
  - the page header
  - the in-panel staged files list
  - the active diff header
- The review screen has a second file-navigation surface even though the app
  already has a sidebar.
- Deleted files only become visible in review mode, and changed files are not
  consistently color-coded in the sidebar.

## Proposed UI

- Sidebar toggle becomes `Simple View`, `All Files`, and `Changes`.
- `Changes` mode shows only staged files, with folder parents auto-expanded so
  the changed files are immediately visible.
- Entering review mode auto-switches the sidebar to `Changes`.
  - Leaving review restores the previous `Simple View` or `All Files` selection
    if the user did not override it.
- The in-panel `Staged Files` list is removed from review mode.
- The review pane removes commit summary metadata such as branch name, file
  count, deletion summary, and per-file line counts.
- Markdown review keeps `Rich`, `Inline`, and `Patch` modes when rich preview is
  available.
  - `Inline` is a single editable rich markdown surface that shows additions in
    place and removed lines as non-editable red strikethrough blocks.
- The branch name moves into the standard file header above the file path so it
  is visible in editor and review mode for every branch.
- The diff header does not repeat the current file path.
  - The top page header remains the canonical path label.

## Sidebar Styling Rules

- Added files use the existing green review color.
- Modified files use the existing blue review color.
- Renamed files use the existing amber review color.
- Deleted files use the existing red review color and add a strikethrough.
- Deleted files remain visible in the sidebar while staged, not only inside the
  review layout.

## Scope

- Primarily frontend work.
- Small staging save support is allowed when required to make inline review
  edits persist.
- No commit-preview payload changes.
