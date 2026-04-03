# Dashboard Updated Status Manual Refresh Spec

## Document Control

- Status: In progress
- Owner: Noter dashboard + GitHub sync flows
- Last updated: 2026-04-03
- Related specs:
  - `specs/070_GITHUB_SYNC_PHASED_ROLLOUT_SPEC.md`
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`

## Summary

The dashboard repository card status chip that renders `Updated 3m ago` should
perform a repository tree refresh when clicked, while still respecting the
existing sync debounce and cooldown rules.

## Current Runtime State

As of 2026-04-03, the dashboard `Updated … ago` chip still navigates to the
current URL instead of calling `api.github.refreshRepositoryTree`.

That behavior was acceptable when a full-page reload reliably re-ran the
dashboard's refresh path, but the current app runtime no longer treats a
same-URL reload as a guaranteed full data refresh boundary. The result is that
the chip remains visually clickable while stale cards may stay stale after the
click.

The explicit refresh behavior already exists elsewhere:

1. dashboard auto-refresh calls `api.github.refreshRepositoryTree`
2. file view auto-refresh calls `api.github.refreshRepositoryTree`
3. backend claim/cooldown logic already enforces recent-success debounce,
   in-progress locking, and failure cooldown

## Goals

1. Make a plain click on `Updated … ago` request a real repository refresh
2. Preserve the current debounce/cooldown protections
3. Keep the status text selectable without accidental refreshes
4. Avoid reintroducing full-page reload as the sync mechanism

## Non-Goals

1. Change the existing debounce windows
2. Add a new backend refresh trigger type
3. Add extra button chrome or copy to the dashboard cards
4. Make failed or paused states manually retryable through this same chip

## Proposed Behavior

When the dashboard card is in the normal `Updated … ago` state:

1. a plain click should call `api.github.refreshRepositoryTree`
2. the request should use the same dashboard debounce bucket as focus/page-load
   refreshes
3. the request should keep the current repo-level backend cooldown semantics
4. the request should still request Cloudflare preview links when the card is
   missing cached preview metadata

When the user is selecting the `Updated … ago` text:

1. the displayed relative time should stay frozen while the selection is active
2. releasing selection without a plain click should not trigger refresh
3. clicking while selection is active should not trigger refresh

## Implementation Notes

1. Replace same-URL anchor navigation with an action-backed click handler
2. Keep the status surface as an inline text-like control rather than a new
   visible button treatment
3. Reuse the dashboard refresh debounce helper before dispatching the action
4. Let existing backend claim logic decide whether the refresh is skipped for
   `recent_success`, `in_progress`, or `cooldown`

## Acceptance Checklist

- [ ] Clicking `Updated … ago` dispatches `api.github.refreshRepositoryTree`
- [ ] The click path respects the existing dashboard debounce window
- [ ] The click path preserves Cloudflare preview hydration behavior
- [ ] Active text selection suppresses refresh
- [ ] No full-page reload is required for the manual refresh path
