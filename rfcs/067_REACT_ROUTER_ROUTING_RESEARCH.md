# React Router Routing Research

## Document Control

- Status: Research / RFC
- Owner: frontend
- Last updated: 2026-03-22

## Question

Would adopting more of React Router, especially framework mode, materially
improve Noter's routing architecture, and if so, what is the right migration
shape?

## Executive Summary

React Router can help this codebase, but mostly by making route ownership more
explicit and uniform, not by replacing Convex as the app's primary data layer.

Today the app uses `BrowserRouter` and a small `<Routes>` table, but a
noticeable amount of route behavior lives outside the route tree:

- top-level page switching in `App.tsx` uses `location.pathname` conditionals
  before the main `<Routes>`
- route canonicalization for vault paths happens inside `FileView.tsx` effects
- vault URLs are built manually in many components instead of through one route
  API
- query params are only partly centralized
- page metadata and some route-aware UI behavior are computed from pathname
  strings rather than route matches

React Router framework mode would help most with:

- a single route tree with route modules instead of pathname conditionals
- type-safe route params and route module props
- nested layouts and route `handle`s for route-aware shared UI
- route-scoped error boundaries
- automatic scroll restoration
- route-based code splitting, prefetch, and lazy route discovery
- optional SPA-mode pre-rendering for public routes

It would help much less with:

- Convex live queries and real-time collaborative state
- mutation-heavy editor flows already modeled around Convex actions/mutations
- consistency problems caused by hand-built URLs unless we also standardize our
  own route helpers

Recommendation: fix routing ownership first, then adopt React Router more deeply
only if we want route-module ergonomics, typegen, route handles, and static
pre-rendering for public pages. I would not start by rewriting the whole app
into framework mode in one pass.

From an onboarding perspective, the biggest issue today is not that the app is
using plain React Router. It is that route behavior is split across several
patterns. That is harder for new contributors and junior developers to learn
than either:

- a simple declarative router with one obvious route table
- or a more opinionated framework setup with clear conventions

Vite+ strengthens the case for a future framework-mode migration because it
preserves much of the Vite mental model while reducing toolchain sprawl.

## Current Routing Shape

### 1. The app uses declarative routing, but not all routes are declared in one place

The current entrypoint mounts `BrowserRouter` in `apps/noter/src/main.tsx`.
`apps/noter/src/App.tsx` defines the primary route table with `Routes`/`Route`,
but several pages bypass that table entirely:

- `/logo`
- `/logo-iso`
- `/logo-svg`
- `/logo-iso-study`
- `/logo-transition-lab`
- `/logo-transition-lab-transforms`
- `/privacy`
- MCP consent flow routing via `MCP_CONSENT_APP_PATH`

Those routes are selected with `location.pathname === ...` checks before the
main `<Routes>` render. That means the app has both:

- a route table
- a second route-selection mechanism in component logic

This is the clearest sign that route ownership is split.

### 2. The vault route is carrying too much canonicalization logic in component effects

`apps/noter/src/components/FileView.tsx` handles several URL shapes:

- `/vault/:owner/:repoName`
- `/vault/:owner/:repoName/:branch`
- `/vault/:owner/:repoName/:branch/*`
- legacy branchless interpretations
- missing/renamed branch redirects

Instead of expressing canonical redirects in the router, `FileView` uses
multiple `useEffect` blocks to navigate to a corrected URL after render. That
works, but it spreads URL semantics into component lifecycle code and makes the
route harder to reason about.

### 3. Route construction is not centralized

There is one good route helper in `apps/noter/src/lib/vaultRoutes.ts` for the
codespace chat route, but most vault/file routes are still built ad hoc.

Repository scan on 2026-03-22:

- 34 `/vault/...` literal occurrences in `apps/noter/src`
- many are in navigation code across `FileView.tsx`,
  `CodespaceChatOnlyView.tsx`, `VaultDashboard.tsx`, and
  `EditedFilesCategories.tsx`

This is enough duplication to create drift in encoding, search param handling,
and future route changes.

### 4. Query param ownership is only partially standardized

The repo already has `apps/noter/src/lib/queryParams.ts`, which is the right
direction. But usage is mixed.

Repository scan on 2026-03-22:

- 17 direct `new URLSearchParams(...)` or `useSearchParams(...)` usages in
  `apps/noter/src`

Some of those are fine, but several route-adjacent behaviors still parse or
rewrite query strings locally instead of routing everything through the helper
layer.

### 5. Route-aware UI behavior is pathname-driven

Several cross-cutting behaviors derive from raw path strings:

- page metadata in `apps/noter/src/lib/pageMetadata.ts`
- Chat FAB visibility in `apps/noter/src/App.tsx`
- public nav toggles in `apps/noter/src/Layout.tsx`
- bootstrap metadata decisions in `apps/noter/src/bootstrap.ts`

This is serviceable, but it means shared UI depends on string matching instead
of route metadata or route hierarchy.

## What React Router Would Help With

### 1. One route tree instead of pathname branches

React Router's data/framework modes push route configuration outside arbitrary
component render logic and into a complete route tree. That would let Noter move
the current pathname special cases into route modules and nested layouts.

Direct benefits for this repo:

- every app route becomes visible in one route config
- auth/public/app shells can be modeled as nested layouts instead of
  `Authenticated`/`Unauthenticated` branches wrapped around separate route sets
- MCP consent, privacy, logo labs, pricing, vault pages, and chat-only views can
  all become normal routes

This is the biggest architectural win.

### 2. Route modules would make routing concerns more local and more uniform

React Router framework mode is built around route modules. A route module can
own its component, error boundary, loader/clientLoader, action/clientAction,
route handles, links, and metadata.

That matches several current pain points:

- `App.tsx` is currently doing route selection, auth gating, page metadata
  selection, and lazy imports all in one place
- route-aware behavior is split between `App.tsx`, `Layout.tsx`,
  `pageMetadata.ts`, and page components

Moving route behavior into route modules would give each route a single home.

### 3. Type-safe route params would reduce hand-rolled param handling

React Router's type generation can infer route params and route-module props
from the route config. That matters here because the app currently does quite a
bit of manual route param plumbing:

- `useParams<{ owner: string; repoName: string; branch?: string; "*": string }>`
- explicit `decodeURIComponent` handling
- branch/file-path canonicalization logic in page components

Typegen will not remove the need for vault-specific encoding helpers, but it
would remove a lot of optional-string and generic `useParams` friction.

### 4. Nested layouts and `handle` would help cross-cutting UI

React Router's `handle` + `useMatches` pattern is a strong fit for several Noter
concerns that are currently pathname-derived:

- page titles and metadata
- route-aware shell behavior
- breadcrumbs or workspace context
- hiding/showing the Chat FAB or similar shell controls

Today, those decisions rely on string checks. With route handles and layout
routes, pages could contribute explicit metadata to the shell instead.

### 5. Route-scoped error boundaries would improve failure isolation

Right now, route failures mostly fall back to component-specific null/error UI.
Framework/data routing would let Noter define error boundaries at route
boundaries, so a vault page failure does not need to share failure handling with
the rest of the app shell.

This is useful for:

- vault route loading failures
- codespace chat view failures
- public page failures
- auth or consent flow failures

### 6. Scroll restoration is a concrete UX improvement

React Router's scroll restoration only works with a data router/framework mode.
For Noter, that matters because there are long dashboards and deep file views.

This is not the highest-priority reason to migrate, but it is a real user
benefit and currently missing from the app architecture.

### 7. Automatic route code splitting would simplify what we already do manually

`App.tsx` already uses `React.lazy` for top-level pages. React Router framework
mode would formalize that pattern:

- route modules are code split automatically
- route modules become the unit of loading
- future route additions do not need more `lazy(...)` wiring in `App.tsx`

This is a convenience win, not a unique capability.

### 8. Prefetch, discovery, and public-page pre-rendering are relevant

Framework mode adds route discovery and prefetch controls on links and supports
SPA mode with optional pre-rendering.

That is relevant for Noter in two places:

- public/marketing routes like `/`, `/pricing`, and `/privacy`
- high-frequency navigations such as dashboard to vault routes

If we care about making public routes statically generated while keeping the
authenticated app as an SPA, React Router framework mode supports that shape.

## What React Router Would Not Solve Well

### 1. It does not replace Convex as the main app data model

The strongest feature of React Router framework mode is route loaders/actions
with revalidation. Noter's main product data is already organized around Convex
live queries and mutations:

- auth state
- vault state
- collaborative file staging
- codespace state
- infra status
- chat state

Those flows are reactive and long-lived. Route loaders are best for
navigation-scoped data fetching. They do not replace Convex's real-time
subscription model.

In practice, even after migration, many route modules would still render
components that call Convex hooks directly.

### 2. Route actions are not a natural replacement for many editor interactions

React Router actions are especially useful for form submissions and
navigation-coupled mutations. Noter's core product interactions are not mostly
HTML form submissions:

- collaborative editor updates
- staged file operations
- codespace ensure/reconnect operations
- dashboard actions mediated by Convex actions and optimistic updates

Some flows could move to `clientAction` or fetchers, but the editor-heavy parts
of the app would likely continue using Convex APIs directly.

### 3. Framework mode alone will not fix hand-built route helpers

Even in framework mode, developers can still build strings manually. To get real
consistency, we would still need to define repo-owned route helper APIs for:

- vault root routes
- vault file routes
- codespace chat routes
- review/diff query params

Otherwise we would just move the inconsistency into route modules.

### 4. It is not a low-cost migration

This repo is currently a plain Vite SPA. Framework adoption would require:

- `@react-router/dev`
- `react-router.config.ts`
- a `root.tsx` document entry
- `routes.ts`
- route-module conversion
- moving providers and shell code above the router into the root route
- revisiting metadata/bootstrap integration

That is real migration work, not a package swap.

## Approachability For New Users And Junior Developers

### 1. The current stack is familiar, but the current routing style is not especially teachable

At a high level, the current stack sounds beginner-friendly:

- Vite
- React Router
- React components

Those are common tools, and many junior developers have seen some version of
them before.

In practice, the repo's routing behavior is harder to learn than the tool names
suggest because the "truth" is fragmented:

- some routes are declared in `App.tsx`
- some route selection happens through pathname checks
- some URL normalization happens inside `FileView.tsx` effects
- some shared route behavior is driven by raw path strings
- some route construction is centralized and some is hand-built

That means a new contributor has to learn repo-specific exceptions instead of
just learning React Router.

### 2. Framework mode adds concepts up front, which is a real onboarding cost

React Router explicitly positions its modes as additive, with more features
coming "at the cost of architectural control". Framework mode also introduces
new concepts and files:

- `root.tsx`
- `routes.ts`
- `react-router.config.ts`
- route modules
- loaders/actions/clientLoaders/clientActions
- `handle`
- generated route types

For a junior developer, that is more to absorb than `BrowserRouter` +
`Routes`/`Route`.

So if the question is only "what is easier to start typing into on day one?",
the current Vite + declarative-router setup wins.

### 3. But once adopted cleanly, framework mode is easier to reason about than today's hybrid

The current app is paying complexity in a less teachable way:

- there is no single obvious home for route behavior
- route conventions are partly local custom knowledge
- route-aware shell behavior is inferred from pathname strings

A well-adopted framework setup is often easier for junior developers after the
first learning pass because it answers basic questions consistently:

- Where do I add a route?
- Where does page metadata live?
- Where does route-level error UI go?
- Where do params and route props come from?
- Where should route-specific loading logic live?

React Router framework mode gives convention-based answers to those questions.
That is usually easier to coach and review than a custom hybrid architecture.

### 4. Vite+ makes the tooling side more approachable

As of 2026-03-22, the current Vite+ docs describe it as:

- "Manage your runtime, package manager, and frontend stack with one tool."
- "One configuration file and one consistent flow of commands across your whole
  stack."
- "Supports every framework built on Vite."

The config docs also say Vite+ keeps project configuration in `vite.config.ts`.

That matters for onboarding because junior developers are often slowed down less
by React itself than by command/config sprawl. Vite+ helps there by making the
tooling surface more uniform:

- one primary CLI (`vp`)
- one primary config file (`vite.config.ts`)
- one standard flow for dev/check/build/test/run

If we eventually adopt React Router framework mode, Vite+ reduces one source of
"this repo has a weird custom toolchain" anxiety because the stack still looks
Vite-shaped.

### 5. Vite+ does not remove the non-frontend complexity in this repo

Vite+ would help frontend-tooling consistency, but it would not by itself
simplify:

- Convex concepts and workflows
- anonymous/worktree bootstrap rules like `make anon`
- provider auth/OAuth setup
- the product-specific editor and collaboration model

So Vite+ is a good option for developer experience, but it should not be
over-credited as a full onboarding fix.

### 6. Onboarding-oriented recommendation

If we optimize specifically for new users and junior developers, I would frame
the path this way:

1. Immediate win

   - centralize route ownership in the current app
   - stop mixing route tables and pathname branches
   - standardize route helper usage

2. If we do a larger migration for long-term teachability

   - prefer React Router framework mode over a custom half-step architecture
     because conventions are easier to teach than repo-specific patterns
   - pair it with Vite+ so the command/config story stays simple and
     Vite-familiar

3. Keep expectations realistic

   - framework mode + Vite+ would improve routing and frontend DX
   - it would not eliminate the need to document Convex/worktree/bootstrap
     workflows clearly

## Migration Cost In This Repo

The main work is organizational, not conceptual.

Likely migration tasks:

1. Replace the current `index.html` + `main.tsx` entry pattern with `root.tsx`
   and React Router's framework bootstrap.
2. Move global providers from the current app mount into the root route.
3. Convert top-level routes from `App.tsx` to route modules.
4. Replace pathname conditionals for privacy/logo/MCP consent with declared
   routes.
5. Introduce nested layouts for:
   - public marketing shell
   - authenticated app shell
   - vault shell
6. Decide whether route data should stay in Convex hooks or partially move to
   `clientLoader`.
7. Rework current metadata handling so route modules own public page metadata.
8. Replace manual route construction with centralized helpers, regardless of
   router mode.

The highest-risk area is the vault/file route because it contains canonical URL
logic and editor state behavior that are easy to regress.

## Migration Options

### Option A: Keep current router mode and clean up ownership

Do not adopt framework mode yet. Instead:

- move all route declarations into one route table
- eliminate pathname-only page switching from `App.tsx`
- add centralized helpers for all vault routes
- standardize route-adjacent query param updates through `queryParams.ts`
- use `useMatch`/shared helpers instead of raw pathname comparisons where
  possible

Pros:

- cheapest path
- addresses the biggest inconsistency immediately
- avoids a framework migration while the app is still heavily Convex-driven

Cons:

- no route typegen
- no route module ergonomics
- no framework pre-rendering
- no data-router-only features like scroll restoration and `useMatches`

### Option B: Move to a data router first

Adopt `createBrowserRouter`/`RouterProvider` without going all the way to
framework mode.

Pros:

- gets nested route trees, `useMatches`, route handles, error boundaries, and
  scroll restoration
- lower migration cost than full framework mode
- preserves a more familiar SPA entry structure

Cons:

- misses framework conveniences like route modules, typegen, and built-in
  pre-rendering
- can become a temporary architecture if framework mode is the eventual target

### Option C: Adopt React Router framework mode in SPA mode

Adopt route modules and `@react-router/dev`, but set `ssr: false` and keep the
authenticated app client-rendered.

Pros:

- full route-module architecture
- route typegen
- automatic code splitting
- route handles/metadata conventions
- option to pre-render public routes later

Cons:

- biggest migration cost
- still does not replace Convex for most app data flows
- requires care around current bootstrap/document metadata behavior

## Recommendation

I would not jump directly to full framework mode as the first routing cleanup.

Recommended sequence:

1. Short-term consistency pass in the current app

   - make every route explicit in one route table
   - introduce centralized helpers for all vault/file/chat routes
   - stop adding new pathname special cases in `App.tsx`
   - standardize route-adjacent query param updates through `queryParams.ts`

2. If that cleanup still leaves the app fighting the router, migrate to either
   data router or framework SPA mode

   - prefer data router first if the goal is route hierarchy, `useMatches`,
     error boundaries, and scroll restoration with less churn
   - prefer framework SPA mode if the goal includes route typegen, route
     modules, and static pre-rendering for public routes

3. If framework mode is chosen, keep Convex in route components initially
   - do not force a loader/action rewrite just because the framework supports it
   - start by migrating route ownership and shell composition, not by replacing
     Convex data flows

The strongest argument for framework mode in this repo is not loaders. It is
uniform route modules, type-safe params, route-aware shell composition, and a
clean path to pre-rendering public pages. The strongest argument against doing
it immediately is that Noter's hardest screens are real-time Convex screens, so
the migration cost is front-loaded while the data-layer payoff is limited.

## Suggested Pilot Scope If We Want To Try It

If we want evidence before a full commitment, pilot on the public surface only:

- `/`
- `/pricing`
- `/privacy`

Why this slice:

- no collaborative editor risk
- clear metadata value
- pre-rendering value is highest here
- lets us validate route modules, root layout, and framework bootstrap without
  touching vault flows

Only after that would I migrate the vault routes.

## Sources

Official React Router docs used for this research:

- [Picking a Mode](https://reactrouter.com/start/modes)
- [Framework Adoption from RouterProvider](https://reactrouter.com/upgrading/router-provider)
- [Single Page App (SPA)](https://reactrouter.com/how-to/spa)
- [Route Module](https://reactrouter.com/start/framework/route-module)
- [Type Safety](https://reactrouter.com/explanation/type-safety)
- [Route Module Type Safety](https://reactrouter.com/how-to/route-module-type-safety)
- [Data Loading](https://reactrouter.com/start/framework/data-loading)
- [Actions](https://reactrouter.com/start/framework/actions)
- [Pending UI](https://reactrouter.com/start/framework/pending-ui)
- [Using `handle`](https://reactrouter.com/how-to/using-handle)
- [ScrollRestoration](https://reactrouter.com/api/components/ScrollRestoration)
- [Automatic Code Splitting](https://reactrouter.com/explanation/code-splitting)
- [Lazy Route Discovery](https://reactrouter.com/explanation/lazy-route-discovery)
- [Link](https://reactrouter.com/main/api/components/Link)

Official Vite+ docs used for onboarding/tooling analysis:

- [Vite+ Home](https://viteplus.dev/)
- [Vite+ Config](https://viteplus.dev/config/)
- [Announcing Vite+ Alpha](https://voidzero.dev/posts/announcing-vite-plus-alpha/)

Repository files reviewed for current-state analysis:

- `apps/noter/src/main.tsx`
- `apps/noter/src/App.tsx`
- `apps/noter/src/Layout.tsx`
- `apps/noter/src/components/FileView.tsx`
- `apps/noter/src/components/CodespaceChatOnlyView.tsx`
- `apps/noter/src/components/VaultDashboard.tsx`
- `apps/noter/src/components/EditedFilesCategories.tsx`
- `apps/noter/src/lib/vaultRoutes.ts`
- `apps/noter/src/lib/queryParams.ts`
- `apps/noter/src/lib/pageMetadata.ts`
