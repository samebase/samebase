# Fast Public Landing Specification

## Document Control

- Status: Implemented
- Owner: Noter frontend
- Last updated: 2026-04-07
- Related files: `apps/noter/react-router.config.ts`, `apps/noter/src/root.tsx`,
  `apps/noter/src/routes.ts`, `apps/noter/src/home.tsx`,
  `apps/noter/src/catchall.tsx`, `apps/noter/src/App.tsx`,
  `apps/noter/src/SignInForm.tsx`, `apps/noter/src/authClient.ts`,
  `apps/noter/src/lib/landingCopy.ts`, `apps/noter/src/lib/pageMetadata.ts`,
  `apps/noter/src/lib/publicLandingAuthState.ts`, `apps/noter/public/_redirects`

## Summary

The public landing route should feel fast before the full Noter app finishes
hydrating.

The implemented design now does that through React Router framework prerendering
instead of a handwritten bootstrap script:

1. build `/` as real landing HTML at build time
2. hydrate into the same React + Convex app runtime
3. keep landing variants and auth handoff inside the normal route tree

This is a pre-rendered SPA landing route, not per-request SSR and not a second
Cloudflare-only product surface.

## Goals

- Make plain `/` visibly useful before hydration completes.
- Preserve the existing full-app behavior after hydration without creating a
  second frontend runtime.
- Keep `/?dev` available for editable landing-copy work.
- Preserve Google auth behavior, including popup and top-level flows.
- Reduce split-brain boot complexity in the public landing path.
- Keep the existing operator-facing dev/build workflows intact.

## Non-Goals

- Runtime SSR on every request.
- A Cloudflare-only static landing page in this iteration.
- Moving the main app to `/app`.
- Reintroducing a separate bootstrap script just for `/`.
- Replacing the existing Convex-backed app auth flow.
- Solving every remaining large chunk in authenticated routes.

## Implemented Design

### Framework-owned landing route

- `apps/noter/react-router.config.ts` runs in SPA mode with `ssr: false` and
  `prerender: ["/"]`.
- `apps/noter/src/routes.ts` gives `/` a real framework index route through
  `apps/noter/src/home.tsx`.
- `apps/noter/src/home.tsx` and `apps/noter/src/catchall.tsx` still bridge into
  `App.tsx` while the remaining route tree is migrated incrementally.

### Build-time landing HTML

- `react-router build` emits `build/client/index.html` as the real prerendered
  homepage.
- The build also emits `build/client/__spa-fallback.html` for the rest of the
  SPA surface.
- `apps/noter/public/_redirects` points the catch-all fallback at
  `__spa-fallback.html` so the prerendered homepage is not reused as the generic
  fallback document.

### Framework document and provider ownership

- `apps/noter/src/root.tsx` now owns the document shell, favicon and manifest
  links, social metadata defaults, structured data, global CSS, and the app's
  provider stack.
- The legacy entry split is gone:
  - `apps/noter/index.html` deleted
  - `apps/noter/src/bootstrap.ts` deleted
  - `apps/noter/src/main.tsx` deleted
  - `apps/noter/src/lib/fastLandingBoot.ts` deleted

### Landing rendering rules

- Plain `/` prerenders the same React landing content that hydrates later,
  instead of string HTML rendered outside React.
- `/?dev` and `/?prod-ui` continue to work through the normal React landing
  route behavior in `SignInForm.tsx`.
- The landing path no longer depends on handwritten DOM listeners or a delayed
  import handoff to the real app.

### Auth and route ownership

- `App.tsx` still owns post-hydration auth branching and most live route
  matching while the rest of the migration proceeds.
- Google sign-in, popup auth, waitlist entry, and landing copy behavior stay
  inside the normal React app and existing Convex Auth flows.
- The public landing route no longer requires a bootstrap-only shell path to
  reach those behaviors.

### Authenticated chunking

- The biggest authenticated-only surfaces remain lazily imported from `App.tsx`.
- The landing route is now fast because `/` is prerendered by the framework, not
  because a separate script stages a temporary shell before importing the app.

## Validation

### Build validation

The implementation must continue to pass:

- `pnpm --filter noter build:ci`

Expected build outputs:

- `build/client/index.html`
- `build/client/__spa-fallback.html`

### Local preview validation

The implementation must continue to boot through the normal operator path:

- `make anon`

The resulting preview should serve `/` successfully and expose the prerendered
landing markup before hydration.

## Acceptance Criteria

- Plain `/` is emitted as build-time HTML by the framework build.
- The public landing route no longer depends on `index.html`, `bootstrap.ts`,
  `main.tsx`, or a delayed app import handoff.
- `/?prod-ui` keeps the prod-like landing path and suppresses dev-only auth and
  editable landing-copy affordances.
- `/?dev` continues to use the editable landing-copy path.
- Existing operator-facing dev/build workflows continue to work.
- Unmatched routes fall through the SPA fallback document instead of the
  prerendered homepage.

## Deferred Follow-Ups

- Migrate the remaining live routes out of `App.tsx` so `home.tsx` and
  `catchall.tsx` can disappear.
- Move route-local metadata closer to route modules and shrink the central
  pathname switchboard.
- Further split very large authenticated chunks, especially `FileView`.
