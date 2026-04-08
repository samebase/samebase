# 081 TanStack Router Migration Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/app shell
- Last updated: 2026-04-08
- Supersedes:
  - framework-readiness direction in
    `specs/080_WORKSPACE_LAYOUT_V2_ROUTE_MIGRATION_AND_FRAMEWORK_READINESS_SPEC.md`
- Depends on:
  - `apps/noter/package.json`
  - `apps/noter/public/_redirects`
  - `apps/noter/scripts/run-vite-dev.js`
  - `apps/noter/src/App.tsx`
  - `apps/noter/src/Layout.tsx`
  - `apps/noter/src/bootstrap.ts`
  - `apps/noter/src/main.tsx`
  - `apps/noter/vite.config.ts`
  - `specs/080_WORKSPACE_LAYOUT_V2_ROUTE_MIGRATION_AND_FRAMEWORK_READINESS_SPEC.md`

## Summary

Noter should migrate to TanStack Router, not React Router framework mode.

The accepted shell seams from `specs/080` still stand:

- `Layout.tsx`
- `RepositoryWorkspaceFrame`
- `DashboardWorkspaceLayout`
- `VaultDashboardWorkspaceScene`

What changes is the router direction around those seams. We should keep the
existing Vite SPA runtime, move route ownership into TanStack Router, and delete
the split `bootstrap.ts` landing path through normal route work instead of
reviving the previously reverted React Router framework bootstrap.

This document stays intentionally short and should be extended during the
migration with concrete problems, attempted fixes, and outcomes.

## Goals

1. Adopt TanStack Router without widening scope into a separate framework boot
   migration first.
2. Preserve the current `make anon` and Vite-based local workflows while the
   router changes.
3. Keep the route-layout seams from `specs/080` so shell work and router work
   stay decoupled.
4. Replace the landing/bootstrap split-brain with normal routed rendering.
5. Keep a running migration log of real blockers and attempted fixes.

## Non-Goals

1. Reviving the React Router framework branch shape from commit `57fd46e5`.
2. Rewriting Convex reads and writes around route loaders on the first pass.
3. Preserving `bootstrap.ts` as a permanent architecture path.
4. Forcing file-based routing before the route semantics are stable.

## Current Constraints

- `apps/noter/src/main.tsx` still mounts a `BrowserRouter`.
- `apps/noter/src/App.tsx` still mixes pathname-gated special cases with the
  authenticated `<Routes>` tree.
- `apps/noter/src/bootstrap.ts` still renders a separate public landing shell
  before importing the real React app.
- Direct `react-router-dom` imports are spread across the app, tests, and visual
  fixtures. The initial inventory found widespread `Link`, `useLocation`,
  `useSearchParams`, `useNavigate`, `useParams`, and `MemoryRouter` usage.
- Search params currently carry meaningful UI state in routes like logo
  previews, machines, sign-in, and research surfaces, so the TanStack move has
  to handle typed search deliberately instead of treating it as a string-only
  API.

## Working Log

### 2026-04-08

- Problem: `specs/080` assumes future React Router framework readiness. Tried:
  inspected the accepted spec plus the repo history around commit `57fd46e5` and
  revert `2f7c7224`. Result: keep the shell seams from `specs/080`, but replace
  the future-router direction with TanStack Router.

- Problem: the repo already tried a framework bootstrap that deleted
  `index.html` and `bootstrap.ts`, then reverted it. Tried: inspected the
  reverted change summary and its deleted RFC. Result: treat "framework runtime
  first" as a dead end for this migration and avoid rebuilding that branch shape
  under a new name.

- Problem: `App.tsx` is not just a route table. It also owns pathname-driven
  auth, metadata, research, logo, pricing, and MCP-consent branching before the
  live `<Routes>` tree renders. Tried: inspected the current entrypoints and
  route switchboard. Result: the migration cannot be a blind package swap; it
  has to peel these branches apart into explicit route ownership.

- Problem: the public landing experience bypasses the router entirely through
  `bootstrap.ts`, string HTML, direct DOM listeners, and delayed `main.tsx`
  import. Tried: inspected the bootstrap path and the e2e coverage that depends
  on it. Result: landing must become a normal TanStack route before the
  migration is complete, otherwise the split-brain architecture survives
  unchanged.

- Problem: direct router imports are scattered. Tried: inventoried current
  `react-router-dom` imports and hook usage. Result: the first code step should
  introduce a repo-owned router seam so the package swap does not require
  another repo-wide search.

- Problem: a bulk import rewrite can accidentally rewrite the seam module itself
  and turn it into a self-import. Tried: introduced
  `apps/noter/src/lib/router.tsx`, bulk-moved imports behind it, then ran
  TypeScript. Result: the first pass rewrote the seam file to import
  `@/lib/router` from itself and triggered circular alias errors. The seam works
  once it keeps a direct `react-router-dom` import, so every automated rewrite
  step needs a post-change typecheck.

- Problem: a repo-owned router seam should not live in a `.tsx` file when it
  only exports helpers. Tried: committed the seam as `router.tsx` and let the
  normal pre-commit lint run. Result: `react-refresh/only-export-components`
  rejected the file, so the seam should live in `router.ts`.

- Problem: TanStack Router supports both file-based and code-based routing.
  Tried: reviewed the current TanStack Router docs for code-based routing,
  router context, authenticated routes, and search params. Result: start with a
  code-based route tree. The current app still centralizes routing in
  components, so file-based generation would add churn before the route
  boundaries are stable.

- Problem: the last hard dependency on React Router route JSX lived in
  `App.tsx`. Tried: replaced the authenticated and unauthenticated
  `<Routes>/<Route>` trees with a pure pathname resolver plus explicit render
  selection. Result: the router seam no longer needs to model `Routes` or
  `Route`, which shrinks the future TanStack adapter surface down to links and
  hooks.

- Problem: route params were still coming from router-owned `useParams`. Tried:
  moved `FileView` and `CodespaceChatOnlyView` onto the repo-owned vault route
  parser instead of router-provided params. Result: the seam no longer needs to
  model `useParams`, and route-shape knowledge now lives with the existing vault
  route utilities instead of the router implementation.

- Problem: step 2 needed a real TanStack route tree without forcing the whole
  app to peel its pathname switchboard in the same patch. Tried: created a
  minimal code-based route tree with `/` plus `$` catch-all routes that both
  render `App`, then mounted it through a dedicated `AppRouterProvider` in
  `main.tsx`. Result: the app now runs under TanStack Router while `App.tsx`
  still owns the existing route resolution logic for the next migration cuts.

- Problem: TanStack `useLocation()` does not expose the same string-shaped
  location contract the app currently expects from React Router. Tried: swapped
  the seam directly onto TanStack hooks and let TypeScript report the shape
  mismatch. Result: TanStack route state exposes parsed search data, so the
  compat seam now rebuilds React Router-like `pathname`, `search`, `hash`, and
  `key` values from `location.href` and strips router-internal state keys before
  exposing `location.state`.

- Problem: TanStack navigation state is modeled as router-managed history state,
  not a raw `navigate(path, { state })` value like React Router. Tried: passed
  raw state through TanStack `navigate()` and hit type friction around state
  updaters. Result: the compat `useNavigate()` wrapper now uses the TanStack
  history API directly for push/replace/go so existing call sites can keep
  passing raw state objects while the router still observes navigation changes.

- Problem: tests and visual fixtures still depend on a `MemoryRouter` that can
  wrap arbitrary children instead of the full app route tree. Tried: reused the
  app router directly and found it would hard-wire fixtures to `App`. Result:
  the seam now has a separate TanStack-backed compat route tree for
  `MemoryRouter`, plus a direct seam test that covers location strings, raw
  state, and search-param writes.

- Problem: phase 3 needed to start moving real paths into TanStack Router
  without dragging authenticated workspace routing into the same patch. Tried:
  promoted the simple public and dev-only surfaces (`/privacy`, `/terms`,
  `/logo*`, `/pitch*`, and the Codex research paths) into explicit TanStack
  routes while leaving `/`, `/pricing`, machines, vault, MCP-consent, and other
  auth-gated routes behind the `App` catch-all. Result: the route tree now owns
  the low-risk standalone pages, and `App.tsx` shrinks without having to solve
  auth/layout ownership in the same cut.

- Problem: the first explicit route tree patch needed JSX route wrappers, but
  the bootstrap router seam lived in `appRouter.ts`. Tried: added wrapper
  components around lazy route surfaces and ran TypeScript/Prettier. Result:
  that part worked, but CI later showed the exported router factory still trips
  `react-refresh/only-export-components` when the module lives in `.tsx`. Keep
  the exported router module in `appRouter.ts` for now and use `createElement`
  instead of JSX until the provider/factory split is worth the extra file churn.

- Problem: once explicit routes and the `$` fallback coexist, it is easy for a
  public page to silently fall back into `App.tsx` again during later edits.
  Tried: added a focused TanStack route-tree test that renders `/terms`,
  `/logo`, and a vault path through a memory history. Result: the test now
  proves both route precedence directions we care about in this phase.

- Problem: TanStack Router's initial navigation touches `window.scrollTo()`,
  which jsdom does not implement. Tried: ran the new route-tree test under
  Vitest jsdom and inspected the stderr noise. Result: stub `scrollTo()` in the
  focused router test instead of carrying noisy false positives during the
  migration.

## Initial Sequence

1. Introduce a repo-owned router seam and move current imports behind it.
2. Start a TanStack code-based route tree around the current app/layout seams.
3. Peel special-case pathname branches out of `App.tsx` into explicit routes.
4. Migrate search-param-heavy routes with typed TanStack search validation.
5. Delete `bootstrap.ts` only after routed landing parity is proven.
