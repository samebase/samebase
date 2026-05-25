# TanStack Start SSR Adoption Research

## Document Control

- Status: Research with implementation follow-up
- Owner: Noter frontend routing, hosting, and Convex data integration
- Created: 2026-05-25
- Related:
  - `research/2026-05-05-cloudflare-pages-workers-direction.md`
  - `research/2026-05-15-notermd-workers-provisioning-migration.md`
  - `research/2026-04-08-root-route-framework-discussion-summary.md`
  - `specs/061_FAST_PUBLIC_LANDING_BOOT_SPEC.md`

## Prompt

Research what Noter needs before adopting TanStack Start SSR beyond the local `/ssr-demo` lab. The
product goal is faster route startup, especially dashboard startup, while most durable logic and
data live in Convex.

## Current Finding

Noter can build and locally demonstrate TanStack Start SSR, but the shipped Cloudflare preview is
still a static SPA deployment. The safe adoption path is selective SSR for public/static routes
first, not authenticated dashboard data SSR.

The dashboard route is currently client-owned because it depends on Convex Auth, live Convex
subscriptions, browser-only query cache behavior, and many actions/mutations. With Noter's current
Convex Auth login, authenticated Convex SSR is not a small TanStack Start switch. It requires an
auth-token bridge that can authenticate server-side Convex HTTP queries, or a later move to a
documented provider path such as Clerk, WorkOS AuthKit, or a future stable Convex Auth SSR flow.

## External Evidence

TanStack Start SSR renders matched routes on the server by default unless the route or app disables
SSR. During the initial request, `beforeLoad`, `loader`, and route components can run server-side,
and the resulting HTML is hydrated in the browser. Selective SSR allows route-level `ssr: true`,
`ssr: false`, or `ssr: "data-only"` behavior.

Reference: https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr

TanStack Start SPA mode is different. It prerenders a shell and does not include matched route
content in the first document until client JavaScript runs. That is the mode Noter currently uses by
default in `apps/noter/vite.config.ts`.

Reference: https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode

Convex's recommended TanStack Start SSR integration uses `@convex-dev/react-query` with
`@tanstack/react-router-ssr-query`. `useSuspenseQuery(convexQuery(...))` participates in SSR; plain
Convex `useQuery()` does not. After SSR, the browser Convex client can resume live subscriptions
from the server-rendered state.

Reference: https://docs.convex.dev/client/tanstack/tanstack-start/

Convex Auth is the main constraint for authenticated SSR. Convex's own Convex Auth documentation
currently describes support for client-side React web apps and React Native, while SSR/API route
support is still under active development. The documented authenticated TanStack Start SSR paths use
providers such as Clerk or WorkOS where the server can obtain a token and set it on the Convex HTTP
client before running loaders.

References:

- https://docs.convex.dev/auth/convex-auth
- https://docs.convex.dev/client/tanstack/tanstack-start/clerk

## Current Noter Shape

### SSR Lab

The branch now has an observable `/ssr-demo` route:

- `apps/noter/vite.config.ts` uses `NOTER_SSR_DEMO` to disable SPA mode locally.
- `apps/noter/src/routes/ssr-demo.tsx` renders static route HTML and records whether its loader ran
  on the server.
- `apps/noter/src/routes/root.tsx` special-cases `/ssr-demo` so it can render outside the client
  Convex auth shell.

Local proof:

```bash
NOTER_SSR_DEMO=1 pnpm --filter noter dev:frontend
curl -sS http://localhost:5173/ssr-demo | tr '\0' '\n' | grep 'data-loader-runtime="server"'
```

### App Root Boundary

Only `/ssr-demo` currently renders route content on the server. Every real app route goes through
`ClientOnly` before `AppRootClient` loads.

`AppRootClient` owns:

- `ConvexAuthProvider`
- `QueryProvider`
- theme synchronization effects
- deferred PostHog initialization
- the router debug overlay
- the real `<Outlet />`

That means route bodies such as `/home` cannot appear in the first HTML document until the client
bundle loads and hydrates.

### Cloudflare Preview Boundary

`apps/noter/wrangler.jsonc` currently uploads static assets only:

```jsonc
"assets": {
  "directory": "./dist/client",
  "not_found_handling": "single-page-application",
}
```

There is no Worker `main` entrypoint, so even if the build creates `dist/server/server.js`, Wrangler
does not run it. Cloudflare previews therefore serve the static SPA shell.

The observed workers.dev preview behavior matched that:

- `/`, `/home`, and `/ssr-demo` returned the same HTML shell.
- `/ssr-demo` did not contain `data-testid="ssr-demo-route"`.
- `/ssr-demo` did not contain `data-loader-runtime="server"`.

## Route Adoption Map

### Good First Candidates

1. `/privacy`
2. `/terms`

These are public, mostly static markdown pages. The route bodies are low risk, but the shared public
shell currently includes client-only chrome, localStorage behavior, and Convex-backed route
URL/admin affordances. The first implementation should either use a server-safe public shell for
these routes or move that chrome behind client-only islands.

### Possible Later Public Candidates

1. `/pitch`
2. `/pitch/print`
3. `/pitch/print/mobile`

These bodies look mostly static and do not depend on Convex hooks, but their route metadata marks
them as admin surfaces. Confirm the intended access model before adding SSR.

Logo/lab routes can SSR static outer markup only after each renderer is audited. Canvas and Three
surfaces should stay client-only or use SSR for a stable shell, not for the renderer itself.

### Keep Client-Owned For Now

1. `/home`
2. `/add`
3. `/machines`
4. `/machine-connect`
5. `/vault/$`
6. codespace chat routes
7. `/mcp-consent`
8. `/pricing`
9. `/localStorage`

These routes depend on one or more of:

- Convex Auth state
- `<Authenticated>` / `<Unauthenticated>`
- approval gating
- live Convex queries
- Convex mutations/actions
- IndexedDB/localStorage/window APIs
- OAuth popup or browser redirect behavior
- editor/canvas/browser-only surfaces

## Required Architecture Changes

### 1. Replace The Hard-Coded SSR Demo Boundary

Move from a pathname check in `root.tsx` to a route metadata policy. For example:

- `renderMode: "server"` for public SSR routes
- `renderMode: "client"` for the authenticated app shell
- optionally `renderMode: "data-only"` later for routes with server data but client UI

The root can then render:

- `RootDocument + Outlet` for server-safe routes
- `RootDocument + ClientOnly + AppRootClient` for client-owned routes

This keeps the current authenticated app stable while letting public routes adopt SSR one by one.

### 2. Split Server-Safe Public Shell From Client Chrome

Create a public shell that can render without Convex, localStorage, `window`, or router effects.
Hydrate optional chrome later if needed.

Do not pull `RouteUrlEditor`, auth controls, Convex-backed admin checks, or localStorage-driven
diagnostics into the server-rendered legal pages.

### 3. Move Public Route Metadata Into `head`

SSR pages need correct title/canonical/meta in the first document. Today much route-specific
metadata is applied after hydration through `usePageMetadata`. Public SSR routes should compute
route metadata through route `head` functions instead.

### 4. Keep Authenticated Convex Data Client-Owned Initially

Do not move dashboard `getUserVaults` into an SSR loader with the current Convex Auth setup.
Instead:

- keep `/home` client-rendered
- keep optimizing Convex query shape, subscriptions, chunking, and cached startup data
- consider server-rendering only a generic authenticated shell if it does not need identity data

If authenticated SSR becomes a goal, evaluate an auth architecture change separately.

### 5. Adopt The Official Convex + TanStack Query Path For SSR Data

For any SSR route that needs Convex data, add and wire:

- `@convex-dev/react-query`
- `@tanstack/react-router-ssr-query`
- `ConvexQueryClient`
- `setupRouterSsrQueryIntegration`
- `convexQuery(...)`
- `useSuspenseQuery(...)`

Use this only for public or safely authenticated data. Plain Convex `useQuery()` should remain for
client-owned live surfaces.

### 6. Change Cloudflare Deployment Shape Before Expecting Workers SSR

Move from Workers Static Assets only to Worker plus assets:

- add the Cloudflare Vite plugin for TanStack Start Worker output
- configure Wrangler with a Worker `main`
- point assets at the generated public assets directory
- add `nodejs_compat` if required by the generated output
- keep preview deployment behavior, but make the Worker execute the server entrypoint

Do not use `NOTER_SSR_DEMO` as a production rollout switch. It is a local/build-time lab flag. Use a
shadow Worker or branch-specific preview for SSR verification.

## Recommended Implementation Sequence

### Phase 0: Keep The Lab

Keep `/ssr-demo` until the first real SSR route is deployed and verified on workers.dev. It is the
smallest regression test for "does the first document contain route HTML?"

### Phase 1: SSR Public Legal Pages Locally

1. Add route metadata for render mode.
2. Replace the `/ssr-demo` pathname check with metadata-driven root rendering.
3. Create a server-safe legal/public shell.
4. Add `head` metadata for `/privacy` and `/terms`.
5. Verify raw local HTML contains legal page content before JS.

Verification:

```bash
NOTER_SSR_DEMO=1 pnpm --filter noter dev:frontend
curl -sS http://localhost:5173/privacy | grep 'Privacy'
curl -sS http://localhost:5173/terms | grep 'Terms'
```

### Phase 2: Deploy SSR To A Shadow Worker

1. Add Cloudflare Worker SSR output without changing the production Worker.
2. Deploy a shadow Worker.
3. Verify `/ssr-demo`, `/privacy`, and `/terms` raw HTML on workers.dev.
4. Confirm static assets, Convex env values, redirects, and preview URLs still work.

Verification:

```bash
curl -sS https://<shadow-worker>.workers.dev/ssr-demo | grep 'data-loader-runtime="server"'
curl -sS https://<shadow-worker>.workers.dev/privacy | grep 'Privacy'
curl -sS https://<shadow-worker>.workers.dev/home | grep -v 'data-testid="vault'
```

The `/home` check should confirm it remains client-owned until authenticated SSR is intentionally
designed.

### Phase 3: Make SSR Default For Public Routes

After shadow verification, make the Worker SSR deployment the normal preview path. Keep private
routes explicitly client-owned.

### Phase 4: Evaluate Authenticated SSR Separately

Only after public SSR is stable, decide whether dashboard data should ever SSR. Options:

1. keep dashboard client-owned and continue Convex/startup optimization
2. adopt a documented auth provider/token bridge for server-side Convex queries
3. wait for stable Convex Auth SSR support

## Open Questions

1. Are `/pitch` and print routes truly public, or should their admin route metadata be enforced?
2. Should legal/public pages use a minimal static shell, or should current chrome hydrate as client
   islands?
3. Do we want a permanent SSR smoke route after real public routes ship, or should `/ssr-demo` be
   removed?
4. Which Worker target should host the first SSR preview: a separate shadow Worker or a branch-only
   preview of the existing Worker?

## Delegation Tree

- Main thread: adoption synthesis, repo research note, PR update.
- Explorer: source-map current Noter routing/auth/data blockers.
- Explorer: primary-source TanStack Start and Convex SSR research.
- Explorer: Cloudflare Workers deployment/runtime audit.

All delegated outputs were integrated into this note. No delegated agent edited files.
