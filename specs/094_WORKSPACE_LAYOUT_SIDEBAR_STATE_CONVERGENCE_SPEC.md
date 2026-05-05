# Workspace Layout Sidebar State Convergence Spec

## Document Control

- Status: Draft
- Owner: Noter frontend/workspace shell
- Last updated: 2026-05-05
- Related files:
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2Context.ts`
  - `apps/noter/src/components/sidebar.tsx`
  - `apps/noter/src/hooks/use-sidebar.ts`
  - `apps/noter/src/components/PersistedSidebarProvider.tsx`
  - `apps/noter/src/hooks/usePersistedWorkspaceSidebarState.ts`
  - `apps/noter/src/hooks/useLocalStorageWorkspaceSidebarState.ts`
  - `apps/noter/src/Layout.tsx`

## Summary

`WorkspaceLayoutV2` local state and workspace sidebar state are conceptually
close. The current split is practical, not a permanent product model:

- `WorkspaceLayoutV2Context` owns ephemeral pane mechanics such as viewport
  size, active resize edge, mobile merged-surface ownership, grip state, and
  carousel settled state.
- `SidebarProvider` owns persisted workspace pane state such as left/right open
  state, side widths, and selected mobile pane.

The long-term direction is to make these feel like one workspace pane state
model. Storage selection must stay outside the layout core: Convex persistence,
local storage, and in-memory fixture state should all provide the same state
controller shape to the workspace shell.

## Principles

- Do not put Convex or local-storage selection inside
  `WorkspaceLayoutV2JustPanesContent`.
- Do not make route code manually bridge every sidebar field forever.
- Keep storage adapters responsible for durability only.
- Keep the workspace layout responsible for pane behavior only.
- Prefer TanStack Store for the workspace/sidebar state controller before trying
  to merge the two current state trees.
- Make invalid pane states unrepresentable with discriminated types before
  adding more effects.

## Target Shape

Introduce a workspace sidebar state controller that can be produced by multiple
storage adapters:

```ts
type WorkspaceSidebarStateController = WorkspaceSidebarState & {
  isHydrated: boolean;
  setLeftDesktopOpen: Dispatch<SetStateAction<boolean>>;
  setLeftDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setLeftMobileWidthPx: Dispatch<SetStateAction<number>>;
  setMobilePane: Dispatch<SetStateAction<WorkspaceSidebarState["mobilePane"]>>;
  setRightDesktopOpen: Dispatch<SetStateAction<boolean>>;
  setRightDesktopWidthPx: Dispatch<SetStateAction<number>>;
  setRightMobileWidthPx: Dispatch<SetStateAction<number>>;
};
```

Then route or app-level code chooses storage and passes the controller into a
workspace-layout-near provider:

```tsx
const sidebarState = usePersistedWorkspaceSidebarState(...);
// or useLocalStorageWorkspaceSidebarState(...)

<WorkspaceLayoutSidebarProvider state={sidebarState}>
  <WorkspaceLayoutV2FullPage ... />
</WorkspaceLayoutSidebarProvider>
```

`WorkspaceLayoutSidebarProvider` can initially wrap the existing
`SidebarProvider`. It is a stepping stone, not the final pane state model.

## Phases

### Phase 1: Name The Controller Shape

Extract the shared return shape from `usePersistedWorkspaceSidebarState` and
`useLocalStorageWorkspaceSidebarState` into a named type near the workspace
layout or sidebar state model.

Both hooks should return the same controller type. The local-storage hook may
return `isHydrated: true` so consumers can treat both persistence paths the same
way.

### Phase 2: Add A Workspace-Layout Sidebar Provider

Create a provider near `workspace-layout-v2/` that accepts the controller and
maps it into the current `SidebarProvider` props.

This removes repeated route-level bridging while preserving existing behavior.
It also makes the dependency explicit: workspace layout consumes sidebar pane
state, while storage adapters remain outside the layout.

### Phase 3: Convert `SidebarProvider` Internals To TanStack Store

Replace `SidebarProvider`'s internal `useState` cluster with a TanStack Store.
Keep its public context API stable during this phase.

This should reduce setter duplication and make later convergence with
`WorkspaceLayoutV2Context` easier.

### Phase 4: Move Sidebar State Ownership Closer To Workspace Layout

After `SidebarProvider` uses a store and route bridging is gone, evaluate
whether `SidebarProvider` should remain a generic component or become a
workspace-layout folder-private provider.

At this point, `useSidebar` may become a workspace-layout selector hook or be
renamed to match the pane state model.

### Phase 5: Merge Compatible State Trees

Only after the prior phases are stable, evaluate merging:

- selected mobile pane
- left/right widths
- mobile merged-surface ownership
- active resize side
- grip session state
- carousel settled state

The final model should describe panes/surfaces rather than treating `main` and
sidebars as fundamentally different kinds of UI. Persistence can then store the
durable subset of that model, while ephemeral pointer/viewport state remains
local.

## Non-Goals

- Moving Convex or local-storage logic into `WorkspaceLayoutV2`.
- Replacing all route persistence in one step.
- Changing saved sidebar state schema before the controller boundary is clear.
- Keeping compatibility shims for app-internal imports.
- Merging transient pointer refs into durable persisted state.

## First Implementation Slice

Start with the smallest visible improvement:

1. Define the controller type.
2. Make `useLocalStorageWorkspaceSidebarState` and
   `usePersistedWorkspaceSidebarState` return it.
3. Add `WorkspaceLayoutSidebarProvider`.
4. Replace `PersistedSidebarProvider`'s manual bridge and `PublicLayoutShell`'s
   manual bridge with the new provider.

This should not change pane behavior. It only clarifies ownership and reduces
prop plumbing.
