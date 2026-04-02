# 083 CSV Table View Spec

## Document Control

- Status: Proposed
- Owner: File view/editor
- Last updated: 2026-04-03
- Related docs:
  - `research/2026-04-03-csv-table-view.md`
  - `specs/069_GITHUB_MEDIA_UPLOADS_SPEC.md`
  - `specs/074_FILE_VIEW_MONACO_MOBILE_PANE_DRAG_SPEC.md`
- Proposed source of truth files:
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/CodeEditor.tsx`
  - `apps/noter/src/components/CsvTableView.tsx`
  - `apps/noter/src/lib/csvTable.ts`

## Why

CSV is one of the worst fits for a raw code editor when the file is wide enough
to matter.

Today Noter can technically open and edit `.csv` files, but the current Monaco
experience is much worse than the image and markdown-specific surfaces we
already provide elsewhere in FileView. The user request is not for a spreadsheet
app. It is for a readable table view that makes CSV files pleasant to inspect
without leaving the repo surface.

That makes the right solution a thin viewer on top of the existing raw editing
path, not a new file model.

## Summary

FileView should add a CSV-specific table renderer for `.csv` files.

The default FileView experience for a selected `.csv` file should be a read-only
table preview with a compact `Table` / `Raw` switch. Raw Monaco remains the
authoring surface and the source of truth for staging, saving, compare, and
commit behavior.

The first version should stay frontend-only:

1. no Convex schema changes
2. no GitHub API changes
3. no spreadsheet editing behavior
4. no table diff mode for review flows

## Problem

Current behavior has a gap between "supported" and "usable":

1. `guessMime` already recognizes `.csv`.
2. `FileView` only branches specially for renderable media and markdown preview
   paths.
3. `CodeEditorWrapper` sends non-prose files into Monaco.
4. Wide CSV files therefore open as plain text, which is hard to scan and wastes
   horizontal space.

This is especially awkward because CSV is usually consumed as tabular data, not
as line-oriented source code.

## Current State

### Existing file routing

- `FileView` already swaps the main surface based on file type.
- Images and `.vox` files use `RepositoryMediaViewer`.
- Markdown-heavy preview paths use `ProsemarkMergeEditor` or
  `ProsemarkReadOnly`.
- Everything else falls back to the normal editor path.

### Existing editor routing

- `CodeEditorWrapper` treats prose files as CodeMirror/ProseMark.
- Non-prose files use Monaco.
- `.csv` is currently just another Monaco-backed non-prose file.

### Existing dependency surface

- The app does not currently depend on a CSV parser or data-grid package.
- The recommended MVP should avoid introducing a heavyweight grid framework.

## Goals

1. Make `.csv` files readable inside FileView without leaving the repo route.
2. Keep the implementation small and frontend-only.
3. Preserve raw Monaco editing as the source of truth.
4. Avoid adding more default global FileView chrome than necessary.
5. Fail closed on malformed or oversized CSV previews.

## Non-Goals

1. Spreadsheet-style cell editing.
2. `.xlsx` or arbitrary spreadsheet file support.
3. Table-aware compare, review, or rebase-conflict rendering.
4. Server-side CSV indexing or structured persistence.
5. Shipping AG Grid-scale table features in the first slice.

## Behavior

### 1. Detect `.csv` files explicitly

Add a small shared file-type helper for CSV detection based on the selected file
path.

This spec intentionally scopes the first slice to `.csv` only.

### 2. Default normal CSV viewing to `Table`

When the selected file is `.csv` and FileView is in the normal editing route:

- the default surface is `Table`
- the table is read-only
- the raw file contents remain available through `Raw`

This is a viewing improvement, not a new editing model.

### 3. Use a compact `Table` / `Raw` switch

CSV files should render a small two-state switch near the top of the file
surface itself.

Requirements:

- keep the control local to CSV files
- do not add a new always-visible global FileView toolbar row
- preserve unrelated query params if the mode is encoded in the URL

Recommended route contract:

- use a key-only `?raw` query param
- no `?raw` means `Table`
- `?raw` means raw Monaco

This matches the repo preference for key-only boolean query params and keeps
deep links possible without inventing a new global persistence surface.

### 4. Table view is preview-oriented, not unbounded

The table renderer should be intentionally conservative:

- parse a bounded preview slice, not an unbounded document-sized table
- show a short hint that raw mode is the escape hatch for full editing
- fall back to raw mode when CSV preview is unavailable

The implementation should prefer a deterministic limit such as "render up to N
rows and M columns" over trying to be clever about huge files.

### 5. Preserve raw data shape while parsing

CSV preview should parse in array mode rather than object mode.

Why:

1. duplicate headers should not be rewritten for display
2. ragged rows should still render predictably
3. the source file should remain the authority rather than a transformed object
   model

The first row should render as the sticky header row in the preview surface.

### 6. Keep compare and review flows unchanged in v1

The CSV table renderer is for the normal editor route only.

These existing flows should keep their current raw behavior:

- commit review
- branch compare
- rebase conflict preview
- deleted-file review states

This keeps the first implementation small and avoids multiplying edge cases
across every FileView mode.

### 7. Raw Monaco remains the editing path

When the user switches to `Raw`, FileView should use the existing Monaco path.

This preserves:

- staging behavior
- autosave/collaboration behavior
- commit preview behavior
- existing Monaco mobile work

The table surface should never become a second editable source of truth in this
phase.

## Product Decisions

### Use Papa Parse, not a full grid framework

The recommended implementation uses Papa Parse for CSV parsing and a repo-owned
table surface for rendering.

Why:

1. it solves quoted fields and delimiter handling without backend work
2. it keeps the visual layer under Noter's control
3. it avoids AG Grid-sized scope for a file-view improvement

### Do not add TanStack Table in v1

TanStack Table is a good follow-up option if we later want sorting, filtering,
or column-level controls.

It is not the easiest first step, because the user request is primarily about
readability, not data-grid power.

### No CSV-specific persistence surface

Do not add Convex-backed UI preference state for CSV mode.

Why:

1. the repo already prefers lightweight query param contracts for shareable
   state
2. `Table` is the default and `Raw` is the explicit escape hatch
3. a device-synced CSV mode preference would add product surface without solving
   the core readability problem

## Implementation Notes

1. Add `papaparse` to `apps/noter/package.json`.
2. Add a small CSV helper module that:
   - detects `.csv`
   - parses bounded preview rows
   - normalizes ragged rows for display
3. Add `CsvTableView.tsx` as a repo-owned read-only component.
4. Extend `FileView` to route `.csv` files to the CSV surface in normal editor
   mode.
5. Reuse the shared query param helpers if the mode switch uses `?raw`.
6. Keep `CodeEditorWrapper` and Monaco as the raw-mode path.
7. Add a narrow visual fixture for the shipped CSV table state.

## Acceptance Criteria

1. Selecting a `.csv` file in normal FileView opens a table surface by default.
2. The CSV surface includes a visible way to switch to raw Monaco.
3. Switching to raw preserves the existing editing path instead of creating a
   second editor implementation.
4. Review, compare, and rebase-conflict flows for CSV remain on their current
   raw/patch surfaces.
5. Oversized or invalid CSV previews fail closed into raw mode with a short
   explanation.
6. The implementation does not require Convex schema or GitHub API changes.

## Validation

1. Add helper tests for CSV detection and bounded preview parsing.
2. Add a focused FileView test that covers:
   - default CSV table rendering
   - `?raw` switching
   - raw fallback on preview failure
3. Add screenshot coverage for the shipped CSV table surface.
4. Run the relevant file-view test suite and the visual coverage touched by the
   new renderer.

## Follow-Up

- Add optional sorting or filtering only after the base read-only surface ships
  and proves useful.
- Consider `.tsv` only after the `.csv` contract feels solid.
- Revisit TanStack Table if the product later wants richer interactions without
  jumping to a heavyweight grid.
