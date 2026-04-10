# DEV_ENV_ORIGIN SITE_URL Sync Spec

## Summary

Introduce a provider-agnostic `DEV_ENV_ORIGIN` environment variable that drives
`SITE_URL` updates for Convex Auth in development. Replace the current
provider-specific `FUSION_ENV_ORIGIN` usage and compute `DEV_ENV_ORIGIN` at
dev-server startup for Daytona (and future sandbox providers).

## Motivation

- Convex Auth uses `SITE_URL` for OAuth redirects.
- In ephemeral sandboxes (Daytona, others), the public origin changes per
  sandbox instance.
- Today the logic is tied to `FUSION_ENV_ORIGIN`, which is provider-specific.
- We need a single, generic mechanism for all sandbox providers.

## Goals

- Use a provider-agnostic env var `DEV_ENV_ORIGIN`.
- Ensure `SITE_URL` is updated correctly when starting the dev server in a
  sandbox.
- Keep local dev behavior unchanged (default to `http://localhost:5173`).

## Non-Goals

- No provider selection UI.
- No refactor/rename of existing Daytona actions or UI labels.
- No per-branch Convex dev deployments (still shared).

## Design

### 1) Source of truth for origin

`DEV_ENV_ORIGIN` is the single input for sandbox environments.

**Precedence in `sync-site-url.mjs`:**

```
DEV_ENV_ORIGIN -> http://localhost:5173
```

Remove `FUSION_ENV_ORIGIN` entirely.

### 2) Compute DEV_ENV_ORIGIN in Daytona startup

When starting the dev server in a Daytona sandbox:

1. Fetch a signed preview URL from the sandbox:
   - `sandbox.getSignedPreviewUrl(DAYTONA_PREVIEW_PORT, DAYTONA_PREVIEW_TTL_SECONDS)`
2. Parse the origin:
   - `new URL(preview.url).origin`
3. Export `DEV_ENV_ORIGIN` for the dev server process:
   - `DEV_ENV_ORIGIN=<origin> pnpm run dev`

If preview URL generation fails, continue without `DEV_ENV_ORIGIN` so local
fallback is used. Do not block dev server start on this.

### 3) Where the origin is used

`apps/noter/sync-site-url.mjs` reads `DEV_ENV_ORIGIN` and runs:

```
npx convex env set SITE_URL "<origin>"
```

This runs in `predev` (already wired).

## Implementation Notes

- `DEV_ENV_ORIGIN` should be derived at dev server start time from the
  provider's preview URL.
- For Daytona, use the existing preview port and TTL constants.
- The preview URL origin is stable even if the signed URL token expires (the
  origin is just scheme + host).
- Keep logging minimal but add a diagnostic log for the chosen origin if
  helpful.

## Production Requirements

- Production deployments must set `SITE_URL` to the frontend origin (e.g.
  `https://app.example.com`) in Convex envs so OAuth callbacks redirect to the
  app rather than the Convex origin.

## User Experience

- User starts dev server from UI.
- `SITE_URL` is automatically set to the sandbox preview origin.
- OAuth redirects work inside the sandbox preview without manual configuration.

## Acceptance Criteria

1. Running `pnpm dev` inside Daytona results in:
   - `sync-site-url.mjs` setting `SITE_URL` to the sandbox preview origin.
2. Local dev (no `DEV_ENV_ORIGIN`) sets `SITE_URL` to `http://localhost:5173`.
3. OAuth redirects work from the sandbox preview without manual edits.

## Risks / Edge Cases

- Preview URL fetch fails: dev server still starts; `SITE_URL` falls back to
  localhost.
- Shared Convex dev deployment: last writer wins (existing limitation).

## Open Questions

- None for this change. Future work may include per-branch or per-user Convex
  deployments.
