# Convex-Hosted RSC on Cloudflare Pages Feasibility

Date: 2026-04-13

## Why This Document Exists

This memo answers a concrete architecture question for `apps/noter`:

- can Noter keep the current Cloudflare Pages deployment shape,
- keep Convex as the backend,
- and move TanStack Start or another React Server Components setup onto Convex
  as the server runtime?

The short answer is:

- not as a clean, supported TanStack Start setup,
- and not as an honest low-risk production direction for this app today.

## Current Repo Context

The current frontend still boots as a client-side Vite app:

- [apps/noter/src/entry.tsx](/Users/nicu/.codex/worktrees/afc5/noter/apps/noter/src/entry.tsx:1)
- [apps/noter/src/lib/convexClient.ts](/Users/nicu/.codex/worktrees/afc5/noter/apps/noter/src/lib/convexClient.ts:1)

Convex currently exposes backend HTTP routes for OAuth, MCP, machines, and
webhooks rather than a React rendering entrypoint:

- [apps/noter/convex/http.ts](/Users/nicu/.codex/worktrees/afc5/noter/apps/noter/convex/http.ts:1)

That means any RSC plan would be an architecture addition, not a small toggle.

## Official Docs Reviewed

These docs were used for this investigation:

- TanStack Start server components guide:
  [link https://tanstack.com/start/latest/docs/framework/react/guide/server-components](https://tanstack.com/start/latest/docs/framework/react/guide/server-components)
- TanStack Start SPA mode guide:
  [link https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode)
- TanStack Start hosting guide:
  [link https://tanstack.com/start/latest/docs/framework/react/guide/hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
- Convex TanStack Start quickstart:
  [link https://docs.convex.dev/quickstart/tanstack-start](https://docs.convex.dev/quickstart/tanstack-start)
- Convex Next.js server-rendering guidance:
  [link https://docs.convex.dev/client/react/nextjs/server-rendering](https://docs.convex.dev/client/react/nextjs/server-rendering)
- Cloudflare Pages Functions docs:
  [link https://developers.cloudflare.com/pages/functions/](https://developers.cloudflare.com/pages/functions/)

## Repo Direction Already Recorded Elsewhere

Two existing docs already point away from this migration shape:

- [specs/081_TANSTACK_ROUTER_MIGRATION_SPEC.md](/Users/nicu/.codex/worktrees/afc5/noter/specs/081_TANSTACK_ROUTER_MIGRATION_SPEC.md:1)
  keeps the app on the Vite SPA runtime.
- [specs/083_TANSTACK_ROUTER_FILE_BASED_MIGRATION_SPEC.md](/Users/nicu/.codex/worktrees/afc5/noter/specs/083_TANSTACK_ROUTER_FILE_BASED_MIGRATION_SPEC.md:1)
  explicitly treats TanStack Start adoption as out of scope.
- [research/2026-04-08-root-route-framework-discussion-summary.md](/Users/nicu/.codex/worktrees/afc5/noter/research/2026-04-08-root-route-framework-discussion-summary.md:1)
  already concluded that true request-time framework rendering fits Workers
  better than static Pages.

This note adds the RSC-specific evidence behind that same conclusion.

## What The Docs Say

### 1) TanStack Start's RSC story assumes a real server runtime

The current TanStack Start docs describe server components as an experimental
framework feature layered on top of its server runtime and bundling pipeline.

The hosting docs point toward server-capable targets such as Cloudflare Workers,
not static Pages-only hosting.

### 2) TanStack Start SPA mode is not the same thing as keeping RSC

SPA mode preserves a client-only deployment shape. It can still talk to external
APIs or server functions, but that does not make those APIs the framework's RSC
renderer.

In other words:

- SPA mode is compatible with "keep the frontend static",
- but it is not the same as "keep TanStack Start server components and move them
  into Convex".

### 3) Convex documents TanStack Start as a backend/data source

Convex's TanStack Start quickstart shows Convex working with TanStack Start as
the backend for app data and functions.

The Convex server-rendering docs I found are specifically about Next.js server
rendering and preloading Convex queries from a server runtime. They do not
describe Convex as the runtime that emits React Flight payloads itself.

### 4) Cloudflare Pages Functions are still Workers

Cloudflare's own Pages docs say that Pages Functions run code on the Cloudflare
network with Cloudflare Workers.

That matters because "stay on Pages instead of Workers" only avoids the Workers
tradeoff if the app remains static. As soon as Pages Functions become the
request-time rendering surface, the runtime is still Workers-based.

## Runtime Experiments Performed

I temporarily added these packages to `apps/noter` to test the runtime shape:

- `react-server-dom-webpack@19.2.4`
- `@tanstack/react-start-rsc@0.0.15`
- `@vitejs/plugin-rsc@0.5.24`

These were used only for investigation and were not kept as part of the final
branch state.

### 1) Raw React Flight server rendering only loaded with `react-server` enabled

`react-server-dom-webpack/server.edge` and `server.node` both failed in normal
Node with:

```text
The "react" package in this environment is not configured correctly.
The "react-server" condition must be enabled in any environment that runs
React Server Components.
```

They only loaded when Node was started with:

```bash
node --conditions react-server ...
```

This is visible in the package itself:

- `react-server-dom-webpack` exports `./server` behind the `react-server`
  condition.
- its server bundle checks
  `React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` before
  continuing.

That means any Convex-hosted RSC plan would need the runtime to expose a real
`react-server` environment, not just a package install.

### 2) TanStack Start's public RSC server entry depends on Vite virtual modules

The public TanStack RSC server entry currently resolves to:

```ts
import { renderToReadableStream } from "virtual:tanstack-rsc-runtime";
```

from:

- `@tanstack/react-start-rsc/dist/esm/entry/rsc.js`

That is not a drop-in module that can be imported inside Convex's separate
bundler/runtime.

### 3) Vite's RSC helpers also depend on Vite-owned runtime pieces

`@vitejs/plugin-rsc/dist/core/rsc.js` depends on Vite-specific module loading,
`import.meta.env`, and the plugin's own vendored RSC/runtime integration.

The browser and server helpers are designed to work inside a Vite-managed RSC
build, not as generic libraries that Convex can become the host for.

### 4) There is no clean streaming bridge from Convex HTTP actions to Node-only RSC rendering

Convex HTTP routes can return `Response` objects, but the Node-only work would
have to sit behind a Node action boundary. That means the obvious shape is:

1. HTTP action receives the request.
2. HTTP action calls a Node action.
3. Node action returns serialized data.
4. HTTP action builds the final response.

That shape breaks the normal RSC expectation that the server runtime itself owns
the render and can stream the Flight payload directly.

Even if a buffered non-streaming prototype were forced through, it would no
longer look like TanStack Start's supported RSC model.

## Feasibility Verdict

## Supported TanStack Start plus Convex plus Pages

I did not find a clean, documented setup that gives all of these at once:

- TanStack Start server components,
- Convex as the server rendering runtime,
- and a Cloudflare Pages deployment that avoids the Workers runtime tradeoff.

The main blockers are:

- React Flight server rendering needs the runtime to opt into the `react-server`
  condition.
- TanStack Start's RSC entrypoints rely on Vite virtual modules and Vite-owned
  runtime glue.
- Convex is documented here as the backend/data layer, not the Flight renderer.
- Pages Functions are still Workers, so they do not preserve a truly non-Workers
  request-time rendering model.

## Custom RSC-on-Convex hack

A custom RSC experiment might be possible with all of the following:

- a bespoke Convex HTTP endpoint,
- Node runtime condition changes for `react-server`,
- manual Flight serialization/deserialization,
- and a client-side integration that bypasses TanStack Start's normal server
  runtime assumptions.

That would be a research spike, not a supported setup, and it would add
significant maintenance risk to a codebase that already has an accepted Vite SPA
contract.

## Recommendation

For Noter specifically, the most honest paths are:

### Option A: stay on the current Vite SPA plus Convex plus Pages stack

Use Convex for backend logic and data, and keep the frontend static.

This matches the current specs and avoids introducing an unsupported framework
runtime split.

### Option B: adopt a Workers-based server runtime if real TanStack Start RSC is the goal

If the real goal is:

- server components,
- request-time rendering,
- TanStack Start server functions,
- and framework-native streaming,

then the clean direction is a Workers-backed deployment shape.

That can be Cloudflare Workers directly, or Pages Functions if the team accepts
that the runtime is still Workers underneath.

### Option C: explore RSC separately from Noter's main runtime contract

If the team wants to learn RSC without destabilizing this app, a separate spike
or throwaway example repo is a better place to do it than the main `apps/noter`
frontend.

## Bottom Line

Convex remains a strong fit as Noter's backend.

TanStack Start RSC remains interesting.

But "keep Cloudflare Pages static, keep Convex as backend, and move the React
server runtime into Convex" is not a clean supported combination based on the
docs and runtime behavior tested here.
