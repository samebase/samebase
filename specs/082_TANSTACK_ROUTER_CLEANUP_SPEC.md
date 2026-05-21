# 082 TanStack Router Cleanup Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/app shell
- Last updated: 2026-05-01
- Depends on:
  - `apps/noter/src/lib/appRouter.ts`
  - `apps/noter/src/components/NotFoundRoutePage.tsx`
  - `apps/noter/src/test/TestRouterProvider.tsx`
  - `specs/081_TANSTACK_ROUTER_MIGRATION_SPEC.md`

## Summary

The TanStack Router migration is complete. The cleanup work removed the temporary bridges that were
left behind to keep the migration safe and incremental, including the now-deleted fast landing shell
path.

This document tracks that cleanup separately from `081` so the accepted migration ledger can stay
focused on the router transition itself.

## Goals

1. Remove runtime dependence on compatibility seams that preserve React Router-shaped APIs.
2. Replace leftover router bridges with deliberate routed surfaces.
3. Shrink fixture and test shims so they exercise the shipped TanStack route tree instead of a React
   Router-shaped adapter.
4. Remove the remaining browser-style location and raw-history escapes so route code can benefit
   from TanStack's native type surface end to end.
5. Replace route-owned raw string helper boundaries with typed TanStack route helpers where
   practical, especially when a helper now exists only for one explicit app route.
6. Keep deliberate router-level URL policy decisions separate from migration debt so optional
   standards changes do not block cleanup completion.

## Cleanup Sequence

1. Remove runtime dependence on the compat seam in `apps/noter/src/lib/router.ts`. Complete.
2. Replace the unresolved-path `App.tsx` bridge with an explicit routed fallback. Complete.
3. Shrink fixture and test dependence on compat helpers such as the router seam `MemoryRouter`.
   Complete.
4. Remove remaining browser-style location adapters, route-local raw history/href escapes, and
   route-owned raw string helper boundaries. Complete.
5. Revisit `FastPublicLandingShell.tsx` only after the router, fallback, test, and location-shim
   cleanup no longer depend on it. Complete.

## Current Step 4 Targets

The route-owned cleanup work is complete. The remaining custom router behavior is intentional
product policy rather than migration debt.

Intentional remaining router-level boundary:

1. `apps/noter/src/lib/tanstackSearchParams.ts` still defines the router-wide query
   parser/stringifier because Noter intentionally preserves key-only URLs such as `/?dev` instead of
   adopting TanStack Router's default JSON-style search semantics.

Already completed in this step:

1. `apps/noter/src/lib/landingDevMode.ts`
2. `apps/noter/src/lib/noterSync.ts`
3. route-local builders like `buildPricingPath()` in `apps/noter/src/components/PricingPage.tsx`
4. route-local research helpers in `apps/noter/src/components/CodexAppServerResearchPage.tsx` and
   `apps/noter/src/components/CodexAppServerThreadBrowserResearchPage.tsx`
5. the route-local `buildLocationHref()` helper that used to mirror TanStack's current
   `location.href` in `apps/noter/src/components/RootIndexRoutePage.tsx`
6. the `buildGithubOAuthReturnToPath()` helper that used to reassemble the current route from
   browser-style location pieces in `apps/noter/src/lib/githubOAuthFlow.ts`
7. the remaining browser-style fixture shim in
   `apps/noter/src/components/CommitReviewVisualFixture.tsx`
8. the root landing/layout shell callsites in `apps/noter/src/Layout.tsx` and
   `apps/noter/src/components/FastPublicLandingShell.tsx`
9. the file-view search contract in `apps/noter/src/lib/fileViewRouteSearch.ts` and the search-only
   query-state transitions in `apps/noter/src/components/FileView.tsx`
10. the low-level history pushes/replaces that used to sit behind file-view navigation in
    `apps/noter/src/components/FileView.tsx`
11. the duplicated `/vault/...` file-route string assembly that now lives in
    `apps/noter/src/lib/vaultRoutes.ts::buildVaultFileRoute`
12. the direct route-owned parser/stringifier callsites that used to sit in
    `apps/noter/src/components/LogoPreviewPage.tsx`, `apps/noter/src/components/PricingPage.tsx`,
    and `apps/noter/src/lib/rootRouteSearch.ts`
13. the remaining app-side parser/stringifier usage on the raw `/vault/$` boundary in
    `apps/noter/src/components/FileView.tsx` and
    `apps/noter/src/components/EditedFilesCategories.tsx`
14. the shell-only landing copy renderer in `apps/noter/src/lib/landingCopyShell.ts`
15. the temporary routed fast shell in `apps/noter/src/components/FastPublicLandingShell.tsx`, its
    once-per-load root-route handoff in `apps/noter/src/components/RootIndexRoutePage.tsx`, the
    shell-only scroll store in `apps/noter/src/lib/publicLandingScrollState.ts`, and the dedicated
    `apps/noter/e2e/public-landing-shell.spec.ts` handoff assertions
16. the generic query-param helper in `apps/noter/src/lib/queryParams.ts`
17. the local ESLint plugin that only existed to enforce the generic query-param helper
18. the Google auth redirect search updates in `apps/noter/src/lib/googleAuthRedirect.ts`, which now
    return typed root search updates for router-owned URL construction

Important non-targets for this step:

1. Existing `Link to="/..."` callsites are already route-typed by TanStack and do not need
   conversion just because they use string literals.
2. Existing `getRouteApi("/...")` callsites are already route-typed and should stay as they are
   unless a more local route API becomes clearer.
3. `apps/noter/src/lib/tanstackSearchParams.ts` is no longer tracked as cleanup debt while Noter
   intentionally preserves key-only query params such as `/?dev`.

## Working Log

### 2026-05-01

- Problem: the remaining generic query-param helper and local lint rule were now preserving a
  pre-router abstraction. Tried: moved route-owned URL updates onto TanStack search objects and
  `router.buildLocation`, while using native `URL` APIs for external URLs and internal API request
  paths. Result: `apps/noter/src/lib/queryParams.ts` and the `eslint-rules` workspace package are
  deleted; the only app-wide search codec left is `apps/noter/src/lib/tanstackSearchParams.ts`,
  which preserves the shipped key-only query string contract.

### 2026-04-08

- Problem: the migration ledger in `081` had started carrying post-migration cleanup work. Tried:
  split the cleanup plan into a dedicated follow-up spec. Result: `081` stays focused on the
  migration, and this document now tracks the smaller cleanup phases.

- Problem: the `"$"` catch-all route in `apps/noter/src/lib/appRouter.ts` still rendered `App.tsx`,
  which was no longer a real route surface. Tried: inspected the routed app state after the TanStack
  migration. Result: the unresolved-path behavior should become an explicit not-found route instead
  of keeping a leftover auth/layout bridge alive.

- Problem: the follow-up inventory on `origin/main` showed that the compat seam cleanup was less
  complete than expected; runtime app code, test helpers, and visual fixtures still imported
  `apps/noter/src/lib/router.ts`. Tried: finished the cleanup in two passes instead of assuming step
  1 was already done. Result: runtime now imports native `@tanstack/react-router` APIs directly,
  fixtures and tests use `apps/noter/src/test/TestRouterProvider.tsx`, and the compat seam plus its
  dedicated seam test are deleted.

- Problem: the generic TanStack `navigate()` API does not accept arbitrary browser-style history
  state objects on raw `href` navigations, but `apps/noter/src/components/FileView.tsx` still
  preserves user-owned history state while it hand-builds file-view hrefs. Tried: switch the
  component to a local `router.history.push` / `replace` escape hatch instead of keeping the old
  global compat wrapper alive. Result: the remaining untyped history usage is explicit, local to
  file view, and marked with TODOs so a future route-owned file-view model can remove it.

- Problem: test and fixture routes still needed a memory-history provider after the compat seam was
  removed. Tried: mount the real app router with `createAppRouter(createMemoryHistory(...))` inside
  a test-only provider. Result: test and visual-fixture surfaces now exercise the shipped TanStack
  route tree instead of a React Router-shaped compatibility layer, with only two root-search mocks
  needing partial-module mocks to keep their tests isolated.

### 2026-04-09

- Problem: several runtime surfaces still reshape TanStack location back into browser-style
  `{ pathname, search, hash }` objects or use low-level raw href pushes where route-owned typed
  navigation is the long-term goal. Tried: audited every remaining `useLocation({ select: ... })`
  adapter that rebuilds browser-style location fields and marked each one with explicit TODOs.
  Result: the remaining type-safety escape hatches are now a named cleanup phase instead of
  scattered incidental debt. The initial hotspots were `Layout.tsx`, `RootIndexRoutePage.tsx`,
  `FastPublicLandingShell.tsx`, `FileView.tsx`, and one fixture-only route label in
  `CommitReviewVisualFixture.tsx`.

- Problem: the landing/root helper layer was still carrying the exported `PathWithSearch` type even
  though TanStack now owns the route tree and search contracts. Tried: remove the shared alias,
  switch the helper layer to explicit pathname/search/hash inputs, and stop reconstructing
  browser-style `#hash` values in the routed landing/root surfaces. Result: `PathWithSearch` is
  gone, the root/landing helpers now read explicit primitives, and the remaining cleanup hotspots
  are narrower: `FileView.tsx`, `FastPublicLandingShell.tsx`, and the fixture-only route label in
  `CommitReviewVisualFixture.tsx`.

- Problem: several routed root/layout/shell callsites still rebuilt tiny
  `{ pathname, search, hash }` mirrors even though they already needed the native TanStack location
  object. Tried: replace those reshaped `useLocation({ select: ... })` calls with direct
  `useLocation()` reads and update the few helper callsites that still need explicit `searchStr`
  inputs. Result: the cleanup moved one step closer to the native TanStack shape, and the remaining
  debt is more clearly limited to the intentional raw-href/raw- history escape hatches.

- Problem: it was still unclear which remaining raw route strings are actually untyped debt versus
  already-typed TanStack literals. Tried: audit the remaining route literals after the
  `PathWithSearch` cleanup and separate helper-boundary debt from already-typed `Link` /
  `getRouteApi` usage. Result: the next cleanup step is now explicit: convert route-owned helper
  boundaries such as `landingDevMode.ts`, `googleAuthRedirect.ts`, `noterSync.ts`, and a few
  route-local builders to typed route helpers, while leaving generic low-level URL builders and
  already-typed route literals alone.

- Problem: the route-owned helper boundary cleanup still mixed two different classes of work:
  helpers that only exist for one explicit TanStack route, and root landing helpers that still
  preserve unrelated query params outside the root search schema. Tried: convert only the clean
  route-owned cases first by deriving href strings from typed `linkOptions(...)` in `noterSync.ts`,
  `PricingPage.tsx`, and the Codex research route helpers. Result: the route-owned string helper
  cleanup is now partially complete, and the remaining root landing helpers are explicitly deferred
  until the root route owns enough query-param behavior to replace those raw string-preserving
  helpers cleanly.

- Problem: the Codex research pages still turned typed route options back into href strings with
  local `to + search` concatenation. Tried: delete those route-local href builders and use
  `router.buildLocation(...)` directly with typed `linkOptions(...)` at the component boundary.
  Result: those research pages now rely on TanStack's own href materialization instead of
  duplicating query-string assembly in app code.

- Problem: a few remaining helpers were still reassembling the current route from
  pathname/search/hash even though TanStack already exposes the live href string. Tried: delete
  `buildLocationHref()` from `RootIndexRoutePage.tsx`, delete `buildGithubOAuthReturnToPath()` from
  `githubOAuthFlow.ts`, and switch the routed callsites onto `location.href`. Result: the
  current-route OAuth and fast-shell comparisons now use TanStack's own location primitive instead
  of app-owned string reconstruction.

- Problem: the root landing dev-toggle helpers were still route-owned string builders even though
  the routed root search contract already existed. Tried: convert `landingDevMode.ts` to build typed
  root-route search objects and move `Layout.tsx` and `FastPublicLandingShell.tsx` onto
  `navigate({ to: "/", search, hash: true })` and `router.buildLocation(...)`. Result: the routed
  landing shell and header toggle now use native TanStack root navigation, and the remaining step-4
  debt is no longer in the root helper layer.

- Problem: the file view route still parsed search flags from raw query strings even after the rest
  of the app moved to route-owned search validators. Tried: add a dedicated `fileViewRouteSearch.ts`
  validator for `/vault/$`, move `FileView.tsx` search-only transitions onto
  `router.navigate({ to: ".", search })`, and reuse the same typed contract from
  `EditedFilesCategories.tsx` when opening staged files. Result: file-view search flags are now
  route-owned and typed, while the remaining raw href/history escapes are narrowed to the encoded
  `/vault/$` path itself rather than its query state.

- Problem: `googleAuthRedirect.ts` looked like another root-helper candidate, but its real behavior
  is preserving the current non-root route during flows like MCP consent. Tried: traced all usage
  through `SignInWithGoogle`, `authClient.ts`, and the existing tests. Result: this helper is not a
  clean step-4 typed-route target yet, so it stays generic for now and is recorded as an explicit
  non-target instead of accidental debt.

- Problem: the remaining file-view cleanup looked like “just replace the raw `/vault/...` strings
  with TanStack route params,” but the current `/vault/$` route intentionally preserves encoded
  branch segments like `feature%2Flogin`. Tried: checked TanStack Router’s `_splat` interpolation
  behavior directly and confirmed that it double-encodes pre-encoded branch segments instead of
  preserving them. Result: we removed the low-level `router.history.push` / `replace` escape hatches
  from `FileView.tsx`, centralized the intentional raw path boundary in
  `apps/noter/src/lib/vaultRoutes.ts::buildVaultFileRoute`, and updated `EditedFilesCategories.tsx`
  to reuse that helper instead of duplicating `/vault/...` assembly. The remaining debt is now
  explicit: one staged-file popover raw-href navigation path and the route shape itself, rather than
  scattered path builders or low-level history calls.

- Problem: `tanstackSearchParams.ts` was still being called directly from a mix of generic helpers
  and clearly route-owned component code, which made the remaining serializer/parser debt look
  bigger than it really was. Tried: moved `PricingPage.tsx` onto `router.buildLocation(...)` for
  absolute callback hrefs, replaced the `LogoPreviewPage.tsx` search-string comparison with
  canonical route-search equality, and simplified `readRootRouteSearch()` to use `URLSearchParams`
  directly instead of routing plain strings back through `parseTanStackSearch()`. Result: the
  remaining direct `tanstackSearchParams` usage is now concentrated in the actual boundary cases:
  app-router config, generic script-facing URL builders, and the raw `/vault/$` file-view search
  boundary.

- Problem: the last app-side `parseTanStackSearch()` / `stringifyTanStackSearch()` calls were still
  hiding inside the raw `/vault/$` file-view boundary, and the fast landing shell still owned a
  duplicate landing-copy HTML renderer even though the app now mounts through routed React
  immediately. Tried: moved the file-view boundary onto `URLSearchParams`-based query merging in
  `fileViewRouteSearch.ts`, so `FileView.tsx` and `EditedFilesCategories.tsx` now preserve unrelated
  params without calling the TanStack codec directly, then replaced the shell-only landing copy HTML
  path with the shipped `LandingCopy` component in `FastPublicLandingShell.tsx` and
  `LandingCopyVisualFixture.tsx`. Result: the remaining `tanstackSearchParams` debt is narrowed to
  app-router config plus generic script-facing helpers, and the fast shell now reuses the same
  landing-copy renderer as the hydrated app.

- Problem: the last major cleanup decision was whether the routed fast landing shell should stay as
  a temporary product behavior or be deleted now that the routed landing surface had absorbed its
  main parity concerns. Tried: remove `FastPublicLandingShell.tsx`, `fastLandingBoot.ts`,
  `publicLandingScrollState.ts`, and the once-per-load shell session from `RootIndexRoutePage.tsx`,
  then rewrite the route-level landing tests around the real routed landing in `SignInForm.tsx`.
  Result: the root route now renders a single landing implementation with no shell handoff, the old
  shell-only scroll/focus machinery is gone, and the route-level Playwright coverage now asserts the
  direct routed landing behavior instead of a bootstrap-style transition contract.
