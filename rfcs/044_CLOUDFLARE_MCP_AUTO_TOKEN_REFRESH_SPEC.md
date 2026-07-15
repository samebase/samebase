# 044 Cloudflare MCP Auto Token Refresh Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-05-12
- Related specs:
  - `rfcs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `rfcs/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`
  - `rfcs/036_MCP_CONNECTION_TOKEN_HEALTH_VISIBILITY_SPEC.md`
  - `rfcs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md`

## Summary

Automatically refresh Cloudflare MCP OAuth tokens in-app using the same refresh orchestration
patterns already used for repository tree refresh:

1. page-load + window-focus refresh triggers
2. expiry-aware refresh window (default: 30 minutes before token expiry)
3. timed background scheduler tick while visible
4. client-side debounce
5. backend mutex/debounce
6. stale-lock recovery
7. visible countdown in the Providers UI

This removes dependency on the manual `Check token` button for normal token maintenance while
keeping manual force-check as an explicit fallback.

## Why this spec exists

Cloudflare MCP token refresh currently works only when specific actions invoke
`internal.cloudflareMcpOAuth.resolveConnectionForUser` or when the user clicks manual `Check token`.

That behavior is functionally correct but inconsistent with established in-app refresh behavior used
for repository sync (often referred to by users as "git fetch"): automatic refresh on page
load/focus, debounce, lock, and clear runtime state.

## Current State Research

### Cloudflare token flow today

1. `apps/noter/convex/cloudflareMcpOAuth.ts`:
   - `resolveConnectionForUser` can refresh token when forced or near expiry.
   - refresh metadata is persisted in `providerConnections.tokenHealth`.
2. `apps/noter/convex/users.ts`:
   - `getCloudflareConnectionStatus` is metadata-only and does not trigger refresh.
   - `checkCloudflareMcpTokenHealth` forces refresh (`forceRefresh: true`).
3. `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`:
   - Cloudflare has a manual `Check token` button.
   - no automatic background token check on focus/page load.

### Repository Refresh Comparison At Spec Time

This comparison is historical. Current GitHub repository inventory behavior is defined by
`specs/114_GITHUB_REPOSITORY_INVENTORY_SPEC.md`; Cloudflare token refresh still reuses the generic
browser duplicate-request guard.

1. Frontend triggers on focus and page-load:
   - `apps/noter/src/components/FileView.tsx`
   - `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
2. Frontend duplicate-request guard:
   - `apps/noter/src/lib/refreshDebounce.ts`
3. Backend lock/debounce/stale lock:
   - `apps/noter/convex/vault/branches.ts` (`claimTreeRefresh`, `releaseTreeRefresh`)
4. Backend action uses lock in `try/finally`:
   - `apps/noter/convex/github.ts` (`refreshRepositoryTree`)

## Goals

1. Auto-maintain Cloudflare MCP token health without manual clicks.
2. Reuse the same "bells and whistles" refresh shape as repository refresh.
3. Prevent duplicate refresh storms from multiple tabs/renders.
4. Preserve existing manual force-check UX.
5. Refresh well before expiry (default 30-minute runway) to allow retries.
6. Keep Cloudflare refresh low-noise and non-blocking for normal UI use.
7. Make scheduler/polling visible in UI with a live countdown to the next check.

## Non-Goals

1. Periodic cron-based token refresh.
2. Extending this behavior to non-Cloudflare providers in this phase.
3. Introducing new environment variables.
4. Changing Cloudflare OAuth scopes or consent semantics.
5. Hard-blocking app usage when refresh fails.

## Scope

1. Backend lock/debounce API for Cloudflare token refresh.
2. Backend expiry-aware scheduling policy and retry window.
3. Backend user action for auto-refresh entrypoint with trigger context.
4. Frontend automatic trigger wiring in Providers UI host (`VaultDashboard`).
5. Manual check path migration to shared backend refresh entrypoint.
6. Polling visibility UI (countdown + state text).
7. Observability and test coverage for refresh orchestration.

## Proposal

### Terminology

When this spec says "git fetch behavior", it refers to the existing repository tree refresh
orchestration in Noter (focus/page-load triggers + debounce + mutex), not a literal shell
`git fetch` process in the browser.

### 1) Cloudflare refresh orchestration state

Add refresh lock metadata for Cloudflare provider connections:

```ts
tokenRefreshStartedAt?: number
lastTokenRefreshAt?: number
```

Placement:

1. On `providerConnections(kind="cloudflare")` documents.
2. Optional fields for backward compatibility.

### 2) Backend lock contract (mirror tree refresh)

Add internal mutations with behavior parallel to `claimTreeRefresh` / `releaseTreeRefresh`:

1. `internal.providerConnections.claimCloudflareTokenRefresh`
2. `internal.providerConnections.releaseCloudflareTokenRefresh`

Claim rules:

1. Skip if no Cloudflare connection.
2. Skip if auth method is not `mcp_oauth`.
3. If `force !== true`:
   - skip if `lastTokenRefreshAt` is within debounce window
4. Regardless of `force`, skip if `tokenRefreshStartedAt` exists and lock is not stale.
5. If claimed, set `tokenRefreshStartedAt = now`.

Release rules:

1. Always clear `tokenRefreshStartedAt`.
2. Set `lastTokenRefreshAt = now` only after a successful refresh.

### 3) Shared refresh constants

Add Cloudflare token refresh constants:

1. `CLOUDFLARE_TOKEN_REFRESH_DEBOUNCE_MS = 2 * 60 * 1000`
2. `CLOUDFLARE_TOKEN_REFRESH_PAGE_LOAD_DEBOUNCE_MS = 10 * 1000`
3. `CLOUDFLARE_TOKEN_REFRESH_STALE_LOCK_MS = 3 * 60 * 1000`
4. `CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS = 30 * 60 * 1000`
5. `CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS = 60 * 1000`
6. `CLOUDFLARE_TOKEN_REFRESH_RETRY_BASE_MS = 60 * 1000`
7. `CLOUDFLARE_TOKEN_REFRESH_RETRY_MAX_MS = 5 * 60 * 1000`

Important clarification:

1. `*_STALE_LOCK_MS` is lock recovery timing, not refresh cadence.
2. `*_SCHEDULER_TICK_MS` is when the app evaluates whether refresh is due, not an unconditional
   token refresh interval.

Location: shared module (`apps/noter/shared/*`) similar to tree refresh constants.

### 4) Refresh timing policy (expiry-driven)

Default policy:

1. Automatic refresh starts at `expiresAt - CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS` (default 30
   minutes before expiry).
2. Before that window opens, scheduler ticks only update UI countdown and return without network
   refresh.
3. Once in-window, automatic refresh attempts run using the lock/debounce flow.
4. On transient failure in-window, retry with bounded backoff (`RETRY_BASE_MS` up to `RETRY_MAX_MS`)
   until success or hard invalid state.
5. `credentialExpiresAt` is required for Cloudflare MCP OAuth rows. The OAuth callback and refresh
   path fail closed if Cloudflare omits `expires_in`.

### 5) User-facing backend action for auto refresh

Add action:

- `users.refreshCloudflareMcpTokenIfNeeded`

Args:

```ts
{
  trigger?: "focus" | "page_load" | "poll" | "manual"
  force?: boolean // optional override, default false
}
```

Behavior:

1. Resolve authenticated user and Cloudflare connection.
2. If disconnected or non-`mcp_oauth`, return current status payload unchanged.
3. Compute scheduling state:
   - `refreshWindowStartsAt = expiresAt - EARLY_WINDOW_MS`
4. For non-manual triggers, if current time is before due time, return early with
   `mcpTokenNextAutoCheckAt` and do not call token refresh endpoint.
5. If refresh is due, attempt lock claim with trigger-sensitive debounce window.
6. If claim fails, return current status payload quickly.
7. If claim succeeds:
   - call `internal.cloudflareMcpOAuth.resolveConnectionForUser`
     - `forceRefresh = true` only for manual/force calls
     - for automatic checks, call refresh only when due (in refresh window)
8. On transient failure, compute `mcpTokenNextAutoCheckAt` with bounded backoff and retry inside the
   pre-expiry window.
9. Release lock in `finally`.
10. Return `cloudflareConnectionStatusValidator` payload plus optional `mcpTokenNextAutoCheckAt`.

### 6) Manual check uses the same pathway

Keep `Check token` button, but route it through
`refreshCloudflareMcpTokenIfNeeded({ trigger: "manual", force: true })` so manual and automatic
flows share one lock/debounce path.

`checkCloudflareMcpTokenHealth` can be:

1. replaced by the new action, or
2. retained as a thin wrapper for backward compatibility.

### 7) Frontend automatic triggers in VaultDashboard

In `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`:

1. Add `refreshCloudflareMcpTokenIfNeeded` action hook.
2. Trigger background check when:
   - page is visible on initial load (`page_load`)
   - window regains focus (`focus`)
   - document visibility changes to `visible` (`focus`)
   - poll interval tick while panel is visible (`poll`)
3. Use client-side debounce (`claimRefreshDebounce`) with a dedicated scope key (for example
   `cloudflare_token`).
4. Background refresh failures should be logged, but should not overwrite create flow validation
   text unless user explicitly clicked manual check.

### 8) UX behavior

1. Keep existing token status text (`Valid`, `Expiring soon`, `Expired`, `Invalid`, `Unknown`).
2. Keep manual `Check token` button with spinner.
3. Show scheduler/refresh state text for Cloudflare MCP row:
   - before window: `Auto-refresh starts in <relative countdown>`
   - in window, waiting for due tick/backoff: `Auto-refresh in <relative countdown>`
   - in-flight: `Checking...`
   - hidden tab paused state: `Auto-check paused (tab hidden)`
4. Countdown should tick live (1s cadence) using existing `useNow`-style clock.
5. Continue showing reconnect guidance when status is `invalid`.
6. Manual check resets the countdown baseline so users can see when next poll will occur.

## API Surface Changes

### `users.getCloudflareConnectionStatus`

No breaking changes required. Optional additive fields may be included for UI lock visibility:

```ts
mcpTokenRefreshStartedAt?: number
mcpTokenLastRefreshAt?: number
```

If countdown needs cross-tab/server-accurate scheduling, optional additive field:

```ts
mcpTokenNextAutoCheckAt?: number
```

Recommendation:

1. Prefer returning `mcpTokenNextAutoCheckAt` from backend so UI countdown is accurate for
   expiry-window scheduling and retry backoff.
2. Client-side fallback (`last check + interval`) is acceptable only when this field is absent.

### New action

`users.refreshCloudflareMcpTokenIfNeeded` returns the same `cloudflareConnectionStatusValidator`
shape.

## Error Handling Rules

1. Auth failures during refresh still map to `tokenHealth.status = "invalid"`.
2. Transient runtime failures keep derived status and set `source = "runtime_error"`.
3. Automatic background refresh must fail silently in UI (console + telemetry), while manual check
   can surface user-visible error text.

## Observability

Add structured events:

1. `cloudflare:mcp_token:auto_refresh_requested`
2. `cloudflare:mcp_token:auto_refresh_skipped` (reason: debounced, locked, disconnected,
   non_mcp_oauth, before_refresh_window)
3. `cloudflare:mcp_token:auto_refresh_claimed`
4. `cloudflare:mcp_token:auto_refresh_released`
5. Include `trigger` in all events (`page_load`, `focus`, `poll`, `manual`).
6. Include scheduling fields where available:
   - `expiresAt`
   - `refreshWindowStartsAt`
   - `nextAutoCheckAt`
   - `retryDelayMs` (for transient failures)

Reuse existing refresh success/failure events from `cloudflareMcpOAuth.ts`.

## Testing Plan

1. Unit tests for claim/release lock behavior:
   - debounce skip
   - stale lock takeover
   - force bypass
2. Action tests for `refreshCloudflareMcpTokenIfNeeded`:
   - returns quickly when not claimed
   - returns quickly with `nextAutoCheckAt` when before refresh window
   - calls resolver when claimed
   - retries with backoff after transient in-window failure
   - always releases lock in error path
3. Frontend tests (or focused integration):
   - focus/visibility triggers fire once per debounce window
   - poll interval trigger fires on schedule only when visible
   - Providers row shows `Auto-refresh starts in ...` / `Auto-refresh in ...` countdown and
     transitions to `Checking...`
   - manual check path still shows pending state

## Rollout Plan

1. Add backend lock metadata + claim/release mutations.
2. Add new refresh action and wire manual check through it.
3. Add dashboard focus/page-load/poll triggers with client debounce + countdown UI.
4. Add telemetry and monitor refresh volume/error rate.
5. Remove legacy manual-only code path once verified stable.

## Acceptance Criteria

1. Cloudflare MCP token refresh runs automatically on page load/focus without user clicks.
2. For tokens with known expiry, automatic refresh does not attempt provider refresh before
   `expiresAt - 30 minutes`.
3. Once inside the 30-minute refresh window, automatic refresh attempts run and transient failures
   retry with bounded backoff.
4. Automatic refresh does not spam provider calls across rapid focus changes.
5. Concurrent tabs/processes do not run duplicate refreshes for the same user connection when lock
   is active.
6. Manual `Check token` still works and force-refreshes through the same orchestration path.
7. Providers UI visibly indicates scheduler state with a live countdown while connected via MCP
   OAuth.
8. Existing Cloudflare provisioning and inventory calls continue to work and benefit from fresher
   credentials.
9. No new environment variables are required.

## Open Questions

1. Should automatic token refresh run only in `VaultDashboard`, or globally in app shell routes
   where Cloudflare operations are likely?
2. Should create-flow actions (`New app/agent` with Cloudflare selected) synchronously call
   refresh-if-needed right before submit as an extra guard?
3. Should `invalid` token state become a hard block for Cloudflare create flow in a follow-up phase?
4. Should we standardize one polling countdown component and apply it to all other polling UIs, such
   as commit status and developer-tool panels, in a follow-up spec?
5. Should the early-refresh window remain 30 minutes, or be configurable to 10 minutes for lower
   token churn?
