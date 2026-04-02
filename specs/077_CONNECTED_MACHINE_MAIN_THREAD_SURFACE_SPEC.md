# 077 Connected Machine Main Thread Surface Spec

## Document Control

- Status: Accepted
- Owner: connected machine thread browsing + local control
- Last updated: 2026-04-02
- Related docs:
  - `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`
  - `specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`
  - `research/2026-04-02-machines-main-chat-surface.md`
  - `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`

## Summary

`/machines` now ships a real selected-thread pane inside the shared workspace
shell instead of an empty canvas.

The shipped main pane must:

1. show the selected machine-local Codex thread as a compact timeline
2. keep grouped work/tool activity between message rows
3. keep the composer anchored at the bottom of the pane
4. render both user and assistant messages through the shared
   `ProsemarkReadOnly` surface so markdown behaves the same way as other Noter
   chat surfaces

## Locked Product Decisions

1. `/machines` stays on the shared workspace shell and keeps the sidebar-first
   route structure from the earlier thread-browser work.
2. The main pane reads machine-local Codex thread detail instead of trying to
   force vault chat state onto the connected-machine route.
3. User and assistant message rows must share the same markdown renderer:
   `ProsemarkReadOnly`.
4. The renderer contract lives inside the shared Prosemark surface, while
   role-specific layout remains outside it.
5. User messages stay visually distinct and right-aligned.
6. Assistant messages stay in the main timeline column without extra faux-card
   chrome beyond what the route already needs.
7. Tool and reasoning items stay grouped into compact work-log blocks rather
   than interleaving raw payload dumps between every message.
8. The bottom composer uses `ChatInput` in `prosemark` mode and fails closed
   when machine control is unavailable.

## Current Behavior

### Main pane structure

The selected-thread pane on `/machines` now includes:

1. a compact thread header with selected machine identity and thread metadata
2. a scrollable timeline for machine-local thread history
3. user and assistant message rows
4. grouped work/tool rows between message rows
5. a bottom composer for continuing the selected thread

### Message rendering contract

For hydrated message items:

1. the pane reads the display text from the selected thread timeline entry
2. both user and assistant rows render that text with `ProsemarkReadOnly`
3. the surrounding row chrome controls alignment, spacing, and bubble styling
4. the message renderer should not fork into a `<pre>` path for user prompts or
   a `StaticMarkdownDocument` path for assistant replies

This keeps markdown rendering, folding, and typography behavior aligned with the
rest of Noter's read-only chat surfaces.

### Work-log rendering contract

Non-message items such as reasoning, tool calls, command executions, and file
changes continue to render as grouped compact work-log rows with concise titles
and previews.

The message renderer change must not flatten those activity groups into message
bodies.

## Source Of Truth Files

- `apps/noter/src/components/MachinesWorkspacePage.tsx`
- `apps/noter/src/components/MachinesWorkspaceView.tsx`
- `apps/noter/src/components/MachinesWorkspaceThreadPane.tsx`
- `apps/noter/src/components/ProsemarkReadOnly.tsx`
- `apps/noter/src/lib/codexThreadTimeline.ts`
- `apps/noter/e2e/machines-workspace-visual.spec.ts`

## Relationship To Earlier Research

The earlier research note in `research/2026-04-02-machines-main-chat-surface.md`
proposed `StaticMarkdownDocument` for lightweight assistant rendering.

The shipped behavior standardizes on `ProsemarkReadOnly` for both message roles
instead so `/machines` matches the existing Noter chat rendering contract.

## Acceptance

- [x] `/machines` can show the selected machine-local thread in the main pane.
- [x] User and assistant messages render through the shared `ProsemarkReadOnly`
      surface.
- [x] Work/tool activity remains grouped separately from message rows.
- [x] The bottom composer stays anchored to the pane and can continue the
      selected thread when machine control is available.
- [x] The shipped UI keeps screenshot coverage for the full machines workspace
      surface, including the main thread pane.
