# Machines Main Chat Surface Research

## Context

- PR `#403` introduced the canonical `/machines` workspace route and
  intentionally shipped only the left thread rail.
- The merged PR body called out that the main pane and chat surface would need a
  separate follow-up because it required more thinking than the sidebar slice.
- The current `/machines` route already has the important backend shape for that
  follow-up: selected machine routing, machine-control auth, thread inventory
  polling, and pinned-thread grouping.

## What PR #403 Deferred

- The main pane is still an empty workspace canvas.
- There is no inline way to inspect a selected machine-local Codex thread.
- There is no bottom composer for continuing the selected thread from Noter.
- The route uses Codex thread inventory data, so the main pane should render
  machine-local thread content instead of reusing the vault chat state machine.

## Reference From `~/dev/other/t3code`

The most useful references live in:

- `apps/web/src/components/chat/MessagesTimeline.tsx`
- `apps/web/src/components/chat/MessagesTimeline.logic.ts`
- `apps/web/src/session-logic.ts`

The parts worth borrowing are the presentation patterns, not the exact data
model:

- assistant replies stay in the main column without extra card chrome
- user prompts stay right-aligned and visually distinct
- consecutive tool/work updates collapse into one compact "work log" block
- tool rows prefer one readable heading plus a short preview instead of dumping
  raw JSON by default
- the composer stays anchored at the bottom while the message history owns the
  scrolling surface

## Direction For Noter

- Keep `/machines` on the shared workspace shell from PR `#403`.
- Load selected thread detail from the machine control API instead of trying to
  force `EditorChatPanel` onto machine-local Codex data.
- Render the main pane as a thin Codex-style timeline:
  - user/assistant message rows
  - grouped work/tool rows between messages
  - compact thread metadata header
  - bottom composer wired to `/turn/start`
- Reuse Noter's existing primitives where they already fit:
  - `StaticMarkdownDocument` for lightweight assistant message rendering
  - `ChatInput` for the bottom composer
  - `RepositoryWorkspaceFrame` and `WorkspaceScene` for the route shell

## Constraints

- The machines route must preserve the sidebar-first work from PR `#403`.
- The main pane should fail closed when the selected machine is offline or
  machine control is unavailable.
- The timeline should prefer compact summaries over raw item payload dumps so
  long machine threads stay scannable.
- Visual regression coverage should move from "sidebar only" toward the full
  shipped workspace surface.
