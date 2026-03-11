# 051 Daytona Standard Runtime And PTY Sessions Spec

## Status

- Proposed
- Last updated: 2026-03-11

## Summary

Standardize user-facing Daytona sandboxes on a Noter-maintained runtime image
and use persistent PTY sessions for terminal-backed flows.

This spec adds one new platform decision and one new UI/runtime decision:

1. user-facing Daytona sandboxes should run on a pinned Noter runtime image
2. long-lived terminal-backed processes should run inside persistent PTY
   sessions, backed by `tmux`

The immediate target is the Daytona workspace dev server surface:

- keep the normal interactive shell terminal
- add a separate read-only `Dev Server` terminal surface
- preserve full terminal fidelity, including ANSI colors and other TTY behavior

This spec supersedes the file-tail-first direction from
`011_DAYTONA_DEV_SERVER_STATUS_AND_LOGS_SPEC.md` for the primary dev-server UI.
Log files remain acceptable as fallback/debug artifacts, not the main UX.

## Problem

Noter now has embedded Daytona PTY terminals, which makes a better in-app
terminal UX possible. However, the current dev server path still starts
`make anon` detached and redirects output to `/tmp/noter-dev.log`.

That is good enough for background startup, but it is not a real terminal
surface:

1. many tools disable colors, spinners, and cursor control when stdout is not a
   TTY
2. file tailing cannot fully reproduce the behavior of a live terminal session
3. browser disconnects should not own the lifetime of the dev server process
4. repo-specific image selection is still too implicit for a user-facing runtime

The system currently mixes three separate concerns:

1. runtime image choice
2. process lifetime
3. browser terminal attachment

Those should be separated cleanly.

## Goals

1. Run user-facing Daytona sandboxes on a known-good, pinned Noter runtime
   image.
2. Preserve real terminal behavior for dev-server output, including colors and
   ANSI control sequences.
3. Keep long-lived terminal-backed processes alive across browser disconnects.
4. Allow read-only attachment for operational views like `Dev Server`.
5. Reuse the existing Daytona PTY transport and embedded `xterm` UI in Noter.
6. Keep the normal workspace shell terminal available as a separate surface.

## Non-Goals

1. Browser console log capture.
2. Replacing Daytona snapshots.
3. Replacing the existing interactive shell terminal with a custom process
   manager.
4. Introducing `node-pty` on the Noter backend.
5. Expanding this spec into `codex app-server` architecture.
6. Full process orchestration or auto-scaling beyond a single sandbox session.

## Main Decision

Use `tmux` as an internal sandbox runtime primitive for persistent PTY-backed
sessions.

Important clarification:

- `tmux` is not being proposed as a user-facing product feature.
- `tmux` is being used as the process/session layer underneath Noter-owned xterm
  surfaces.

Why `tmux` is the right fit here:

1. it gives named durable sessions inside the sandbox
2. it lets Noter detach and reattach without tying process lifetime to one
   browser tab
3. it preserves real TTY behavior, unlike log-file tailing
4. it supports read-only attachment for observability surfaces
5. it is simpler than inventing a custom session supervisor around Daytona PTY

## Alternatives Considered

### 1. Tail `/tmp/noter-dev.log` in a read-only terminal

Rejected for primary UX.

Reason:

1. easy to add
2. works as a fallback
3. loses too much terminal fidelity because the dev server was not started on a
   PTY in the first place

### 2. Run `make anon` directly inside a raw Daytona PTY session

Rejected for the durable path.

Reason:

1. it gives real terminal output
2. but it couples process lifetime and browser/PTy attachment too tightly
3. reconnect and multi-view behavior become fragile

### 3. Use a process manager like `pm2` or `supervisord`

Rejected for this problem.

Reason:

1. these are good at background process supervision
2. they are not the right primitive for a terminal surface with reattach and
   read-only viewing

### 4. Use `screen`

Not preferred.

Reason:

1. similar class of tool
2. `tmux` is the cleaner and more widely adopted primitive for named sessions
   and programmatic attach/detach workflows

## Standard Runtime Image

User-facing Daytona sandboxes should be based on a single Noter-maintained
runtime image family.

This applies to:

1. workspace sandboxes
2. Codex auth sandboxes
3. future terminal-backed operational surfaces

Required properties of that runtime image:

1. pinned, versioned, and known-good
2. includes `tmux`
3. includes `make`, `corepack`, and supported `pnpm`
4. includes Codex CLI when the sandbox role requires it, or derives from a base
   that guarantees compatible installation
5. remains compatible with Daytona snapshot and deps-image flows

Important rule:

Repo-specific deps images may remain as a performance optimization, but they
must extend or remain compatible with the same Noter standard runtime baseline.

The fallback path should move away from an ad hoc generic base image and toward
the standard Noter runtime image.

## Session Model

Noter should treat terminal-backed sandbox sessions as explicit roles.

Initial roles:

1. `shell`
2. `dev_server`
3. `codex_auth`

### `shell`

- interactive
- full input enabled
- attached to a normal shell in the workspace sandbox

### `dev_server`

- read-only by default in UI
- backed by a named `tmux` session
- command starts the existing safe dev path (`make anon`) inside the sandbox
- intended for server output, requests, rebuilds, and crashes

### `codex_auth`

- single-purpose
- can still use the embedded PTY transport
- may remain non-interactive/read-only at the Noter UI level after launch
- does not require `tmux` immediately, but should stay compatible with the same
  session abstraction

## Dev Server Lifecycle

### Start

When the user opens the `Dev Server` surface for a workspace sandbox:

1. Noter ensures the workspace sandbox is running.
2. Noter ensures the standard runtime image provides `tmux`.
3. Noter ensures a named `tmux` session exists for that sandbox and role.
4. If the session does not exist, Noter starts:

```bash
tmux new-session -d -s noter-dev-server 'cd /home/daytona/workspace/<repo> && make anon'
```

5. Noter opens a Daytona PTY session that attaches to that `tmux` session in
   read-only mode.

### Reattach

If the browser closes or the websocket disconnects:

1. the `tmux` session keeps running
2. the user can reopen the `Dev Server` surface
3. Noter reattaches to the same named session

### Restart

Add an explicit `Restart dev server` action:

1. terminate the named `tmux` session
2. recreate it with the same command
3. reopen or refresh the read-only PTY attachment

### Stop

`Stop dev server` is optional in the first rollout.

If added later, it should:

1. terminate only the dev-server session
2. leave the workspace sandbox intact

## UI Contract

For the Daytona workspace tools, split terminal surfaces by role.

Recommended UI:

1. `Shell`
   - interactive
   - same purpose as the current embedded terminal
2. `Dev Server`
   - read-only
   - backed by `tmux`
   - optimized for observability, not command entry

Behavior:

1. `Shell` and `Dev Server` should be separate tabs or segmented views, not one
   terminal trying to do everything
2. `Dev Server` should not expose arbitrary input by default
3. `Open in tab` remains a fallback until the PTY surfaces are proven stable

## Backend Shape

The existing Daytona PTY actions should evolve toward role-based session APIs.

Recommended shape:

1. `openWorkspaceShellPtySession`
2. `openWorkspaceDevServerPtySession`
3. `restartWorkspaceDevServerSession`
4. `closeWorkspacePtySession`
5. `resizeWorkspacePtySession`

Implementation note:

The frontend should still receive:

1. `sessionId`
2. `webSocketUrl`
3. `previewToken`

The backend remains responsible for:

1. validating sandbox ownership
2. creating/attaching the sandbox-side PTY
3. mapping role to command/session behavior

## Operational Status

For `Dev Server`, status should be based on the tmux-backed process/session, not
just a tailed file.

Useful signals:

1. whether the named tmux session exists
2. whether the preview port is listening
3. whether the PTY attach succeeded

Log files like `/tmp/noter-dev.log` may remain for:

1. bootstrap diagnostics
2. failure fallback
3. postmortem inspection

But the main observability surface should be the PTY-attached session.

## Security / Isolation

1. Only open PTY sessions for sandboxes belonging to the current user.
2. Keep dev-server sessions scoped to one sandbox.
3. Do not expose arbitrary command execution through the read-only `Dev Server`
   surface.
4. Treat session names as internal implementation details, not user input.

## Rollout Plan

1. Define and publish a Noter standard Daytona runtime image that includes
   `tmux`.
2. Move user-facing Daytona sandbox fallbacks onto that image baseline.
3. Add backend support for a tmux-backed `dev_server` PTY role.
4. Add a `Dev Server` tab next to the existing shell terminal.
5. Keep `/tmp/noter-dev.log` as fallback only.
6. Later, decide whether `codex_auth` should also adopt tmux-backed persistence
   or remain a simpler one-shot session.

## Acceptance Criteria

1. The `Dev Server` surface shows full terminal fidelity, including colors,
   because the underlying process runs inside a real PTY-backed session.
2. Closing the browser tab does not stop the dev server.
3. Reopening the `Dev Server` surface reattaches to the same running session.
4. The normal `Shell` terminal remains interactive and separate.
5. User-facing Daytona sandboxes no longer depend on ad hoc generic base images
   for fallback behavior.

## Open Questions

1. Should the standard runtime image include Codex CLI directly, or should Codex
   remain layered on top for auth-specific sandboxes?
2. Should workspace sandbox creation enforce the standard image at snapshot
   build time, at sandbox create time, or both?
3. Should `Stop dev server` ship in the first rollout or wait until restart and
   reattach behavior is stable?
