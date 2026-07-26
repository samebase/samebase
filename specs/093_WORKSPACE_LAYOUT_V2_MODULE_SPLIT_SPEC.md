# Workspace Layout V2 Module Split Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/workspace shell
- Last updated: 2026-06-27
- Related files:
  - `apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx`
  - `apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2Geometry.ts`
  - `apps/samebase/src/components/workspace-layout-v2/useWorkspaceLayoutV2MobileResize.ts`
  - `apps/samebase/src/components/workspace-layout-v2/useWorkspaceLayoutV2MobileCarousel.ts`
  - `apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2Viewports.tsx`
  - `specs/092_WORKSPACE_PANE_MIN_RESIZE_MERGE_SPEC.md`

## Summary

`WorkspaceLayoutV2.tsx` should remain the readable full implementation of the workspace shell: it
resolves route props, sidebar state, viewport measurements, pane widths, resize handles, and chooses
the desktop or mobile viewport.

The file should not also own every low-level detail of the pane model, mobile gesture controllers,
and JSX viewport rendering. Those pieces have clear module boundaries and should be split so the
main file reads as orchestration over named parts.

## Split Order

### 1. Geometry And Pane Model

Move pure layout math into `WorkspaceLayoutV2Geometry.ts`.

This module owns:

- desktop and mobile width constraints
- mobile pane and merged-side types
- mobile pane order and carousel surface selection
- mobile scroll offset math
- merged-fit and merge-handoff decisions

This module must stay React-free. It should not import hooks, JSX components, or sidebar context. It
is the best place for the current bridge from today's `left/main/right` names toward the future
pane/surface mental model.

### 2. Mobile Controllers

Move mobile interaction hooks into focused hook modules:

- `useWorkspaceLayoutV2MobileResize.ts`
- `useWorkspaceLayoutV2MobileCarousel.ts`

The resize hook owns the transient grip session and merged-surface state. The carousel hook owns
native scroll synchronization and settled-state tracking. Both hooks may depend on the geometry
module, but neither should render JSX.

The hooks should keep the invariant from `092_WORKSPACE_PANE_MIN_RESIZE_MERGE_SPEC.md`: `main` can
belong to at most one merged surface at a time.

### 3. Viewport Rendering

Move render-only viewport components into `WorkspaceLayoutV2Viewports.tsx`.

This module owns:

- `WorkspaceLayoutV2DesktopViewport`
- `WorkspaceLayoutV2MobileViewport`
- pane separator class selection

It should receive already-resolved widths, content, refs, and surface state. It should not read
sidebar context or decide resize behavior.

## Main File Contract

After these splits, `WorkspaceLayoutV2.tsx` should primarily contain:

- public component props
- `WorkspaceLayoutV2FullPage`
- address chrome wiring
- main-pane header wiring
- viewport measurement and transient layout store consumption
- resize-handle construction and mode selection

`WorkspaceLayoutV2` is the workspace-frame orchestration root. It owns the shared address chrome
region and the pane viewport. It is high enough to see viewport size, pane state, pane availability,
active resize edge, mobile surface ownership, carousel settled state, and the selected mobile pane.
Do not reintroduce wrapper components around it only to preserve old internal names.

`WorkspaceLayoutV2FullPage` should stay an adapter from route-facing `WorkspaceLayoutV2PaneFrame`
props and address chrome content to rendered workspace content. It should not own address editor
behavior, mobile surface state, or pane gesture state.

The main file can still be the entrypoint for app callsites, but it should not become a same-name
re-export shim. If a constant or type is no longer owned by the main component module, current
callsites should import it from the owning module directly.

## State Model

The pane mental model should be represented first as data types, then by pure model helpers, then by
React hooks that apply those decisions to DOM and sidebar state.

The shell-local TanStack store should be created by `WorkspacePaneRuntimeProvider` and carried
inside the single workspace pane runtime context. Consumers inside `workspace-layout-v2/` should
read through selectors so each module names the state it actually needs, but the selector helpers
must not create a second React provider or context.

The store should own:

- viewport size
- active resize side
- mobile merged/unmerged surface ownership
- mobile grip session state that affects rendering
- mobile carousel settled state

The store should not own:

- persisted sidebar state from `SidebarProvider`
- pointer bookkeeping inside `WorkspaceLayoutV2ResizeHandle`
- browser DOM refs

Pane presence should be a direct prop-presence contract. `WorkspaceLayoutV2` should render a side
pane only when the caller provides that side pane element. Callers should omit absent side panes. If
a route intentionally needs an empty visible pane, it should pass an explicit empty element such as
`<div />`; `null` should not be a separate pane-presence state.

Merged surface state should use a discriminated type instead of parallel nullable fields:

```ts
type WorkspaceLayoutV2MobileSurface =
  | { kind: "unmerged" }
  | {
      kind: "merged";
      mainWidthPx: number;
      side: "left" | "right";
    };
```

This makes invalid states unrepresentable. A merged surface cannot have a side without a main width,
and `main` cannot belong to both side surfaces at once.

Drag state should follow the same rule:

```ts
type WorkspaceLayoutV2MobileGrip =
  | { kind: "idle" }
  | {
      kind: "dragging";
      mergeTargetSide: "left" | "right" | null;
      shouldSettleMergedOnEnd: boolean;
      side: "left" | "right";
      slideOffsetPx: number;
      startMainWidthPx: number;
      startSideWidthPx: number;
    };
```

The mobile resize hook may still keep refs for same-gesture reads that must be synchronous with
pointer movement, but those refs should mirror the centralized store model rather than define a
second source of truth.

Future direction: the current split between `SidebarProvider` persisted state and
`WorkspaceLayoutV2` ephemeral layout state is an implementation boundary, not a permanent product
model. A later pane model may consolidate these into one state tree and persist it either locally
for unauthenticated users or through the authenticated app state. The local workspace layout context
should therefore avoid baking in assumptions that sidebar state can never move closer to the pane
model.

## Non-Goals

- Replacing `WorkspaceLayoutV2` with a generalized pane framework.
- Changing shipped behavior while splitting files.
- Adding compatibility shims or barrel exports.
- Moving route-specific layout usage into the workspace shell.
- Extracting resize-handle arrays before they have a clearer ownership shape.

## Validation

Each split should land as its own commit and preserve behavior. At minimum, run focused
WorkspaceLayoutV2 tests after the split series, and run broader type/lint validation before updating
the PR.

Useful checks:

```bash
pnpm test apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2.mobile.test.tsx
pnpm test apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2.test.tsx
pnpm --filter samebase check:ci
```
