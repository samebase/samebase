# No-JS Root Landing Specification

## Document Control

- Status: Accepted and in progress
- Owner: Noter frontend/public web
- Last updated: 2026-04-12
- Related files:
  - `apps/noter/index.html`
  - `apps/noter/public/_redirects`
  - `apps/noter/dev/staticRootLanding.ts`
  - `apps/noter/e2e/public-landing-no-js.spec.ts`
  - `apps/noter/lib/landingCopyContent.ts`
  - `apps/noter/src/SignInForm.tsx`
  - `apps/noter/src/components/LandingCopy.tsx`
  - `apps/noter/src/lib/landingCopy.ts`
  - `apps/noter/vite.config.ts`
  - `specs/061_FAST_PUBLIC_LANDING_BOOT_SPEC.md`
  - `specs/082_TANSTACK_ROUTER_CLEANUP_SPEC.md`

## Summary

noter should render a recognizable public landing page at `/` even when
JavaScript is blocked.

The intended shape is:

1. root hard loads receive a static landing document with visible branded
   content,
2. deep app routes keep using the existing SPA shell,
3. when JavaScript is available on `/`, the existing app still boots on top of
   the static landing,
4. no-JS-only placeholders should preserve layout for JS-only controls such as
   Google sign-in and the current waitlist flow.

This is intentionally a root-only public fallback, not a return to the old
fast-shell handoff path.

## Goals

1. Make `/` readable and branded with JavaScript disabled.
2. Keep the no-JS landing visually close to the current shipped landing.
3. Reuse the existing landing copy contract instead of forking the product
   message into a second source of truth.
4. Keep deep routes and authenticated app routes on the existing SPA shell.
5. Preserve room to tighten parity later if the ProseMark landing styling and
   plain HTML rendering converge further.

## Non-Goals

1. Reintroducing the old shell-first boot and handoff behavior.
2. Making the current Google sign-in flow work without JavaScript.
3. Making the current waitlist Convex mutation work without JavaScript in this
   first slice.
4. Moving the private app to a new public path such as `/app`.
5. Shipping full SSR or route-level React hydration in this slice.

## First Slice

The initial implementation should:

1. restore a static landing-copy renderer for plain HTML,
2. generate a built root `index.html` that contains visible landing markup
   inside `#root`,
3. preserve the existing built app shell as `app.html`,
4. update Cloudflare rewrites so non-root routes still resolve to `app.html`,
5. render a same-footprint Google placeholder that explicitly says JavaScript is
   required,
6. render a no-JS waitlist placeholder instead of a fake working form,
7. add direct tests for the generated static landing HTML.

## Implemented Initial Slice

The current branch implements the first slice with a build-time root/app split:

1. `apps/noter/vite.config.ts` now preserves the original built SPA shell as
   `dist/app.html`, then rewrites `dist/index.html` into a root-only static
   landing document after the normal build completes.
2. `apps/noter/dev/staticRootLanding.ts` generates the root fallback by
   injecting visible landing markup into the built `#root` placeholder while
   keeping the normal app scripts in place for later boot.
3. `apps/noter/public/_redirects` now keeps `/` on `index.html` and sends
   non-root SPA paths to `app.html`.
4. `apps/noter/lib/landingCopyContent.ts` now owns the shared landing copy
   contract so the routed landing and the static build step can reuse the same
   slogan-and-bullets source.
5. The root static landing now shows an explicit no-JS Google placeholder, a
   disabled waitlist row, and a no-JS hint instead of pretending either flow
   works without JavaScript.
6. A tiny inline script swaps the no-JS Google message for a same-footprint
   inert JS placeholder as soon as scripts run, which avoids collapsing the row
   before React hydrates the routed landing.
7. The routed landing and build-time fallback now use the same stable slogan
   selection seed for a given build so the headline does not jump during boot.

## Implementation Notes

- The static landing should prefer the same class hooks already used by the
  landing surface so styling drift stays bounded.
- The fallback copy should be visible semantic HTML, not `sr-only` content.
- The root static page may still include the normal app assets so the SPA can
  boot when JavaScript is available.
- The static fallback should fail closed to plain non-interactive placeholders
  instead of pretending the auth or waitlist actions work.

## Validation

The current branch has local coverage for:

1. shared landing copy parsing and static HTML generation through
   `apps/noter/src/lib/landingCopy.test.ts` and
   `apps/noter/dev/staticRootLanding.test.ts`,
2. a production-build verification through `pnpm --dir apps/noter run build:ci`,
3. a JS-disabled root landing browser check in
   `apps/noter/e2e/public-landing-no-js.spec.ts`.

## Follow-Up Work

1. Decide whether the waitlist should gain a real no-JS submission path.
2. Decide whether the Google row should eventually link to a server-started
   OAuth entrypoint instead of a placeholder.
3. Tighten parity checks between the static landing renderer and the routed
   landing surface after the first root-only fallback is stable.

## Acceptance Criteria

1. A hard load of `/` renders recognizable noter landing content even if
   JavaScript does not execute.
2. Hard loads of non-root routes still resolve to the SPA shell.
3. The root no-JS landing remains visually close to the shipped routed landing.
4. The static landing explicitly communicates when an action requires
   JavaScript.
