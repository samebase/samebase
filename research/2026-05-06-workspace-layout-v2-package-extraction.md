# Workspace Layout V2 Package Extraction Research

## Document Control

- Status: Research
- Owner: Noter frontend/workspace shell
- Created: 2026-05-06
- Branch: `codex/workspace-layout-package-research`
- Related files:
  - `apps/noter/src/components/workspace-layout-v2/`
  - `apps/noter/src/Layout.tsx`
  - `apps/noter/src/components/PersistedSidebarProvider.tsx`
  - `apps/noter/src/hooks/usePersistedWorkspaceSidebarState.ts`
  - `apps/noter/src/hooks/useLocalStorageWorkspaceSidebarState.ts`
  - `apps/noter/convex/workspaceSidebarStateModel.ts`
  - `packages/`
  - `pnpm-workspace.yaml`
  - `specs/087_WORKSPACE_LAYOUT_V2_SINGLE_LAYOUT_AND_PRERENDER_SPEC.md`
  - `specs/093_WORKSPACE_LAYOUT_V2_MODULE_SPLIT_SPEC.md`
  - `specs/094_WORKSPACE_LAYOUT_SIDEBAR_STATE_CONVERGENCE_SPEC.md`

## Question

Should `WorkspaceLayoutV2` move into its own package inside the monorepo, and if
so, what should move first?

## Working Hypothesis

Moving the full current `workspace-layout-v2` folder into a package right now is
probably premature. A package can be useful as a pressure test for dependency
boundaries, but the current layout still imports app-owned UI, app hooks,
Convex-derived state types, route/search helpers, and Noter-specific debug
behavior.

The feasible direction is likely incremental:

1. carve out a small package-shaped core that owns pure pane geometry and
   runtime-neutral types;
2. leave Noter-owned adapters, persistence, route chrome, shadcn buttons, and
   product-specific panels in `apps/noter`;
3. only move the React shell after those boundaries already read as package
   boundaries inside the app.

This note will be updated as the dependency audit runs.

## Evidence Log

- 2026-05-06: Created this research note before the audit so findings survive
  context compaction.
- 2026-05-06: Confirmed the monorepo already supports internal packages through
  `pnpm-workspace.yaml`, which includes `packages/*`.
- 2026-05-06: Existing internal packages mostly export TypeScript source
  directly. `@noter-md/dependent` exposes `./src/*.ts` through package exports
  and is consumed by `apps/noter` with `workspace:*`.
- 2026-05-06: `workspace-layout-v2` currently imports app-local modules:
  `@/components/ui/button`, `@/hooks/use-mobile`, `@/hooks/useElementSize`,
  `@/lib/clampNumber`, `@/lib/utils`, `@/lib/landingDevMode`,
  `@/lib/tanstackSearchParams`, `@/lib/workspaceSidebarStateController`,
  `@/lib/workspacePaneSizes`, and `../../../convex/workspaceSidebarStateModel`.
- 2026-05-06: The rendered shell depends on `react`, `@tanstack/react-store`,
  `lucide-react`, Tailwind class names, and app design tokens such as
  `bg-background`, `text-foreground`, `border-border`, and `muted`.
- 2026-05-06: `WorkspaceLayoutV2Geometry.ts` is the cleanest extraction target.
  Its only app-local dependency is `clampNumber`, which is a one-line pure
  helper.
- 2026-05-06: The Solid lab already exists as a separate app, not a package. It
  is useful evidence because it shows the minimum layout idea without React app
  chrome, Convex state, resize handles, or route state. It is not a reusable
  package boundary.
- 2026-05-06: Current `workspace-layout-v2` is 4,603 lines including 1,454 lines
  of tests. The production files are large enough that moving everything at once
  would be hard to review and easy to mistake for simplification.
- 2026-05-06: Checked recent GitHub PR history for workspace layout terms. The
  most relevant merged chain is #711 through #716, which split state/utility
  code, normalized the sidebar controller, moved the provider boundary, routed
  layout internals through pane hooks, routed app consumers through the runtime,
  and clarified the runtime contract.

## Recent PR Context

The most relevant PR chain supports a package-shaped direction, but not a direct
package move:

- [#711](https://github.com/noter-md/noter/pull/711) split layout state and
  utility code, adding geometry/panel/resize modules and documenting that Convex
  and local-storage selection should stay outside the layout core.
- [#712](https://github.com/noter-md/noter/pull/712) normalized
  `WorkspaceSidebarStateController` so Convex, localStorage, and fixtures share
  the same durable-state adapter shape.
- [#713](https://github.com/noter-md/noter/pull/713) moved the transient layout
  provider boundary up next to durable sidebar state.
- [#714](https://github.com/noter-md/noter/pull/714) routed layout internals
  through pane-owned hooks instead of the old `useSidebar()` compatibility API.
- [#715](https://github.com/noter-md/noter/pull/715) routed app pane consumers
  through the workspace runtime and deleted the unused sidebar compatibility
  layer.
- [#716](https://github.com/noter-md/noter/pull/716) clarified the accepted
  runtime contract: one `WorkspacePaneRuntimeProvider` and one runtime context
  boundary for durable pane state/actions plus transient layout interaction
  state.

That sequence is strong evidence that the current app folder already wants a
smaller boundary around pane runtime concepts. It is also evidence against
moving the whole folder right now: the accepted direction is to make boundaries
legible first, then move only the pieces whose dependencies are already clean.

The older PR trail has a useful caution. Some broader or more architectural
attempts were closed or superseded, including
[#563](https://github.com/noter-md/noter/pull/563) and
[#590](https://github.com/noter-md/noter/pull/590). The merged work that stuck
tended to be narrow and behavior-preserving. A package extraction should follow
that same shape.

## Current Package Boundary Friction

### 1. App UI Primitives

`WorkspaceLayoutV2FullPage` and `WorkspaceLayoutV2BottomPanel` import the app
`Button` from `apps/noter/src/components/ui/button.tsx`.

That button is not a small leaf dependency. It depends on Base UI,
`class-variance-authority`, app `cn()`, and app `resolveBaseUiAsChild()`. Moving
the current shell into a package by importing the app button from the package
would invert the dependency graph and make the package app-owned in disguise.

The package-safe options are:

1. keep `WorkspaceLayoutV2FullPage` in `apps/noter` as the Noter chrome adapter;
2. make the package render buttonless structural slots and let Noter provide
   controls;
3. let the package own its own primitive button, which is heavier and less
   aligned with Noter's generated shadcn/ui boundary.

Option 1 is the least surprising first step.

### 2. Durable State Is Still Convex-Shaped

The runtime imports `WorkspaceSidebarState` from
`apps/noter/convex/workspaceSidebarStateModel.ts`. The accepted spec says that
the persisted schema name is historical and should not drive runtime vocabulary,
but the code still needs that type.

A package should not import from an app Convex folder. Before moving the runtime
provider, we would need a package-owned durable pane state type such as:

```ts
type WorkspacePanePreferences = {
  leftDesktopOpen: boolean;
  leftDesktopWidthPx: number;
  leftMobileWidthPx: number;
  mobilePane: "left" | "main" | "right";
  rightDesktopOpen: boolean;
  rightDesktopWidthPx: number;
  rightMobileWidthPx: number;
};
```

Then `apps/noter/convex/workspaceSidebarStateModel.ts` can continue deriving or
checking compatibility against that shape without the package knowing Convex
exists.

### 3. App-Specific Debug And Route Search

`WorkspaceLayoutV2.tsx` still decides the default mobile resize grip visibility
by reading `window.location.search` through Noter-specific helpers:

- `isLandingDevModeEnabled`
- `parseTanStackSearch`

That is product/debug behavior, not package behavior. A package should receive
`showMobileResizeGripDots` explicitly and let the app decide the default.

### 4. Tailwind And Theme Coupling

The layout uses Tailwind utility strings and Noter theme tokens. That is fine
for an internal monorepo package, but the app Tailwind config currently scans
only app-local source paths:

```ts
content: [
  "./pages/**/*.{ts,tsx}",
  "./components/**/*.{ts,tsx}",
  "./app/**/*.{ts,tsx}",
  "./src/**/*.{ts,tsx}",
];
```

If a package contains Tailwind class strings, `apps/noter` must include that
package source in Tailwind scanning or import it through an explicit Tailwind v4
source directive. Otherwise package-only classes can silently disappear from
production CSS.

This is not a blocker, but it is easy to miss.

### 5. Test And Fixture Surface

The app has broad coverage that asserts `workspace-layout-v2` test ids and DOM
attributes from route-level Playwright tests. That is good protection, but it
means a move will touch many imports and snapshots even when behavior is
unchanged.

The package should keep unit tests close to the extracted core, while the app
should keep route-level and visual coverage. Moving all tests with the package
would blur product behavior and package behavior.

## Feasibility By Slice

### Slice A: Pure Pane Geometry Package

Feasibility: high.

Move only the pure layout model into something like
`packages/workspace-layout-core`:

- `WorkspaceLayoutV2Geometry.ts`
- `WorkspaceLayoutV2PanelGeometry.ts`
- possibly `WorkspaceLayoutV2ResizeHandleConfigs.ts`
- a package-local `clampNumber`
- pure unit tests for mobile surface selection, merge handoff, min/max sizing,
  panel sizing, and resize-handle config generation

This would remove meaningful complexity from the app folder without forcing
React, Convex, Tailwind, shadcn, or app route defaults into a package.

This also matches the accepted module-split direction: geometry first, then
controllers, then rendering.

### Slice B: React Runtime Package Without Noter Chrome

Feasibility: medium.

Move the runtime provider, low-level pane viewport renderer, resize handle, and
mobile controllers into a package only after these prep changes:

1. replace `WorkspaceSidebarState` imports with package-owned pane preference
   types;
2. move `useElementSize`, `clampNumber`, and `cn` equivalents into the package
   or remove the need for them;
3. remove the landing-dev default from the shell;
4. make toggle and close controls caller-supplied or package-owned in a way that
   does not import Noter shadcn files;
5. update Tailwind scanning for package source;
6. keep `PersistedSidebarProvider`, Convex/local-storage hooks, and route
   adapters in `apps/noter`.

This is feasible, but it is not a one-file move. The value would be real only if
the resulting package exposes a smaller API than the current app folder.

### Slice C: Move The Whole Folder As-Is

Feasibility: low.

A direct move of `apps/noter/src/components/workspace-layout-v2` into
`packages/workspace-layout-v2` would mostly replace `@/` imports with awkward
cross-package app imports or duplicate app utilities. That would look like
progress while preserving the same mental model leak.

This is the synthetic-change failure mode: the folder path would say "package",
but the package would still know about Noter buttons, Noter route search, Noter
Convex types, Noter Tailwind scanning, and Noter fixture defaults.

## Recommended Direction

Do not move the full current React shell yet.

Do create a package only if the first package boundary is small and enforceable:

```txt
packages/workspace-layout-core
  owns: pane geometry, surface model, resize math, pure tests
  does not own: React rendering, shadcn controls, Convex persistence, localStorage,
                Noter route search, public landing dev behavior, route fixtures
```

After that lands, wait. If the app code becomes easier to read because
`WorkspaceLayoutV2.tsx` can import obvious pure pane decisions from the package,
then consider the next slice.

The second slice should not be "move more files." It should be "remove app
knowledge from the React runtime." Only when that is true should the React
runtime move into `packages/workspace-layout-react` or similar.

## Proposed First Package Shape

Suggested package name:

```txt
@noter-md/workspace-layout-core
```

Suggested files:

```txt
packages/workspace-layout-core/
  package.json
  tsconfig.json
  src/
    geometry.ts
    panelGeometry.ts
    resizeHandles.ts
    clampNumber.ts
    index.ts
  test/
    geometry.test.ts
    panelGeometry.test.ts
    resizeHandles.test.ts
```

Suggested exports:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./geometry": "./src/geometry.ts",
    "./panel-geometry": "./src/panelGeometry.ts",
    "./resize-handles": "./src/resizeHandles.ts"
  }
}
```

Suggested package scripts should match `@noter-md/dependent`:

```json
{
  "scripts": {
    "typecheck": "pnpm --dir ../.. exec tsgo -p packages/workspace-layout-core/tsconfig.json --pretty false",
    "lint": "pnpm --dir ../.. exec vp lint --tsconfig packages/workspace-layout-core/tsconfig.json --report-unused-disable-directives packages/workspace-layout-core/src packages/workspace-layout-core/test",
    "test": "pnpm --dir ../.. exec vp test packages/workspace-layout-core/test",
    "check": "pnpm run typecheck && pnpm run lint && pnpm run test"
  }
}
```

Root scripts would need `check:packages`, `typecheck:packages`, and likely
`apps/noter/package.json` dependency updates:

```json
"@noter-md/workspace-layout-core": "workspace:*"
```

This first package should export source only, like `@noter-md/dependent`, and
stay private until there is a real external packaging requirement.

## What Must Stay In The App For Now

- `PersistedSidebarProvider`
- `usePersistedWorkspaceSidebarState`
- `useLocalStorageWorkspaceSidebarState`
- `WorkspaceSidebarState` Convex validators and schema fields
- `PublicLayoutShell`
- `WorkspaceLayoutV2FullPage`
- `WorkspaceLayoutV2BottomPanel`
- `WorkspaceLayoutV2PaneFrame`, unless the package later owns styling tokens
- app button/icon choices
- landing dev mode / search-param defaults
- route and visual fixtures
- route-level Playwright tests

## Migration Plan If We Try It

1. Create `@noter-md/workspace-layout-core` with copied pure geometry and tests.
2. Replace app imports from `WorkspaceLayoutV2Geometry`,
   `WorkspaceLayoutV2PanelGeometry`, and maybe
   `WorkspaceLayoutV2ResizeHandleConfigs` with package imports.
3. Delete the app-local pure files only after every callsite imports the package
   directly. Do not keep one-line re-export shims.
4. Run focused unit tests plus `pnpm --filter noter check:ci`.
5. Stop there and reassess whether the app reads better.

The important review question for the first PR should be:

```txt
Did this package reduce the mental model inside apps/noter, or did it only move
files?
```

## Current Opinion

Moving toward a package is a good direction as a constraint, not as a near-term
goal.

The package boundary would help if it forces us to name which pieces are
actually reusable:

- pane/surface model: yes
- min/max geometry: yes
- resize merge/handoff decisions: yes
- raw carousel/render mechanics: maybe
- Noter panel chrome: no
- Noter sidebar persistence: no
- Noter public-layout debug knobs: no
- shadcn button styling: no

My current recommendation is to make one small package for pure workspace pane
layout math, then reassess. If that first package does not make the app easier
to understand, moving the React shell would probably be ceremony.
