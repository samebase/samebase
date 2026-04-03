# CSV Table View Research

## Context

- `apps/noter/src/components/FileView.tsx` currently special-cases renderable
  repository media and markdown-style inline previews, but `.csv` files still
  fall through to the normal editor path.
- `apps/noter/src/components/CodeEditor.tsx` routes non-prose files into Monaco,
  so CSV currently opens as raw text.
- `apps/noter/convex/gitOperationsActions.ts` already recognizes `.csv` as
  `text/csv; charset=utf-8`, which means the missing piece is the frontend
  presentation layer rather than MIME detection.
- `apps/noter/package.json` does not currently include a CSV parser or table
  library.
- The repo already has explicit Monaco vs. ProseMark parity work in
  `apps/noter/e2e/file-view-code-parity.spec.ts` and
  `apps/noter/src/components/FileViewCodeParityVisualFixture.tsx`.

## Current Product Shape

- CSV files are editable today, but only as raw text in Monaco.
- Noter already has one precedent for file-type-specific rendering:
  `RepositoryMediaViewer` replaces the editor path for image and `.vox` files.
- The current FileView header is already busy. Any CSV solution that requires a
  large new global toolbar row will be harder to justify than a file-local
  surface toggle.
- Mobile editability matters here. If CSV table mode is read-only and raw mode
  still depends on Monaco, we preserve the current mobile weakness instead of
  fixing it.

## Options

### 1. Papa Parse plus a ProseMark-first CSV table editor

Add [`papaparse`](https://www.papaparse.com/docs) and build a small CSV-specific
table editor around the existing ProseMark/CodeMirror direction.

Why it fits:

- Papa Parse already handles delimiter detection, quoted fields,
  `skipEmptyLines`, row `preview` limits, and optional `worker` parsing.
- The repo already wants ProseMark to become the mobile-editable default, and
  the Monaco/ProseMark parity fixture exists specifically to make that switch
  safer.
- A repo-owned CSV editor keeps markup, styling, and mobile behavior aligned
  with the rest of Noter instead of importing a foreign grid system.
- We can keep raw CSV text as the persisted format while making the default
  interaction a table editor instead of a raw code editor.

Tradeoffs:

- Table editing is more work than a read-only viewer.
- We still need explicit limits so wide or very large CSV files fail closed
  instead of trying to render an enormous DOM surface.
- The implementation should stay CSV-specific. It should not pretend CSV is
  markdown just because it sits on the ProseMark/CodeMirror side of the app.

### 2. Papa Parse plus TanStack Table

Add [`papaparse`](https://www.papaparse.com/docs) and
[`@tanstack/react-table`](https://tanstack.com/table/latest/docs/installation).

Why it helps:

- TanStack Table already provides sorting, filtering, column sizing, visibility,
  and optional virtualization hooks.
- It is headless, so it would not force AG Grid-like visuals onto Noter.

Tradeoffs:

- This is more state and rendering code than the ProseMark-first path.
- The official docs call out a React Compiler caveat for the React adapter, and
  even though Noter is on React 18 today, that is still more integration surface
  than we need for an MVP editor.
- This path makes sense if we already know v1 needs richer grid features, not
  just a good editable CSV surface.

### 3. AG Grid

Add [`ag-grid-react`](https://www.ag-grid.com/react-data-grid/getting-started/).

Why it helps:

- AG Grid ships a large set of table features quickly.
- The official quick start shows a straightforward install, but it also expects
  `AgGridProvider`, module registration, and a grid-specific component model.

Tradeoffs:

- It is the heaviest option by far for a file-view improvement.
- The Community and Enterprise split is extra product and licensing surface that
  Noter does not need for "make CSV editable and pleasant on mobile".
- Styling and interaction defaults would pull FileView toward a standalone data
  app instead of keeping the current editor-first surface.

## Obsidian Precedent

Obsidian's official help currently says core supported file formats do not
include `.csv`, and that additional file formats come from community plugins.

- Accepted file formats:
  [help.obsidian.md/file-formats](https://help.obsidian.md/file-formats)
- Community plugins:
  [help.obsidian.md/community-plugins](https://help.obsidian.md/community-plugins)

The closest direct precedent is the community plugin
[`deathau/csv-obsidian`](https://github.com/deathau/csv-obsidian), whose README
describes viewing and editing CSV files in a spreadsheet-like table format.

That is the useful comparison point here: a custom CSV editing surface, not a
raw code editor with slightly nicer syntax colors.

## Recommendation

The easiest good solution is option 1:

- add `papaparse`
- keep the implementation frontend-only
- make the default CSV surface editable and ProseMark-first
- keep raw mode as an escape hatch rather than the primary path
- rely on the existing Monaco/ProseMark parity work to keep future switching
  practical

Concretely, the recommended MVP is:

1. Detect `.csv` files in `FileView`.
2. Default normal editor mode to an editable table surface instead of raw
   Monaco.
3. Add a small `Table` / `Raw` switch inside the file surface, not a new
   always-visible global header row.
4. Parse CSV in array mode so we preserve duplicate headers, ragged rows, and
   raw cell ordering.
5. Make table editing work on mobile through the ProseMark/CodeMirror path.
6. Render a sticky first row, row numbers, and scrollable columns.
7. Fall back to raw mode with a short inline explanation if parsing fails or the
   guardrails say "too large for table mode".

This keeps the patch small and avoids backend changes, staging changes, or
spreadsheet-app scope.

## Proposed MVP Boundaries

- Scope only `.csv` initially. Papa Parse can auto-detect delimiters, but the
  product request here is specifically about CSV.
- Table mode is for the standard editor route only.
- Existing compare, review, and rebase-conflict surfaces stay raw for v1.
- Allow direct cell editing, but do not add formulas, typed columns, or
  spreadsheet-only concepts.
- No new Convex schema or API work should be required.

## Why This Lives In `research/`

This document gathers the evidence and recommends the easiest implementation
shape, but it does not define the accepted product contract yet. The actual
proposal belongs in `rfcs/`.

## External References

- Papa Parse docs: [papaparse.com/docs](https://www.papaparse.com/docs)
- TanStack Table docs:
  [tanstack.com/table/latest/docs](https://tanstack.com/table/latest/docs)
- AG Grid React quick start:
  [ag-grid.com/react-data-grid/getting-started](https://www.ag-grid.com/react-data-grid/getting-started/)
- Obsidian accepted file formats:
  [help.obsidian.md/file-formats](https://help.obsidian.md/file-formats)
- Obsidian community plugins:
  [help.obsidian.md/community-plugins](https://help.obsidian.md/community-plugins)
- `csv-obsidian` plugin README:
  [github.com/deathau/csv-obsidian](https://github.com/deathau/csv-obsidian)
