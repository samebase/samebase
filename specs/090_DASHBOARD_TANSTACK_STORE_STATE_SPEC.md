# Dashboard TanStack Store State Spec

## Document Control

- Status: In progress
- Owner: Noter dashboard/frontend
- Last updated: 2026-05-03
- Related specs:
  - `specs/067_VAULT_BRANCH_FILTERS_SPEC.md`
  - `archive/079_DASHBOARD_UPDATED_STATUS_MANUAL_REFRESH_SPEC.md`

## Summary

The dashboard should use TanStack Store for local UI state instead of scattered React `useState`
calls. This keeps event handlers explicit, lets local state transitions live behind named actions,
and matches the store pattern introduced for the logo controls.

## Goals

1. Move low-risk dashboard UI state to TanStack Store.
2. Keep state stores scoped to the owning mounted component or control.
3. Replace direct setter choreography with named actions that preserve current behavior.
4. Leave server-refresh orchestration untouched while the separate server-side workflow branch is
   active.

## Non-Goals

1. Do not change dashboard vault or branch refresh behavior in this patch.
2. Do not move refresh scheduling, visibility listeners, or token refresh polling into the store.
3. Do not change persisted Convex dashboard settings or vault branch filter semantics.
4. Do not add route/query persistence for local-only UI state.

## State Migration Plan

Migrate these state buckets now:

1. Delete dialog intent, destructive option toggles, pending flags, and errors.
2. Create-app input, pending flag, and error text.
3. Provider disconnect and manual Cloudflare token-check pending state.
4. Per-vault developer tools open state.
5. Infrastructure retry pending vault id.
6. Sign-out pending state.
7. Global chat busy and autofocus handoff state.
8. Branch filter control search text and open state.
9. Visual fixture counters and branch expansion toggles.
10. Last-updated status text-selection frozen timestamp.

Keep these refresh-owned pieces out of scope until the server-side workflow branch lands:

1. `useDashboardRepositoryTreeRefresh`
2. `useVisibleDashboardRepositoryTreeRefresh`
3. `useCloudflareMcpTokenAutoCheck`
4. Cloudflare auto-check polling pause state and auto-check pending state if moving them would
   increase churn in refresh logic.

## Implementation Notes

1. Use `useCreateStore` and `useSelector` from `@tanstack/react-store`, matching the logo preview
   store style.
2. Prefer feature-owned hooks such as `useVaultDashboardLocalStore` and
   `useVaultBranchFiltersControlStore` over shared generic wrappers.
3. Keep async Convex calls in React handlers; store actions should update local UI state only.
4. Keep existing refs for popup windows, selection, and scroll anchoring because they are imperative
   DOM or browser handles rather than render state.

## Acceptance Checklist

- [x] Dashboard production components no longer use `useState` for migrated UI state.
- [x] Refresh scheduling logic is behaviorally unchanged.
- [x] Branch filter search/open behavior is unchanged on desktop and touch sheet surfaces.
- [x] Delete dialog defaults and pending/error states match existing behavior.
- [ ] Existing dashboard tests and targeted visual fixtures pass.

## Validation Notes

As of 2026-05-03, targeted dashboard unit tests and app typecheck pass. The targeted dashboard
visual run has four local one-pixel snapshot height mismatches in existing dashboard fixture
baselines, while the remaining twelve dashboard visual tests pass.
