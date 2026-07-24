# 083 TanStack Router File-Based Migration Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/app shell
- Last updated: 2026-04-09
- Depends on:
  - `apps/samebase/package.json`
  - `apps/samebase/vite.config.ts`
  - `apps/samebase/src/lib/appRouter.ts`
  - `apps/samebase/src/routes.ts`
  - `specs/081_TANSTACK_ROUTER_MIGRATION_SPEC.md`
  - `specs/082_TANSTACK_ROUTER_CLEANUP_SPEC.md`

## Summary

Samebase should keep its current Vite SPA runtime and convert the shipped TanStack Router app from a
handwritten code-based route table into generated file-based routing.

The first implementation path should use TanStack Router's virtual file routes instead of the plain
filesystem convention. That keeps the migration compatible with the current shipped URL surface,
avoids awkward route filenames for paths such as `/vault/$`, and still moves route ownership into
route modules plus a generated route tree.

This document intentionally starts short. It should be expanded during the migration with the real
issues, attempted fixes, and outcomes from each landed slice.

## Goals

1. Keep the current Vite SPA runtime and deployment shape while moving route ownership to file-based
   TanStack Router modules.
2. Preserve the current shipped paths, route precedence, not-found behavior, root-route search
   behavior, and custom search serialization.
3. Avoid filesystem-driven route naming churn where the current route surface is awkward to express
   directly as filenames.
4. Keep the current `createAppRouter(...)`, `AppRouterProvider`, and `TestRouterProvider` seams
   intact so runtime and tests can migrate with low blast radius.
5. Capture real blockers and follow-up opportunities in a living spec instead of treating this as a
   one-shot mechanical rewrite.

## Non-Goals

1. Adopting TanStack Start in the same change series.
2. Moving Samebase from the current Vite SPA deployment shape to a Workers or SSR runtime.
3. Rewriting route-owned search contracts, Convex data flow, or auth boundaries just because the
   route tree generator changes.
4. Changing Samebase's existing key-only query-param policy or other intentional URL-shape
   decisions.
5. Renaming app-level router seams to match TanStack Start conventions before the file-based
   migration is proven.

## Current Constraints

- `apps/samebase/src/lib/appRouter.ts` currently owns the shipped route tree and router factory.
- The shipped route tree includes explicit root, public, research, authenticated, machines,
  codespace, and vault/file surfaces.
- `apps/samebase/src/lib/tanstackSearchParams.ts` intentionally preserves human-readable query
  params such as `/?dev`.
- `apps/samebase/src/main.tsx` and `apps/samebase/src/test/TestRouterProvider.tsx` already mount the
  real TanStack router through stable app-owned seams that should survive the first migration slice.
- `apps/samebase/public/_redirects` and `apps/samebase/index.html` still represent the active SPA
  hosting/runtime contract and should stay unchanged in this migration unless a step proves
  otherwise.

## Initial Sequence

1. Add the TanStack Router Vite plugin and generate the route tree from a virtual file routes
   config.
2. Mirror the current shipped route table into route modules under `apps/samebase/src/routes`.
3. Keep the router factory in `apps/samebase/src/lib/appRouter.ts`, but switch it from a handwritten
   `createRoute(...)` tree to the generated `routeTree`.
4. Preserve the existing app-owned search parser/stringifier, root search middleware, and not-found
   handling.
5. Validate the generated route tree against the existing route tests before attempting follow-up
   cleanup such as route-file reorganization or route-local helper deletion.

## Working Log

### 2026-04-09

- Problem: plain filesystem-based routing would force awkward filenames for a few current shipped
  routes, especially the encoded catch-all vault route at `/vault/$`. Tried: reviewed the latest
  TanStack Router file-based and virtual file routes docs. Result: start with `virtualRouteConfig`
  so Samebase can move to file-based route ownership without inventing brittle filename conventions
  for already-shipped paths.

- Problem: the current `appRouter.ts` seam intentionally stayed a `.ts` file during the earlier
  TanStack migration because widening it to `.tsx` had caused extra lint and module-shape churn.
  Tried: switched the provider to JSX while moving the router factory onto the generated file-based
  `routeTree`. Result: Vite dependency scanning failed on JSX inside `appRouter.ts`, so the file
  should stay `.ts` and continue using `createElement(RouterProvider, { router })` instead of
  widening the seam during this migration.

- Problem: the first file-based slice needed to prove that Samebase could swap the route-tree source
  without widening scope into runtime or test-harness rewrites. Tried: kept `createAppRouter(...)`,
  `AppRouterProvider`, and `TestRouterProvider` intact while replacing the handwritten
  `createRoute(...)` table with generated virtual file routes under `apps/samebase/src/routes`.
  Result: the initial pass generated `routeTree.gen.ts`, preserved the current Vite SPA runtime, and
  passed `tsc --noEmit`, focused router/route-dependent Vitest coverage, `lint:ci`, and `build:ci`.

- Problem: the first file-based slice still left many routes with a two-step hop:
  `routes/*.tsx -> components/*RoutePage.tsx -> real page component`. Tried: inline the route-only
  wrappers for authenticated routes such as `/add`, `/pricing`, `/vault/$`, and the chat-only
  codespace route, plus the simple public wrappers for `/privacy`, `/terms`, `/pitch*`, and the logo
  transition labs. Result: the route files now own those thin wrappers directly, the dead
  `components/*RoutePage.tsx` files are deleted, and the remaining route-support helper file only
  carries the shared public-route shell plus the routes that still need a bit more local logic.

- Problem: the new route files still relied on manual `React.lazy(...)` calls, which duplicated the
  code-splitting responsibility that TanStack Router can own directly and made the next performance
  step harder to reason about. Tried: replace the route-file `lazy(...)` wrappers with direct
  component imports, then enable `autoCodeSplitting: true` on the existing `@tanstack/router-plugin`
  Vite integration. Result: route-owned code splitting now moves to the router plugin, the route
  files stay simpler, and the home route can keep its separate `VaultDashboard` lazy boundary while
  we validate the initial bundle shape in follow-up checks.

- Problem: once route files stopped hiding imports behind `React.lazy(...)`, the broader Vitest
  suite started importing some route-owned components in plain test contexts where Vite compile-time
  defines are not always injected. Tried: read the optional browser proxy path through the typed
  build config object and give repo-wide Vitest the same test build config shape, then allow a
  test-only fallback local Convex URL when Vitest does not inject `VITE_CONVEX_URL` either. Result:
  full-test imports keep working outside the app Vite build pipeline without changing the shipped
  proxy behavior in real app runtime.

- Problem: even after the first wrapper cleanup, `-publicRouteComponents.tsx` still carried
  route-specific logo and research page exports, which kept an unnecessary indirection layer alive
  for routes that no longer need special migration handling. Tried: move the remaining logo and
  codex research route logic into their own route files and leave `-publicRouteComponents.tsx` as
  the shared public metadata/layout shell only. Result: the route tree is more local and obvious,
  while the helper file shrinks down to one tiny shared wrapper instead of acting like a second
  route registry.

- Problem: router-managed route chunks still preload every module imported by a route component, so
  `/vault/$` started pulling the full `FileView` stack as soon as the route chunk preloaded, even
  for signed-out deep links that should stop at the auth gate. Tried: add a regression test around
  the route component's `.preload()` behavior, then restore a route-local `lazy(...)` boundary just
  for `FileView` while keeping the rest of the router on `autoCodeSplitting`. Result: the heavy
  editor bundle stays behind the authenticated shell again without backing out the broader route
  cleanup.
