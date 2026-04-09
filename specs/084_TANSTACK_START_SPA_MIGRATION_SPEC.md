# TanStack Start SPA Migration

## Goal

Adopt TanStack Start for `apps/noter` while keeping the current app runtime
model intentionally conservative:

- Stay SPA-only at runtime for the first pass.
- Do not introduce server functions, server routes, or request-time auth work.
- Preserve the current landing-page fast path at `/`, where signed-out users can
  see the public landing/sign-in surface without eagerly rendering the
  authenticated dashboard branch.

## Why Now

The app has already completed the TanStack Router migration and now owns its
route tree through file-route modules. TanStack Start is the next framework step
if we want:

- a first-class TanStack Router framework runtime
- a root document route instead of a bespoke `index.html` shell
- SPA shell generation through Start's supported `/_shell.html` flow

## Non-Goals

- No SSR rollout in this slice.
- No hosting migration to Cloudflare Workers in this slice.
- No route-head rewrite in this slice. Existing runtime metadata hooks can stay
  in place until the Start shell is stable.
- No extra prerendered pages yet, even for static routes like `/privacy` and
  `/terms`, unless the migration proves the app can safely render those routes
  during Start prerender without reintroducing the old landing/dashboard issue.

## Current Constraints

### Landing + Dashboard Share `/`

The current `/` route uses `RootIndexRoutePage` to choose between:

- the signed-out public landing/sign-in surface
- the authenticated dashboard surface behind `ApprovalGate`

This split is intentionally client-driven today. A prior framework-mode attempt
caused trouble because the app's shared document/runtime shell and the mixed
landing/dashboard `/` behavior were not aligned cleanly.

The migration must preserve these invariants:

- Start's root shell must not force the authenticated dashboard path into the
  initial static shell.
- Signed-out visits to `/` must remain light and must not eagerly pull the heavy
  dashboard branch.
- We should prefer Start SPA mode's shell-only prerender over route-level
  prerender for `/` in the first pass.

### Providers Are Currently Outside The Router

Today the app mounts like this:

- `OptionalThemeProvider`
- `ConvexAuthProvider`
- `QueryProvider`
- `AppRouterProvider`

Start will own the router mount, so we need a new integration point for those
providers.

### Browser-Only Setup Still Exists

The app currently performs browser-only setup before mount, including
`ensureWindowStorageAccess("localStorage")`.

That work must stay client-only after the Start migration.

## First-Pass Plan

### 1. Move To Start's SPA Shell

- Replace the standalone router Vite plugin with TanStack Start's Vite plugin.
- Enable SPA mode so the build emits `/_shell.html`.
- Update redirects so unknown routes rewrite to `/_shell.html`.

### 2. Add Start's Required Entry Files

- Add `src/router.tsx` as the Start-owned router entry.
- Add `src/client.tsx` as a custom client entry so we can keep browser-only
  setup and the app provider stack.
- Replace the current root route file with `src/routes/__root.tsx` and move the
  document shell from `index.html` into that route.

### 3. Keep The Existing Router Semantics

Preserve these router behaviors:

- `defaultPreload: false`
- `notFoundMode: "root"`
- custom search parse/stringify functions
- root-route search validation and retained `devtools` query param behavior

### 4. Be Conservative About Prerendering

For the first Start pass:

- let SPA mode prerender only the root shell
- do not opt into extra static prerendered routes yet

This keeps the migration focused on Start's runtime shell and avoids build-time
rendering of route trees that still assume a client-only provider environment.

## Expected App Changes

- `apps/noter/vite.config.ts`
- `apps/noter/package.json`
- `apps/noter/src/router.tsx`
- `apps/noter/src/client.tsx`
- `apps/noter/src/routes/__root.tsx`
- `apps/noter/src/main.tsx` / `apps/noter/src/entry.tsx` /
  `apps/noter/src/lib/appRouter.ts`
- `apps/noter/src/test/TestRouterProvider.tsx`
- `apps/noter/index.html`
- `apps/noter/public/_redirects`

## Validation

At minimum, the migration must pass:

- `make anon`
- `pnpm --filter noter exec tsc --noEmit`
- focused router/layout tests
- `pnpm --filter noter run lint:ci`
- `pnpm --filter noter run build:ci`

Manual route sanity checks should cover:

- `/`
- `/privacy`
- `/terms`
- one authenticated route such as `/machines`

## Working Log

- Started the Start migration on top of `origin/main` after the earlier router
  migration had already been squashed/merged. Rebasing the old router branch
  produced add/add conflicts across the new route files, so the clean Start work
  restarted from a fresh `origin/main` branch instead of replaying duplicate
  history.
- Identified the main safety constraint up front: Start's root document route is
  the risky part, not the existing TanStack file routes. The first pass will use
  Start SPA mode without extra route prerendering so the `/` landing/dashboard
  split stays client-driven.
- Kept the current `src/routes.ts` virtual route manifest for the first Start
  pass. Start can consume the existing virtual route config, which let the
  framework migration stay focused on runtime shell ownership instead of forcing
  another round of filesystem route renames.
- Replaced `index.html` with `src/routes/__root.tsx` and moved the app provider
  stack under that Start root route. This preserved the current Router
  gesture-debug overlay, root search validation, and the document metadata that
  previously lived in the static HTML shell.
- Confirmed that the landing/dashboard split on `/` still behaves correctly in
  Start SPA mode. Signed-out visits to `/` do not eagerly request the
  authenticated dashboard modules, so the earlier framework-mode regression did
  not come back in this pass.
- Start's build worked without any extra experimental code-splitting flags in
  the current release. Route chunks are still emitted, so the migration keeps
  the config minimal instead of threading Start-only toggles through
  `vite.config.ts`.
- Vitest still boots against the repo's existing Vite test stack, so the Start
  plugin is skipped when `process.env.VITEST === "true"`. Tests keep using the
  checked-in generated route tree while dev/build use TanStack Start normally.
- Start prerender imports route-owned modules earlier than the old pure-client
  entry did, which exposed two browser-only assumptions: `convexClient.ts`
  needed a safe non-window origin path for server-like module evaluation, and
  `OptionalThemeProvider` needed to defer `next-themes` until after mount to
  avoid hydration mismatches from its injected script.
- Route tests still mount into detached DOM nodes instead of letting Start
  hydrate the whole document, so `__root.tsx` intentionally returns a fragment
  in test mode while keeping the real `<html>/<head>/<body>` shell for dev and
  build.
