# SidebarLayout Single Layout And Prerender Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/workspace shell
- Last updated: 2026-08-28
- Supersedes:
  - `archive/080_WORKSPACE_LAYOUT_V2_ROUTE_MIGRATION_AND_FRAMEWORK_READINESS_SPEC.md`
- Related files:
  - `packages/sidebars/package.json`
  - `packages/sidebars/src/SidebarLayout.tsx`
  - `packages/sidebars/src/SidebarLayoutGeometryInternal.ts`
  - `packages/sidebars/src/SidebarLayoutViewports.tsx`
  - `packages/sidebars/src/structure.css`
  - `apps/samebase/src/components/AppWorkspaceShell.tsx`
  - `apps/samebase/src/lib/appWorkspaceSidebarPrehydration.ts`
  - `specs/092_WORKSPACE_PANE_MIN_RESIZE_MERGE_SPEC.md`
  - `specs/094_SIDEBAR_LAYOUT_PANE_RUNTIME_SPEC.md`
  - `specs/097_WORKSPACE_MOBILE_MERGE_STATE_PERSISTENCE_SPEC.md`

## Current Contract

### One Canonical Layout

`SidebarLayout` is the canonical Samebase workspace layout. Any Samebase route that needs the shared
workspace shell must render the package component through the shared app route tree.

The route chooses which panes exist and what content they contain. The package owns the canonical
DOM order, pane geometry, resize behavior, mobile carousel behavior, accessibility attributes,
browser event wiring, and scroll ownership. Static output and hydrated output must use this same
React component tree.

The package may export neutral structural helpers such as `PaneFrame`. Samebase adapters that add
product buttons, icons, labels, routing, or other app chrome stay in the app.

### Structural CSS And Consumer Styling

The package is unthemed, but it is not CSS-free. The canonical component loads
`@samebase/sidebars/structure.css` so a consumer cannot omit the required mechanics. The package
also exports that stylesheet path for tools that manage CSS entrypoints directly.

The structural stylesheet owns only rules that are required for correct behavior:

- box sizing and flex containment
- minimum sizes and overflow ownership
- desktop and mobile viewport selection
- mobile scroll snap and pane order
- dynamic pane width application
- resize-handle placement, hit areas, and touch handling
- a visible default focus indicator for interactive layout controls

The package runtime and stylesheet must use the same responsive boundary. Dynamic geometry must use
package-owned CSS variables. The package must expose stable part and state data attributes for
consumer styling and prehydration. These attributes and variables are public package API.

The package must not depend on Tailwind, a Tailwind source scan, Samebase theme tokens, shadcn/ui,
or Samebase utility helpers. Consumer CSS owns colors, backgrounds, separators, grip appearance,
transitions, and other visual design. A consumer may use Tailwind for this work.

The package must not add render props, prop getters, or a separate class prop for each internal part
only to support styling. Stable attributes give consumers a styling boundary without exposing the
internal React tree as a second assembly API.

### Address Chrome

The address chrome is a named region above the pane viewport. The package owns its placement,
containment, and relationship to the pane viewport. The consumer owns its background, separator
appearance, control height, and content.

Samebase always supplies `RouteUrlEditorNext` for app routes. URL parsing, route readiness,
suggestions, preview, commit, restore, and router integration stay in Samebase.

### Mobile Escape Path

If a route provides a mobile side pane, the rendered route must provide a visible way to move from
that pane to the adjacent pane. An empty pane must still have this escape path. A hidden desktop
control is not sufficient.

The package owns the navigation behavior. The consumer may provide the visible control as part of
its pane chrome.

### Prerender And First Paint

Prerendering must use a standard React render path that invokes the same package components as the
hydrated route. The structural stylesheet must be available for the first paint.

Prehydration and React must use the same package attributes, CSS variables, responsive boundary, and
geometry rules. The app may read its own persisted state before hydration, but it must apply that
state through the package prehydration contract.

The prerender must not:

- concatenate a parallel copy of the layout HTML
- copy package markup or styles into a build script
- rebuild pane frames, resize handles, or the mobile carousel by hand
- keep a second shell because it has a smaller startup bundle

If the canonical component path becomes too large, remove or lazy-load the dependency at its source.
Do not add a second layout.

### Internal Boundaries

Package geometry modules must stay React-free. Interaction controllers may use React hooks, but they
must not render JSX. Viewport renderers receive resolved state and content. They must not choose
storage or persistence behavior.

These boundaries keep the package testable without making the consumer assemble its internal DOM.

## Non-Goals

- Provide a visual theme.
- Make consumers own functional layout CSS.
- Move Samebase routing, persistence, or product chrome into the package.
- Preserve app-internal import paths through compatibility wrappers.
- Support a second consumer-built DOM tree for the same layout behavior.

## Validation

- Package tests verify desktop and mobile geometry without Tailwind or Tailwind preflight.
- Server-render tests verify the canonical region and pane order.
- Hydration tests verify that prehydration and React produce the same visible layout.
- Interaction tests verify pointer, touch, keyboard, focus, resize, and mobile scroll behavior.
- Samebase route tests verify address chrome placement and a visible mobile escape path.
- Public route tests verify that direct loads and client navigation use the same layout tree.
- Package checks reject imports from Samebase app code, Tailwind, shadcn/ui, and Samebase theme
  utilities.
