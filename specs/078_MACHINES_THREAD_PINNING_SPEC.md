# 077 Machines Thread Pinning Spec

## Status

- Accepted implementation plan
- Owner: Noter frontend + local machine-control bridge
- Last updated: 2026-04-02

## Summary

The `/machines` thread rail should support pinning and unpinning threads using
the same machine-local pin state that Codex desktop already persists.

Unpinning should stay direct and always visible on pinned rows. Pinning should
match the native desktop mental model without relying on hover alone:

1. on desktop, an unpinned row reveals its pin affordance on hover or keyboard
   focus
2. on mobile, the selected unpinned row reveals the same affordance because
   selection is the closest equivalent to hover

This feature should reuse the existing `pinnedThreadIds` inventory contract
instead of introducing a second persistence layer in Convex or route-local
state.

## Research

### Existing pin data already exists end to end

`packages/sync/noter.js` already reads desktop pin state from
`$CODEX_HOME/.codex-global-state.json` under `pinned-thread-ids`, and the
machine-control `GET /threads` response already returns that array as
`pinnedThreadIds`.

That means pin state is already:

1. machine-local
2. outside provider-owned thread data
3. shared with the existing Codex desktop sidebar model

### The shipped `/machines` rail already understands pinned groups

`apps/noter/src/components/MachinesWorkspaceView.tsx` already renders:

1. pinned threads first
2. project groups for remaining threads
3. stable grouping based on `useCodexThreadSidebarViewModel`

Today the pinned section only shows a static leading pin icon. Unpinned rows do
not expose any pin affordance at all.

### The current backend has no pin mutation

The local control router currently exposes:

1. `GET /threads`
2. `GET /threads/:threadId`
3. `POST /thread/resume`
4. `POST /thread/archive`
5. `POST /thread/unarchive`
6. `POST /turn/start`

There is no `pin` or `unpin` route yet, so the UI cannot persist pin changes.

### Mobile needs a non-hover affordance

The user problem is specifically that hover works on desktop but not on mobile.
The existing `/machines` rail already has explicit selected-row state, so the
selected thread is the right mobile substitute for hover:

1. tap the row to select it
2. selection reveals the pin affordance
3. tap the icon to pin it

This avoids adding permanent extra chrome to every unpinned row.

## Goals

1. Let the `/machines` rail pin and unpin threads.
2. Reuse the existing machine-local desktop pin store.
3. Keep unpinning obvious on both desktop and mobile.
4. Make pinning discoverable on mobile without showing controls on every row.
5. Preserve selected-thread behavior while rows move between sections.
6. Keep the rail visually close to the current Codex-like design.

## Non-Goals

- Reordering pinned threads manually.
- Moving pin state into Convex or provider-owned thread metadata.
- Adding extra section labels, helper copy, or other sidebar chrome.
- Designing a new icon system beyond minor presentation differences.

## Proposal

### 1. Add machine-control pin mutations

Add two local-control endpoints:

1. `POST /thread/pin`
2. `POST /thread/unpin`

Behavior:

1. both accept `{ threadId }`
2. both mutate `pinned-thread-ids` in `$CODEX_HOME/.codex-global-state.json`
3. both preserve unrelated keys in the global state file
4. pin deduplicates and prepends the id so the newly pinned thread lands at the
   top of the pinned section immediately
5. unpin removes the id entirely

These routes are local UI-state mutations. They do not call the provider.

### 2. Refresh inventory after each pin mutation

`MachinesWorkspacePage` should call the new endpoint and then refresh the thread
inventory through the existing `GET /threads` flow.

That refresh is required because `GET /threads` already owns two important
contracts:

1. pinned-thread fallback for older sessions outside the provider page limit
2. canonical grouping after pinned threads are removed from project buckets

Refreshing after pin/unpin keeps the page aligned with the same inventory logic
instead of duplicating it in React state.

### 3. Row affordance rules

Each thread row should separate:

1. the main row hit target that selects the thread
2. a small action button that pins or unpins it

Visibility rules:

1. pinned rows: show the unpin button at all times
2. unpinned desktop rows: show the pin button on hover and `focus-within`
3. unpinned mobile rows: show the pin button when the row is selected

Interaction rules:

1. clicking the row selects the thread
2. clicking the pin button must not also trigger row selection again
3. pinning a selected thread keeps it selected after it moves into the pinned
   section
4. unpinning a selected thread keeps it selected if it remains in the refreshed
   inventory
5. if unpinning removes the thread from the visible inventory because it falls
   outside the current list limit, the existing selection fallback may choose
   the first visible thread

### 4. Pending state

Pin and unpin are async operations and should show a local pending state in the
button itself.

Requirements:

1. disable the action button while its request is in flight
2. render an in-button loading indicator for the active row
3. avoid disabling unrelated rows longer than necessary

### 5. Visual treatment

Use the existing pin metaphor.

Preferred treatment:

1. keep the current compact Lucide pin family
2. let the pinned state remain the stronger, always-visible presentation
3. keep the unpinned affordance subtle until revealed
4. avoid adding badges, labels, or a second metadata line for the action

If the same icon is used for both states, that is acceptable.

## Validation

1. Add sync-runtime tests that cover pin and unpin persistence in the desktop
   global state file.
2. Add visual coverage for:
   - desktop hover revealing the pin affordance on an unpinned row
   - mobile selected-row state revealing the same affordance
3. Keep the existing machines workspace visual coverage green after the row
   structure change.

## Implementation Notes

Primary files expected to change:

1. `packages/sync/noter.js`
2. `apps/noter/public/noter.js`
3. `apps/noter/src/lib/codexAppServerResearch.ts`
4. `apps/noter/src/components/MachinesWorkspacePage.tsx`
5. `apps/noter/src/components/MachinesWorkspaceView.tsx`
6. `apps/noter/src/components/MachinesWorkspaceVisualFixture.tsx`
7. `apps/noter/e2e/machines-workspace-visual.spec.ts`
8. `packages/sync/noter.test.ts`
