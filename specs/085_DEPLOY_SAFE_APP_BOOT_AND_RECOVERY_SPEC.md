# Deploy-Safe App Boot And Recovery Specification

## Document Control

- Status: Accepted and implemented
- Owner: Noter frontend
- Last updated: 2026-04-12
- Related files: `specs/064_THIN_INSTALLABLE_WEB_APP_SPEC.md`, `apps/noter/src/main.tsx`,
  `apps/noter/src/components/AppBootErrorBoundary.tsx`,
  `apps/noter/src/components/AppBootFailureState.tsx`, `apps/noter/src/lib/appBootRecovery.ts`,
  `apps/noter/src/lib/appBuildMetadata.ts`, `apps/noter/src/lib/convexQueryCache.ts`,
  `apps/noter/src/lib/convexQueryCacheStorage.ts`, `apps/noter/src/lib/storageAccess.ts`,
  `apps/noter/src/routes/root.tsx`

## Summary

noter must not strand mobile users on a white screen after a deploy.

The accepted contract is:

1. The app should tolerate normal deploy transitions, including tabs that were already open before
   the new deploy finished.
2. Thin installability remains allowed, but install metadata must not re-couple the app to
   service-worker or app-shell caching.
3. If the browser loads stale code or stale local app state anyway, noter must recover in-app
   instead of leaving the user with a blank page.
4. Cloudflare cache purge and manual browser site-data clearing are emergency tools, not the normal
   recovery path.

## Problem Context

- Mobile browser sessions have repeatedly reached a fully white screen after a squash/deploy while
  incognito still worked.
- Chrome on mobile sometimes surfaced a browser-level "delete and reset data" affordance before the
  app recovered, which indicates persisted origin state was involved.
- The current app is installable from mobile browsers through a thin manifest path, so an installed
  shortcut or standalone launch surface can keep older browser state around longer than a fresh
  incognito tab.
- noter does not currently ship a service worker, so the likely failure mode is not a Workbox-style
  offline shell. The more likely causes are:
  - an already-open shell referencing old code-split chunks after a deploy
  - persisted browser state from an older build
  - app-owned IndexedDB/local storage state that no longer matches the current UI assumptions
- A white screen with no visible reset path is unacceptable even if the root cause is browser
  caching rather than server availability.

## Goals

- Prevent deploy transitions from causing unrecoverable white screens in normal browser and
  installed-web-app sessions.
- Keep thin installability without reintroducing service-worker or app-shell caching.
- Give the user an explicit in-app recovery path when startup fails.
- Keep the default operational fix app-side rather than requiring Cloudflare purge or support
  intervention.
- Bound stale local query cache reads to the build that wrote them.

## Non-Goals

- Adding offline support.
- Adding a service worker, Workbox, or `vite-plugin-pwa`.
- Making Cloudflare purge part of the normal deploy checklist.
- Clearing all site data on every deploy.
- Hiding every possible startup error behind automatic retries with no user visibility.

## Accepted Behavior Contract

### 1. Treat stale deploy assets as a first-class boot failure mode

noter shall explicitly recognize stale dynamic-import failures during app boot.

Examples include:

- Vite `vite:preloadError`
- stale dynamic import failures such as "Failed to fetch dynamically imported module"
- chunk load failures caused by a tab running older HTML/JS while the deploy has already replaced
  the old hashed asset files

This failure mode is expected in long-lived browser tabs and should be handled as a normal
deploy-transition edge case, not as an exotic browser bug.

### 2. Auto-recover once from stale deploy assets

When noter detects a likely stale-asset boot failure, it shall:

1. prevent the default uncaught boot failure path
2. force one reload with a cache-busting query param
3. avoid infinite reload loops by remembering that the current build already attempted automatic
   recovery in this session

One automatic retry is acceptable. Infinite retry loops are not.

### 3. Provide a visible in-app recovery surface

If app boot still fails, noter shall render a recovery UI instead of a blank screen.

That recovery UI must include:

- a reload action
- a reset-local-data action
- a short explanation that local browser data may be stale
- the current app build identifier
- the captured startup error when available

The recovery UI is a product requirement, not just a local debugging aid.

### 4. Reset-local-data means app-owned browser storage, not operator rituals

The in-app reset action shall clear the local browser state that noter can safely own from the
current origin, including:

- local storage
- session storage
- IndexedDB state
- Cache Storage entries
- any registered service workers if they exist in the browser

After clearing, noter shall reload immediately.

This reset path may sign the user out. That is acceptable when the alternative is a stuck white
screen.

### 5. Scope query-cache state to the current build

App-owned persisted query cache reads shall be namespaced by the shipped build identifier, not
shared forever across deploys.

This means:

- a newer build must not hydrate from a previous build's cached query namespace
- stale local query payloads from an older UI must not be able to crash a newer UI before fresh data
  arrives
- the query-cache database name may stay stable, but the logical cache key namespace must include
  the current build identity

### 6. Thin installability remains separate from caching

This spec does not change the thin installable web app decision from
`specs/064_THIN_INSTALLABLE_WEB_APP_SPEC.md`.

The accepted install/caching boundary remains:

- installable manifest and icons are allowed
- no service worker is required for installability
- no app-shell cache may be introduced to "fix" deploy safety
- installed web-app launches must obey the same deploy-safety contract as ordinary browser tabs

### 7. Cloudflare is not the primary recovery mechanism

Cloudflare may still cache static assets according to ordinary hosting rules, but noter shall not
rely on Cloudflare purge as the standard way to recover from deploy-time white screens.

Operational guidance:

- do not make "purge everything" part of normal deploy flow for this problem
- use Cloudflare purge only when there is evidence the edge is actually serving the wrong content
- prefer fixing stale-browser recovery in the app itself first

### 8. Clear-Site-Data is a targeted tool, not the deploy default

`Clear-Site-Data` may be added later for a dedicated recovery endpoint or other explicit
operator-triggered reset flow.

It is not the default answer for every deploy because:

- it would clear more state than normal users should lose on every rollout
- it would sign users out and remove useful local state indiscriminately
- the app should already recover from the common stale-shell path without it

If noter ever adds `Clear-Site-Data`, the preferred initial scope is targeted clearing such as
`"cache", "storage"` on an explicit recovery response, not a blanket deploy-wide header on normal
app HTML.

## Validation

### Automated

- The boot path registers stale-asset recovery before rendering the app tree.
- The app boot tree is wrapped in a top-level error boundary that renders a recovery UI.
- The recovery helpers have direct tests for stale-asset detection and cache-busting reload URL
  handling.
- The recovery UI has direct tests for stale-asset and generic-startup failure rendering.
- App query-cache keys include a build-scoped namespace.
- `pnpm --dir apps/noter exec tsgo --noEmit` passes.

### Manual

- Open noter in a normal mobile browser session, keep the tab around through a new deploy, and
  confirm the app either recovers automatically or shows the recovery UI instead of staying white.
- Confirm incognito still boots cleanly.
- Confirm installed-web-app launches behave the same as normal browser tabs for deploy recovery.
- Confirm the reset-local-data action gets the user unstuck without requiring a browser settings
  hunt.

## Acceptance Criteria

- noter no longer fails closed to a blank white screen for the common stale deploy-shell path.
- A stale chunk or stale dynamic import during boot triggers at most one automatic recovery reload.
- If automatic recovery is insufficient, the user sees an explicit recovery UI with reload and
  reset-local-data actions.
- App-owned persisted query cache state from one build is not reused by a later build.
- Thin installability remains intact without adding a service worker.
- Operators do not need to treat Cloudflare purge as the default fix for this issue class.
- The product has a durable source-of-truth spec for this behavior instead of relying on code
  comments or chat context alone.
