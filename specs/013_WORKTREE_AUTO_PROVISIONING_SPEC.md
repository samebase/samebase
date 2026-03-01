# Worktree Auto-Provisioning Spec (Local Codex Focus)

## Document Control

- Status: Proposed
- Owner: Noter dev environment / local tooling
- Date: 2026-02-16
- Related specs:
  - `specs/007_SIMPLE_VIEW_FRONTMATTER_SPEC.md`
  - `specs/012_DEV_ENV_ORIGIN_SITE_URL_SYNC_SPEC.md`
- Related files:
  - `/Users/nicu/dev/my/noter/noter.md`
  - `/Users/nicu/dev/my/noter/apps/noter/package.json`
  - `/Users/nicu/dev/my/noter/apps/noter/vite.config.ts`
  - `/Users/nicu/dev/my/noter/apps/noter/sync-site-url.mjs`
  - `/Users/nicu/dev/my/noter/apps/noter/src/lib/simpleView.ts`

## Summary

Enable “one idea per worktree” by auto-provisioning a local Convex backend and a
unique frontend port for each git worktree on macOS. The primary entrypoint is
`pnpm dev` (run by the user or Codex), so multiple worktrees can run
concurrently without manual port or Convex setup, and local Codex runs stay
isolated per worktree.

## Goals

1. `pnpm dev` in any worktree just works (no manual Convex config or port
   edits).
2. Multiple worktrees can run in parallel without port conflicts.
3. Each worktree uses an isolated Convex backend instance so data and chat state
   don’t collide.
4. Configuration is stored in `noter.md` frontmatter (human + LLM readable).
5. Default path is local-only (no Netlify, no Codespaces) to keep iteration
   fast.

## Non-Goals

1. Automated worktree creation (handled manually or by Codex when requested).
2. VS Code tunnel or mobile editing flows (deferred).
3. Production provisioning (Netlify / Convex prod).
4. Git auto-commit/auto-push workflows.
5. Cross-device persistence of local Convex data.

## Product Decisions (Locked)

1. Worktree auto-provisioning targets **local Convex anonymous deployments** per
   worktree.
2. Unique Vite frontend ports are **deterministic per worktree** with a
   collision-safe fallback.
3. Configuration lives in `noter.md` frontmatter under a new `worktrees` block.
4. Default behavior is **enabled** when `worktrees` block is present; otherwise
   no change.

## Worktree Frontmatter Contract

Add a `worktrees` section to `noter.md` frontmatter (alongside `simpleView`).

Example:

```md
---
simpleView:
  exclude:
    - src/**
worktrees:
  enabled: true
  frontend:
    basePort: 5173
    range: 200
  convex:
    mode: anonymous_local
---
```

Defaults if missing:

- `worktrees.enabled`: `false`
- `frontend.basePort`: `5173`
- `frontend.range`: `200`
- `convex.mode`: `anonymous_local`

## Worktree Location Convention

To avoid forcing a new folder structure, adopt a filename‑based convention
instead of `noter/main`:

- Main worktree: `<repo>` (e.g., `~/dev/noter`)
- Other worktrees: `<repo>-<suffix>` (e.g., `~/dev/noter-idea-1`)

The **first `-` is the delimiter**. This keeps common habits (a single `noter`
folder) and enables consistent parsing without requiring a container directory.

## Worktree Identity

A stable worktree key is needed for backend + frontend port selection.

Algorithm:

1. Determine repo base name from `git rev-parse --show-toplevel` (basename).
2. If current folder basename starts with `${repoBase}-`, use the suffix after
   the first `-` as the worktree key candidate.
3. Otherwise fall back to `git rev-parse --abbrev-ref HEAD`.
4. If branch result is `HEAD`, use `git rev-parse --short HEAD` and prefix with
   `detached-`.
5. Slugify:
   - lowercase
   - replace non `[a-z0-9]` with `-`
   - trim repeated `-`
   - max length 32

Resulting `worktreeId` is used for:

- Anonymous local backend port selection
- Frontend port selection

## Convex Auto-Provisioning

### Mode: `anonymous_local`

- Set environment variables when starting dev:
  - `CONVEX_AGENT_MODE=anonymous`
- Run `node convex-dev.js` (wrapper around `convex dev`). In anonymous mode it
  must:
  - pass `--local`
  - pass worktree-specific `--local-cloud-port` and `--local-site-port`
- Convex CLI will:
  - start a local backend
  - create or reuse local anonymous state for this worktree path
  - write `.env.local` with `VITE_CONVEX_URL`

Note: in `CONVEX_AGENT_MODE=anonymous`, Convex uses deployment name
`anonymous-agent`. Isolation is achieved via per-worktree local backend ports
and state directories, not unique deployment labels.

### Rationale

Anonymous local deployments allow multiple isolated backends without creating
new Convex cloud projects or dev deployments. This is the lowest-friction way to
get “one idea per worktree.”

## Frontend Port Strategy

1. Compute deterministic port:
   - `port = basePort + (hash(worktreeId) % range)`
   - `hash` is a stable string hash (e.g. djb2).
2. If the port is in use, increment until a free port is found within the range.
3. If no free port in range, fall back to OS-assigned free port.

Set:

- `VITE_PORT` (or `DEV_SERVER_PORT`) for Vite
- `DEV_ENV_ORIGIN=http://localhost:<port>` so `sync-site-url.mjs` sets Convex
  `SITE_URL` correctly

## Dev Command Flow

Introduce a worktree-aware dev script (Node) that is invoked by `pnpm dev` (root
entrypoint).

### New script behavior

1. Resolve repo root + worktree ID.
2. Load `noter.md` frontmatter and parse `worktrees` settings.
3. If `worktrees.enabled` is false or missing, run current dev behavior
   (`pnpm dev`).
4. If enabled:
   - compute `worktreeId`, local backend ports, and frontend port
   - set env vars described above
   - spawn `dev:backend` and `dev:frontend` in parallel

### Integration points

- Update `/Users/nicu/dev/my/noter/apps/noter/package.json` `dev` script to
  remain the underlying implementation used by the worktree-aware script.
- Update `/Users/nicu/dev/my/noter/apps/noter/vite.config.ts` to read the port
  env and set `server.port`.

## Data Flow Summary

```text
noter.md -> parse worktrees config -> compute worktreeId + ports
  -> set CONVEX_AGENT_MODE + local backend ports + VITE_PORT + DEV_ENV_ORIGIN
  -> run convex dev + vite
```

## Acceptance Criteria

1. Two worktrees can run `pnpm dev` simultaneously without port conflicts.
2. Each worktree uses a unique local Convex backend URL/port pair.
3. `VITE_CONVEX_URL` in each worktree’s `.env.local` points to its own local
   backend.
4. `sync-site-url.mjs` sets `SITE_URL` to the worktree’s localhost port.
5. If `worktrees.enabled` is absent, behavior matches today.

## Tests

1. Unit: worktree ID generation
   - branch name
   - detached HEAD
   - slug sanitation
2. Unit: deterministic port calculation + collision fallback
3. Manual:
   - Start dev in two worktrees, verify both UIs load and backend URLs differ
   - Confirm `VITE_CONVEX_URL` differs by worktree

## Risks / Edge Cases

- Anonymous local deployments do not persist data across machines.
- GitHub OAuth might require additional setup for local anonymous deployments.
- Port range collision if many worktrees exceed the range (fallback handles
  this).

## Future Follow-ups

1. Optional `convex.mode=cloud_dev` to reuse existing dev deployment (single
   worktree).
2. VS Code tunnel / mobile editing path.
3. Optional auto-push of worktree changes for device handoff.
