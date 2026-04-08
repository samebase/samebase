# 082 TanStack Router Cleanup Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/app shell
- Last updated: 2026-04-08
- Depends on:
  - `apps/noter/src/lib/appRouter.ts`
  - `apps/noter/src/components/NotFoundRoutePage.tsx`
  - `apps/noter/src/lib/router.ts`
  - `specs/081_TANSTACK_ROUTER_MIGRATION_SPEC.md`

## Summary

The TanStack Router migration is complete. The remaining work is cleanup: remove
temporary bridges that were left behind to keep the migration safe and
incremental.

This document tracks that cleanup separately from `081` so the accepted
migration ledger can stay focused on the router transition itself.

## Goals

1. Remove runtime dependence on compatibility seams that preserve React
   Router-shaped APIs.
2. Replace leftover router bridges with deliberate routed surfaces.
3. Keep the landing shell cleanup separate from route-ownership cleanup so those
   decisions can move at different speeds.

## Cleanup Sequence

1. Remove runtime dependence on the compat seam in
   `apps/noter/src/lib/router.ts`.
2. Replace the unresolved-path `App.tsx` bridge with an explicit routed
   fallback.
3. Shrink fixture and test dependence on compat helpers such as the router seam
   `MemoryRouter`.
4. Revisit `FastPublicLandingShell.tsx` only after the router and fallback
   cleanup no longer depend on it.

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
