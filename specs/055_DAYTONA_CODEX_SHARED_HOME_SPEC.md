# 055 Daytona Codex Shared Home Spec

## Status

- Implemented
- Last updated: 2026-03-13

## Summary

Daytona currently mounts the shared per-user Codex volume at `/root/.codex` and
sets `CODEX_HOME` to that path. In production, `codex login status` works, but
interactive `codex` fails in sandbox terminals when it tries to persist the
directory trust decision for the repo.

The desired model is still one shared writable Codex home across Daytona auth
and workspace sandboxes. The fix is to move that shared home under the active
sandbox user home at `/home/daytona/.codex` and treat that path as the single
Codex state surface.

## Problem

Observed in production on 2026-03-13:

1. `codex login status` succeeds inside the sandbox.
2. `codex --help` succeeds inside the sandbox.
3. Interactive `codex` fails before entering the TUI.
4. Codex logs report:
   - failed to persist `config.toml`
   - path: `/root/.codex/config.toml`
   - error: `Operation not permitted (os error 1)`

This means auth reuse works, but the mounted shared home is not valid enough for
live interactive Codex usage in the current Daytona terminal flow.

## Goal

Keep one shared writable Codex home per user across Daytona sandboxes while
making interactive Codex work in the sandbox terminal without copy-based auth
workarounds.

## Non-Goals

1. Do not switch to per-sandbox isolated Codex homes.
2. Do not copy only `auth.json` into a local sandbox directory as the primary
   design.
3. Do not mount over the entire `/home/daytona` directory.
4. Do not store Codex auth or memories in Convex documents.

## Design

### 1. Shared volume stays the source of truth

Keep the per-user Daytona Codex volume introduced in spec 049. It remains the
single persisted Codex state surface across auth sandboxes and workspace
sandboxes.

### 2. Move the shared Codex home under the sandbox user home

Use:

- sandbox user: `daytona`
- sandbox home: `/home/daytona`
- shared Codex home: `/home/daytona/.codex`

Do not use `/root/.codex` as the Codex home going forward.

### 3. Mount the same volume at the new path in both sandbox types

For:

1. the lightweight Codex auth sandbox
2. normal Daytona workspace sandboxes

mount the same per-user Codex volume at:

- `/home/daytona/.codex`

Set:

- `CODEX_HOME=/home/daytona/.codex`

Codex compatibility should be keyed off that explicit mount path and
`CODEX_HOME` value. The shell prompt may still appear as `root` in some Daytona
terminal surfaces, but Codex state must no longer depend on `/root/.codex`.

### 4. Use the mount path as the compatibility boundary

Existing sandboxes or auth sandboxes using `/root/.codex` should be considered
incompatible and recreated automatically. The current setup checks already use
the configured `DAYTONA_CODEX_HOME`, so changing the shared constant is enough
to invalidate old mount-path setups.

### 5. Preserve shared Codex state semantics

This path change is not an auth-only migration. The mounted volume should remain
the live writable Codex home so:

1. auth persists
2. trust decisions persist
3. Codex memories and other future state remain shared across sandboxes and
   agents

## Acceptance Criteria

1. Connecting or verifying Codex in Daytona stores `codexHome` as
   `/home/daytona/.codex`.
2. New auth sandboxes mount the shared volume at `/home/daytona/.codex`.
3. New workspace sandboxes mount the shared volume at `/home/daytona/.codex`.
4. Existing sandboxes mounted at `/root/.codex` are treated as incompatible and
   recreated on demand.
5. In a fresh Daytona workspace sandbox terminal:
   - `echo $CODEX_HOME` prints `/home/daytona/.codex`
   - `codex login status` succeeds
   - interactive `codex` reaches the trust prompt
   - after confirming trust, Codex enters the normal interactive TUI
   - interactive `codex` no longer fails while persisting `config.toml` under
     `/root/.codex`

## Validation

1. Update the existing sandbox env/bootstrap test expectations to the new
   `CODEX_HOME`.
2. Re-run the production-style Daytona sandbox flow.
3. In the Daytona terminal, verify interactive `codex` works without overriding
   `CODEX_HOME` manually.
