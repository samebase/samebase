# 071 File View Graph Toggle In Developer Tools Spec

## Document Control

- Status: Proposed
- Owner: File view + agent graph
- Last updated: 2026-03-26
- Related specs:
  - `specs/022_AGENT_GRAPH_VIEW_SPEC.md`
  - `specs/023_AGENT_GRAPH_CHAT_INTEGRATION_SPEC.md`
  - `specs/040_DAYTONA_USAGE_AND_FLOW_SPEC.md`
- Source of truth files:
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/AgentGraphView.tsx`

## Summary

Move the FileView `Editor`/`Graph` switch out of the always-visible editor
header and into the existing `Developer tools` collapsible.

The goal is to keep Graph View available for advanced and agent-focused
workflows without spending default header space on a mode that most file-view
sessions do not need.

This RFC keeps the current Graph behavior intact:

1. Graph mode still replaces the main editor pane.
2. The selected mode still persists per vault in localStorage.
3. Clicking graph nodes still returns the user to editor mode.

## Problem

Today FileView shows the `Editor`/`Graph` tabs in a dedicated row above the main
content area, even for normal file-editing sessions.

That creates two UX issues:

1. it gives an advanced/experimental surface permanent visual weight in the
   default editor chrome
2. it adds one more always-visible control row to a header that already carries
   branch context, sync state, preview/review actions, PR actions, reset, and
   Daytona developer controls

The current placement made sense while validating the Graph View MVP, but it is
not a good long-term default if the graph entry point is meant to stay more
developer-oriented than editor-oriented.

## Current State

### FileView behavior

Current implementation in `apps/noter/src/components/FileView.tsx`:

1. `viewMode` is `"editor" | "graph"`.
2. `viewMode` is stored in localStorage under `noter:graph-view:${vaultId}`.
3. The `Editor`/`Graph` tabs render in their own row above the main content.
4. `Developer tools` is a separate collapsible below the main action row.
5. `Developer tools` defaults closed via local React state and currently holds:
   - `DaytonaWorkspaceButton`
   - `DaytonaSnapshotList`

### Related specs

Current source docs assume the graph toggle is part of the default editor
header:

1. `specs/022_AGENT_GRAPH_VIEW_SPEC.md` says the toggle lives in the editor
   header area.
2. `specs/023_AGENT_GRAPH_CHAT_INTEGRATION_SPEC.md` formalizes only the
   persistence contract, not the toggle placement.
3. `specs/040_DAYTONA_USAGE_AND_FLOW_SPEC.md` already frames `Developer tools`
   as the place for advanced Daytona controls in adjacent vault surfaces.

## Goals

1. Hide the graph entry point from the default FileView chrome.
2. Keep Graph View available without changing its functional behavior.
3. Preserve the existing per-vault localStorage persistence contract.
4. Keep a clear path back to editor mode when graph mode is active.

## Non-Goals

1. Redesigning `AgentGraphView`.
2. Changing graph data sources, chat behavior, or node interactions.
3. Moving Graph View persistence from localStorage into Convex.
4. Changing dashboard `Developer tools` behavior.
5. Introducing a broader FileView header redesign in this change.

## Proposal

### 1. Move the mode switch into FileView `Developer tools`

Remove the standalone `Editor`/`Graph` row from the main FileView content area.

Instead, render the same two-state mode control as the first item inside the
existing `Developer tools` collapsible in `FileView`.

This treats Graph View as an advanced tool rather than a default navigation
surface.

### 2. Keep `Developer tools` hidden by default in normal editor mode

When FileView opens in the normal `editor` mode, `Developer tools` should remain
closed by default, matching the current Daytona-tool behavior.

This is the primary user-visible outcome of the RFC: the graph switch is no
longer visible by default.

### 3. Auto-open `Developer tools` when graph mode is active

If FileView switches into `graph` mode, the `Developer tools` section should
open automatically.

This applies both when:

1. the user actively switches from `editor` to `graph`
2. the persisted localStorage value restores `graph` on load

Why:

1. it keeps the return path to `Editor` visible
2. it makes the active advanced mode self-explanatory
3. it avoids trapping the user in a hidden toggle after persistence restores
   graph mode

This RFC does not require persisting the open/closed state of `Developer tools`.
The only persisted state remains `viewMode`.

### 4. Preserve the existing graph-mode contract

This proposal intentionally does not change the current graph contract:

1. localStorage key remains `noter:graph-view:${vaultId}`
2. corrupt or unavailable storage still falls back to `editor`
3. entering `graph` still closes the preview panel
4. review mode still forces FileView back to `editor`
5. clicking a graph node still opens the file and switches back to `editor`

### 5. Keep Daytona tools in the same section

`DaytonaWorkspaceButton` and `DaytonaSnapshotList` stay inside
`Developer tools`.

The graph toggle should sit above them in the same collapsible so the section
becomes the single home for advanced FileView controls.

## Product Decisions

### Recommended interaction model

Use the same `Editor`/`Graph` control semantics that exist today, only in a new
placement.

The RFC does not require switching component primitives. Reusing the current
tabs-style control is preferred if it keeps the implementation small.

### No new persistence surface

Do not add Convex or localStorage persistence for the FileView `Developer tools`
section itself.

Reason:

1. the user request is about default visibility, not cross-device sync
2. `viewMode` is already the only state that needs to survive reloads
3. adding a second persisted UI preference would expand scope without clear
   value

## Implementation Notes

1. Remove the standalone `editorSurfaceTabs` row from `FileView`.
2. Render the same `Editor`/`Graph` control at the top of `CollapsibleContent`
   for `Developer tools`.
3. When switching into `graph`, also open `Developer tools`.
4. When hydrating with persisted `graph` mode, initialize `Developer tools` as
   open so the toggle is visible immediately.
5. Keep the current `viewMode` persistence effect and storage key unchanged.

## Acceptance Criteria

1. Opening FileView in normal editor mode does not show the `Editor`/`Graph`
   switch until `Developer tools` is expanded.
2. Expanding `Developer tools` reveals the `Editor`/`Graph` switch above the
   Daytona controls.
3. Switching to `graph` mode opens `Developer tools` automatically.
4. Reloading a vault whose persisted mode is `graph` restores graph mode and
   shows the toggle inside an open `Developer tools` section.
5. Reloading a vault whose persisted mode is `editor` restores editor mode with
   `Developer tools` closed by default.
6. Existing graph-node navigation still returns the user to `editor`.

## Validation Scenarios

1. Open FileView on a vault in default editor mode and confirm no graph toggle
   is visible until `Developer tools` is expanded.
2. Expand `Developer tools`, switch to `graph`, and confirm the graph renders
   without any standalone header toggle row.
3. Refresh while in `graph` mode and confirm the section reopens with the switch
   visible.
4. Click a graph node and confirm the file opens in `editor` mode.
5. Enter review mode from editor and confirm FileView still forces `editor`
   mode.
6. Add or update a narrow visual/screenshot fixture that covers:
   - default collapsed state
   - expanded `Developer tools` state with the switch visible

## Follow-Up

If this RFC is accepted and implemented, update the graph-related source docs so
they stop describing the toggle as part of the default editor header.
