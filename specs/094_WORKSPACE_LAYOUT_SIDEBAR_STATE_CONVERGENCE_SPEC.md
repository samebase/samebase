# Workspace Layout Sidebar State Convergence Spec

## Document Control

- Status: Draft
- Owner: Noter frontend/workspace shell
- Last updated: 2026-05-05
- Related files:
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2Context.ts`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutSidebarProvider.tsx`
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

Post-PR #712 status: production routes already treat sidebar state as workspace
layout state. `WorkspaceLayoutSidebarProvider` receives a workspace sidebar
controller and provides `SidebarContext` directly. `WorkspaceLayoutV2Context`
still owns transient pane mechanics, but the next convergence step is to create
that transient store at the same provider boundary as the durable sidebar
controller. The main remaining design problem is not whether sidebars belong to
workspace layout; they do. The design problem is how to combine durable pane
preferences with transient interaction state without moving Convex/local-storage
selection into the layout core.

There should be one controller type, `WorkspaceSidebarStateController`.
Convex-backed routes, public local-storage routes, and tests/fixtures should
produce that same controller shape through different adapters. Do not create
separate controller types for each persistence source, and do not use
localStorage-backed adapters for ordinary fixtures; fixtures should use a tiny
in-memory controller so they stay deterministic and side-effect free.

## Principles

- Do not put Convex or local-storage selection inside
  `WorkspaceLayoutV2JustPanesContent`.
- Do not make route code manually bridge every sidebar field forever.
- Keep storage adapters responsible for durability only.
- Keep the workspace layout responsible for pane behavior only.
- Use one controller type with multiple producers. Convex, local storage, and
  fixture memory state are adapters, not different mental models.
- Treat `WorkspaceLayoutSidebarProvider` as the standard workspace layout
  boundary for production code. Direct `SidebarProvider` usage should migrate to
  fixtures/tests only, then disappear as its behavior moves into the workspace
  layout provider.
- Prefer TanStack Store for the workspace/sidebar state controller before trying
  to merge the two current state trees.
- Make invalid pane states unrepresentable with discriminated types before
  adding more effects.
- Prefer one workspace pane runtime context over a generic sidebar context plus
  a separate layout context.
- Keep persisted schema renames separate from runtime model cleanup. The
  database can keep `WorkspaceSidebarState` field names while the runtime model
  moves toward panes.

## Current Stepping-Stone Shape

PR #711 introduced a workspace sidebar state controller that can be produced by
multiple storage adapters. This branch normalizes that controller from a
field-specific setter bag into one durable-state operation:

```ts
type WorkspaceSidebarStateController = {
  isHydrated: boolean;
  state: WorkspaceSidebarState;
  setState: (
    updateState: (currentState: WorkspaceSidebarState) => WorkspaceSidebarState,
    persistenceMode: "immediate" | "width_deferred",
  ) => void;
};
```

Route or app-level code chooses storage and passes the controller into a
workspace-layout-near provider:

```tsx
const sidebarState = usePersistedWorkspaceSidebarState(...);
// or useLocalStorageWorkspaceSidebarState(...)

<WorkspaceLayoutSidebarProvider controller={sidebarState}>
  <WorkspaceLayoutV2FullPage ... />
</WorkspaceLayoutSidebarProvider>
```

`WorkspaceLayoutSidebarProvider` provides the existing `SidebarContext` API
directly. This shape is useful because storage adapters now own only durable
state while the workspace-layout provider owns side-specific pane behavior. It
is still a stepping stone because `useSidebar()` is a stable compatibility hook
name while workspace-layout internals move toward pane selectors/actions.

## Revised Target Runtime Shape

The best next shape is a single workspace pane runtime store with two explicit
slices:

```ts
type WorkspacePaneRuntimeState = {
  durable: WorkspaceSidebarState;
  interaction: {
    activeResizeSide: WorkspaceLayoutV2ActiveResizeSide;
    mobile: {
      grip: WorkspaceLayoutV2MobileGrip;
      isPaneSettled: boolean;
      surface: WorkspaceLayoutV2MobileSurface;
    };
    viewportSize: ElementSize;
  };
};
```

The durable slice is selected and persisted by route-level adapters:

```ts
type WorkspacePaneDurableStateController = {
  isHydrated: boolean;
  state: WorkspaceSidebarState;
  setState: (
    updateState: (currentState: WorkspaceSidebarState) => WorkspaceSidebarState,
    persistenceMode: "immediate" | "width_deferred",
  ) => void;
};
```

The runtime provider owns workspace pane behavior:

- side-specific width/open/mobile-pane setters
- shortcut-side aliases such as `open`, `setOpen`, `toggleSidebar`
- mobile pane toggles
- transient resize, viewport, carousel, and merged-surface actions

The storage adapters own only durability:

- read defaults/server/local-storage state
- expose hydration status
- persist whole durable-state updates immediately or with width deferral
- recover from persistence errors

Fixtures and tests should produce the same controller shape with an in-memory
adapter. They should not use the localStorage hook unless the behavior under
test is localStorage persistence itself.

This removes the current repeated setter bags from both persistence hooks and
makes `WorkspaceLayoutSidebarProvider` the real workspace pane provider instead
of a bridge into a generic `SidebarProvider`.

## Phases

### Phase 1: Name The Controller Shape

Extract the shared return shape from `usePersistedWorkspaceSidebarState` and
`useLocalStorageWorkspaceSidebarState` into a named type near the workspace
layout or sidebar state model.

Both hooks should return the same controller type. The local-storage hook may
return `isHydrated: true` so consumers can treat both persistence paths the same
way.

Implementation: `WorkspaceSidebarStateController` lives in
`apps/noter/src/lib/workspaceSidebarStateController.ts`.

### Phase 2: Add A Workspace-Layout Sidebar Provider

Create a provider near `workspace-layout-v2/` that accepts the controller and
maps it into the current `SidebarProvider` props.

This removes repeated route-level bridging while preserving existing behavior.
It also makes the dependency explicit: workspace layout consumes sidebar pane
state, while storage adapters remain outside the layout.

Implementation: `WorkspaceLayoutSidebarProvider` lives in
`apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutSidebarProvider.tsx`.
`PersistedSidebarProvider` now chooses the Convex-backed controller and
delegates the controller bridge to that provider. `PublicLayoutShell` chooses
the local-storage controller, applies public-route visibility sanitation, then
delegates to the same provider.

### Phase 3: Convert `SidebarProvider` Internals To TanStack Store

Replace `SidebarProvider`'s internal `useState` cluster with a TanStack Store.
Keep its public context API stable during this phase.

This should reduce setter duplication and make later convergence with
`WorkspaceLayoutV2Context` easier.

Historical implementation: `SidebarProvider` briefly used a private TanStack
store for its uncontrolled fallback state. That component has since been
deleted; the durable controller now feeds `SidebarContext` directly from
`WorkspaceLayoutSidebarProvider`.

### Phase 4: Move Sidebar State Ownership Closer To Workspace Layout

After `SidebarProvider` uses a store and route bridging is gone, evaluate
whether `SidebarProvider` should remain a generic component or become a
workspace-layout folder-private provider.

At this point, `useSidebar` may become a workspace-layout selector hook or be
renamed to match the pane state model.

Decision: `SidebarProvider` is workspace layout state. It should stop being the
behavior owner. The next phase should move its behavior into
`WorkspaceLayoutSidebarProvider`, then update direct app-internal callsites and
fixtures to use workspace-layout-owned providers/controllers.

Current status: direct fixture and component-test `SidebarProvider` mounts have
been replaced with `WorkspaceLayoutV2MemorySidebarProvider`, which uses the same
`WorkspaceSidebarStateController` contract as the persisted adapters while
staying in memory.

Current implementation: `WorkspaceLayoutSidebarProvider` now constructs
`SidebarContext` directly from `WorkspaceSidebarStateController`, and the old
`SidebarProvider` component has been deleted. The `useSidebar()` hook path and
context shape remain stable for existing consumers while the runtime model moves
toward panes. Renaming `useSidebar` to a pane-owned hook should wait until the
provider ownership move is stable.

Implementation slices:

1. Replace `WorkspaceSidebarStateController`'s setter bag with a durable
   controller that exposes `state` and one typed
   `setState(nextState, persistenceMode)` operation. Keep the persisted schema
   and hook names stable during this slice.
2. Replace direct test/fixture `SidebarProvider` usage with a small
   workspace-layout memory controller that implements the existing
   `WorkspaceSidebarStateController` type. Do not add a fixture-specific
   controller type, do not use localStorage for ordinary fixtures, and do not
   keep a compatibility wrapper for app-internal production code.
3. Move the current `SidebarProvider` context-value construction into
   `WorkspaceLayoutSidebarProvider`. Production routes, fixtures, and tests
   should not render `SidebarProvider` directly or indirectly after this slice.
4. Delete `SidebarProvider`'s controlled/uncontrolled prop API, default state,
   and internal store once `WorkspaceLayoutSidebarProvider` provides
   `SidebarContext` directly.
5. Move or rename `useSidebar` only after the provider ownership has moved.
   Until then, keeping the hook path stable is acceptable because the provider
   boundary is the real behavior change.

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

Decision: merge the runtime contexts before renaming persisted fields. The
durable slice can remain `WorkspaceSidebarState` for now; the runtime context
can call it `durable` or `panes` and expose pane selectors/actions. Once the
runtime state is unified, a future schema migration can decide whether persisted
field names should become pane-oriented.

Implementation slices:

1. Move `WorkspaceLayoutV2Context`'s transient state into the same provider that
   owns durable pane behavior.
2. Move `WorkspaceLayoutV2Provider` from inside `WorkspaceLayoutV2JustPanes` to
   the page/provider boundary so header controls and panes read one store.
3. Replace `useSidebar` reads in workspace layout internals with direct
   workspace pane selectors/actions.
4. Rename the public app-internal hook from `useSidebar` to a workspace pane
   name once the old context is gone.

## Non-Goals

- Moving Convex or local-storage logic into `WorkspaceLayoutV2`.
- Replacing all route persistence in one step.
- Changing saved sidebar state schema before the controller boundary is clear.
- Keeping compatibility shims for app-internal imports.
- Merging transient pointer refs into durable persisted state.

## Completed Implementation Slice (#711)

This first bridge slice was completed in PR #711 and remains here as historical
context for the controller convergence plan.

Start with the smallest visible improvement:

1. Define the controller type.
2. Make `useLocalStorageWorkspaceSidebarState` and
   `usePersistedWorkspaceSidebarState` return it.
3. Add `WorkspaceLayoutSidebarProvider`.
4. Replace `PersistedSidebarProvider`'s manual bridge and `PublicLayoutShell`'s
   manual bridge with the new provider.

This should not change pane behavior. It only clarifies ownership and reduces
prop plumbing.

## Completed Implementation Slice (#712)

This controller-normalization and provider-collapse slice was completed in PR
#712 and remains here as historical context for the runtime convergence plan.

This branch starts with durable controller normalization:

1. Change `WorkspaceSidebarStateController` to hold:
   - `isHydrated`
   - `state`
   - `setState(updateState, persistenceMode)`
2. Update `usePersistedWorkspaceSidebarState` and
   `useLocalStorageWorkspaceSidebarState` to return that controller.
3. Move side-specific setters into `WorkspaceLayoutSidebarProvider`.
4. Keep `WorkspaceLayoutSidebarProvider` rendering `SidebarProvider` for this
   slice only, so behavior remains unchanged while the state contract becomes a
   real controller instead of a prop-shaped bag.

This is the smallest useful step toward combining the states because it removes
the duplicated setter API at the persistence boundary without yet moving
transient resize mechanics or changing route behavior.

## Current Implementation Slice

This branch moves transient workspace layout state to the same provider boundary
as durable sidebar state:

1. `WorkspaceLayoutSidebarProvider` creates and provides
   `WorkspaceLayoutV2Context` next to `SidebarContext`.
2. `WorkspaceLayoutV2JustPanes` consumes the existing layout context instead of
   creating an inner provider.
3. Delete the pass-through `WorkspaceLayoutV2Provider` file once it has no
   callsites.

This intentionally keeps `useSidebar()` and
`useWorkspaceLayoutV2Selector()`/`useWorkspaceLayoutV2Actions()` names stable.
The behavior change is only ownership: durable pane state and transient pane
mechanics now share one workspace-layout provider boundary.
