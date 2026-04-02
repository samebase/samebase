# GitLens Commit Graph UI Research

## Goal

Figure out what it would take to reproduce the GitLens commit graph UI shown in
the April 2, 2026 screenshot, with special attention to the "tree" portion.

The short version: yes, the graph is the hardest part, but it is not the only
hard part. The screenshot is not a file tree. It is a commit DAG projected into
stable horizontal lanes, wrapped in a virtualized table/grid with rich ref
badges, async enrichment, and persistent column behavior.

## Executive Summary

- The easy part is the table chrome:
  - headers
  - row selection styling
  - commit message / author / date / SHA columns
  - file-count plus green/red change bars
- The medium part is the ref and badge system:
  - local branch pills
  - current-branch styling
  - remote/tag/worktree icons
  - `+N` overflow compaction
  - author avatar vs text collapse when columns get narrow
- The hard part is the graph engine:
  - commit DAG lane assignment
  - stable lane colors
  - merge rendering
  - compact vs default graph layout
  - keeping graph lines correct under pagination and virtualization
- GitLens itself does not implement this as ordinary app rows. In the current
  public source, it streams `GitGraphRow` data into a dedicated
  `@gitkraken/gitkraken-components` `GraphContainer`, which handles the heavy UI
  work.
- In Noter, the safest path is:
  1. build a static visual fixture first
  2. implement a row-virtualized table with a row-level SVG graph column
  3. wire live Git data only after the visuals and lane model are stable

## What The Screenshot Actually Contains

Visible columns:

- `BRANCH / TAG`
- `GRAPH`
- `COMMIT MESSAGE`
- `AUTHOR`
- `CHANGES`
- `COMMIT DATE / TIME`
- `SHA`

Visible behaviors in the screenshot:

- selected row highlight across the full width
- branch/tag pills aligned to specific commit rows
- current branch pill treatment on `main`
- graph nodes rendered as author avatars inside colored circles
- colored vertical and curved connecting lines between commits
- multiple simultaneous lanes
- relative date labels like `3 minutes ago`
- abbreviated SHA values
- file-count plus additions/deletions bars in the `CHANGES` column

Important correction:

- The hard part is not a "tree" in the filesystem sense.
- It is a directed acyclic graph of commits.
- A convincing clone needs a graph lane allocator, not a nested tree widget.

## What GitLens Source Confirms

### 1. GitLens models graph rows as enriched commit rows

The public GitLens source defines a `GitGraphRow` with:

- `sha`
- `parents`
- `author`
- `email`
- `date`
- `message`
- `type`
- `heads`
- `remotes`
- `tags`
- `stats`
- `reachableFromBranches`

Source:

- [packages/git/src/models/graph.ts](https://github.com/gitkraken/vscode-gitlens/blob/5e0e8b8cfce0ed8967d844900742ce8a9404a284/packages/git/src/models/graph.ts)

Why this matters:

- the UI does not derive everything from raw `git log` text in the browser
- rows are already normalized into a graph-aware view model before rendering

### 2. GitLens builds graph rows from Git CLI history, not from UI state

The CLI provider uses Git history plus explicit ordering and enrichment:

- `git log`
- `--all`
- `--topo-order` or other configured ordering
- commit parents
- ref decorations
- author data
- deferred stats loading

Source:

- [packages/git-cli/src/providers/graph.ts](https://github.com/gitkraken/vscode-gitlens/blob/5e0e8b8cfce0ed8967d844900742ce8a9404a284/packages/git-cli/src/providers/graph.ts)
- [packages/git-cli/src/parsers/logParser.ts](https://github.com/gitkraken/vscode-gitlens/blob/5e0e8b8cfce0ed8967d844900742ce8a9404a284/packages/git-cli/src/parsers/logParser.ts)

Important implementation detail:

- GitLens can defer `rowsStats` into a second pass instead of blocking the
  entire graph on additions/deletions data.

That is a useful pattern for Noter too, because the `CHANGES` column is nice to
have but should not delay first paint.

### 3. GitLens enriches rows after history parsing

GitLens has a row processor that:

- attaches branch/tag/remote contexts
- groups refs
- populates avatar data
- annotates current-user rows
- formats message content

Source:

- [src/git/graphRowProcessor.ts](https://github.com/gitkraken/vscode-gitlens/blob/5e0e8b8cfce0ed8967d844900742ce8a9404a284/src/git/graphRowProcessor.ts)

This is another strong signal that the screenshot is the result of a multi-step
pipeline:

1. read Git history
2. compute/enrich row metadata
3. render via a specialized graph/grid component

### 4. GitLens hands rendering to a dedicated graph component

The React wrapper passes rows, columns, stats, avatars, scroll markers,
selection state, and interaction handlers into `GraphContainer` from
`@gitkraken/gitkraken-components`.

Source:

- [src/webviews/apps/plus/graph/graph-wrapper/gl-graph.react.tsx](https://github.com/gitkraken/vscode-gitlens/blob/5e0e8b8cfce0ed8967d844900742ce8a9404a284/src/webviews/apps/plus/graph/graph-wrapper/gl-graph.react.tsx)

This is the biggest architectural takeaway from the research:

- GitLens is not painting this UI with a handful of plain React rows.
- There is a dedicated graph/table renderer sitting underneath the product UI.

### 5. GitLens supports persistent column layouts and compact graph mode

The current source contains both default and compact column presets:

- default:
  - `ref: 130`
  - `graph: 150`
  - `message: 300`
  - `author: 130`
  - `changes: 200`
  - `datetime: 130`
  - `sha: 130`
- compact:
  - `ref: 32`
  - `graph: 150`
  - `author: 32`
  - `message: 500`
  - `changes: 200`
  - `datetime: hidden`
  - `sha: 130`

Source:

- [src/webviews/plus/graph/graphWebview.ts](https://github.com/gitkraken/vscode-gitlens/blob/5e0e8b8cfce0ed8967d844900742ce8a9404a284/src/webviews/plus/graph/graphWebview.ts)

Why this matters:

- the graph is designed as a configurable data grid, not a fixed layout
- if we want "copy this UI" rather than "roughly evoke it", column behavior is
  part of the feature

## What Public GitLens Docs Confirm

GitKraken's current public docs and release notes line up with the screenshot:

- the Commit Graph supports customizable layouts and reorderable/hideable
  columns
- there is a compact graph column mode
- the author column can collapse to avatars only
- the changes column is explicitly meant to show size at a glance

Sources:

- [GitKraken Commit Graph feature page](https://www.gitkraken.com/features/commit-graph)
- [GitLens release notes](https://help.gitkraken.com/gitlens/gitlens-release-notes-current/)

These docs matter because they tell us which visible behaviors are product
features rather than accidents of one screenshot.

## What Noter Already Has That We Can Reuse

Good reusable pieces:

- shared workspace shell
  - [apps/noter/src/components/workspace-layout/RepositoryWorkspaceFrame.tsx](../apps/noter/src/components/workspace-layout/RepositoryWorkspaceFrame.tsx)
  - [apps/noter/src/components/workspace-layout/WorkspaceSidebarShell.tsx](../apps/noter/src/components/workspace-layout/WorkspaceSidebarShell.tsx)
- existing sidebar resize and shell behavior
- visual-fixture route infrastructure
  - [apps/noter/src/visualFixture.tsx](../apps/noter/src/visualFixture.tsx)
- Playwright screenshot pipeline
  - [apps/noter/e2e/machines-workspace-visual.spec.ts](../apps/noter/e2e/machines-workspace-visual.spec.ts)
- prior machine-root sidebar work and view-model patterns
  - [research/2026-04-02-machines-machine-root-sidebar.md](./2026-04-02-machines-machine-root-sidebar.md)
  - [apps/noter/src/lib/machinesWorkspaceSidebar.ts](../apps/noter/src/lib/machinesWorkspaceSidebar.ts)
  - [apps/noter/src/components/MachinesWorkspaceView.tsx](../apps/noter/src/components/MachinesWorkspaceView.tsx)

Things that are not meaningfully reusable for this specific UI:

- `FileTree`
  - it solves nested folders, not commit DAG lanes
- `AgentGraphView`
  - it uses ReactFlow for free-positioned nodes, not dense timeline rows
- existing thread browser rows
  - useful for styling patterns, not for graph math

## What Noter Does Not Yet Have

- a virtualized grid/list surface for dense history rows
- a commit graph lane allocator
- a Git history view-model specialized for refs, parents, and per-row stats
- column width / order persistence for a graph table
- a route or component specifically meant for repository history exploration

This means a faithful implementation is not "just styling".

## Data Pipeline We Would Need

### Option A: Machine-local Git CLI adapter

Best fit if this UI is meant to inspect live connected-machine repos.

What we would fetch:

- commit SHA
- parent SHAs
- author name and email
- author or committer timestamp
- subject or full message
- ref decorations
- optionally changed-file counts and additions/deletions

Recommended first-pass shape:

```ts
type GitCommitGraphRow = {
  sha: string
  parents: string[]
  authorName: string
  authorEmail: string
  dateMs: number
  message: string
  refs: GraphRefBadge[]
  stats?: {
    files: number
    additions: number
    deletions: number
  }
}
```

Likely CLI strategy:

- first pass:
  - `git log --all --topo-order --format=...`
- second pass:
  - `git log --all --topo-order --numstat --format=...`

Why I would prefer this for a machine-centric surface:

- exact parity with the machine's real repository state
- no need to reimplement history walking when native Git is available
- easier to match GitLens behavior around refs and ordering

### Option B: Convex / `isomorphic-git` adapter

Best fit if the UI should work against repos Noter already cloned or hydrated on
the backend.

Relevant current repo signal:

- Noter already uses `isomorphic-git` in Convex actions:
  - [apps/noter/convex/gitOperationsActions.ts](../apps/noter/convex/gitOperationsActions.ts)

Relevant external docs:

- [`isomorphic-git` `log`](https://isomorphic-git.org/docs/en/log.html)
- [`isomorphic-git` overview](https://isomorphic-git.org/en/)

Pros:

- no dependency on machine-local shell commands
- consistent backend-controlled shape
- works well when the repo is already cloned in Node

Cons:

- the current repo usage is file-oriented, not graph-view-oriented
- we would still need to build ref enrichment and lane layout ourselves
- performance on large histories needs deliberate caching and batching

My recommendation:

- if this is for connected machines, prefer Option A first
- if this is for vault-hosted repos in Convex, Option B is viable but needs a
  dedicated graph data service

## The Hard Part: The Graph Engine

This is the real core of the problem.

### The graph is a lane allocator, not a nested tree

To render something like the screenshot, we need to convert ordered commits into
per-row drawing instructions.

Each row needs:

- the lane index of the commit node
- incoming vertical lines from child rows
- outgoing lines to each parent
- curved joins where a line changes lane
- merge-node treatment when a commit has multiple parents
- color identity that stays stable enough for humans to track branch flow

### Minimal lane-allocation strategy

Given commits in reverse chronological topological order:

1. Keep a map of `pendingCommitSha -> laneIndex`.
2. When a row is rendered:
   - if its `sha` already has a lane, reuse that lane
   - otherwise assign the leftmost free lane
3. Keep secondary parent lanes alive so future rows know where their incoming
   lines originate.
4. Release lanes once no future visible row needs them.
5. Emit row drawing segments from the active-lane state before and after the
   current commit.

The row render data can look like:

```ts
type GraphLaneSegment =
  | { kind: 'vertical'; lane: number; color: string }
  | { kind: 'curve-left'; fromLane: number; toLane: number; color: string }
  | { kind: 'curve-right'; fromLane: number; toLane: number; color: string }
  | { kind: 'horizontal'; fromLane: number; toLane: number; color: string }

type GraphRowLayout = {
  commitLane: number
  nodeColor: string
  segmentsAbove: GraphLaneSegment[]
  segmentsThrough: GraphLaneSegment[]
  segmentsBelow: GraphLaneSegment[]
}
```

### Why this is harder than it looks

- merges make a row depend on future lane occupancy
- branch labels need to sit beside the correct row without colliding with graph
  geometry
- compact mode changes how much horizontal room the graph gets
- pagination means the top and bottom edges of the current page still need graph
  continuity
- virtualization means offscreen rows cannot be assumed to exist in the DOM

### Non-obvious edge cases

- multiple branch heads on one commit
- local and remote refs for the same logical branch
- ref overflow chips like `+1`
- merge commits with two visible parent lines
- long-lived branches that weave across many rows
- commits with identical timestamps
- stash or worktree pseudo-rows if we want GitLens-like extra row types later

## Recommended Rendering Architecture In Noter

### Recommended MVP architecture

- outer scroll container with sticky header
- virtualized row list
- each row rendered as a CSS grid
- graph cell rendered as a small SVG for that row
- refs cell rendered as badge chips
- changes cell rendered as count + proportional green/red bars

Why row-level SVG is the best first move:

- much simpler than one giant canvas
- easier to test in visual fixtures
- easier to keep aligned with row virtualization
- easy to reason about per-row hover and selection states

Why not start with canvas:

- canvas helps at very large scales
- but it complicates hit testing, sharpness, resize behavior, and fixture
  determinism
- it is an optimization path, not the easiest first implementation

## UI Behaviors Worth Copying Later, Not First

- column reorder
- column hide/show
- compact graph mode toggle
- avatar-only author column at minimum width
- minimap
- scrollbar markers
- topological multi-selection
- row context menus
- hover ghost refs
- details sidebar

These are real GitLens features, but they are not required to make the first
version feel recognizably GitLens-like.

## What A Realistic First Noter Slice Should Include

If the goal is "copy the look well enough to evaluate product fit", the first
slice should include:

- sticky header
- selected-row highlight
- `BRANCH / TAG` pill column
- graph lane rendering for:
  - linear history
  - simple branch
  - simple merge
- commit message column
- author column with avatar or initials
- changes column with file count + addition/deletion bars
- relative date column
- SHA column
- desktop sidebar-width behavior if hosted in a workspace shell

That is enough to answer the main product question without committing to the
full GitLens feature set.

## Suggested Implementation Plan

### Phase 1: Static fixture and visual parity

- Create a dedicated visual fixture with hand-authored graph rows.
- Hard-code several graph shapes:
  - straight line
  - branch and rejoin
  - stacked refs
  - selected row
  - long message truncation
- Tune colors, spacing, badges, and row height until it feels right.

Deliverable:

- `GitCommitGraphVisualFixture.tsx`
- Playwright desktop screenshots

### Phase 2: Graph layout engine

- Introduce `computeCommitGraphLayout(rows)` that turns parent links into lane
  segments.
- Keep this pure and testable.
- Add unit tests for:
  - linear history
  - fork
  - merge
  - lane reuse
  - ref overflow

Deliverable:

- test-covered graph math independent of the UI shell

### Phase 3: Live data adapter

- Add a Git history fetcher for either:
  - machine-local CLI
  - backend `isomorphic-git`
- Load refs and core commit rows first
- load stats asynchronously
- optionally load avatars asynchronously

Deliverable:

- real history rendered through the already-proven fixture component

### Phase 4: Interaction and persistence

- column resize persistence
- row keyboard selection
- hover states
- optional compact mode

Deliverable:

- product-ready first version rather than just a visual mock

## Testing Plan

Minimum testing I would require:

- unit tests for graph lane layout
- visual fixture screenshots for:
  - default desktop
  - narrow graph columns
  - selected row
  - merge-heavy fixture
- route-level Playwright coverage if this ships on a real page rather than only
  as a fixture

Because this is a graph surface, screenshot coverage is especially important.
Many failures will be geometric rather than semantic.

## Estimated Scope

These estimates are inference, not source-backed facts.

- rough visual clone with static data:
  - about 2 to 4 days
- convincing live graph with correct lane math and stats:
  - about 1 to 2 weeks
- high-fidelity GitLens-like surface with column behavior, persistence, and
  interaction polish:
  - about 2 to 4 weeks

Main reason the timeline expands:

- the graph math and grid behavior compound each other
- every extra interaction feature multiplies testing and edge cases

## Recommendation

If we want to explore this seriously in Noter, I would do it this way:

1. Do not start from `FileTree`.
2. Do not start from live Git data.
3. Build a dedicated commit-graph visual fixture first.
4. Implement the graph as virtualized rows plus row-level SVG.
5. Treat stats and avatars as progressive enhancement.
6. Skip minimap, hidden refs, and advanced context menus until the core graph
   reads correctly.

That gives us the fastest path to answering the key product question:

- can Noter convincingly host a GitLens-style commit graph surface?

I think the answer is yes, but only if we treat the graph as its own rendering
system, not as a restyled sidebar tree.

## Sources

- [GitKraken Commit Graph feature page](https://www.gitkraken.com/features/commit-graph)
- [GitLens release notes](https://help.gitkraken.com/gitlens/gitlens-release-notes-current/)
- [GitLens `GitGraphRow` model](https://github.com/gitkraken/vscode-gitlens/blob/5e0e8b8cfce0ed8967d844900742ce8a9404a284/packages/git/src/models/graph.ts)
- [GitLens CLI graph provider](https://github.com/gitkraken/vscode-gitlens/blob/5e0e8b8cfce0ed8967d844900742ce8a9404a284/packages/git-cli/src/providers/graph.ts)
- [GitLens log parser](https://github.com/gitkraken/vscode-gitlens/blob/5e0e8b8cfce0ed8967d844900742ce8a9404a284/packages/git-cli/src/parsers/logParser.ts)
- [GitLens row processor](https://github.com/gitkraken/vscode-gitlens/blob/5e0e8b8cfce0ed8967d844900742ce8a9404a284/src/git/graphRowProcessor.ts)
- [GitLens React graph wrapper](https://github.com/gitkraken/vscode-gitlens/blob/5e0e8b8cfce0ed8967d844900742ce8a9404a284/src/webviews/apps/plus/graph/graph-wrapper/gl-graph.react.tsx)
- [GitLens graph webview defaults](https://github.com/gitkraken/vscode-gitlens/blob/5e0e8b8cfce0ed8967d844900742ce8a9404a284/src/webviews/plus/graph/graphWebview.ts)
- [Git pretty-formats documentation](https://git-scm.com/docs/pretty-formats.html)
- [Git `rev-list` documentation](https://www.kernel.org/pub/software/scm/git/docs/git-rev-list.html)
- [`isomorphic-git` `log` documentation](https://isomorphic-git.org/docs/en/log.html)
