# Workspace mobile merge state persistence spec

## Document control

- Status: Accepted
- Owner: Samebase frontend/workspace shell
- Created: 2026-05-08
- Last updated: 2026-08-28
- Related specs:
  - `specs/092_WORKSPACE_PANE_MIN_RESIZE_MERGE_SPEC.md`
  - `specs/094_WORKSPACE_LAYOUT_PANE_RUNTIME_SPEC.md`
- Decision history:
  - [PR #734](https://github.com/samebase/samebase/pull/734) added durable mobile merge state.
  - [PR #1289](https://github.com/samebase/samebase/pull/1289) replaced route and viewport state
    repair with a local display fallback.
- Main code and tests:
  - `apps/samebase/convex/workspaceSidebarStateModel.ts`
  - `packages/workspace-layout/src/WorkspaceLayoutV2.tsx`
  - `packages/workspace-layout/src/WorkspaceLayoutV2Prehydration.ts`
  - `packages/workspace-layout/src/WorkspacePaneRuntime.tsx`
  - `packages/workspace-layout/src/useWorkspaceLayoutV2MobileResize.ts`
  - `packages/workspace-layout/src/WorkspaceLayoutV2.mobile.test.tsx`
  - `apps/samebase/src/hooks/useLocalStorageWorkspaceSidebarState.ts`
  - `apps/samebase/src/hooks/usePersistedWorkspaceSidebarState.ts`
  - `apps/samebase/e2e/workspace-layout-v2.live.spec.ts`
  - `apps/samebase/e2e/workspace-sidebar-drag.spec.ts`

## Current contract

### Merge state is durable

A mobile side and main pane merge is a saved workspace layout preference. Refresh must preserve the
preference. A route and viewport that can show the saved merge must restore it.

`WorkspaceSidebarState` has this required field:

```ts
type WorkspaceMobileSurface =
  { kind: "unmerged" } | { kind: "merged"; mainWidthPx: number; side: "left" | "right" };
```

The field has these meanings:

- `{ kind: "unmerged" }` means that each mobile pane is a separate carousel pane.
- A merged `left` surface combines the left and main panes.
- A merged `right` surface combines the main and right panes.

`mobilePane` remains the saved logical pane. When the user selects `main`, the app must save an
unmerged surface. A route that can only display `main` does not count as a user selection. The route
must not change the saved `mobilePane` or `mobileSurface`.

### Route fallback is display-only

Signed-in workspace state is shared across routes and clients. A saved merge does not have to be
available on every route.

If the current route does not provide the saved side pane, the layout must display the main pane
without a merge. It must keep the saved pane and merge state unchanged. When the user returns to a
route that provides the side pane, the saved merge must be available again.

Prehydration and React rendering must use the same fallback. The fallback must not write a state
repair to Convex or local storage.

### Viewport fallback is display-only

The stored `mainWidthPx` can come from another viewport. The renderer must calculate the local main
pane width from the current viewport and the resolved side pane width. It must not write the local
width back only because the viewport is different.

If the current viewport cannot fit the saved merge within the pane constraints, the layout must
display an unmerged surface. It must keep the saved merge state unchanged. The merge must return
when a later viewport can fit it.

The default merged layout must fit at a 320px mobile viewport. At that width, the responsive side
pane minimum is 106px and the main pane minimum is 214px.

### Merge state is not width inference

The app must not infer a saved merge from a minimum side pane width. Minimum width is one user
gesture that can create a merge. It is not the definition of merge state.

The renderer must show a merge only when `mobileSurface.kind` is `"merged"` and the current route
and viewport can display it.

### Persistence uses one state model

Convex and local storage must persist `mobileSurface` as part of the complete workspace sidebar
state. State comparison and delayed write logic must detect a change to `mobileSurface` even when
the selected pane and pane widths do not change.

The local storage parser must reject payloads from an old version or payloads with an invalid mobile
surface. The app must not infer missing merge state from a saved pane width.

Committed merge state belongs to the pane state controller. In-progress drag state and local
viewport measurements remain transient layout state.

## Non-goals

- Add a visible merge button.
- Rename `WorkspaceSidebarState`.
- Add separate saved merge preferences for each route or viewport.
- Infer merge state from pane width.
- Make every route display every saved side pane.

## Validation

The current contract has these test owners:

- `WorkspaceLayoutV2.mobile.test.tsx` verifies that a route without the saved left pane displays the
  main pane and does not change the saved pane or merge state.
- `WorkspaceLayoutV2.mobile.test.tsx` verifies that a saved merge uses the current mobile viewport
  without changing the saved merge.
- `workspace-layout-v2.live.spec.ts` verifies that a signed-in merge stays active across different
  mobile viewport widths and is not cleared by a route without the saved pane.
- `workspace-sidebar-drag.spec.ts` verifies that a mobile merge survives a local storage reload.
- The local storage and persisted sidebar hook tests verify parser rules and merge-only writes.
