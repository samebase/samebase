# 083 CSV Table View Spec

## Document Control

- Status: Proposed
- Owner: File view/editor
- Last updated: 2026-04-03
- Related docs:
  - `research/2026-04-03-csv-table-view.md`
  - `specs/069_GITHUB_MEDIA_UPLOADS_SPEC.md`
  - `specs/074_FILE_VIEW_MONACO_MOBILE_PANE_DRAG_SPEC.md`
  - `apps/noter/e2e/file-view-code-parity.spec.ts`
  - `apps/noter/src/components/FileViewCodeParityVisualFixture.tsx`
- Proposed source of truth files:
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/CodeEditor.tsx`
  - `apps/noter/src/components/CsvTableEditor.tsx`
  - `apps/noter/src/lib/csvTable.ts`

## Why

CSV is one of the worst fits for a raw code editor when the file is wide enough
to matter.

Today Noter can technically open and edit `.csv` files, but the current Monaco
experience is much worse than the image and markdown-specific surfaces we
already provide elsewhere in FileView. The user request is not for a spreadsheet
app. It is for an editable table view that makes CSV files pleasant to inspect
and modify without leaving the repo surface.

The product direction here is also not "keep Monaco default until some later
editor migration." The repo already has explicit Monaco/ProseMark parity work so
ProseMark can become the mobile-editable default without permanently giving up
the ability to switch back.

That makes the right solution a CSV-specific table editor on the ProseMark path,
not a read-only viewer bolted onto a Monaco-first workflow.

## Summary

FileView should add a CSV-specific table renderer for `.csv` files.

The default FileView experience for a selected `.csv` file should be an
editable, ProseMark-first table surface with a compact `Table` / `Raw` switch.
Raw mode can stay as the escape hatch, but it should not remain the primary
authoring path for CSV on mobile.

The first version should stay frontend-only:

1. no Convex schema changes
2. no GitHub API changes
3. no spreadsheet-app features beyond direct table editing
4. no table diff mode for review flows

## Problem

Current behavior has a gap between "supported" and "usable":

1. `guessMime` already recognizes `.csv`.
2. `FileView` only branches specially for renderable media and markdown preview
   paths.
3. `CodeEditorWrapper` sends non-prose files into Monaco.
4. Wide CSV files therefore open as plain text, which is hard to scan and wastes
   horizontal space.
5. Leaving Monaco as the primary path keeps CSV editing weak on mobile even if
   we add a nicer read-only view beside it.

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

### Existing parity safety net

- The repo already has a dedicated Monaco vs. ProseMark parity fixture and test.
- That matters because CSV can move onto the ProseMark path now without turning
  Monaco into a one-way dead end.

## Goals

1. Make `.csv` files readable inside FileView without leaving the repo route.
2. Keep the implementation small and frontend-only.
3. Make CSV editing work through the mobile-friendly ProseMark path by default.
4. Preserve the ability to compare against Monaco behavior and switch later if
   needed.
5. Avoid adding more default global FileView chrome than necessary.
6. Fail closed on malformed or oversized CSV tables.

## Non-Goals

1. Spreadsheet formulas, typed columns, or Excel-like computation features.
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
- the table is editable
- the raw file contents remain available through `Raw`

This is still a text-backed editing model. The file on disk remains CSV text.

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

### 4. Table mode should be editable, but still fail closed on oversized files

The table renderer should be intentionally conservative:

- make normal-sized CSV files editable in table mode
- show a short hint that raw mode is the escape hatch for very large files
- fall back to raw mode when CSV table mode is unavailable

The implementation should prefer deterministic limits such as "up to N rows and
M columns can use table mode" over trying to be clever about huge files.

### 5. Preserve raw data shape while parsing

CSV table mode should parse in array mode rather than object mode.

Why:

1. duplicate headers should not be rewritten for display
2. ragged rows should still render predictably
3. the source file should remain the authority rather than a transformed object
   model

The first row should render as the sticky header row in the table surface.

### 6. Keep compare and review flows unchanged in v1

The CSV table renderer is for the normal editor route only.

These existing flows should keep their current raw behavior:

- commit review
- branch compare
- rebase conflict preview
- deleted-file review states

This keeps the first implementation small and avoids multiplying edge cases
across every FileView mode.

### 7. Raw mode is the fallback, not the primary authoring path

When the user switches to `Raw`, FileView can continue to use the existing
Monaco path in the short term.

This preserves:

- staging behavior
- commit preview behavior
- a known fallback for oversized or malformed CSVs
- the ability to compare output against the parity harness

However, the default contract for CSV should be that table mode is the normal
editable surface.

## Product Decisions

### Use Papa Parse with a ProseMark-first CSV editor

The recommended implementation uses Papa Parse for CSV parsing and a repo-owned
CSV table editor on the ProseMark/CodeMirror path.

Why:

1. it solves quoted fields and delimiter handling without backend work
2. it lines up with the repo's mobile-editable direction
3. it keeps the visual layer under Noter's control
4. it avoids AG Grid-sized scope for a file-view improvement

### Treat Monaco/ProseMark parity as an enabler, not a blocker

The existing parity fixture should be used to make a ProseMark-default CSV
surface safer to ship.

It should not be read as a reason to keep Monaco as the primary CSV experience.

### Do not add TanStack Table in v1

TanStack Table is a good follow-up option if we later want sorting, filtering,
or column-level controls.

It is not the easiest first step, because the user request is primarily about
editable mobile-friendly CSV tables, not data-grid power.

### No CSV-specific persistence surface

Do not add Convex-backed UI preference state for CSV mode.

Why:

1. the repo already prefers lightweight query param contracts for shareable
   state
2. `Table` is the default and `Raw` is the explicit escape hatch
3. a device-synced CSV mode preference would add product surface without solving
   the core readability and mobile-editing problem

### Obsidian-style precedent is "custom CSV editor," not "pretend CSV is markdown"

Obsidian's official help says CSV is not a core accepted file format and points
to community plugins for extra file types. A community plugin,
`deathau/csv-obsidian`, explicitly provides spreadsheet-like CSV viewing and
editing.

That precedent supports building a dedicated CSV editor surface rather than
trying to keep CSV as plain text with nicer theming.

## Implementation Notes

1. Add `papaparse` to `apps/noter/package.json`.
2. Add a small CSV helper module that:
   - detects `.csv`
   - parses CSV text into editable table rows
   - normalizes ragged rows for display
   - serializes edited rows back to CSV text
3. Add `CsvTableEditor.tsx` as a repo-owned editable component.
4. Extend `FileView` to route `.csv` files to the CSV surface in normal editor
   mode.
5. Reuse the shared query param helpers if the mode switch uses `?raw`.
6. Keep `CodeEditorWrapper` and Monaco as the raw-mode fallback path.
7. Add or extend parity coverage so the CSV work continues to fit the
   Monaco/ProseMark migration strategy.
8. Add a narrow visual fixture for the shipped CSV table state.

## Acceptance Criteria

1. Selecting a `.csv` file in normal FileView opens a table surface by default.
2. The CSV table surface is editable on mobile-friendly ProseMark defaults.
3. The CSV surface includes a visible way to switch to raw mode.
4. Switching to raw preserves the existing fallback path instead of creating a
   second persistence model.
5. Review, compare, and rebase-conflict flows for CSV remain on their current
   raw/patch surfaces.
6. Oversized or invalid CSV tables fail closed into raw mode with a short
   explanation.
7. The implementation does not require Convex schema or GitHub API changes.

## Validation

1. Add helper tests for CSV detection, parsing, and table serialization.
2. Add a focused FileView test that covers:
   - default editable CSV table rendering
   - `?raw` switching
   - raw fallback on table-mode failure
3. Add screenshot coverage for the shipped CSV table surface.
4. Keep the Monaco/ProseMark parity coverage green after the CSV changes.
5. Run the relevant file-view test suite and the visual coverage touched by the
   new renderer.

## Follow-Up

- Add optional sorting or filtering only after the base editable surface ships
  and proves useful.
- Consider `.tsv` only after the `.csv` contract feels solid.
- Revisit TanStack Table if the product later wants richer interactions without
  jumping to a heavyweight grid.
