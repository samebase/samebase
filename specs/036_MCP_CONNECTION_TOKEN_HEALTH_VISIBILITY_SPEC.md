# 036 MCP Connection Token Health Visibility Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-03-04
- Related specs:
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/029_PROVIDERS_PANEL_SETTINGS_SPEC.md`
  - `specs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `rfcs/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`

## Summary

Expose MCP token health in the Providers UI so users can see whether their MCP
connection is still usable before provisioning or production-read actions fail.

Initial target is Cloudflare (`auth.method = "mcp_oauth"`), with schema/API
shapes designed so future MCP providers can reuse the same contract.

## Problem

Today, Providers UI shows only `connected` + auth method. Users can appear
connected while the MCP access token is expired/invalid. The first clear signal
often comes later during provisioning or infra reads, which is too late.

We need explicit token health status in UI, including graceful behavior when no
expiry metadata is available.

## Goals

1. Show MCP token health in Providers UI with clear user-facing states.
2. Surface expiry information when available.
3. Surface invalid/refresh-failed states with a reconnect call-to-action.
4. Avoid chatty provider calls on every UI render.
5. Keep solution generic enough for future `mcp_oauth` providers.

## Non-Goals

1. Full token-health UX for non-MCP auth methods (`oauth`, `api_key`) in this
   phase.
2. Background cron jobs for periodic provider-wide health checks.
3. New environment-variable fallback paths.
4. Blocking all app usage when MCP token is unhealthy.

## Scope

1. Backend: token-health metadata model and Cloudflare MCP health resolution.
2. Backend: connection-status query returns MCP token health.
3. Frontend: Providers panel shows health status and reconnect guidance.
4. Frontend: optional manual "Check token" action for MCP connections.

## State Model

### Token Health Status

`mcpTokenStatus` is one of:

1. `valid`
2. `expiring_soon`
3. `expired`
4. `invalid`
5. `unknown`

### State Semantics

1. `valid`: token is usable and not near expiry.
2. `expiring_soon`: token still usable, but expiry is within warning window.
3. `expired`: expiry timestamp has passed.
4. `invalid`: active validation/refresh failed due auth error (for example
   `401 invalid_token`).
5. `unknown`: no reliable expiry data and no recent active validation result.

## Data Model Changes

Add optional connection health metadata to `providerConnections` documents:

```ts
tokenHealth?: {
  status: "valid" | "expiring_soon" | "expired" | "invalid" | "unknown"
  checkedAt: number
  expiresAt?: number
  source: "expiry_metadata" | "refresh_attempt" | "active_probe" | "runtime_error"
  errorMessage?: string
}
```

Notes:

1. Keep `tokenHealth` optional; it is a cached health snapshot, not the source
   of truth for the persisted credential shape.
2. `expiresAt` is copied from auth metadata when available.
3. `errorMessage` must be short/sanitized for UI display.

## Backend Contract

### 1) Resolve MCP Connection with Health

Extend/standardize the existing internal Cloudflare resolver behavior:

1. Read connection.
2. Derive initial status from required Cloudflare MCP `credentialExpiresAt`.
3. If forced check or near expiry:
   - attempt refresh (or active probe if refresh not applicable),
   - persist new auth tokens when refresh succeeds,
   - persist `tokenHealth` status.
4. On auth failure, persist `tokenHealth.status = "invalid"` and short error.

For Cloudflare, reuse `cloudflareMcpOAuth.resolveConnectionForUser` as the
single implementation point.

### 2) Status Query Surface

Extend `users.getCloudflareConnectionStatus` response:

```ts
{
  connected: boolean
  accountId?: string
  authMethod?: "oauth" | "mcp_oauth" | "api_key"
  mcpTokenStatus?: "valid" | "expiring_soon" | "expired" | "invalid" | "unknown"
  mcpTokenExpiresAt?: number
  mcpTokenCheckedAt?: number
  mcpTokenError?: string
}
```

Contract rules:

1. MCP fields are returned only when `authMethod === "mcp_oauth"`.
2. For non-MCP methods, MCP fields are omitted.
3. If `tokenHealth` absent, derive from `credentialExpiresAt`.

### 3) Manual Check Action

Add a user action to trigger an active health check:

- `users.checkCloudflareMcpTokenHealth`

Behavior:

1. Requires authenticated user and existing Cloudflare connection.
2. Calls internal resolver with `forceRefresh: true`.
3. Returns updated status payload consistent with
   `getCloudflareConnectionStatus`.

## Frontend UX Contract

### Providers Panel

For Cloudflare row when `authMethod = "mcp_oauth"`:

1. Show one health badge:
   - `Valid`
   - `Expiring soon`
   - `Expired`
   - `Invalid`
   - `Unknown`
2. Show timestamp text when present:
   - `Expires <relative time>` for `valid/expiring_soon`
   - `Expired <relative time>` for `expired`
   - `Last checked <relative time>` for `invalid/unknown`
3. Show `Reconnect` guidance for `invalid`.
4. Show `Check token` button (manual action) for MCP connections.

### Create Repository Flow

For Cloudflare hosting selection:

1. Keep existing connection gating (`connected`) unchanged in phase 1.
2. If `mcpTokenStatus` is `invalid` or `expired`, show inline warning before
   create/retry actions:
   - `Cloudflare token is invalid or expired. Reconnect Cloudflare.`
3. Do not hard-block create in phase 1; warn and allow user to proceed.

## Health Resolution Rules

### Expiry Warning Window

- `MCP_EXPIRING_SOON_MS = 15 * 60 * 1000` (15 minutes)

### Derivation Logic

1. If `credentialExpiresAt <= now`: `expired`.
2. If `credentialExpiresAt <= now + window`: `expiring_soon`.
3. Else: `valid`.

### Invalid Classification

Use `invalid` when active refresh/probe returns auth-specific failure
(`401 invalid_token`, invalid refresh token, revoked grant).

For transient network timeouts or provider outages, keep last non-invalid
derived status and set `source = "runtime_error"` with `errorMessage`.

## Performance and Safety

1. `getCloudflareConnectionStatus` must be cheap and mostly metadata-derived.
2. No provider network call on every render.
3. Active checks happen only on:
   - explicit manual check,
   - existing runtime flows that already need Cloudflare access.

## Observability

Add structured logs:

1. `cloudflare:mcp_token:health_derived`
2. `cloudflare:mcp_token:refresh_success`
3. `cloudflare:mcp_token:refresh_failed`
4. `cloudflare:mcp_token:status_query`

Log fields:

1. `userId`
2. `status`
3. `source`
4. `expiresAt` (if any)
5. `message` (sanitized, optional)

## Rollout Plan

1. Backend schema/query/action changes.
2. Providers panel MCP health rendering.
3. Manual `Check token` action.
4. Post-release monitor for:
   - invalid-token rates,
   - reconnect frequency,
   - provisioning failures caused by auth.

## Acceptance Criteria

1. Cloudflare row shows MCP token health state when connected via MCP OAuth.
2. Expiry-based states render correctly from metadata.
3. Expired/invalid token states are visible before provisioning actions.
4. Manual `Check token` updates status within a single UI refresh cycle.
5. Existing non-MCP provider UX remains unchanged.
6. No new required environment variables are introduced.

## Open Questions

1. Should `invalid` state hard-block Cloudflare-hosted repo creation in phase 2?
2. Should we add periodic background refresh/check for long-lived sessions?
3. Should `tokenHealth` be modeled generically for all provider auth methods in
   a follow-up spec?
