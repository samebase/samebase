# 059 Daytona Persistent Tmux Terminals Spec

## Status

- Proposed
- Last updated: 2026-03-16

## Related Specs

- `specs/040_DAYTONA_USAGE_AND_FLOW_SPEC.md`
- `specs/051_DAYTONA_STANDARD_RUNTIME_AND_PTY_SESSIONS_SPEC.md`
- `specs/052_DAYTONA_RUNTIME_MANIFEST_AND_SANDBOX_PROGRAMS_SPEC.md`
- `specs/057_DAYTONA_MOBILE_WEB_TERMINAL_EXPERIENCE_SPEC.md`

## Summary

Extend Noter's Daytona terminal model so that workspace terminal tabs represent
durable `tmux` sessions inside the sandbox, not disposable raw PTY processes.

This spec keeps the current Daytona PTY transport and xterm-based UI, but
changes what the PTY attaches to:

1. `Shell` attaches to a named sandbox `tmux` session instead of a raw login
   shell.
2. `Dev Server` attaches to the existing named sandbox `tmux` session instead of
   tailing `/tmp/noter-dev.log`.
3. Closing or losing a Daytona PTY only kills the short-lived attachment client,
   not the underlying shell or dev-server session.
4. Terminal tabs become stable workspace roles rather than browser-local PTY
   inventory.

The first rollout is intentionally scoped to fresh sandbox lifecycles. If a PR
or snapshot rebuild replaces the sandbox, the terminal sessions are expected to
reset with it.

## Research Findings

### Current repo behavior

1. `apps/noter/convex/daytona/terminal.ts` opens workspace shell terminals as
   raw PTY sessions with random session ids and no `tmux` layer.
2. `apps/noter/src/components/DaytonaWorkspaceButton.tsx` kills those PTY
   sessions on tab close, branch change, and component unmount, which means the
   interactive shell itself is disposable today.
3. `apps/noter/convex/daytona/actions.ts` already starts the dev server inside a
   named `tmux` session, but the user-visible `Dev Server` tab still attaches to
   `tail -F /tmp/noter-dev.log` rather than to the `tmux` session directly.
4. Current workspace tabs represent only open browser PTY attachments. If the
   browser session goes away, the tab disappears even when the meaningful
   sandbox-side process is still alive.

### External behavior that matters

1. Daytona PTY sessions can be created and disconnected independently of the
   process they started, which makes them usable as attach/detach clients rather
   than the durable session primitive.
2. Daytona documentation explicitly recommends cleaning up long-running PTY
   processes to avoid leaks, so Noter should continue killing attachment PTYs
   when the UI closes them.
3. `tmux` provides the primitive we actually need for durability: stable named
   sessions, attach/detach behavior, read-only clients, and `remain-on-exit`
   handling for post-mortem inspection.

## Problem

The current workspace shell model ties user state to the lifetime of a single
Daytona PTY process.

That creates the wrong ownership boundary:

1. the browser owns the shell lifetime
2. PTY cleanup destroys interactive shell state
3. the tab model describes local attachments instead of durable sandbox roles
4. the dev server is persistent, but the shell is not
5. the product already has tabs, but the tabs do not map to stable sessions

This is why a Daytona PTY or browser close can wipe useful shell state even
though the sandbox itself is still healthy.

## Goals

1. Make workspace shell state survive Noter PTY closes, browser disconnects, and
   dialog unmounts.
2. Make the `Dev Server` tab attach to the actual `tmux` session that owns the
   dev server, not a log tail surrogate.
3. Make terminal tabs stable per workspace role so a newly launched sandbox can
   show both `Shell` and `Dev Server` tabs immediately.
4. Keep Daytona PTY attachment cleanup explicit so Noter does not leak
   attachment processes.
5. Reuse the existing Daytona runtime baseline and existing dev-server `tmux`
   helpers wherever possible.

## Non-Goals

1. Preserving shell state across sandbox replacement, snapshot rebuild, or repo
   re-materialization.
2. Building a general multi-pane `tmux` UI inside Noter.
3. Replacing the Daytona native web terminal on port `22222`.
4. Supporting arbitrary user-created terminal roles in the first rollout.
5. Solving concurrent multi-client resize/input coordination perfectly in the
   initial implementation.

## Main Decision

Noter should treat the durable unit as a sandbox `tmux` session and the
disposable unit as a Daytona PTY attachment.

That means:

1. a named `tmux` session is created or reused per terminal role
2. every UI open creates a fresh Daytona PTY attachment
3. that PTY runs `tmux attach-session ...`
4. when the UI closes, Noter kills only the PTY attachment
5. the underlying `tmux` session remains available for the next attachment

This preserves Daytona PTY cleanup while removing browser ownership of the real
session state.

## Terminal Roles

Initial workspace roles remain:

1. `shell`
2. `dev_server`

### `shell`

- interactive
- durable across attachment loss
- backed by a named `tmux` session
- starts in the repo working directory
- uses the preferred sandbox shell (`fish` today, fallback handled by existing
  sandbox user bootstrap)

### `dev_server`

- read-only in the Noter UI
- backed by the existing named dev-server `tmux` session
- remains the canonical place for dev-server output, rebuild logs, and crashes
- no longer depends on `tail -F /tmp/noter-dev.log` for the primary tab

## Session Naming

Use stable `tmux` session names per sandbox role.

Initial names:

1. `noter-shell`
2. `noter-dev-server`

Important distinction:

1. `tmux` session names are stable and role-based
2. Daytona PTY session ids remain short-lived and random per attachment

This avoids PTY id collisions while preserving a stable reconnection target.

## Session Lifecycle

### Sandbox start

When `startDaytonaWorkspace` succeeds for a workspace sandbox:

1. the existing dev-server startup path continues to ensure `noter-dev-server`
2. Noter also ensures `noter-shell` exists before returning success for the
   interactive workspace flow
3. the response should give the UI enough information to render stable workspace
   terminal tabs immediately

The branch/file workspace UI should use the same Daytona control surface as the
dashboard: create sandbox, create debug sandbox, open shell, open dev server,
and the terminal tabs. Opening a raw Daytona terminal in a separate browser tab
remains available only as an explicitly named fallback action.

### Shell ensure behavior

Ensuring the shell session must be idempotent.

If `noter-shell` is missing:

```bash
tmux new-session -d -s noter-shell -c <repoDir> <preferred-shell>
tmux set-option -t noter-shell remain-on-exit on
```

If `noter-shell` already exists, treat that as success and do not replace it.

### Shell attach behavior

Opening the `Shell` tab should create a new Daytona PTY attachment that runs a
quoted command equivalent to:

```bash
tmux attach-session -t noter-shell
```

If the session unexpectedly disappears between ensure and attach, Noter should
retry once by re-ensuring `noter-shell`.

### Dev server attach behavior

Opening the `Dev Server` tab should create a new Daytona PTY attachment that
runs a quoted command equivalent to:

```bash
tmux attach-session -r -t noter-dev-server
```

This makes the visible tab match the real long-running process instead of a
best-effort log mirror.

### Attachment close behavior

When the browser closes a terminal tab or the component unmounts:

1. Noter should continue calling `killPtySession` for the Daytona PTY attachment
2. that PTY should be understood as a disposable `tmux` client
3. killing it must not kill the backing `tmux` session

This is the critical ownership inversion that the current shell flow is missing.

### Explicit destructive actions

Only explicit destructive actions should kill the durable session:

1. `Remove sandbox`
2. a future `Reset shell`
3. a future `Restart dev server`
4. sandbox replacement during snapshot rebuild or reprovisioning

Regular UI close and reopen must not count as destructive.

## UI Model

The workspace terminal tabs should become role-based, not attachment-based.

### Tab visibility

When a sandbox exists:

1. `Shell` is always shown
2. `Dev Server` is shown when the dev-server role is expected for that sandbox
   launch path
3. tabs stay visible even if their current PTY attachment is closed

### Default selection

After creating or opening a sandbox from the full workspace UI:

1. `Shell` becomes the active tab
2. `Dev Server` also appears immediately as an available tab

This matches the mental model that both durable sessions already exist.

### External terminal fallback

If the embedded PTY hits a Daytona/browser edge case, the UI may still expose a
manual escape hatch labeled `Open External Terminal`.

### Reconnect behavior

If a PTY attachment closes unexpectedly:

1. keep the tab
2. surface a reconnectable terminal state instead of removing the tab
3. re-opening the tab attaches a fresh PTY client to the same `tmux` session

### Button behavior

`Open Shell` and `Open Dev Server` should mean:

1. focus the existing tab if it already has a live attachment
2. otherwise create a fresh PTY attachment to the stable role session

They should no longer imply "create a brand new shell process."

## Backend Contract

### Shared helpers

Refactor the existing dev-server `tmux` helpers into a shared module that can be
used by both `apps/noter/convex/daytona/actions.ts` and
`apps/noter/convex/daytona/terminal.ts`.

Expected shared concerns:

1. inspect session state
2. ensure session exists
3. kill/reset session when explicitly requested
4. build quoted attach commands for interactive and read-only clients

### Workspace terminal open APIs

Keep the current API shape if that minimizes frontend churn, but change the
semantics:

1. `openWorkspacePtySession` becomes "open shell attachment to `noter-shell`"
2. `openWorkspaceDevServerPtySession` becomes "open read-only attachment to
   `noter-dev-server`"
3. neither endpoint should expose the raw shell process as the durable object

### Close APIs

Keep `closeWorkspacePtySession`, but document that it closes only the current
Daytona PTY attachment, not the durable role session.

## Attachment Command Details

The PTY bootstrap should continue to:

1. ensure the sandbox is started
2. ensure projected Codex home is mounted
3. switch to the sandbox user
4. trust the repo path in Codex config when applicable

After that bootstrap, the interactive command should land in `tmux`, not in a
fresh shell process.

The attach command should be quoted and executed by the sandbox user rather than
by root.

## Read-Only Enforcement

The `Dev Server` tab must remain read-only in two places:

1. the frontend should keep input disabled
2. the backend attach command should use `tmux` read-only attach mode

Hiding input in the browser alone is not sufficient.

## Concurrent Client Behavior

The initial rollout does not need to optimize for multiple simultaneous
interactive shell attachments to the same sandbox.

Practical rule:

1. reattachment after disconnect is a supported path
2. one active writer per workspace in the normal UI is the intended path
3. if multiple writers attach anyway, shared-input and resize oddities are an
   accepted limitation for now

This is still materially better than losing the shell entirely.

## Logging And Fallbacks

`/tmp/noter-dev.log` remains useful, but only as:

1. bootstrap fallback
2. status diagnostics
3. post-failure inspection

It should stop being the primary source for the `Dev Server` tab once the tmux
attach path exists.

## Acceptance Criteria

1. Launching a new workspace sandbox from the full UI yields visible `Shell` and
   `Dev Server` tabs without requiring the user to create each one manually.
2. Closing the workspace dialog, navigating away, or losing the browser socket
   does not destroy the underlying shell session.
3. Reopening `Shell` reconnects to the same `tmux` session with previous shell
   state intact.
4. Reopening `Dev Server` reconnects to the same `tmux` session instead of a log
   tail.
5. Removing the sandbox still removes all session state, which is acceptable in
   this phase.

## Rollout Plan

1. Extract shared Daytona `tmux` helpers from the existing dev-server flow.
2. Convert workspace shell PTY open from raw shell launch to durable
   `noter-shell` ensure-and-attach.
3. Convert `Dev Server` PTY open from log tailing to read-only tmux attach.
4. Change the tab UI from attachment inventory to stable role tabs.
5. Preserve explicit PTY attachment cleanup on close and unmount.
6. Add reconnect-focused tests for shell persistence and stable tab behavior.

## References

- Daytona docs:
  [Open-source SDK PTY sessions](https://www.daytona.io/docs/oss/sdk/terminal-ssh-and-vscode)
- Daytona docs:
  [TypeScript SDK interactive sessions](https://www.daytona.io/docs/oss/sdk/interactive-sessions)
- Daytona docs:
  [Resource management for interactive sessions](https://www.daytona.io/docs/oss/sdk/advanced-use)
- tmux man page: [attach-session](https://man.openbsd.org/tmux.1)
