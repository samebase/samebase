# Agent Graph View MVP Specification (ReactFlow)

## Document Control

- Status: Implemented for MVP
- Owner: Noter frontend
- Date: 2026-02-22
- Related specs:
  - `specs/021_AGENT_BUILDER_TEMPLATE_SPEC.md`
  - `specs/071_FILE_VIEW_GRAPH_TOGGLE_IN_DEVELOPER_TOOLS_SPEC.md`
- Related files:
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/FileViewDeveloperTools.tsx`
  - `apps/noter/src/components/CodeEditor.tsx`
  - `apps/noter/src/main.tsx`

## Summary

Add an alternate Graph View to the file editor using ReactFlow. The MVP is
minimal: it renders nodes for root `AGENTS.md` and `tools.json` (when present),
connects them with a single edge, and provides an `Editor`/`Graph` switch inside
FileView `Developer tools`. The graph is read-only and is intended to validate
ReactFlow’s feel and integration surface before deeper agent-editing work.

## Goals

- Validate ReactFlow in the Noter UI with minimal integration risk.
- Provide a clear, simple graph view of agent scaffolding files.
- Allow users to switch between Editor and Graph view from Developer tools.
- Persist the chosen view per vault.

## Non-Goals (MVP)

- Parsing file contents into a semantic agent graph.
- Graph-based editing or file generation.
- Auto-layout, grouping, or rich visual styling.
- Multi-file graph beyond root `AGENTS.md` and `tools.json`.

## UX Requirements

- Graph view replaces the editor pane (sidebar remains visible).
- Toggle lives inside FileView `Developer tools`, not the default editor header.
- `Developer tools` stays hidden by default in normal editor mode and remains
  visible while graph mode is active.
- Toggle state is persisted per vault via localStorage.
- Clicking a graph node opens the file and switches back to Editor view.
- If no nodes are present, render an empty canvas (no placeholder text).

## Data Inputs

- Source tree: `vault.treeData.tree` plus staged changes merged in
  `finalTreeData` (same set used by the file tree).
- Node presence is determined solely by filename equality:
  - `AGENTS.md`
  - `tools.json`

## Graph Model (MVP)

Nodes:

- `agents` => label `AGENTS.md`, path `AGENTS.md`
- `tools` => label `tools.json`, path `tools.json`

Edge:

- `agents-tools` if both nodes exist; `source: agents`, `target: tools`

Positions:

- Fixed positions, e.g. `agents` at `(0, 0)` and `tools` at `(280, 0)`.

## Implementation Plan

1. Dependency

   - Add `@xyflow/react` to `apps/noter/package.json`.
   - Import `@xyflow/react/dist/style.css` from `apps/noter/src/main.tsx`.

2. New Component

   - Create `apps/noter/src/components/AgentGraphView.tsx`.
   - Use `ReactFlow`, `Controls`, and `Background`.
   - Accept props: `nodes`, `edges`, `onOpenFile`.
   - On node click, call `onOpenFile(node.data.path)`.

3. FileView Integration
   - In `FileViewInner`, add `viewMode` state: `"editor" | "graph"`.
   - Persist in localStorage with key `noter:graph-view:${vault._id}`.
   - Build nodes/edges from `finalTreeData` in a `useMemo`.
   - Render `AgentGraphView` when `viewMode === "graph"`.
   - Render the mode switch inside `FileViewDeveloperTools`.
   - Keep `Developer tools` visible while graph mode is active.
   - Ensure preview is closed or hidden while in graph view.

## Public API / Behavior Changes

- Frontend-only addition. No Convex or schema changes.
- New dependency: `@xyflow/react`.

## Acceptance Criteria

1. When the repository contains both files, display two nodes and one edge.
2. If the repository contains only a single file, show one node and no edge.
3. When neither file is present, render an empty canvas (no placeholder text).
4. Clicking a node opens the file in Editor view.
5. View toggle is persisted per vault across refresh.
6. Graph view reflects staged files (no commit required).

## Test Scenarios

- Open a repo with `AGENTS.md` and `tools.json` present.
- Rename or delete one of the files in staging and confirm node updates.
- Expand `Developer tools`, toggle between Editor/Graph, and refresh; verify
  persisted view.
- Click node to open file; verify it switches to Editor view.

## Future Iterations

- Parse `AGENTS.md` / `tools.json` into semantic nodes (tools, subagents,
  skills).
- Visual styling closer to LangSmith-style cards and dashed edges.
- Dragging/arranging nodes saved to repo state.
- Read-only minimap, layout helpers, and auto-fit on load.
