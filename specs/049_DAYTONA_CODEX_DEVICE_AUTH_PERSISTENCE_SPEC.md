# 049 Daytona Codex Auth Volume Spec

## Status

- Historical
- Superseded by `specs/055_DAYTONA_CODEX_SHARED_HOME_SPEC.md`
- Last updated: 2026-03-15

## Note

This document described the first volume-backed Codex auth design for Daytona.
The core idea that remains valid is:

1. use a per-user Daytona volume for durable Codex state
2. keep Codex auth out of Convex documents and repo files
3. drive login through a dedicated Daytona auth sandbox and device auth

The concrete path, mount, and runtime-user details in the original draft are no
longer the source of truth.

Obsolete assumptions from the original draft include:

- mounting the shared volume at `/root/.codex`
- treating `root` as the intended long-term runtime user
- mounting the shared volume directly at the live `CODEX_HOME`

Use `specs/055_DAYTONA_CODEX_SHARED_HOME_SPEC.md` for the implemented contract.
