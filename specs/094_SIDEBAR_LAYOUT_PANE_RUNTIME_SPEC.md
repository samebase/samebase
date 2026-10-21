# Sidebar Layout Pane Runtime Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/workspace shell
- Last updated: 2026-10-21
- Supersedes:
  - `archive/093_WORKSPACE_LAYOUT_V2_MODULE_SPLIT_SPEC.md`
- Related files:
  - `packages/sidebars/src/SidebarLayout.tsx`
  - `packages/sidebars/src/SidebarLayoutGeometryInternal.ts`
  - `packages/sidebars/src/SidebarLayoutPrehydration.ts`
  - `packages/sidebars/src/SidebarLayoutViewports.tsx`
  - `packages/sidebars/src/SidebarRuntimeInternal.tsx`
  - `apps/samebase/src/components/AppWorkspaceShell.tsx`
  - `apps/samebase/src/hooks/usePersistedWorkspaceSidebarState.ts`
  - `apps/samebase/src/hooks/useVisualFixtureWorkspaceSidebarState.ts`
  - `apps/samebase/src/hooks/useLocalWorkspaceSidebarState.ts`
  - `apps/samebase/src/lib/appWorkspaceSidebarPrehydrationScript.ts`
  - `apps/samebase/src/routes/root.queries.ts`
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

- a Convex-backed controller for a document that the server rendered as the user, which starts from
  the saved state that the root loader read for that render
- a local-storage controller for a document rendered without a session (a prerendered public page,
  or a server render for a visitor without one), which writes every change to local storage
- an in-memory controller for the `/visual-fixture` route, tests, and fixtures

A document keeps the controller of its render until the next document load, so the Convex state and
the local copy never meet on one page.

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
The package prehydration script uses the same calculation as the live layout. Each pane carries its
own desktop width variable, so a pane that a render adds has its width in its first style.

### Static First Paint

The package owns the data attributes, CSS variables, responsive boundary, and geometry rules of the
first paint. Before React measures the viewport, `SidebarLayout` renders the controller state as
markup: desktop open state and widths, the selected mobile pane, a saved merged side, and the mobile
widths as CSS clamps of the carousel width. The carousel starts at scroll position 0, so a selected
main pane gives the left pane no width until React measures and scrolls past it, and a selected
right pane aligns the carousel content to its end. `@samebase/sidebars/structure.css` must load
before the first layout paint. After measurement, the normal runtime owns the layout.

A page rendered as the user needs no inline sidebar script: the root loader reads the saved state,
and the controller starts from it. A page rendered without a session renders one inline script after
the layout markup. It calls the package's `prehydrateSidebarLayoutDesktop` and
`prehydrateSidebarLayoutMobilePane` with the local-storage state, and the app build compiles it into
a string (`?inline-script`), never with `Function#toString` at run time. The local controller
installs the stored state in its layout effect at hydration and removes the temporary stylesheet
once a commit has rendered that state. Prehydration must not write state or act as a second pane
runtime.

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
