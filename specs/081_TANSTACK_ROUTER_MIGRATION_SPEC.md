# 081 TanStack Router Migration Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/app shell
- Last updated: 2026-06-06
- Supersedes:
  - framework-readiness direction in
    `archive/080_WORKSPACE_LAYOUT_V2_ROUTE_MIGRATION_AND_FRAMEWORK_READINESS_SPEC.md`
- Depends on:
  - `apps/samebase/package.json`
  - `apps/samebase/public/_redirects`
  - `apps/samebase/scripts/run-vite-dev.ts`
  - `apps/samebase/src/Layout.tsx`
  - `apps/samebase/src/components/FastPublicLandingShell.tsx`
  - `apps/samebase/src/components/NotFoundRoutePage.tsx`
  - `apps/samebase/src/components/RootIndexRoutePage.tsx`
  - `apps/samebase/src/entry.tsx`
  - `apps/samebase/src/main.tsx`
  - `apps/samebase/vite.config.ts`
  - `archive/080_WORKSPACE_LAYOUT_V2_ROUTE_MIGRATION_AND_FRAMEWORK_READINESS_SPEC.md`
  - `specs/082_TANSTACK_ROUTER_CLEANUP_SPEC.md`

## Summary

Samebase should migrate to TanStack Router, not React Router framework mode.

The accepted shell seams from archived Spec 080 still stand:

- `Layout.tsx`
- `RepositoryWorkspaceFrame`
- `DashboardWorkspaceLayout`
- `VaultDashboardWorkspaceScene`

What changes is the router direction around those seams. We should keep the existing Vite SPA
runtime, move route ownership into TanStack Router, and delete the split `bootstrap.ts` landing path
through normal route work instead of reviving the previously reverted React Router framework
bootstrap.

This document stays intentionally short and should be extended during the migration with concrete
problems, attempted fixes, and outcomes.

## Goals

1. Adopt TanStack Router without widening scope into a separate framework boot migration first.
2. Preserve the current `pnpm dev:worktree` and Vite-based local workflows while the router changes.
3. Keep the route-layout seams from archived Spec 080 so shell work and router work stay decoupled.
4. Replace the landing/bootstrap split-brain with normal routed rendering.
5. Keep a running migration log of real blockers and attempted fixes.

## Non-Goals

1. Reviving the React Router framework branch shape from commit `57fd46e5`.
2. Rewriting Convex reads and writes around route loaders on the first pass.
3. Preserving `bootstrap.ts` as a permanent architecture path.
4. Forcing file-based routing before the route semantics are stable.

## Current Constraints

- `apps/samebase/src/entry.tsx` now loads directly from `index.html`, while
  `apps/samebase/src/main.tsx` only owns the reusable routed app mount logic.
- `apps/samebase/src/lib/appRouter.ts` now owns the simple standalone public and dev-only routes
  (`/privacy`, `/terms`, `/logo*`, and `/pitch*`) plus the non-root authenticated app routes (MCP
  consent, pricing, add-repository, and the vault/file surfaces), plus the explicit root routes for
  `/` and `/test`.
- `apps/samebase/src/components/RootIndexRoutePage.tsx` now owns public `/` rendering, and public
  Google and GitHub sign-in entrypoints now pass `/vault` as the provider return route when the user
  starts sign-in from `/`. Authenticated users can still browse the public landing route because
  `apps/samebase/src/lib/useAppAuthRuntimeEffects.ts` no longer redirects authenticated `/` renders.
  Unresolved paths now go through a deliberate root-level not-found route instead of a leftover
  `App.tsx` bridge.
- The fast public landing behavior now lives inside routed public landing components instead of a
  separate `bootstrap.ts` HTML path.
- The repo-owned router seam in `apps/samebase/src/lib/router.ts` is still a temporary compatibility
  layer for `Link`, `useLocation`, `useSearchParams`, `useNavigate`, and `MemoryRouter`, so route
  ownership is only partially moved out of the React Router-era API shape.
- `apps/samebase/src/lib/appRouter.ts` now uses repo-owned plain-string search parsing/stringifying
  so route-owned TanStack search can preserve the app's existing human-readable query semantics
  instead of falling back to TanStack's JSON-like default search serialization.
- The meaningful app-owned search surfaces (landing, MCP consent, pricing, and logo) now validate
  through route-owned TanStack search contracts, so the remaining work is cleanup and simplification
  rather than finishing search ownership.
- Post-migration cleanup now lives in `specs/082_TANSTACK_ROUTER_CLEANUP_SPEC.md` so this document
  can stay focused on the migration itself.
- The shared workspace wrapper migration from archived Spec 080 is a separate track. Router and
  bootstrap cleanup should not be coupled to `RepositoryWorkspaceFrame` / `DashboardWorkspaceLayout`
  rewrites or the `FileView` mobile drag-contract migration unless a step truly needs both.

## Working Log

### 2026-04-08

- Problem: archived Spec 080 assumes future React Router framework readiness. Tried: inspected the
  accepted spec plus the repo history around commit `57fd46e5` and revert `2f7c7224`. Result: keep
  its shell seams, but replace the future-router direction with TanStack Router.

- Problem: the repo already tried a framework bootstrap that deleted `index.html` and
  `bootstrap.ts`, then reverted it. Tried: inspected the reverted change summary and its deleted
  RFC. Result: treat "framework runtime first" as a dead end for this migration and avoid rebuilding
  that branch shape under a new name.

- Problem: `App.tsx` is not just a route table. It also owns pathname-driven auth, metadata,
  research, logo, pricing, and MCP-consent branching before the live `<Routes>` tree renders. Tried:
  inspected the current entrypoints and route switchboard. Result: the migration cannot be a blind
  package swap; it has to peel these branches apart into explicit route ownership.

- Problem: the public landing experience bypasses the router entirely through `bootstrap.ts`, string
  HTML, direct DOM listeners, and delayed `main.tsx` import. Tried: inspected the bootstrap path and
  the e2e coverage that depends on it. Result: landing must become a normal TanStack route before
  the migration is complete, otherwise the split-brain architecture survives unchanged.

- Problem: direct router imports are scattered. Tried: inventoried current `react-router-dom`
  imports and hook usage. Result: the first code step should introduce a repo-owned router seam so
  the package swap does not require another repo-wide search.

- Problem: a bulk import rewrite can accidentally rewrite the seam module itself and turn it into a
  self-import. Tried: introduced `apps/samebase/src/lib/router.tsx`, bulk-moved imports behind it,
  then ran TypeScript. Result: the first pass rewrote the seam file to import `@/lib/router` from
  itself and triggered circular alias errors. The seam works once it keeps a direct
  `react-router-dom` import, so every automated rewrite step needs a post-change typecheck.

- Problem: a repo-owned router seam should not live in a `.tsx` file when it only exports helpers.
  Tried: committed the seam as `router.tsx` and let the normal pre-commit lint run. Result:
  `react-refresh/only-export-components` rejected the file, so the seam should live in `router.ts`.

- Problem: TanStack Router supports both file-based and code-based routing. Tried: reviewed the
  current TanStack Router docs for code-based routing, router context, authenticated routes, and
  search params. Result: start with a code-based route tree. The current app still centralizes
  routing in components, so file-based generation would add churn before the route boundaries are
  stable.

- Problem: the last hard dependency on React Router route JSX lived in `App.tsx`. Tried: replaced
  the authenticated and unauthenticated `<Routes>/<Route>` trees with a pure pathname resolver plus
  explicit render selection. Result: the router seam no longer needs to model `Routes` or `Route`,
  which shrinks the future TanStack adapter surface down to links and hooks.

- Problem: step 2 needed a real TanStack route tree without forcing the whole app to peel its
  pathname switchboard in the same patch. Tried: created a minimal code-based route tree with `/`
  plus `$` catch-all routes that both render `App`, then mounted it through a dedicated
  `AppRouterProvider` in `main.tsx`. Result: the app now runs under TanStack Router while `App.tsx`
  still owns the existing route resolution logic for the next migration cuts.

- Problem: TanStack `useLocation()` does not expose the same string-shaped location contract the app
  currently expects from React Router. Tried: swapped the seam directly onto TanStack hooks and let
  TypeScript report the shape mismatch. Result: TanStack route state exposes parsed search data, so
  the compat seam now rebuilds React Router-like `pathname`, `search`, `hash`, and `key` values from
  `location.href` and strips router-internal state keys before exposing `location.state`.

- Problem: TanStack navigation state is modeled as router-managed history state, not a raw
  `navigate(path, { state })` value like React Router. Tried: passed raw state through TanStack
  `navigate()` and hit type friction around state updaters. Result: the compat `useNavigate()`
  wrapper now uses the TanStack history API directly for push/replace/go so existing call sites can
  keep passing raw state objects while the router still observes navigation changes.

- Problem: tests and visual fixtures still depend on a `MemoryRouter` that can wrap arbitrary
  children instead of the full app route tree. Tried: reused the app router directly and found it
  would hard-wire fixtures to `App`. Result: the seam now has a separate TanStack-backed compat
  route tree for `MemoryRouter`, plus a direct seam test that covers location strings, raw state,
  and search-param writes.

- Problem: phase 3 needed to start moving real paths into TanStack Router without dragging
  authenticated workspace routing into the same patch. Tried: promoted the simple public and
  dev-only surfaces (`/privacy`, `/terms`, `/logo*`, `/pitch*`, and the Codex research paths) into
  explicit TanStack routes while leaving `/`, `/pricing`, machines, vault, MCP-consent, and other
  auth-gated routes behind the `App` catch-all. Result: the route tree now owns the low-risk
  standalone pages, and `App.tsx` shrinks without having to solve auth/layout ownership in the same
  cut.

- Problem: the first explicit route tree patch needed JSX route wrappers, but the bootstrap router
  seam lived in `appRouter.ts`. Tried: added wrapper components around lazy route surfaces and ran
  TypeScript plus formatter checks. Result: that part worked, but CI later showed the exported
  router factory still trips `react-refresh/only-export-components` when the module lives in `.tsx`.
  Keep the exported router module in `appRouter.ts` for now and use `createElement` instead of JSX
  until the provider/factory split is worth the extra file churn.

- Problem: once explicit routes and the `$` fallback coexist, it is easy for a public page to
  silently fall back into `App.tsx` again during later edits. Tried: added a focused TanStack
  route-tree test that renders `/terms`, `/logo`, and a vault path through a memory history. Result:
  the test now proves both route precedence directions we care about in this phase.

- Problem: TanStack Router's initial navigation touches `window.scrollTo()`, which jsdom does not
  implement. Tried: ran the new route-tree test under Vitest jsdom and inspected the stderr noise.
  Result: stub `scrollTo()` in the focused router test instead of carrying noisy false positives
  during the migration.

- Problem: after phases 1 through 3 landed on `origin/main`, the original sequence in this spec was
  too coarse and the constraint list had gone stale. Tried: reread archived Spec 080, audited the
  merged `origin/main` router state, and compared that state to the remaining bootstrap and
  auth-gated route work. Result: split the remaining plan into explicit route-ownership work,
  search-param migration, and bootstrap deletion, and keep the workspace-shell migration from
  archived Spec 080 as a separate track.

- Problem: deleting `bootstrap.ts` immediately after the standalone public routes moved looked
  tempting, but bootstrap still owns real runtime behavior. Tried: audited `bootstrap.ts`,
  `SignInForm.tsx`, and the Vite-generated static/legal assets. Result: bootstrap deletion should
  happen only after the routed runtime owns the root landing behavior, auth/dev query params,
  waitlist draft handoff, scroll restoration, and any remaining debug-only overlay behavior.

- Problem: MCP consent still lived behind the `App.tsx` catch-all even though it already has its own
  path constant and auth-specific UI. Tried: promoted `/oauth/mcp/consent` into an explicit TanStack
  route, extracted the shared approval gate, and moved the popup-close hook behind a repo-owned
  helper so the consent route could preserve the old popup behavior while leaving pricing, machines,
  and vault routes untouched. Result: MCP consent is now route-owned, the remaining `App.tsx`
  switchboard is smaller, and the next route slices can promote pricing/add-repository without
  carrying the consent logic with them.

- Problem: pricing and add-repository still shared the same authenticated runtime shell as
  `App.tsx`, so moving them naively would have dropped the approval gate, popup-close handling,
  metadata, and unauthenticated sign-in fallback. Tried: extracted a shared authenticated route page
  shell plus shared app-auth runtime effects, then promoted `/pricing` and `/add` into explicit
  TanStack routes and removed those branches from the `App.tsx` pathname resolver. Result: pricing
  and add-repository are now route-owned without forcing the heavier vault routes into the same
  patch, and `App.tsx` only keeps the remaining unresolved authenticated branches.

- Problem: the first typed-search slice on the public/dev routes hit a mismatch between TanStack
  Router's default search serialization and the app's existing query semantics. Tried: wired
  route-owned search directly with the default serializer and checked the generated URLs. Result:
  the default serializer would emit JSON-like values such as quoted numeric strings and `=true`
  booleans, so the router now uses repo-owned plain-string search parse/stringify helpers before
  `validateSearch` normalizes route-owned values.

- Problem: the explicit public/dev routes were still reading search through the compat router seam
  even though those pages already lived under TanStack route ownership. Tried: moved the logo
  preview/static-study routes and the Codex research routes onto route-owned `validateSearch`,
  `getRouteApi()`, and route-local navigation while keeping the route surface area small. Result:
  the public/dev search-heavy routes now read and write typed TanStack search directly, the logo
  route state no longer depends on the compat `useSearchParams` hook, and the remaining search
  migration scope is limited to authenticated explicit routes plus the root landing flow.

- Problem: converting the logo route validator to a transformed Zod schema hit a TanStack
  input/output typing edge when the schema was passed directly to `validateSearch`. Tried: wiring
  the Zod schema straight into the route definition so TanStack could infer from the schema alone.
  Result: navigation started treating every logo search key as required on writes, so the current
  compromise is a Zod-backed `validateLogoRouteSearch()` wrapper that keeps the simpler sparse
  navigation type until the route can move to a cleaner schema-with-adapter shape.

- Problem: the authenticated explicit routes were path-owned by TanStack, but MCP consent, pricing,
  machine connect, and machines still read or wrote search through `window.location`, compat
  `useLocation`, or compat `useSearchParams`. Tried: added Zod-backed route validators for those
  surfaces, moved the pages onto `getRouteApi().useSearch()` and route-aware navigation, and reused
  repo-owned builders only where the app still needs canonical URLs outside TanStack navigation.
  Result: the remaining authenticated explicit routes now own their search state through TanStack,
  `buildMachinesWorkspacePath()` still generates the same sparse URLs, and the remaining search
  migration scope is limited to the root landing flow.

- Problem: the first implementation of the authenticated search slice reused
  `tanstackSearchParams.ts` inside `noterSync.ts`, which is imported by `pageMetadata.ts` and
  therefore by `vite.config.ts`. Tried: centralizing the URL stringification there. Result: Vite
  config load failed under raw Node because `tanstackSearchParams.ts` depended on app alias imports
  at the time, so the short-term fix was to keep config-path modules on alias-free `queryParams.ts`
  helpers and reserve the TanStack serializer for routed runtime code. Superseded 2026-05-01: the
  generic `queryParams.ts` helper was deleted after `tanstackSearchParams.ts` became self-contained
  and route-owned callers moved to TanStack search objects.

- Follow-up reviews worth considering after merge, but intentionally not folded into this PR's core
  scope: replace the dev-only research surface `href` strings with route-owned TanStack `Link`
  usage, decide whether the repo-owned plain-string search codec should explicitly support repeated
  keys or explicitly reject array semantics, and verify whether the logo preview should always apply
  browser back/forward search updates even while scene interaction is active.

- Problem: the last meaningful search seam was the root landing flow, where `?auth`, `?dev`, and
  `?prod-ui` were still split across `App.tsx`, `SignInForm.tsx`, `Layout.tsx`,
  `publicLandingAuthState.ts`, `landingDevMode.ts`, compat `useSearchParams`, and `useAutoSignIn()`
  reading `window.location.search`. Tried: added a root-route Zod validator plus a repo-owned
  `useRootRouteSearch()` hook, moved the shared landing/auth runtime reads onto that route-owned
  contract, and left the existing string-based URL builders in place so toggles and popup redirects
  could keep preserving unrelated query params. Result: the routed app now owns the root landing
  search contract through TanStack Router, the old compat search hook is no longer part of the
  landing flow, and the next phase can focus on replacing the root bootstrap split instead of
  finishing search migration first.

- Problem: the root-route helper initially imported `rootRouteId` from `@tanstack/router-core`,
  which is visible inside the lockfile tree but not as an app-level package import. Tried: used that
  package directly after checking the installed runtime internals. Result: TypeScript/Vite
  resolution failed in the app package, so the safe app-local route binding is the stable root ID
  literal `"__root__"` until the package graph intentionally exposes a better public import path.

- Problem: deleting `bootstrap.ts` would have broken the accepted `public-landing-shell` behavior if
  the root route immediately jumped straight to the hydrated sign-in surface. Tried: promoted `/`
  and `/test` into explicit TanStack routes, rebuilt the fast landing shell as routed React state
  around `RootIndexRoutePage`, moved the gesture debug overlay into the routed root, and switched
  `index.html` back to `main.tsx` with only a tiny pre-paint theme script. Result: the split
  entrypoint is gone, routed root ownership is real, and the existing landing shell/handoff
  Playwright contract still passes on the app route without reviving the old bootstrap file.

- Problem: after the routed-root phase rebased onto newer `origin/main`, the landing-focused
  Playwright slice no longer failed broadly, but a small set of shell assertions still regressed.
  Tried: reran only `public-landing-shell.spec.ts` and `landing-copy-visual.spec.ts` against the
  real `pnpm dev:worktree` stack and grouped the failures by invariant instead of updating snapshots
  blindly. Result: the remaining breakages clustered around pre-hydration toggle behavior,
  blocked-storage boot, and a couple of bootstrap-era visual assumptions rather than a general
  routed-root failure.

- Problem: the pre-hydration landing dev toggle stopped matching the old shell contract closely
  enough for duplicate-tap and related handoff checks. Tried: restored the old
  `public-landing-dev-toggle` anchor identity in the shared status bar and let shell route
  transitions use TanStack navigation without forcing an extra manual handoff before the route
  change settled. Result: the duplicate-tap path passes again and the shell toggle behavior is
  closer to the pre-bootstrap contract without reviving direct DOM history mutation.

- Problem: the routed app could still blank before the landing shell rendered when `localStorage`
  access was denied, because startup/theme code touched web storage during mount. Tried: added a
  tiny in-memory storage fallback plus an optional theme-provider wrapper around app boot so denied
  storage fails closed instead of crashing the route tree. Result: the landing shell still renders
  when browser storage is blocked, and the shell/root-route tests can keep that privacy-mode
  invariant without bringing back `bootstrap.ts`.

- Problem: two landing tests were still asserting bootstrap-era raster parity more literally than
  the temporary routed shell can guarantee today. Tried: kept the strict fixture-level landing-copy
  parity checks, but narrowed the live route checks to focus on larger regressions: allow a
  one-pixel height drift plus anti-alias-tolerant diffing for the `/ -> /?dev` landing-copy
  comparison, and treat the pre-hydration mobile dev-toggle check as "bounded, settles quickly, and
  does not jump off-screen" instead of "no movement at all." Result: the routed landing tests still
  guard the important user-facing behavior while acknowledging that the temporary routed fast shell
  is not a byte-for-byte clone of the old bootstrap HTML path.

- Problem: importing app helpers from `main.tsx` could now mount React at module evaluation time,
  because the routed-root phase moved the app boot side effect into the same module that editor code
  imports for the shared Convex client. Tried: moved the `mountApp()` call into a dedicated
  `entry.tsx` browser entry module and pointed `index.html` at that file while the rest of the app
  keeps importing the Convex client directly from `lib/convexClient.ts`. Result: importing
  editor/runtime helpers no longer tries to mount `#root`, and the routed app boot side effect is
  isolated to the actual browser entrypoint.

- Problem: the routed fast-shell follow-up drifted away from the shared landing auth gate and left
  room for the once-per-load shell session to resurrect on later SPA navigation. Tried: switched the
  initial shell eligibility check back onto `shouldRenderFastLandingShell()`, then narrowed that
  shared helper back to the real remembered-auth signals (`noter_was_authenticated` and
  `noter_auth_provider`) after a broader raw-`__convexAuth*` check turned out to misclassify
  anonymous Convex sessions as authenticated and suppress the shell from first paint. Explicitly
  retire the shell session before shell-driven route transitions or when the root route decides the
  shell no longer applies. Result: the fast-shell session rules are back in one place, the shell no
  longer disappears just because anonymous auth tokens exist, and route transitions no longer depend
  on a separate root-only copy of the auth gate logic.

- Problem: the blocked-storage fallback fixed startup crashes, but the in-memory storage object did
  not expose stored keys through `Object.keys()`, which meant popup OAuth token relay could still
  silently lose Convex auth tokens under denied-storage conditions. Tried: changed the fallback
  storage implementation to mirror stored values onto enumerable own properties and added a focused
  test around `ensureWindowStorageAccess()`. Result: the fallback now behaves closely enough to real
  `localStorage` for both `storage.key(index)` iteration and `Object.keys(localStorage)`-based token
  collection.

- Problem: the landing toggle frame helpers originally judged a mix of pre-transition and
  post-transition frames, which made the mobile shell test look like content jitter even when the
  target route was stable. Tried: filtered both helpers down to target-route frames only, then
  tightened the settled helper to assert that the hydrated route stays within the intended on-screen
  bounds instead of only checking spread. Result: the routed landing stability test now measures the
  right surface, and the remaining assertion is stricter about off-screen jumps without reviving the
  old bootstrap contract.

- Follow-up simplification candidate: if first-paint theme parity becomes less important than code
  simplicity, we can delete the pre-paint theme script in `index.html` and the startup theme/storage
  fallback helpers, accept a brief post-mount theme correction, and simplify the routed root boot
  path further.

## Completed Milestones

1. Introduce a repo-owned router seam and move current imports behind it.
2. Start a TanStack code-based route tree around the current app/layout seams.
3. Peel the simple standalone pathname branches out of `App.tsx` into explicit TanStack routes.
4. Promote all remaining non-root authenticated routes into explicit TanStack routes, including MCP
   consent, pricing/add, machines, and vault/file paths.
5. Move the public/dev explicit routes with meaningful query state onto route-owned TanStack search
   handling, including the logo preview surfaces and the Codex research routes.
6. Move the authenticated explicit routes with meaningful query state onto route-owned TanStack
   search handling, including MCP consent, pricing, machine connect, and machines workspace params.
7. Move the root landing search state onto route-owned TanStack handling, including `?auth`, `?dev`,
   and the related shared landing/auth helpers.
8. Move the root landing/dashboard split onto explicit TanStack routes and delete `bootstrap.ts`
   while preserving the current fast landing shell behavior inside routed React.

## Remaining Sequence

1. Delete routed fast-shell parity code once we are ready to stop preserving the old public landing
   shell/handoff contract: `shouldRenderFastLandingShell()`, `fastLandingBoot.ts`,
   `FastPublicLandingShell.tsx`, and the related parity-only tests or fixtures.
2. Delete the remaining unresolved fallback route bridge in `App.tsx` and the router compat seam in
   `apps/samebase/src/lib/router.ts` once those callers have a deliberate TanStack-native path.
3. Keep the shared workspace wrapper and drag-contract migration from archived Spec 080 on a
   separate rollout track, and reconnect it only where routed ownership genuinely needs those seams.
