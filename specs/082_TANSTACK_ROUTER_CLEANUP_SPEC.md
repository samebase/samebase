# 082 TanStack Router Cleanup Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/app shell
- Last updated: 2026-04-09
- Depends on:
  - `apps/noter/src/lib/appRouter.ts`
  - `apps/noter/src/components/NotFoundRoutePage.tsx`
  - `apps/noter/src/test/TestRouterProvider.tsx`
  - `specs/081_TANSTACK_ROUTER_MIGRATION_SPEC.md`

## Summary

The TanStack Router migration is complete. The cleanup work removes the last
temporary bridges that were left behind to keep the migration safe and
incremental, while intentionally keeping the fast landing shell decision
separate.

This document tracks that cleanup separately from `081` so the accepted
migration ledger can stay focused on the router transition itself.

## Goals

1. Remove runtime dependence on compatibility seams that preserve React
   Router-shaped APIs.
2. Replace leftover router bridges with deliberate routed surfaces.
3. Shrink fixture and test shims so they exercise the shipped TanStack route
   tree instead of a React Router-shaped adapter.
4. Remove the remaining browser-style location and raw-history escapes so route
   code can benefit from TanStack's native type surface end to end.
5. Keep the landing shell cleanup separate from route-ownership cleanup so that
   decision can move at a different speed.

## Cleanup Sequence

1. Remove runtime dependence on the compat seam in
   `apps/noter/src/lib/router.ts`. Complete.
2. Replace the unresolved-path `App.tsx` bridge with an explicit routed
   fallback. Complete.
3. Shrink fixture and test dependence on compat helpers such as the router seam
   `MemoryRouter`. Complete.
4. Remove remaining browser-style location adapters and route-local raw
   history/href escapes. Remaining.
5. Revisit `FastPublicLandingShell.tsx` only after the router, fallback, test,
   and location-shim cleanup no longer depend on it. Remaining.

## Working Log

### 2026-04-08

- Problem: the migration ledger in `081` had started carrying post-migration
  cleanup work. Tried: split the cleanup plan into a dedicated follow-up spec.
  Result: `081` stays focused on the migration, and this document now tracks the
  smaller cleanup phases.

- Problem: the `"$"` catch-all route in `apps/noter/src/lib/appRouter.ts` still
  rendered `App.tsx`, which was no longer a real route surface. Tried: inspected
  the routed app state after the TanStack migration. Result: the unresolved-path
  behavior should become an explicit not-found route instead of keeping a
  leftover auth/layout bridge alive.

- Problem: the follow-up inventory on `origin/main` showed that the compat seam
  cleanup was less complete than expected; runtime app code, test helpers, and
  visual fixtures still imported `apps/noter/src/lib/router.ts`. Tried: finished
  the cleanup in two passes instead of assuming step 1 was already done. Result:
  runtime now imports native `@tanstack/react-router` APIs directly, fixtures
  and tests use `apps/noter/src/test/TestRouterProvider.tsx`, and the compat
  seam plus its dedicated seam test are deleted.

- Problem: the generic TanStack `navigate()` API does not accept arbitrary
  browser-style history state objects on raw `href` navigations, but
  `apps/noter/src/components/FileView.tsx` still preserves user-owned history
  state while it hand-builds file-view hrefs. Tried: switch the component to a
  local `router.history.push` / `replace` escape hatch instead of keeping the
  old global compat wrapper alive. Result: the remaining untyped history usage
  is explicit, local to file view, and marked with TODOs so a future route-owned
  file-view model can remove it.

- Problem: test and fixture routes still needed a memory-history provider after
  the compat seam was removed. Tried: mount the real app router with
  `createAppRouter(createMemoryHistory(...))` inside a test-only provider.
  Result: test and visual-fixture surfaces now exercise the shipped TanStack
  route tree instead of a React Router-shaped compatibility layer, with only two
  root-search mocks needing partial-module mocks to keep their tests isolated.

### 2026-04-09

- Problem: several runtime surfaces still reshape TanStack location back into
  browser-style `{ pathname, search, hash }` objects or use low-level raw href
  pushes where route-owned typed navigation is the long-term goal. Tried:
  audited every remaining `useLocation({ select: ... })` adapter that rebuilds
  browser-style location fields and marked each one with explicit TODOs. Result:
  the remaining type-safety escape hatches are now a named cleanup phase instead
  of scattered incidental debt. The current hotspots are `Layout.tsx`,
  `RootIndexRoutePage.tsx`, `FastPublicLandingShell.tsx`, `FileView.tsx`, and
  one fixture-only route label in `CommitReviewVisualFixture.tsx`.

- Problem: the landing/root helper layer was still carrying the exported
  `PathWithSearch` type even though TanStack now owns the route tree and search
  contracts. Tried: remove the shared alias, switch the helper layer to explicit
  pathname/search/hash inputs, and stop reconstructing browser-style `#hash`
  values in the routed landing/root surfaces. Result: `PathWithSearch` is gone,
  the root/landing helpers now read explicit primitives, and the remaining
  cleanup hotspots are narrower: `FileView.tsx`, `FastPublicLandingShell.tsx`,
  and the fixture-only route label in `CommitReviewVisualFixture.tsx`.
