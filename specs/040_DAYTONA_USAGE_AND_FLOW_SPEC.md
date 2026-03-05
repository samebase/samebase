# 040 Daytona Usage And Flow Spec

## Status

- Proposed
- Date: 2026-03-05

## Goal

Document how Daytona is used in Noter today and define a practical flow that
reduces startup latency while keeping the current feature set (terminal,
preview, snapshots, and future Codex/LSP hooks).

## Current Usage (As Implemented)

### 1) Where Daytona is triggered in UI

- Vault dashboard developer tools render `DaytonaWorkspaceButton` and
  `DaytonaSnapshotList`.
- File view preview drawer renders `DaytonaPreviewPanel` for dev status/logs and
  preview links.

### 2) Backend entrypoints

Main Convex actions in `apps/noter/convex/daytonaActions.ts`:

- `startDaytonaWorkspace`
- `getDaytonaTerminalUrl`
- `getDaytonaPreviewUrl`
- `startDaytonaDevServerSafe`
- `startDaytonaDevServerFast`
- `getDaytonaDevServerStatus`
- `removeDaytonaSandbox`
- `prebuildDaytonaSnapshot`
- `getDaytonaPrebuildLogs`
- `listDaytonaSnapshotsForVault`
- `removeDaytonaSnapshot`
- `ensureDaytonaRegistryForVault`

### 3) Data persisted per vault

Daytona fields are persisted on `vaults`:

- `daytonaSandboxId`, `daytonaSandboxName`, `daytonaSandboxCreatedAt`
- `daytonaSnapshotName`
- `daytonaPrebuildLogs`, `daytonaPrebuildLogsUpdatedAt`
- `daytonaPrebuildLogsBranch`, `daytonaPrebuildLogsSnapshot`

### 4) Startup behavior today

`startDaytonaWorkspace` is snapshot-first and strict:

1. Validates Daytona API config.
2. Resolves snapshot name from `owner/repo/branch`.
3. Requires snapshot to exist and be `active`; otherwise returns an error.
4. Creates a new sandbox from snapshot.
5. Refreshes git repo in sandbox (`always|smart|never`).
6. Starts dev server via `make anon` (safe path).
7. Writes sandbox id/name to vault.
8. Returns startup timing metrics.

### 5) Snapshot build behavior today

`prebuildDaytonaSnapshot`:

1. Requires user GitHub token.
2. Clones target branch to a temp dir.
3. Tries deps image candidates from hash/lock hash.
4. Falls back to base image + install if no deps image template is configured.
5. Streams build logs into vault fields.

### 6) Dev control behavior today

- Safe start: `make anon` in sandbox.
- Fast start: `pnpm run dev` in sandbox.
- Status: checks listening port/log tail.
- Terminal link: signed preview URL on port `22222`.
- App preview link: preview URL on port `5173`.

### 7) Operational add-ons

- CI builds immutable Daytona deps image tags from content hash.
- Local CLI helper exists to refresh sandbox git checkout:
  `pnpm daytona:refresh`.

## Frictions In Current Flow

1. Branch is hardcoded to `main` in vault dashboard when launching Daytona.
2. `startDaytonaWorkspace` always creates a new sandbox; no reuse/resume path.
3. Snapshot is mandatory before start; no automatic prebuild-or-wait flow.
4. Repo refresh uses remote URL with token in URL (higher secret exposure risk).
5. End-to-end start includes sandbox create + git refresh + `make anon`, so
   startup is commonly seconds (or more), not sub-100ms.
6. `daytonaSnapshotName` field exists but is not the primary source of truth for
   selecting the startup snapshot.

## Proposed Flow (Practical)

### A) Branch-aware launch source

- Use currently selected branch in Noter route/context.
- Do not hardcode `main` in dashboard Daytona launch.

### B) Two-path startup contract

Introduce `ensureDaytonaWorkspace(vaultId, branch, mode)` where
`mode = auto | recreate`.

`auto` path:

1. Find sandbox by vault+branch labels.
2. If found and `started`, reuse immediately.
3. If found and `stopped`, call `sandbox.start()` and reuse.
4. If none found, create from snapshot.

`recreate` path:

- Always create a fresh sandbox from snapshot and replace metadata.

### C) Snapshot readiness policy

For `auto` when snapshot is missing:

1. If a build is already in progress for this branch, return `pending_prebuild`.
2. Otherwise trigger `prebuildDaytonaSnapshot` asynchronously and return
   `pending_prebuild`.
3. UI polls snapshot status and enables launch when active.

### D) Fast first paint UX

On click:

1. Return sandbox identity as soon as sandbox is reusable/created.
2. Open terminal link immediately.
3. Start dev server in background (safe or fast policy).
4. Surface live status/log panel while boot completes.

This removes blocking behavior from the button and shifts long work into async
status updates.

### E) Git refresh hardening

Replace token-in-URL remote strategy with header-based auth (same pattern as
`scripts/daytona-refresh.sh`):

- `git -c http.extraHeader="AUTHORIZATION: basic ..." fetch ...`

### F) LSP usage flow in Daytona

Use Daytona SDK LSP in sandbox for indexed code intelligence:

1. Ensure sandbox started and repo refreshed.
2. `sandbox.createLspServer("typescript", "/home/daytona/workspace/<repo>")`
3. `lsp.start()`
4. On file open/close: `didOpen` / `didClose`
5. Query features: `documentSymbols`, `sandboxSymbols`, `completions`
6. Stop LSP server on sandbox stop/archive.

### G) Codex cloud handoff flow (optional)

If Noter should open Codex cloud directly from this Daytona context:

1. Resolve `branch` from current vault context.
2. Trigger backend runner command:
   `codex cloud exec --env <env-id> --branch <branch> "<prompt>"`
3. Return task URL and open it in new tab.

Daytona is not required for this command itself, but Daytona remains useful for
interactive dev/LSP workspace behavior.

## Recommended Product Flow

1. User opens vault on branch `X`.
2. User clicks `Open Workspace`.
3. Backend runs `ensureDaytonaWorkspace(vaultId, X, auto)`.
4. UI immediately gets one of:
   - `ready` (sandbox id + links), or
   - `pending_prebuild` (snapshot building).
5. If `ready`, UI opens terminal/preview and starts status polling.
6. If `pending_prebuild`, UI shows snapshot progress and auto-retries launch.
7. User can choose `Recreate workspace` from advanced menu when needed.

## Rollout Plan

1. Implement branch-aware launch (remove hardcoded `main`).
2. Add sandbox reuse/resume path before create.
3. Add `pending_prebuild` state and async prebuild trigger.
4. Switch git refresh auth to header-based fetch.
5. Add explicit `recreate` action.
6. Add optional LSP bootstrap endpoint for future editor features.

## Acceptance Criteria

1. Re-clicking launch for same vault+branch reuses existing sandbox in `auto`
   mode.
2. Missing snapshot no longer hard-fails start flow; it enters
   `pending_prebuild` with visible progress.
3. Startup P50 for warm workspace (already created sandbox) is under 3 seconds
   to usable terminal URL.
4. Branch passed to Daytona launch always matches active Noter branch.
5. Git refresh no longer puts access token in remote URL.
