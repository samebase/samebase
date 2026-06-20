# DEV_ENV_ORIGIN SITE_URL Sync Spec

## Summary

Introduce a `DEV_ENV_ORIGIN` environment variable that drives `SITE_URL` updates for Convex Auth in
development. Development launchers set it when they already know the browser-facing origin, and
local dev falls back to the selected localhost frontend origin.

## Motivation

- Convex Auth uses `SITE_URL` for OAuth redirects.
- In shared, tunneled, or anonymous development flows, the public origin can differ from the local
  process origin.
- The origin handoff needs one stable contract across local worktrees and tunnel wrappers.

## Goals

- Use a provider-agnostic env var `DEV_ENV_ORIGIN`.
- Ensure `SITE_URL` is updated correctly when starting the dev server from a local or tunneled
  launcher.
- Keep local dev behavior unchanged when the Convex deployment points at localhost.

## Non-Goals

- No provider selection UI.
- No per-branch Convex dev deployments (still shared).

## Design

### 1) Source of truth for origin

`DEV_ENV_ORIGIN` is the preferred input when a launcher has already selected the browser-facing
origin.

**Precedence in `scripts/sync-site-url.ts`:**

```text
DEV_ENV_ORIGIN -> resolved local dev origin for localhost Convex deployments -> error
```

Remove `FUSION_ENV_ORIGIN` entirely.

### 2) Set DEV_ENV_ORIGIN in development launchers

When a launcher knows the browser-facing origin before Vite starts, it exports that origin for the
dev process:

```text
DEV_ENV_ORIGIN=<origin> pnpm run dev
```

The anonymous and primary local launchers set this from the selected frontend origin. Tunnel
wrappers should set it from the public tunnel origin. If a launcher cannot determine a public
origin, the follow-up sync only falls back to the resolved local dev origin when the Convex
deployment points at localhost; otherwise it fails closed instead of writing a localhost URL into a
shared deployment.

### 3) Where the origin is used

`apps/samebase/scripts/sync-site-url.ts` reads `DEV_ENV_ORIGIN`, falls back to the resolved local
dev origin for localhost Convex deployments, and runs:

```
npx convex env set SITE_URL "<origin>"
```

This runs in `predev` (already wired).

## Implementation Notes

- `DEV_ENV_ORIGIN` should be derived at dev server start time by the launcher that owns the public
  or local frontend origin.
- Keep logging minimal but add a diagnostic log for the chosen origin if helpful.

## Production Requirements

- Production deployments must set `SITE_URL` to the frontend origin (e.g. `https://app.example.com`)
  in Convex envs so OAuth callbacks redirect to the app rather than the Convex origin.

## User Experience

- User starts dev server from a local, anonymous, or tunneled launcher.
- `SITE_URL` is automatically set to the selected browser origin.
- OAuth redirects work inside the selected browser origin without manual configuration.

## Acceptance Criteria

1. Running through a launcher that sets `DEV_ENV_ORIGIN` results in `scripts/sync-site-url.ts`
   setting `SITE_URL` to that origin.
2. Local dev with a localhost Convex deployment and no `DEV_ENV_ORIGIN` sets `SITE_URL` to the
   resolved local dev origin, starting from `http://localhost:5173`.
3. OAuth redirects work from the selected browser origin without manual edits.

## Risks / Edge Cases

- Public origin discovery fails: localhost Convex deployments still sync to the resolved local dev
  origin, while shared deployments fail closed instead of writing a localhost URL.
- Shared Convex dev deployment: last writer wins (existing limitation).

## Open Questions

- None for this change. Future work may include per-branch or per-user Convex deployments.
