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

## Current Product Shape

- CSV files are editable today, but only as raw text in Monaco.
- Noter already has one precedent for file-type-specific rendering:
  `RepositoryMediaViewer` replaces the editor path for image and `.vox` files.
- The current FileView header is already busy. Any CSV solution that requires a
  large new global toolbar row will be harder to justify than a file-local
  surface toggle.
- The easiest safe slice is a better viewing surface, not spreadsheet-style
  editing.

## Options

### 1. Papa Parse plus a repo-owned CSV table surface

Add [`papaparse`](https://www.papaparse.com/docs) and build a small
`CsvTableView` component in app code.

Why it fits:

- Papa Parse already handles delimiter detection, quoted fields,
  `skipEmptyLines`, row `preview` limits, and optional `worker` parsing.
- A repo-owned table keeps the markup, styling, and mobile behavior aligned with
  the rest of Noter instead of importing a foreign grid system.
- We can keep raw Monaco editing as the source of truth and treat the table as a
  read-only browsing surface.

Tradeoffs:

- Sorting, filtering, column resizing, and virtualization would be custom work
  if we want them later.
- We need to define explicit limits so wide or very large CSV files fail closed
  instead of trying to render an enormous DOM surface.

### 2. Papa Parse plus TanStack Table

Add [`papaparse`](https://www.papaparse.com/docs) and
[`@tanstack/react-table`](https://tanstack.com/table/latest/docs/installation).

Why it helps:

- TanStack Table already provides sorting, filtering, column sizing, visibility,
  and optional virtualization hooks.
- It is headless, so it would not force AG Grid-like visuals onto Noter.

Tradeoffs:

- This is more state and rendering code than the repo-owned-table path.
- The official docs call out a React Compiler caveat for the React adapter, and
  even though Noter is on React 18 today, that is still more integration surface
  than we need for an MVP viewer.
- This path makes sense if we already know v1 needs interactive table features,
  not just a readable CSV surface.

### 3. AG Grid

Add [`ag-grid-react`](https://www.ag-grid.com/react-data-grid/getting-started/).

Why it helps:

- AG Grid ships a large set of table features quickly.
- The official quick start shows a straightforward install, but it also expects
  `AgGridProvider`, module registration, and a grid-specific component model.

Tradeoffs:

- It is the heaviest option by far for a file-view improvement.
- The Community and Enterprise split is extra product and licensing surface that
  Noter does not need for "make CSV readable".
- Styling and interaction defaults would pull FileView toward a standalone data
  app instead of keeping the existing editor-first surface.

## Recommendation

The easiest good solution is option 1:

- add `papaparse`
- keep the implementation frontend-only
- make CSV table view read-only in v1
- preserve raw Monaco editing as the actual authoring path

Concretely, the recommended MVP is:

1. Detect `.csv` files in `FileView`.
2. Default normal editor mode to a table surface instead of raw Monaco.
3. Add a small `Table` / `Raw` switch inside the file surface, not a new
   always-visible global header row.
4. Parse CSV in array mode so we preserve duplicate headers, ragged rows, and
   raw cell ordering.
5. Render a sticky first row, row numbers, and scrollable columns.
6. Limit the viewer to a conservative preview slice so the browser never tries
   to paint an unbounded table.
7. Fall back to raw Monaco with a short inline explanation if parsing fails or
   the preview guardrails say "too large for table view".

This keeps the patch small and avoids backend changes, staging changes, or
spreadsheet-editing commitments.

## Proposed MVP Boundaries

- Scope only `.csv` initially. Papa Parse can auto-detect delimiters, but the
  product request here is specifically about CSV.
- Table view is for the standard editor route only.
- Existing compare, review, and rebase-conflict surfaces stay raw for v1.
- No inline cell editing, formulas, column types, or spreadsheet behaviors.
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
