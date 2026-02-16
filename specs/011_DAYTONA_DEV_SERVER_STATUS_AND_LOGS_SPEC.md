# 011 Daytona Dev Server Status & Logs Spec

## Summary

Add visibility and control for Daytona dev server runs:

- Keep the existing **safe** start (ensures pnpm + install fallback).
- Add a **fast start** button that only `cd`s + runs `pnpm dev`.
- Add a **status/logs panel** that surfaces whether the dev server is running and shows a log tail.

This removes ambiguity from `exitCode: 0` on the background launch by surfacing runtime status and logs.

## Goals

- Provide a clear, read-only view of dev server health (running or not).
- Show a short tail of `/tmp/noter-dev.log` in-app.
- Add a fast start path for power users.
- Preserve the existing safe start path unchanged.

## Non-Goals

- Full terminal/file browser replacement (terminal link already exists).
- Arbitrary command execution from UI.
- Automatic restarts or process supervision.

## UX / UI

**Daytona Preview Panel (or Workspace controls):**

- **Start Dev (Safe)** button (existing flow).
- **Start Dev (Fast)** button (new, no install checks).
- **Dev Status** indicator:
  - Running / Not running / Unknown.
  - Port info (`5173`).
- **Dev Logs** section:
  - Short tail (default 200 lines).
  - Manual **Refresh** button.
  - Clear message when the log file does not exist yet.

**Terminal link remains available** for full access.

## API / Convex Actions

### 1) `getDaytonaDevServerStatus`

Returns status + a log tail in one call.

**Response shape (proposal):**

- `ok: boolean`
- `running: boolean | null` (null = unknown)
- `port: number` (always `DAYTONA_PREVIEW_PORT`)
- `pid?: number` (if discoverable)
- `logTail?: string` (tail of `/tmp/noter-dev.log`)
- `message?: string`

**Implementation notes:**

- Use `sandbox.process.executeCommand` with a small script that:
  - Detects port listener (`ss -ltnp | grep ":5173"`).
  - Optionally extracts PID from `ss` or `lsof`.
  - `tail -n 200 /tmp/noter-dev.log` if the file exists.
  - Emits structured output (e.g., JSON lines) that the action parses.
- If `ss` or `lsof` is missing, mark `running: null` and include a message.

### 2) `startDaytonaDevServerFast`

Minimal start that only runs:

```
cd /home/daytona/workspace/<repo>
NOTER_DEV_HOST=0.0.0.0 NOTER_DEV_PORT=5173 NOTER_DEV_STRICT_PORT=1 nohup bash -lc "pnpm dev" > /tmp/noter-dev.log 2>&1 &
```

**Behavior:**

- If port `5173` is already listening, return `ok: true` with message "Already running."
- No dependency checks or installs.

## Implementation Details

### Status Detection

Primary check:

- `ss -ltnp | grep ":5173"` (fast, usually present on Debian).

Fallbacks if `ss` is missing:

- `lsof -iTCP:5173 -sTCP:LISTEN`
- If neither is available, return `running: null`.

### Log Tail

- `tail -n 200 /tmp/noter-dev.log`
- If missing, return a message like "Dev log not found yet."

### Security

- Logs may include env output; keep tail size small.
- No extra permissions; only status/logs for the user’s own sandbox.

## Data Model

- No new tables.
- Optional: store last status timestamp in memory only (not persisted).

## Error Handling

- If sandbox not found, return `{ ok: false, message }` (existing pattern).
- If commands fail, return `ok: false` with the stderr summary.

## Rollout Plan

1. Add Convex actions `getDaytonaDevServerStatus` and `startDaytonaDevServerFast`.
2. Update UI to show:
   - Start Dev (Safe)
   - Start Dev (Fast)
   - Status + Logs panel
3. Verify:
   - Safe start still works.
   - Fast start works when deps already installed.
   - Status correctly reports running vs stopped.

