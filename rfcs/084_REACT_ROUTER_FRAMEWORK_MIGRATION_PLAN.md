# 084 React Router Framework Migration Plan

## Document Control

- Status: In progress
- Owner: Noter frontend/app shell
- Last updated: 2026-04-07
- Depends on:
  - `apps/noter/package.json`
  - `apps/noter/vite.config.ts`
  - `apps/noter/react-router.config.ts`
  - `apps/noter/src/root.tsx`
  - `apps/noter/src/entry.client.tsx`
  - `apps/noter/src/routes.ts`
  - `apps/noter/src/home.tsx`
  - `apps/noter/src/catchall.tsx`
  - `apps/noter/src/App.tsx`
  - `apps/noter/src/Layout.tsx`
  - `apps/noter/src/lib/pageMetadata.ts`
  - `apps/noter/src/lib/publicLandingAuthState.ts`
  - `apps/noter/src/lib/landingCopyShell.ts`
  - `apps/noter/src/lib/publicLandingScrollState.ts`
  - `apps/noter/public/_redirects`
  - `apps/noter/scripts/run-react-router-dev.js`
  - `apps/noter/src/components/workspace-layout/RepositoryWorkspaceFrame.tsx`
  - `apps/noter/src/components/workspace-layout/DashboardWorkspaceLayout.tsx`
  - `apps/noter/src/components/workspace-layout/VaultDashboardWorkspaceScene.tsx`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx`
  - `apps/noter/src/components/workspace-layout-v2/useWorkspaceLayoutV2DragSurface.ts`
  - `apps/noter/src/components/useProsemarkMobilePaneDrag.ts`
  - `specs/080_WORKSPACE_LAYOUT_V2_ROUTE_MIGRATION_AND_FRAMEWORK_READINESS_SPEC.md`

## Summary

This RFC defines a concrete migration plan for moving Noter from the current
`BrowserRouter` plus component-route setup to React Router framework mode.

The migration should follow the official
[Framework Adoption from Component Routes](https://reactrouter.com/upgrading/component-routes)
guide, but adapted to Noter's monorepo structure, Convex runtime, custom Vite
setup, prerendered public landing route, and remaining `App.tsx` compatibility
bridge.

The key sequencing rule is:

1. gain the framework runtime first without changing live route behavior
2. delete the landing/bootstrap split-brain
3. extract route modules and layout routes incrementally around the accepted
   shell seams from
   `specs/080_WORKSPACE_LAYOUT_V2_ROUTE_MIGRATION_AND_FRAMEWORK_READINESS_SPEC.md`

## Goals

1. Adopt React Router framework mode without breaking current routes.
2. Preserve the existing `make anon` and package-level operator workflows.
3. Keep Convex subscriptions, auth hooks, and current component-owned data flow
   intact for the initial migration.
4. Delete the separate public-landing bootstrap runtime instead of preserving it
   inside a new framework setup.
5. Reuse `Layout.tsx`, `RepositoryWorkspaceFrame`, `DashboardWorkspaceLayout`,
   and `VaultDashboardWorkspaceScene` as the future layout-route seam.
6. Keep template work out of scope for this migration pass.

## Non-Goals

1. Rewriting all routes around loaders and actions on day one.
2. Blocking framework adoption on starter-template cleanup.
3. Combining route-module extraction with a fresh workspace-shell redesign.
4. Preserving `bootstrap.ts` as a long-term architecture path.

## Current branch status

Implemented on the current framework branch:

1. Phase 1 is complete enough to boot through React Router framework mode:
   `reactRouter()` is in Vite, `react-router.config.ts` exists, and the app now
   starts through `root.tsx`, `entry.client.tsx`, `routes.ts`, `home.tsx`, and
   `catchall.tsx`.
2. Phase 2 is effectively complete for provider ownership: the framework root
   owns the document shell and provider stack, and `main.tsx` is deleted.
3. Phase 4 is mostly complete for the landing path: `/` is prerendered via
   `prerender: ["/"]`, `build/client/index.html` contains the real landing
   markup, `_redirects` falls back to `__spa-fallback.html`, and the old
   `index.html` plus `bootstrap.ts` entry path is gone.
4. Temporary bridge code still exists by design: `home.tsx` and `catchall.tsx`
   both render `App.tsx`, and `App.tsx` still owns most live route matching,
   auth branching, and route-level metadata decisions after hydration.
5. The visual fixture surface is still intentionally reachable through a
   framework route at `/visual-fixture.html` while the rest of the migration
   continues.

## Migration Plan

### Phase 0. Scope and guardrails

Required boundaries for this migration:

1. adopt React Router framework mode in SPA configuration first with
   `ssr: false`
2. keep the existing `make anon`, `make anon-once`, and package-level dev/build
   workflows intact for operators; change the implementation behind them rather
   than teaching the repo a second frontend startup path
3. keep Convex subscriptions, auth hooks, and client-side data ownership in the
   current components during the initial framework move instead of forcing an
   immediate loader/action rewrite
4. keep `RepositoryWorkspaceFrame`, `DashboardWorkspaceLayout`, and
   `VaultDashboardWorkspaceScene` router-agnostic so they remain reusable as
   nested layout-route elements later
5. keep starter-template and template-regeneration work out of scope for this
   pass; those templates can be deleted and recreated later instead of blocking
   the app migration

### Phase 1. Boot the app under the framework without changing route behavior

Primary goal:

- make Noter run through the React Router framework runtime while still routing
  every URL through the existing `App.tsx` switchboard

Primary file targets:

- `apps/noter/package.json`
- `apps/noter/vite.config.ts`
- `apps/noter/react-router.config.ts`
- `apps/noter/src/root.tsx`
- `apps/noter/src/entry.client.tsx`
- `apps/noter/src/routes.ts`
- `apps/noter/src/catchall.tsx`

Required work:

1. replace `@vitejs/plugin-react` with `reactRouter()` in
   `apps/noter/vite.config.ts`, while preserving existing Noter-specific Vite
   behavior such as build metadata defines, static asset syncing, legal-page
   generation, Daytona proxying, and local dev plugins
2. add `apps/noter/react-router.config.ts` beside `vite.config.ts` with
   `appDirectory: "src"` and `ssr: false`
3. move the current document shell from `apps/noter/index.html` into
   `apps/noter/src/root.tsx`, including favicon links, manifest links, social
   metadata defaults, theme color, and structured data
4. keep `apps/noter/src/entry.client.tsx` minimal and boot with `HydratedRouter`
5. introduce a single catchall route module that renders the existing `App.tsx`,
   so the app comes back on screen before any route-module extraction starts
6. replace the current Vite-only frontend commands with React Router framework
   commands under the existing package and Makefile entrypoints; because Noter
   currently depends on `run-vite-dev.js` for deterministic port and origin
   state, that wrapper should become a React Router-aware wrapper instead of
   being deleted outright

Exit criteria:

- the app boots through React Router framework mode
- all current URLs still behave the same because `App.tsx` still owns live
  routing
- the repo has one framework runtime and zero reliance on `BrowserRouter`

### Phase 2. Separate document boot from the app shell

Primary goal:

- keep the framework document entry SSR-safe and move app-only providers and
  shells below it

Required direction:

1. move the provider stack currently mounted in `apps/noter/src/main.tsx` behind
   the root route so the framework entry owns app bootstrap
2. keep the route-module `root.tsx` focused on the document shell, not on
   authenticated app chrome
3. keep `apps/noter/src/Layout.tsx` as the app-level
   `WorkspaceLayoutV2PageFrame` owner for routes that should render inside the
   app shell; do not turn it into the document root
4. make `apps/noter/src/main.tsx` temporary compatibility code at most; it
   should shrink toward deletion once the bootstrap split is gone

This phase is successful when the framework root owns document rendering and the
existing app shell remains a nested concern.

### Phase 3. Peel standalone pathname branches out of `App.tsx`

Primary goal:

- shrink `App.tsx` as a pathname switchboard before touching the main
  authenticated workspace routes

Recommended extraction order:

1. public static routes with simple shell needs: `/privacy`, `/terms`
2. standalone public or noindex surfaces that already bypass most app routing:
   `/pitch`, `/pitch/print`, `/pitch/print/mobile`
3. isolated logo and research routes that are currently handled by direct
   pathname checks
4. auth-sensitive exceptional routes such as MCP consent only after the simpler
   standalone routes have proven the framework boot path

Required direction:

1. each extracted route gets a route-module entry in `routes.ts`
2. each extracted route owns its own metadata export instead of depending on a
   central pathname switch in `pageMetadata.ts`
3. `App.tsx` keeps serving the remaining URLs through the catchall until the
   extracted route works end to end

This phase should remove special-case branches from `App.tsx` without forcing a
rewrite of the shared workspace wrappers.

### Phase 4. Delete the landing/bootstrap split-brain

Primary goal:

- make the public landing page a normal framework route and remove the
  handwritten bootstrap runtime

Primary file targets:

- `apps/noter/src/bootstrap.ts`
- `apps/noter/src/lib/fastLandingBoot.ts`
- `apps/noter/src/lib/landingCopyShell.ts`
- `apps/noter/src/lib/publicLandingScrollState.ts`
- bootstrap-only branches in `apps/noter/src/lib/pageMetadata.ts`
- bootstrap-only branches in `apps/noter/src/lib/publicLandingAuthState.ts`
- parity-only landing tests and fixtures

Required direction:

1. move the landing route onto the normal React Router route tree so `/` is
   rendered by a route module from first paint
2. keep the current landing UX behavior, but implement it through React
   components and route metadata instead of string HTML plus manual DOM event
   binding
3. if a lightweight pre-hydration landing surface is still needed, render it as
   framework-owned document or route output rather than through a separate
   bootstrap script that later imports the app
4. delete `bootstrap.ts` only after the route-level landing coverage proves
   scroll restore, waitlist draft behavior, auth handoff, and metadata parity

This phase is the biggest architectural simplification in the whole migration.

### Phase 5. Introduce nested layout routes around the accepted shell seams

Primary goal:

- make the future route-module structure match the already accepted workspace
  shell seams

Required direction:

1. add nested route boundaries for the app shell, repository workspace shell,
   and dashboard workspace shell
2. let the route modules own route matching, params, redirects, and exceptional
   auth behavior
3. keep `RepositoryWorkspaceFrame`, `DashboardWorkspaceLayout`, and
   `VaultDashboardWorkspaceScene` focused on layout composition and passed-in
   content
4. do not teach those shared wrappers about loaders, actions, matches, or
   route-module-only state

The intended route hierarchy after this phase is:

1. framework document root in `root.tsx`
2. app-shell layout route backed by `Layout.tsx`
3. repository and dashboard nested layout routes backed by the existing shared
   wrapper seams
4. leaf routes such as dashboard, pricing, add repository, machines, machine
   connect, vault file view, and codespace chat

### Phase 6. Move authenticated app routes off the catchall incrementally

Primary goal:

- migrate the real app routes one by one without stacking route extraction and
  shell redesign in the same change

Recommended order:

1. dashboard and pricing routes
2. add-repository and machine-management routes
3. repository and file-view routes
4. codespace chat routes

Required direction:

1. keep the existing Convex hook-driven data flow for the first pass; route
   modules do not need loaders merely because they exist
2. adopt `clientLoader`, actions, redirects, or route-level metadata only when a
   specific route becomes simpler because of them
3. do not declare `FileView` fully migrated until its mobile editor drag path is
   compatible with `useWorkspaceLayoutV2DragSurface` instead of the old
   shell-owned drag bridge
4. delete the catchall `App.tsx` route only after no live URL depends on the
   component-route tree anymore

This phase should end with `App.tsx` either deleted or reduced to dead
compatibility code that can immediately be removed.

### Phase 7. Cleanup, deletion, and validation

Cleanup targets:

1. temporary bridge routes in `apps/noter/src/home.tsx` and
   `apps/noter/src/catchall.tsx` after live routes no longer depend on the
   component-route tree
2. bootstrap-era metadata helpers, landing parity helpers, and landing parity
   tests that are no longer needed now that `/` prerenders through the framework
   runtime
3. central pathname switching inside `App.tsx` and `pageMetadata.ts` once route
   modules own the remaining live URLs
4. `@types/react-router-dom` if it is no longer needed after the framework move

Required validation:

1. route-level Playwright coverage for landing, dashboard, repository file view,
   codespace chat, MCP consent, and machine routes
2. explicit mobile coverage for pane escape, sidebar drag, editor drag, focus,
   and scroll ownership
3. successful local boot through the existing `make anon` flow
4. successful production build through the framework build path

## Risks and constraints

1. The biggest remaining integration risk is not the framework boot path
   anymore; it is the temporary `home.tsx` and `catchall.tsx` bridge that still
   routes most live URLs through `App.tsx`.
2. The biggest workflow risk is dropping Noter's custom Vite behavior while
   swapping to `reactRouter()`.
3. The biggest product risk is claiming repository routes are migrated before
   the `FileView` mobile drag contract has moved off the old shell bridge.
4. The biggest process risk is trying to do shell migration and route-module
   extraction in the same step for the same route.

## Acceptance criteria

1. The app can boot in React Router framework mode while preserving current
   behavior behind a catchall `App.tsx` route.
2. The landing route no longer depends on a separate bootstrap-only DOM runtime.
3. Shared workspace wrappers remain the layout-route seam instead of learning
   router-specific data-loading concerns.
4. Authenticated routes can move off the catchall incrementally without another
   shell rewrite.
5. The existing operator-facing `make anon` workflow still works after the
   migration.
