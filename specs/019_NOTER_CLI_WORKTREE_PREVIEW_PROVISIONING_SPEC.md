# 019 Local Worktree Bootstrap Spec (Existing GH + Convex CLI)

## Document Control

- Status: Proposed
- Owner: Noter local developer workflow
- Last updated: 2026-02-19
- Related specs:
  - `specs/012_DEV_ENV_ORIGIN_SITE_URL_SYNC_SPEC.md`
  - `specs/013_WORKTREE_AUTO_PROVISIONING_SPEC.md`
  - `specs/014_WORKTREE_CLOUD_PROVISIONING_AND_CLI_AUTH_SPEC.md`

## Summary

Solve the immediate local-dev problem for Codex-created worktrees: new worktrees often start without
Convex environment values, so `make` is not smooth.

The MVP approach is intentionally small:

1. Require developer machine to already be authenticated with GitHub CLI and Convex CLI.
2. On `make`, run preflight checks for those auth states.
3. If `apps/noter/.env.local` is missing in the current worktree, copy it from the `main` worktree.
4. Continue with existing `pnpm install` and `pnpm dev`.

This keeps local workflows fast and reduces support surface. Non-technical users can stay in
browser-only mode.

## Problem Statement

Current behavior in new worktrees:

- User starts a fresh Codex conversation in a new git worktree.
- Repo code is present, but Convex env linkage in `apps/noter/.env.local` may be missing.
- `make` cannot reliably start dev without manual repair.

Goal: make this path reliable with minimal new infrastructure.

## Goals

- Make new local worktrees boot with one command (`make`) when tools are already set up.
- Keep behavior deterministic and non-interactive.
- Reuse existing `gh` and `convex` auth; do not introduce new auth layers in MVP.
- Avoid locking users into Noter-managed local auth for basic local development.

## Non-Goals

- No Noter CLI login/session/token model in MVP.
- No backend-mediated provisioning in MVP.
- No automatic per-worktree preview deployment creation in MVP.
- No data copy between Convex deployments in MVP.
- No changes to browser-only user flow.

## Product Decisions (Locked for MVP)

1. Local-dev mode requires passing both:
   - `gh auth status`
   - `npx convex login status`
2. `make` must fail fast with actionable error if either check fails.
3. `apps/noter/.env.local` is bootstrapped from the `main` worktree only when missing.
4. Existing shared Convex deployment behavior remains unchanged.
5. Any advanced preview-per-worktree provisioning is deferred.

## User Flow (MVP)

1. User has `gh` and `convex` CLI already authenticated on machine.
2. User creates a new worktree (manually or via Codex).
3. User runs `make`.
4. `make` runs:
   - auth preflight checks
   - `.env.local` bootstrap from `main` worktree if missing
   - existing install + dev steps
5. Dev server starts without extra manual setup.

## Technical Design

### Preflight checks

Run before install/dev:

- `gh auth status`
- `npx convex login status`

Failure behavior:

- Exit non-zero.
- Print short, explicit remediation command:
  - `gh auth login`
  - `npx convex login`

### Main worktree discovery

Resolve `main` worktree path via:

- `git worktree list --porcelain`
- select block where `branch refs/heads/main`

If no `main` worktree is found:

- fail with explicit message and next step.

### `.env.local` bootstrap

Target file:

- `apps/noter/.env.local` in current worktree.

Source file:

- `<main_worktree>/apps/noter/.env.local`.

Rules:

- If target exists, do nothing.
- If target missing and source exists, copy source to target.
- If both missing, fail with explicit message.

### `make` integration

MVP target sequence:

1. `pnpm run worktree:bootstrap` (new helper script)
2. `pnpm install`
3. `pnpm dev`

Helper script responsibilities:

- run preflight
- discover main worktree
- bootstrap `.env.local` if missing

## Security Notes

- Do not print secrets from `.env.local`.
- Do not mutate existing `.env.local` values in this MVP.
- Copy file only when target is absent.

## Testing

### Manual

1. New worktree with missing `apps/noter/.env.local`:
   - `make` should copy env and start.
2. New worktree with existing `apps/noter/.env.local`:
   - `make` should not overwrite.
3. Logged-out `gh` or `convex`:
   - `make` should fail with explicit command to fix.
4. Missing `main` worktree env source:
   - `make` should fail with explicit message.

### Optional automated checks

- script unit test for parsing `git worktree list --porcelain`.
- script unit test for bootstrap rule matrix (exists/missing).

## Follow-up Options (Not MVP)

1. Branch + machine-scoped preview deployment provisioning.
2. Noter backend-mediated provisioning API.
3. Noter CLI package (`npx`) for external users.
4. Seed/copy data workflow from shared dev deployment to preview deployment.
5. Automatic cleanup/TTL policy for preview deployments.

## Open Questions

1. Should fallback source support non-`main` default branch repos (`master` or configured default)?
2. Should bootstrap optionally copy from a user-defined canonical worktree path?
