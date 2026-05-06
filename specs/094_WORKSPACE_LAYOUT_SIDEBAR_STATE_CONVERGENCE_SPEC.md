# Workspace Layout Pane Runtime Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/workspace shell
- Last updated: 2026-05-06
- Related files:
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx`
  - `apps/noter/src/components/workspace-layout-v2/WorkspacePaneRuntime.tsx`
  - `apps/noter/src/components/PersistedSidebarProvider.tsx`
  - `apps/noter/src/hooks/usePersistedWorkspaceSidebarState.ts`
  - `apps/noter/src/hooks/useLocalStorageWorkspaceSidebarState.ts`
  - `apps/noter/src/lib/workspaceSidebarStateController.ts`
  - `apps/noter/src/Layout.tsx`
  - `vite.config.ts`

## Summary

`WorkspaceLayoutV2` has several internal components that all need access to pane
state. The provider exists so those components can read and update pane state
without passing the same props through every layer.

The mental model is one workspace pane runtime:

1. A route chooses where durable pane preferences come from.
2. The workspace pane runtime receives those preferences through one controller.
3. Workspace layout components read pane state and actions from that runtime.

The implementation must use one React context from one provider for this
runtime. A route should not need to reason about separate sidebar state, layout
state, state context, actions context, or selector-provider boundaries. The
runtime value may carry durable pane state/actions and a transient layout store,
but the React provider and context boundary is singular.

## Runtime Model

The workspace pane runtime has two kinds of state:

- Durable pane preferences: left/right desktop open state, desktop widths,
  mobile widths, and selected mobile pane.
- Ephemeral interaction state: viewport size, active resize side, mobile resize
  grip, mobile merged-surface ownership, and carousel settled state.

Durable state is still persisted as `WorkspaceSidebarState`. That schema name is
historical and should not drive the runtime model. Runtime code should speak in
panes. Schema renames are a separate migration and are not part of the current
goal.

Ephemeral state is local to the mounted workspace layout. It should not be
persisted and should not leak into route storage adapters.

## Storage Boundary

Routes and app shells choose storage. The workspace layout does not.

Current storage producers:

- Convex-backed app routes use `usePersistedWorkspaceSidebarState`.
- Public routes use `useLocalStorageWorkspaceSidebarState`.
- Fixtures and component tests use in-memory controllers.

All storage producers expose the same `WorkspaceSidebarStateController` shape:

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

The runtime receives that controller and owns pane behavior such as toggling a
pane, changing the active mobile pane, updating widths, and handling the global
pane shortcut.

## Provider Boundary

The provider boundary exists to avoid prop drilling inside
`workspace-layout-v2`. It should present one conceptual surface:

```tsx
<WorkspacePaneRuntimeProvider controller={controller}>
  <WorkspaceLayoutV2FullPage />
</WorkspacePaneRuntimeProvider>
```

The current implementation exposes this boundary as
`WorkspacePaneRuntimeProvider` from `WorkspacePaneRuntime.tsx`. Older
workspace-sidebar provider names should not be reintroduced as compatibility
wrappers.

The runtime must keep a single React context. If transient layout interaction
state needs TanStack Store selectors, the store object should live inside the
same runtime context value rather than behind another provider. Do not split the
runtime into separate state, action, layout-store, or selector contexts unless a
measured product problem proves the split is necessary and this spec is updated
first. Start from the simplest mental model and let unnecessary plumbing
disappear first.

`workspace-layout-v2` is exempt from the component-only Fast Refresh lint rule.
This folder should optimize for a readable runtime boundary over splitting
components, hooks, and types into separate files only to satisfy refresh
tooling.

The provider should not make callers understand:

- whether state, actions, and the transient layout store are separate internals
- whether transient state uses TanStack Store
- whether durable state comes from Convex, local storage, or memory

Callers should only need to know that they are inside the workspace pane
runtime.

## Layout Consumers

Workspace layout internals should consume the runtime directly instead of
accepting repeated pane props. Examples include:

- `WorkspaceLayoutV2`
- `WorkspaceLayoutV2FullPage`
- mobile resize and carousel helpers
- header controls that toggle panes

Route content may consume workspace pane runtime hooks when it needs to
coordinate with the layout, such as selecting the mobile main pane after a file
selection. Pure domain helpers that only need pane names or persisted schema
fields should import from the persisted model instead of depending on the
runtime.

## Design Rules

- Prefer the simplest visible model over premature subscription optimization.
- Keep one React provider and one React context for workspace pane behavior.
- Keep storage selection outside `workspace-layout-v2`.
- Keep durable persistence and ephemeral interaction state separate in behavior,
  even if they are exposed through one runtime.
- Keep runtime APIs near `workspace-layout-v2`, not in generic `hooks/` folders
  based only on React implementation shape.
- Keep the pane runtime provider, hooks, and closely related types together
  unless moving them apart makes the workspace layout mental model simpler.
- Do not add compatibility wrappers for app-internal imports.
- Do not rename persisted schema fields just to match runtime vocabulary.
- Do not add another provider or context inside `workspace-layout-v2` for
  refresh-time, organizational, or speculative performance reasons.
- Do not move `workspace-layout-v2` into a package yet, but keep the folder
  organized as if it could become one later.

## Current State

The migration that removed the generic `useSidebar` runtime is complete:

- PR #711 named the controller and added a provider bridge.
- PR #712 normalized the controller into one durable state updater.
- PR #713 moved transient layout state to the provider boundary.
- PR #714 moved `workspace-layout-v2` internals off `useSidebar`.
- PR #715 moved remaining app consumers off `useSidebar` and deleted the
  compatibility hook.
- PR #716 clarified this runtime model and made `WorkspacePaneRuntimeProvider`
  from `WorkspacePaneRuntime.tsx` the visible provider boundary.

This spec should now guide simplification, not more migration churn. The next
implementation change should only happen if it makes the runtime boundary read
more like the one-provider mental model above.

## Non-Goals

- Continuing refactors only because historical sidebar names still exist in the
  persistence schema.
- Merging all state into one store before there is a concrete readability or
  behavior reason.
- Splitting state/actions or transient layout state into multiple React
  contexts.
- Moving Convex or local-storage decisions into the workspace layout.
- Moving `workspace-layout-v2` into a package in the current slice.
