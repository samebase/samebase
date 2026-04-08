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

- `apps/noter/src/main.tsx` now mounts TanStack Router through
  `AppRouterProvider`, but `apps/noter/src/App.tsx` still owns the root landing
  split plus the small root-only authenticated pathname switchboard (`/` and
  `/test`).
- `apps/noter/src/lib/appRouter.ts` now owns the simple standalone public and
  dev-only routes (`/privacy`, `/terms`, `/logo*`, `/pitch*`, and the Codex
  research paths) plus the non-root authenticated app routes (MCP consent,
  pricing, add-repository, machines, machine connect, codespace chat, and the
  vault/file surfaces), while `/` still renders through `App`.
- `apps/noter/src/bootstrap.ts` still renders a separate public landing shell
  before importing the real React app.
- The repo-owned router seam in `apps/noter/src/lib/router.ts` is still a
  temporary compatibility layer for `Link`, `useLocation`, `useSearchParams`,
  `useNavigate`, and `MemoryRouter`, so route ownership is only partially moved
  out of the React Router-era API shape.
- `apps/noter/src/lib/appRouter.ts` now uses repo-owned plain-string search
  parsing/stringifying so route-owned TanStack search can preserve the app's
  existing human-readable query semantics instead of falling back to TanStack's
  JSON-like default search serialization.
- Search params still carry meaningful UI state in landing (`?auth`, `?dev`),
  MCP consent, machine connect bootstrap, pricing checkout, machines, and
  sign-in, so the remaining TanStack move still has to finish the authenticated
  and root landing surfaces deliberately instead of treating search as a
  string-only API.
- The shared workspace wrapper migration in `specs/080` is a separate track.
  Router and bootstrap cleanup should not be coupled to
  `RepositoryWorkspaceFrame` / `DashboardWorkspaceLayout` rewrites or the
  `FileView` mobile drag-contract migration unless a step truly needs both.

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

- Problem: after phases 1 through 3 landed on `origin/main`, the original
  sequence in this spec was too coarse and the constraint list had gone stale.
  Tried: reread `specs/080`, audited the merged `origin/main` router state, and
  compared that state to the remaining bootstrap and auth-gated route work.
  Result: split the remaining plan into explicit route-ownership work,
  search-param migration, and bootstrap deletion, and keep the workspace-shell
  migration from `specs/080` as a separate track.

- Problem: deleting `bootstrap.ts` immediately after the standalone public
  routes moved looked tempting, but bootstrap still owns real runtime behavior.
  Tried: audited `bootstrap.ts`, `SignInForm.tsx`, and the Vite-generated
  static/legal assets. Result: bootstrap deletion should happen only after the
  routed runtime owns the root landing behavior, auth/dev query params, waitlist
  draft handoff, scroll restoration, and any remaining debug-only overlay
  behavior.

- Problem: MCP consent still lived behind the `App.tsx` catch-all even though it
  already has its own path constant and auth-specific UI. Tried: promoted
  `/oauth/mcp/consent` into an explicit TanStack route, extracted the shared
  approval gate, and moved the popup-close hook behind a repo-owned helper so
  the consent route could preserve the old popup behavior while leaving pricing,
  machines, and vault routes untouched. Result: MCP consent is now route-owned,
  the remaining `App.tsx` switchboard is smaller, and the next route slices can
  promote pricing/add-repository without carrying the consent logic with them.

- Problem: pricing and add-repository still shared the same authenticated
  runtime shell as `App.tsx`, so moving them naively would have dropped the
  approval gate, popup-close handling, metadata, unauthenticated sign-in
  fallback, and the global chat FAB. Tried: extracted a shared authenticated
  route page shell plus shared app-auth runtime effects, then promoted
  `/pricing` and `/add` into explicit TanStack routes and removed those branches
  from the `App.tsx` pathname resolver. Result: pricing and add-repository are
  now route-owned without forcing the heavier machines or vault routes into the
  same patch, and `App.tsx` only keeps the remaining unresolved authenticated
  branches.

- Problem: `/machines` and `/machines/connect` still looked like switchboard
  paths in `App.tsx`, even though both pages already behave like standalone
  authenticated app surfaces with route-local search state. Tried: reused the
  shared authenticated route shell from the pricing/add step, promoted both
  machine routes into explicit TanStack routes, and removed those cases from the
  old authenticated pathname resolver. Result: the machines surfaces are now
  route-owned, `App.tsx` only keeps codespace and vault/file routing branches,
  and the later typed-search phase can focus on search ownership instead of path
  ownership.

- Problem: the last unresolved non-root authenticated paths were still the
  coupled vault surfaces, where the generic file route and the chat-only
  codespace route overlap under the same `/vault/*` prefix. Tried: promoted the
  chat-only codespace path into a specific TanStack route first, then added a
  generic `/vault/$` route for the file surface and removed both cases from the
  old authenticated pathname resolver. Result: TanStack Router now owns the full
  non-root path table, the focused route test proves codespace precedence over
  the generic vault route, and `App.tsx` is down to the root dashboard/test
  switchboard that will be addressed in the later landing/bootstrap phase.

- Problem: the first typed-search slice on the public/dev routes hit a mismatch
  between TanStack Router's default search serialization and the app's existing
  query semantics. Tried: wired route-owned search directly with the default
  serializer and checked the generated URLs. Result: the default serializer
  would emit JSON-like values such as quoted numeric strings and `=true`
  booleans, so the router now uses repo-owned plain-string search
  parse/stringify helpers before `validateSearch` normalizes route-owned values.

- Problem: the explicit public/dev routes were still reading search through the
  compat router seam even though those pages already lived under TanStack route
  ownership. Tried: moved the logo preview/static-study routes and the Codex
  research routes onto route-owned `validateSearch`, `getRouteApi()`, and
  route-local navigation while keeping the route surface area small. Result: the
  public/dev search-heavy routes now read and write typed TanStack search
  directly, the logo route state no longer depends on the compat
  `useSearchParams` hook, and the remaining search migration scope is limited to
  authenticated explicit routes plus the root landing flow.

## Completed Milestones

1. Introduce a repo-owned router seam and move current imports behind it.
2. Start a TanStack code-based route tree around the current app/layout seams.
3. Peel the simple standalone pathname branches out of `App.tsx` into explicit
   TanStack routes.
4. Promote all remaining non-root authenticated routes into explicit TanStack
   routes, including MCP consent, pricing/add, machines, codespace chat, and
   vault/file paths.
5. Move the public/dev explicit routes with meaningful query state onto
   route-owned TanStack search handling, including the logo preview surfaces and
   the Codex research routes.

## Remaining Sequence

1. Migrate the remaining authenticated explicit routes with meaningful search
   state onto route-owned TanStack search handling. Priorities: MCP consent
   request id, pricing checkout state, machine connect bootstrap params, and
   machines workspace params.
2. Migrate the root landing search state onto route-owned TanStack handling,
   including `?auth` and `?dev`.
3. Move the root landing/dashboard split onto normal routed rendering and only
   then delete `bootstrap.ts`. Preserve any tiny pre-paint support that is still
   justified, such as theme setup, but do not preserve the split runtime.
4. Delete bootstrap-only parity code once routed landing parity is proven:
   `resolveBootstrapPageMetadata()`, `shouldRenderFastLandingShell()`,
   `fastLandingBoot.ts`, and the related parity-only tests or fixtures.
5. Keep the shared workspace wrapper and drag-contract migration from
   `specs/080` on a separate rollout track, and reconnect it only where routed
   ownership genuinely needs those seams.
