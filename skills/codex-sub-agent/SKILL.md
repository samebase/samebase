---
name: codex-sub-agent
description:
  Start a real Codex app thread that is immediately visible in the Codex Desktop GUI. Use when the
  user asks to create, open, spawn, delegate to, or test a Codex thread they can see in the Codex
  GUI/sidebar, especially from another Codex thread.
---

# Codex GUI Thread

Use the Codex app tools. Do not use `codex exec`, `codex app-server`, or `codex://` deep links when
the requirement is "visible in the Codex GUI".

## Workflow

1. If `codex_app.list_projects` and `codex_app.create_thread` are not available, search tools for
   `create_thread`.
2. Call `codex_app.list_projects`.
3. Pick the saved project whose `label` or `path` matches the requested repo. For Samebase, use
   project id `/Users/nicu/dev/samebase/samebase`.
4. Call `codex_app.create_thread` with:
   - `target.type: "project"`
   - `target.projectId: <project id from list_projects>`
   - `target.environment.type: "local"` for a normal visible project thread
   - `target.environment.type: "worktree"` only when the user asks for isolated implementation
   - `prompt: <the exact task prompt>`
5. Report the returned `threadId` and emit:

```text
::created-thread{threadId="<threadId>"}
```

## Known Good Shape

```json
{
  "target": {
    "type": "project",
    "projectId": "/Users/nicu/dev/samebase/samebase",
    "environment": { "type": "local" }
  },
  "prompt": "Visibility test from the current Codex thread. Please reply with exactly: Visible Codex GUI thread test OK. Do not edit files, run commands, or start any follow-up work."
}
```

This created GUI-visible thread `019f3d39-61dc-7241-b54e-3304079a97a3` on 2026-07-07, and the
operator confirmed it appeared instantly in the Codex GUI.
