# Mobile Sidebar Convex Persistence Research

## Status

- Date: 2026-04-02
- Reported issue: on mobile, refreshing `/machines` after opening the sidebar resets the shell back
  to the closed state
- Current decision: persist shared workspace-shell sidebar state in Convex, then add route-owned
  sidebar content persistence only where it clearly belongs

## Reproduction

I reproduced the reported bug on the real route instead of a fixture:

- URL: `/machines`
- Viewport: `390x844`
- Sign-in flow: password auth dev autofill
- Observed shell state:
  - initial: `data-mobile-pane="main"`
  - after opening the left sidebar: `data-mobile-pane="left"`
  - after full reload: `data-mobile-pane="main"`

This matches the user report exactly.

## What The Code Does Today

The shared sidebar shell currently keeps its state only in React memory:

- `apps/noter/src/components/sidebar.tsx`
  - `SidebarProvider` owns `mobilePane`, left/right desktop open state, and left/right mobile and
    desktop widths with `useState(...)`
- `apps/noter/src/components/MachinesWorkspaceView.tsx`
  - mounts its own `SidebarProvider`
  - also keeps `openProjectIds` only in component state
- `apps/noter/src/components/FileView.tsx`
  - mounts its own `SidebarProvider`
- `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
  - mounts its own `SidebarProvider`

That means a full refresh recreates the provider and drops every sidebar state slice back to its
defaults.

There is also a partial legacy persistence path that does not currently restore anything:

- `apps/noter/src/components/sidebar.tsx`
  - writes a `sidebar_state` cookie when the primary desktop sidebar toggles
- no app code reads that cookie back into `SidebarProvider`

So the current cookie is effectively write-only and does not solve refresh restore for the shared
shell.

## Existing Convex Patterns Worth Reusing

Two existing patterns point to the right fix shape:

1. `apps/noter/convex/folderExpansion.ts`
   - stores per-user, per-vault sidebar tree expansion state in Convex
2. `apps/noter/convex/dashboardSettings.ts`
   - stores lightweight per-user UI toggles in Convex
   - the client keeps a local optimistic mirror and ignores server echoes until the pending write
     settles

Those two patterns together are a better foundation than adding more cookie or `localStorage` state.

## Options Considered

### 1. Patch It With Cookie Or `localStorage`

This is the fastest narrow fix, but it is not the best fix here.

Why not:

- the user explicitly asked for Convex-backed persistence
- the repo already prefers Convex for durable user-visible UI state
- the shell state is now shared across multiple routes, not one isolated widget
- the existing cookie path is already stale and incomplete
- adding a second persistence layer now makes later consolidation harder

### 2. Expand `dashboardSettings`

This is tempting because it already stores UI toggles in Convex, but it is the wrong abstraction for
the shared workspace shell.

Why not:

- `dashboardSettings` is global per-user state, not route- or surface-scoped
- sidebar widths and mobile pane state do not belong beside billing-cycle and chat-dock preferences
- `/machines` and repository routes would either leak into dashboard-only state or force awkward
  optional fields with no clear ownership
- route-specific extras such as file-tree scroll or machine-group expansion do not fit this table
  cleanly

### 3. Add A Dedicated `workspaceSidebarState` Convex Model

This is the best fit.

Why:

- it matches the shared-shell architecture directly
- it keeps shell geometry and open/closed state separate from unrelated product settings
- it can scope state by workspace surface instead of by one giant settings row
- it leaves room for route-owned follow-up state without forcing everything into one table

## Recommended Design

### Phase 1: Persist Shared Shell State

Add a dedicated Convex table for shared workspace sidebar state, keyed by user and workspace
surface.

Suggested row shape:

```ts
{
  userId: Id<"users">,
  workspaceKey: string,
  leftDesktopOpen: boolean,
  rightDesktopOpen: boolean,
  leftDesktopWidthPx: number,
  rightDesktopWidthPx: number,
  leftMobileWidthPx: number,
  rightMobileWidthPx: number,
  mobilePane: "left" | "main" | "right",
  updatedAt: number,
}
```

Suggested initial `workspaceKey` values:

- `dashboard`
- `machines`
- `repository`

`repository` should stay workspace-level, not per-vault, for shell state. File tree structure
already has its own per-vault persistence, and most users will expect sidebar open/width behavior to
feel stable across repositories.

### Client Shape

Keep `SidebarProvider` presentational and fixture-safe. Do not couple Convex directly into it.

Instead:

1. Extend `SidebarProvider` so the full shell state can be controlled from the outside, not just the
   primary desktop open boolean.
2. Add a wrapper hook such as `usePersistedWorkspaceSidebarState({ workspaceKey, defaults })` that:
   - reads the row from Convex
   - mirrors it locally for immediate UI response
   - uses the same pending-write pattern as `dashboardSettings`
   - feeds controlled state and change handlers into `SidebarProvider`

That preserves the current fixture and visual-test ergonomics while giving the production routes a
real persistence path.

### Write Cadence

Not every state slice should persist at the same frequency:

- persist open/closed toggles and `mobilePane` immediately
- persist desktop/mobile widths on resize end, not on every drag frame
- update `updatedAt` only when a real state change commits

This avoids turning drag into a mutation flood.

### Hydration Behavior

The client should hydrate from Convex without letting late server echoes stomp fresh local
interactions.

Recommended behavior:

- start from the current route defaults
- apply the server state once it loads
- if the user has already interacted locally, ignore stale server echoes until the pending local
  write settles

That is the same pattern already used successfully for dashboard settings.

## Why Scroll Restoration Is A Separate Concern

The user asked for scroll position too, which is a good direction, but it does not belong in the
generic shell layer.

The shell owns open state and pane geometry. The routes own the actual scroll containers.

Examples:

- `apps/noter/src/components/MachinesWorkspaceView.tsx`
  - the left rail scroll container lives inside route content
- `apps/noter/src/components/FileView.tsx`
  - the file-tree scroll container is route-owned and already has separate folder-expansion
    persistence
- `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
  - sidebar content is different again and already has its own `providersPanelOpen` state

So the clean split is:

- shared shell table for open/closed state, pane selection, and widths
- route-owned persistence for route-owned scroll and expansion details

## Phase 2: Route-Owned Sidebar Content Persistence

After Phase 1 fixes the reported bug, add route-specific persistence where it is worth the
complexity.

### `/machines`

Good follow-up candidates:

- left rail `scrollTop`
- expanded project ids (`openProjectIds`)

These can live in a small `/machines`-specific Convex record keyed by user and surface. They should
not be stuffed into the generic shell row.

### Repository File View

Good follow-up candidate:

- file-tree `scrollTop`

Folder expansion is already persisted per user per vault, so this would be an incremental addition
rather than a new generic system.

### Dashboard

No extra route-specific change is required for the initial fix.

- `providersPanelOpen` already persists through `dashboardSettings`
- only the shared shell open/closed and mobile pane state is missing there

## Validation Plan

Before implementing the fix, add a real-route Playwright repro for the reported behavior.

Recommended first test:

1. open `/machines` on a mobile viewport
2. sign in with the seeded password auth flow
3. open the left sidebar on the real route
4. reload the page
5. assert the shell still reports `data-mobile-pane="left"`

Follow-up tests after rollout:

- repository route keeps its shared shell pane after reload
- dashboard route keeps its shared shell pane after reload
- resizing a sidebar persists only after the resize settles

## Cleanup To Include With The Fix

Once Convex-backed shell persistence ships:

- remove the write-only `sidebar_state` cookie path from `apps/noter/src/components/sidebar.tsx`
- update the privacy-policy copy that currently claims the cookie is how the sidebar preference is
  remembered

## Recommendation Summary

The best fix is not a narrow `/machines` patch.

The best fix is:

1. introduce a dedicated Convex-backed shared workspace sidebar state model
2. control `SidebarProvider` from a thin persistence wrapper hook
3. ship Phase 1 with open state, `mobilePane`, and widths
4. add scroll and other sidebar-content details only in the routes that own those scroll containers

That fixes the reported mobile refresh bug, fits the current shared-shell architecture, and avoids
mixing shell state with unrelated settings or adding another local-only persistence system.
