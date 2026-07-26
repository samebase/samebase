# Idea: Main Agent Hub for Codex Worktrees

> Retired 2026-07-26: Samebase does not ship an in-app chat hub. Agents use MCP and browser handoff
> instead.

## Problem

When multiple agents are running in separate worktrees, I keep context switching between chats and
lose flow. The work itself is happening, but the control surface is fragmented.

## Desired outcome

Have one persistent "main agent" (similar to Noter's ChatFab) that can see, coordinate, and talk to
all active worktree agents from a single place.

Think of it like a Wispr Flow-style layer above all worktrees:

- always available
- fast to invoke
- routes work to the right running agent
- aggregates progress and results back in one chat

## Product concept

### Main agent responsibilities

- Maintain global intent and priorities.
- Route tasks to the most relevant worktree agent.
- Keep a unified memory of goals, constraints, and decisions.
- Summarize worker progress into one timeline.
- Handle cross-worktree operations (handoffs, rebases, dependency order).

### Worktree agent responsibilities

- Execute scoped tasks inside a single worktree.
- Report status, blockers, and produced artifacts back to the hub.
- Request clarification/escalation through the main agent.

## MVP (ship fast)

1. Add a single "Hub" chat entrypoint that is always visible.
2. Show active worktree agents as sessions with status: `idle | running | blocked | needs-review`.
3. Let Hub send a task to any session with one click.
4. Stream back concise progress updates into Hub (with source worktree labels).
5. Add a quick "focus transfer" action: open related worktree + recent messages + changed files.
6. Add a "create branch" action from Hub for any worktree session, even as a simple markdown command
   first (example: `create branch codex/<name>`).

## UX notes

- Default to a compact floating entrypoint (ChatFab-like behavior).
- Keep interaction command-first: "ask agent X to continue task Y", "summarize all running work".
- Avoid forcing manual tab hopping for normal coordination tasks.

## Success criteria

- Fewer manual context switches per task.
- Faster completion time for parallel worktree efforts.
- Better continuity after interruptions.

## Risks

- Hub can become noisy if worker updates are verbose.
- Routing mistakes can send tasks to the wrong worktree.
- Needs clear permission boundaries for destructive operations.

## Mitigations

- Enforce structured worker update format (`what changed`, `next`, `blocked`).
- Require explicit worktree targeting for write/destructive actions.
- Keep summaries default, raw logs on demand.

## Follow-ups

- Add "delegate automatically" mode based on file/path ownership rules.
- Add weekly analytics for context-switch count and recovered time.
- Add reusable playbooks for common multi-worktree workflows.
