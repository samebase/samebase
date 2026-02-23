# 024 Daytona Image And Startup Performance Spec

## Summary

This spec defines the remaining work to make Daytona startup fast and
predictable while keeping CI cost low:

1. Use content-based image identity (not commit SHA).
2. Reuse prebuilt images from PR builds on `main` when content is identical.
3. Measure startup and build performance with repeatable metrics.

## Problem

- Current Daytona startup includes repo refresh and dev server startup work.
- Image build time is expensive (~minutes), so rebuilding on each commit is not
  acceptable.
- CI image tags currently rely on lock hash only, which does not fully capture
  all image inputs.

## Goals

- Reduce time-to-usable Daytona workspace.
- Avoid unnecessary image rebuilds.
- Support all merge strategies (squash, rebase+merge, merge commit) without
  losing image reuse.
- Keep rollout safe with compatibility fallback.

## Non-Goals

- Replacing Daytona prebuild architecture.
- Building source snapshots for every commit.
- Forcing a single repository merge strategy.

## Technical Decision

Use an immutable **full input hash** for deps images.

Reason:

- Works across all merge strategies.
- Reuses PR-built images on `main` when inputs are unchanged.
- Avoids incorrect cache hits from lock-only tagging.

## Full Input Hash Definition

Hash must include every effective input to `Dockerfile.daytona-deps`:

- `Dockerfile.daytona-deps`
- `pnpm-lock.yaml`
- `package.json`
- `pnpm-workspace.yaml`
- `apps/noter/package.json`
- `apps/noter-starter-template/package.json`
- build args affecting output (`PNPM_VERSION`, etc.)
- `DAYTONA_BASE_IMAGE` reference string

## CI Flow

### Triggers

- `pull_request` to `main` with same path filters.
- `push` to `main` with same path filters.
- `workflow_dispatch`.

### Behavior

1. Compute `fullInputHash`.
2. Build with BuildKit cache.
3. Publish immutable tag:
   - `ghcr.io/<owner>/<repo>-daytona-deps:<fullInputHash>`
4. On `main`, also publish alias tags:
   - `deps-lock-<lockHash>` (transition compatibility)
   - `<lockHash>` (legacy compatibility)
5. Add concurrency:
   - cancel stale workflow runs per ref.

### Build Caching

- Keep `cache-from/cache-to` with GHA backend.
- Keep Dockerfile cache mount for pnpm store.

## Backend (Convex) Lookup

Update Daytona deps image resolution in `apps/noter/convex/daytonaActions.ts`:

1. Compute the same `fullInputHash`.
2. Resolve primary tag: `<fullInputHash>`.
3. During migration, fallback to `<lockHash>`.

## Measurement Plan

Collect data before and after rollout.

### Startup Metrics (already instrumented)

- `totalMs`
- `sandboxCreateMs`
- `repoRefreshMs`
- `devServerStartMs`
- terminal link readiness duration

### CI Metrics

- PR build wall time (cold and warm cache)
- main build wall time when image already exists
- main build wall time when image does not exist

### Sample Size

- At least 5 runs per scenario.
- Report p50 and p90.

## Acceptance Criteria

- Main path does not rebuild deps image when `fullInputHash` is unchanged.
- PR-produced image is reusable on `main` regardless of merge strategy.
- Startup p50 improves versus baseline.
- No increase in prebuild failures from missing image tags.

## Rollout Plan

1. Add `fullInputHash` computation in CI and publish immutable tag.
2. Add backend lookup support for full-hash tag + compatibility fallback.
3. Run baseline vs optimized measurement.
4. If stable for 1 week, remove old lock-only primary path.

## Risks

- Hash mismatch between CI and backend logic.
- Base image tag drift when a floating base image tag is reused.
- Fork PRs may lack push permissions; handle with conditional publish.

## Open Questions

- Retention policy for old immutable tags in GHCR.
- Whether to include branch-scoped cache scopes or shared cache only.
