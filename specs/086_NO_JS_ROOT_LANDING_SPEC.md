# No-JS Root Landing Specification

## Document Control

- Status: Proposed
- Owner: Noter frontend/public web
- Last updated: 2026-04-12
- Related files:
  - `apps/noter/index.html`
  - `apps/noter/public/_redirects`
  - `apps/noter/src/SignInForm.tsx`
  - `apps/noter/src/components/LandingCopy.tsx`
  - `apps/noter/src/lib/landingCopy.ts`
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

## Implementation Notes

- The static landing should prefer the same class hooks already used by the
  landing surface so styling drift stays bounded.
- The fallback copy should be visible semantic HTML, not `sr-only` content.
- The root static page may still include the normal app assets so the SPA can
  boot when JavaScript is available.
- The static fallback should fail closed to plain non-interactive placeholders
  instead of pretending the auth or waitlist actions work.

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
