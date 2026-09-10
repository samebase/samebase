# Sidebar Layout Pane Runtime Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/workspace shell
- Last updated: 2026-08-28
- Supersedes:
  - `archive/093_WORKSPACE_LAYOUT_V2_MODULE_SPLIT_SPEC.md`
- Related files:
  - `packages/sidebars/src/SidebarLayout.tsx`
  - `packages/sidebars/src/SidebarLayoutGeometryInternal.ts`
  - `packages/sidebars/src/SidebarLayoutPrehydration.ts`
  - `packages/sidebars/src/SidebarLayoutViewports.tsx`
  - `packages/sidebars/src/SidebarRuntimeInternal.tsx`
  - `apps/samebase/src/components/AppWorkspaceShell.tsx`
  - `apps/samebase/src/lib/appWorkspaceSidebarPrehydration.ts`
  - `apps/samebase/src/hooks/usePersistedWorkspaceSidebarState.ts`
  - `apps/samebase/src/hooks/useLocalStorageWorkspaceSidebarState.ts`
  - `packages/sidebars/src/SidebarLayoutState.ts`
  - `specs/087_SIDEBAR_LAYOUT_SINGLE_LAYOUT_AND_PRERENDER_SPEC.md`
  - `specs/097_WORKSPACE_MOBILE_MERGE_STATE_PERSISTENCE_SPEC.md`

## Current Contract

### One Pane Runtime

The workspace layout uses one pane runtime:

1. The consumer chooses a storage controller.
2. `SidebarRuntimeProvider` receives that controller.
3. Package components read pane state and actions from one React context.

The runtime may use an internal store for focused subscriptions, but it must not expose separate
state, action, or interaction providers. A consumer must not need to know how the runtime divides
its internal state.

### Durable And Transient State

The controller owns durable pane preferences:

- desktop pane open state and widths
- mobile pane widths
- selected mobile pane
- committed mobile merged or unmerged surface

The mounted package runtime owns transient interaction state:

- measured viewport size
- active resize side
- in-progress mobile grip state
- preview merge state
- mobile carousel settled state

Transient state must not enter the consumer storage adapter. Committed preference changes must go
through the controller.

### Storage Boundary

The package accepts a `SidebarLayoutStateController`. It does not choose or import a persistence
system.

Samebase uses:

- a Convex-backed controller for signed-in app routes
- a local-storage controller for public routes
- an in-memory controller for tests and fixtures

The package must not import Convex, Samebase storage hooks, or Samebase schema modules. Samebase may
keep the historical `WorkspaceSidebarState` name at its persistence boundary. The package runtime
uses pane vocabulary.

### App Policy

Global keyboard shortcuts are consumer policy. The package exposes pane actions and accessible
resize-handle keyboard behavior. Samebase registers its Ctrl+B or Command+B shortcut and calls the
selected pane action.

The package does not own app routing, route readiness, header controls, or the choice of which pane
a product shortcut toggles.

### Desktop Pane Widths

Each visible desktop pane has a 160px minimum. A sidebar can use all space that remains after the
other visible panes reach their minimum widths. A resize first reduces the main pane. After the main
pane reaches its minimum, it reduces the opposite sidebar. Both sidebar widths are saved in one
state update. Reversing the resize gives space back to main and keeps the opposite sidebar at its
reduced width. Pointer and keyboard resizing use the same limits.

Closed or absent sidebars reserve no space and keep their saved widths. When the layout becomes
narrower, it reduces the displayed sidebar widths in proportion to their space above the minimum.
This does not change the saved widths. If an embedded desktop layout cannot fit all pane minima, the
minima scale down to fit. Resize controls report these same local limits.

Sidebar width transitions are disabled during a resize and when the measured layout width changes.
The desktop prehydration script uses the same calculation as the live layout.

### Static First Paint

The package owns the data attributes, CSS variables, responsive boundary, and geometry rules used
for prehydration. Samebase owns the persisted-state reader and renders the generated desktop and
mobile prehydration scripts immediately after the matching layout markup.

The app prehydration adapter must pass validated state into the package contract. It must not copy
the package selectors or geometry math. `@samebase/sidebars/structure.css` must load before the
first layout paint.

Before React measures the viewport, prehydration may apply stored desktop open state and widths or a
valid stored mobile surface. After measurement, the normal runtime owns the layout. Prehydration
must not write state or act as a second pane runtime.

### Pane Presence And Display Fallbacks

Side pane presence follows prop presence. Omit `left` or `right` when that pane does not exist. Pass
an explicit empty element when the route requires a visible empty pane. `null` is not a separate
pane-presence state.

If the current route or viewport cannot display a saved mobile pane or merge, the runtime shows a
valid local fallback without changing the saved preference. The saved preference becomes visible
again when a later route and viewport can display it.

### Internal Module Boundaries

- Geometry and pane-model modules stay React-free.
- Interaction controllers do not render JSX.
- Viewport renderers receive resolved state, refs, and content.
- Viewport renderers do not choose storage or persistence.
- DOM refs and pointer bookkeeping stay outside durable state.

The package keeps the canonical DOM tree. These module boundaries must not become a consumer-facing
prop-getter or render-prop assembly API.

## Non-Goals

- Merge durable and transient state into one persisted store.
- Add more React contexts for organization or speculative performance.
- Move Convex or local-storage decisions into the package.
- Rename Samebase persistence fields as part of package extraction.
- Add compatibility wrappers for old app import paths.
- Register product-wide keyboard shortcuts inside the package.

## Validation

- Runtime tests use in-memory controllers and verify one provider and one context boundary.
- Persistence adapter tests verify complete durable-state writes and delayed width writes.
- Hydration tests verify that prehydration stops controlling layout after runtime measurement.
- Mobile tests verify display-only fallbacks for missing panes and unsupported viewport geometry.
- Dependency checks verify that the package does not import Samebase persistence or routing code.
- Keyboard tests verify package resize controls separately from Samebase global shortcut policy.
