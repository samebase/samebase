# Workspace Layout V2 Module Split Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/workspace shell
- Last updated: 2026-05-05
- Related files:
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2Geometry.ts`
  - `apps/noter/src/components/workspace-layout-v2/useWorkspaceLayoutV2MobileResize.ts`
  - `apps/noter/src/components/workspace-layout-v2/useWorkspaceLayoutV2MobileCarousel.ts`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2Viewports.tsx`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2BottomPanel.tsx`
  - `specs/092_WORKSPACE_PANE_MIN_RESIZE_MERGE_SPEC.md`

## Summary

`WorkspaceLayoutV2.tsx` should remain the readable full implementation of the
workspace shell: it resolves route props, sidebar state, viewport measurements,
pane widths, resize handles, and chooses the desktop or mobile viewport.

The file should not also own every low-level detail of the pane model, mobile
gesture controllers, and JSX viewport rendering. Those pieces have clear module
boundaries and should be split so the main file reads as orchestration over
named parts.

## Split Order

### 1. Geometry And Pane Model

Move pure layout math into `WorkspaceLayoutV2Geometry.ts`.

This module owns:

- desktop and mobile width constraints
- mobile pane and merged-side types
- mobile pane order and carousel surface selection
- mobile scroll offset math
- merged-fit and merge-handoff decisions

This module must stay React-free. It should not import hooks, JSX components, or
sidebar context. It is the best place for the current bridge from today's
`left/main/right` names toward the future pane/surface mental model.

### 2. Mobile Controllers

Move mobile interaction hooks into focused hook modules:

- `useWorkspaceLayoutV2MobileResize.ts`
- `useWorkspaceLayoutV2MobileCarousel.ts`

The resize hook owns the transient grip session and merged-surface state. The
carousel hook owns native scroll synchronization and settled-state tracking.
Both hooks may depend on the geometry module, but neither should render JSX.

The hooks should keep the invariant from
`092_WORKSPACE_PANE_MIN_RESIZE_MERGE_SPEC.md`: `main` can belong to at most one
merged surface at a time.

### 3. Viewport Rendering

Move render-only viewport components into `WorkspaceLayoutV2Viewports.tsx`.

This module owns:

- `WorkspaceLayoutV2DesktopViewport`
- `WorkspaceLayoutV2MobileViewport`
- pane separator class selection

It should receive already-resolved widths, content, refs, and surface state. It
should not read sidebar context or decide resize behavior.

## Main File Contract

After these splits, `WorkspaceLayoutV2.tsx` should primarily contain:

- public component props
- `WorkspaceLayoutV2FullPage`
- `WorkspaceLayoutV2ViewportFrame`
- `WorkspaceLayoutV2JustPanes`
- main-pane header wiring
- viewport measurement and small shell-local store state
- resize-handle construction and mode selection

The main file can still be the entrypoint for app callsites, but it should not
become a same-name re-export shim. If a constant or type is no longer owned by
the main component module, current callsites should import it from the owning
module directly.

## Non-Goals

- Replacing `WorkspaceLayoutV2` with a generalized pane framework.
- Changing shipped behavior while splitting files.
- Adding compatibility shims or barrel exports.
- Moving route-specific layout usage into the workspace shell.
- Extracting resize-handle arrays before they have a clearer ownership shape.

## Validation

Each split should land as its own commit and preserve behavior. At minimum, run
focused WorkspaceLayoutV2 tests after the split series, and run broader
type/lint validation before updating the PR.

Useful checks:

```bash
pnpm test apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.mobile.test.tsx
pnpm test apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.test.tsx
pnpm --filter noter check:ci
```
