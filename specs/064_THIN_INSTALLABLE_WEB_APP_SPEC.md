# Thin Installable Web App Specification

## Document Control

- Status: Accepted and implemented
- Owner: Noter frontend
- Last updated: 2026-03-25
- Related files: `specs/061_FAST_PUBLIC_LANDING_BOOT_SPEC.md`,
  `specs/061_USER_LOGO_STATIC_SVG_DELIVERY_SPEC.md`, `apps/noter/index.html`,
  `apps/noter/public/_redirects`, `apps/noter/public/favicon.png`,
  `apps/noter/public/favicon-32.png`, `apps/noter/public/install-icon.svg`,
  `apps/noter/public/logo-static.svg`,
  `apps/noter/scripts/generate-install-icon-assets.mjs`,
  `apps/noter/src/bootstrap.ts`, `apps/noter/src/main.tsx`,
  `apps/noter/src/components/logoStaticSvgAsset.ts`,
  `apps/noter/src/lib/staticLegalPage.ts`, `apps/noter/vite.config.ts`

## Summary

noter should remain installable from mobile browsers, but that installability
must be as thin as possible:

1. Ship a static web app manifest and explicit install icons.
2. Keep small favicons for normal browser chrome.
3. Do not ship a service worker, Workbox runtime, or offline cache.
4. Do not reintroduce a PWA plugin that couples install metadata to aggressive
   caching.

The install path should improve homescreen behavior without changing the normal
browser refresh model.

## Problem Context

- `apps/noter/index.html` and the generated public legal HTML pages currently
  link only `16x16` and `32x32` favicons.
- The public site currently exposes no manifest link and no Apple touch icon on
  `/`, `/privacy`, or `/terms`.
- Production `/manifest.webmanifest` still resolves to the SPA HTML fallback
  instead of a real manifest asset.
- [#245](https://github.com/noter-md/noter/pull/245) removed `vite-plugin-pwa`
  and `registerSW`. That removed the stale-cache path, but it also removed the
  only manifest-generation path.
- [#262](https://github.com/noter-md/noter/pull/262) refined the small favicon
  assets for browser chrome, but that did not restore dedicated install
  metadata.
- [#281](https://github.com/noter-md/noter/pull/281) made the generated
  `logo-static.svg` path the current public logo source of truth, while this
  spec still points at the older `lumina_icon.png` asset as the default install
  icon source.
- [#310](https://github.com/noter-md/noter/pull/310) added crawlable public
  `/privacy` and `/terms` pages, so the public HTML surface is no longer just
  `index.html`.
- Result: browser tabs can still show a correct favicon while Add to Home Screen
  can create a plain shortcut and choose an unexpected icon or stale fallback.

## External Research Summary

- Chrome's current install guidance no longer requires a service worker for
  menu-based install flows. Install metadata and runtime caching do not need to
  be coupled.
- Chromium still recommends explicit manifest fields for the best installed
  experience, especially `name`/`short_name`, `icons`, `start_url`, and
  `display`, plus at least `192x192` and `512x512` icons and preferably a
  maskable icon.
- The manifest remains the standard way to declare install name, start URL,
  display mode, and install icons, and current guidance is to link it from all
  pages of the PWA.
- iOS homescreen install flows still require explicit install-focused metadata,
  and Apple still expects an explicit `apple-touch-icon` for reliable homescreen
  icons.
- If explicit install metadata is missing or unavailable, browsers may fall back
  to shortcut-like behavior and choose icons heuristically.
- Current iOS guidance explicitly warns against relying on deprecated Apple
  standalone meta tags as the install fallback when the manifest cannot be
  loaded.

References:

- [Chrome install criteria update](https://developer.chrome.com/blog/update-install-criteria)
- [web.dev manifest guidance](https://web.dev/articles/add-manifest)
- [web.dev iOS/PWA enhancement notes](https://web.dev/learn/pwa/enhancements/)
- [Apple web application icon guidance](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)

## Goals

- Restore mobile installability without reintroducing stale deploy behavior.
- Ensure Add to Home Screen uses explicit noter brand assets instead of browser
  heuristics.
- Keep the browser-first refresh model simple and reliable.
- Make install metadata auditable in repo files rather than hidden in plugin
  transforms.

## Non-Goals

- Offline support.
- Background sync or push notifications.
- A service worker.
- Workbox or `vite-plugin-pwa`.
- Splash screens, screenshot galleries, install shortcuts, or richer PWA polish
  beyond minimal installability.
- Custom install-prompt UI or `beforeinstallprompt` handling in this slice.
- Deprecated Apple standalone meta-tag fallbacks such as
  `apple-mobile-web-app-capable`.
- Treating installed-app behavior as more important than the normal browser
  experience.

## Decision

### 1. Decouple installability from caching

noter shall treat installability metadata and runtime caching as separate
concerns.

- Installability comes from a static manifest file and explicit install icons.
- Caching remains ordinary browser/network behavior for the deployed SPA.
- No service worker may be added as part of this implementation.

### 2. Static manifest contract

Add a committed `apps/noter/public/manifest.webmanifest`.

The manifest shall contain only the minimal fields needed for stable install
behavior:

- `id: "/"`
- `name: "noter"`
- `short_name: "noter"`
- `start_url: "/"`
- `scope: "/"`
- `display: "standalone"`
- `theme_color`
- `background_color`
- `icons` with explicit raster install icons, including `purpose: "any"` and
  `purpose: "any maskable"` coverage

The manifest must be linked directly from `apps/noter/index.html`. It must not
be generated by a build plugin.

### 3. Install icon contract

noter shall maintain two icon layers:

- Browser chrome icons: small favicon assets for tabs/address bar.
- Install icons: dedicated larger icons for homescreen and installed-app
  surfaces.

Requirements:

- do not reuse only the `16x16` and `32x32` favicon set for install surfaces
- provide at least `192x192` and `512x512` PNG manifest icons
- provide a dedicated maskable icon variant for Android; the current centered
  transparent logo mark needs deliberate background/padding treatment rather
  than launcher heuristics
- provide an Apple touch icon for iOS homescreen install flows
- derive all install icons from the current public logo source of truth
- render install icons on a white canvas while preserving the white-mode logo
  face colors

Initial default:

- use `apps/noter/public/logo-static.svg` together with
  `apps/noter/src/components/logoStaticSvgAsset.ts` as the canonical public-logo
  source for install icon exports
- treat `apps/noter/public/lumina_icon.png` as a legacy asset, not as the
  default source of truth for new install metadata
- committed PNG install icons may be generated from the repo-owned static logo
  source, but the served install assets must still be explicit committed files

### 4. Public HTML metadata contract

`apps/noter/index.html` shall keep the small favicon links and add:

- a manifest link
- an Apple touch icon link
- the existing theme-color meta

Generated public HTML pages that are real unauthenticated entry points
(`apps/noter/src/lib/staticLegalPage.ts`, currently `/privacy` and `/terms`)
shall mirror the same manifest and Apple touch icon links so installability does
not depend on which public page is open when the user reaches browser install
UI.

The manifest `start_url` remains `/` even when install is triggered from a legal
page, so installed launches enter the main app surface instead of a document
page.

No service worker registration script or plugin-generated install metadata may
be introduced.

### 5. Hosting contract

Production must serve the manifest as a real static asset, not as SPA HTML
fallback.

Requirements:

- `/manifest.webmanifest` returns `application/manifest+json` or another JSON
  content type, not `text/html`
- explicit manifest/icon asset routes win over the catch-all SPA fallback in
  `apps/noter/public/_redirects`
- install icon URLs return the committed image assets
- Apple touch icon URLs return the committed image asset
- the install path works without changing the normal browser refresh behavior

### 6. Caching constraints

This feature must not reintroduce the stale-content problems removed with
[#245](https://github.com/noter-md/noter/pull/245).

Constraints:

- no service worker file
- no `registerSW`
- no `vite-plugin-pwa`
- no Workbox runtime
- no app-shell cache
- no offline cache
- no manual cache-clearing step required to get the latest deployed app in a
  normal browser tab

Hashed JS/CSS asset caching from the regular build is acceptable. Runtime data
or HTML freshness problems are not.

## Browser Behavior Notes

- A correct tab favicon does not guarantee a correct install icon.
- Browsers may ignore favicons for homescreen install and instead use manifest
  icons, Apple touch icons, screenshots, or other heuristics.
- If explicit install metadata is missing, the result may look like a plain
  shortcut rather than an installed app.
- Existing installed shortcuts or web apps may keep stale icon state until they
  are removed and re-added. That platform behavior is acceptable; fresh installs
  still must use the current explicit metadata.

## Validation

### Automated

- `apps/noter/index.html` contains manifest and Apple touch icon links.
- generated public legal HTML contains the same manifest and Apple touch icon
  links.
- `manifest.webmanifest` is committed and parseable.
- Local preview and production serve `/manifest.webmanifest` as a manifest JSON
  asset, not HTML.
- Local preview and production serve install icon and Apple touch icon URLs as
  image assets, not HTML.
- No service worker registration or PWA plugin dependency exists in the app
  entry/build config.

### Manual mobile checks

- Chrome on Android: Add to Home Screen or Install uses the explicit install
  icon and opens in standalone mode.
- Safari on iOS: Add to Home Screen uses the Apple touch icon and launches as a
  standalone web app rather than a plain browser bookmark.
- Normal browser refresh on desktop and mobile does not require clearing site
  data to receive the latest deploy.

## Acceptance Criteria

- noter remains browser-first and refresh-safe.
- Install metadata reflects current lowercase `noter` branding and the current
  public logo source of truth.
- Mobile install uses explicit brand icon assets rather than fallback
  heuristics.
- The thin install path works without a service worker.
- Removing site data is not needed to see new deployments in a normal browser
  session.
- `index.html`, the manifest, and install icons are all plain repo files that
  can be reviewed directly.

## Historical Context

- [#245](https://github.com/noter-md/noter/pull/245) removed caching and
  accidentally removed install metadata in the same step.
- [#262](https://github.com/noter-md/noter/pull/262) improved the small
  browser-favicon assets but did not restore dedicated install metadata.
- [#281](https://github.com/noter-md/noter/pull/281) made the generated
  `logo-static.svg` path the public logo source of truth.
- [#310](https://github.com/noter-md/noter/pull/310) added crawlable public
  legal pages, which expanded the set of public HTML documents that can surface
  install UI.

This spec keeps the cache removal and restores only the thin install pieces.
