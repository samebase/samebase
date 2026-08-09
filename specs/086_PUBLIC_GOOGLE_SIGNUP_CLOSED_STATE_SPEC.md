# Public OAuth Signup Closed State Specification

## Document Control

- Status: Implemented
- Owner: Samebase auth/frontend
- Last updated: 2026-08-08

## Summary

When a cold public landing visitor starts Google or GitHub auth from `/` and returns still
unauthenticated, Samebase should show a dedicated signup-closed landing state instead of silently
dropping the user back onto the default landing page. A recognized, safe authorization error takes
priority over this generic state.

## Goals

- Make public OAuth signup failures legible on the landing page.
- Reuse the existing waitlist form instead of inventing a second signup flow.
- Keep the copy minimal and action-oriented.
- Avoid carrying raw email addresses in query params or other client-visible transport.

## Non-Goals

- Prefilling the waitlist form from the provider profile email.
- Defining account-linking error semantics, which belong to
  `specs/122_ACCOUNT_SIGN_IN_METHODS_SPEC.md`.
- Reworking the post-authenticated approval gate.

## Required Behavior

1. Every public landing Google or GitHub auth entrypoint, including the iframe popup fallback, must
   mark its OAuth `redirectTo` with an app-owned signup-return flag.
2. If that OAuth round-trip returns to `/` without producing an authenticated session, the landing
   page must render a signup-closed state unless the return contains a recognized, safe
   `authorization-error`.
3. The signup-closed state must hide Google, GitHub, and password auth controls and keep only the
   minimal notice plus the waitlist form. A recognized authorization error, such as
   `account-link-required`, must instead show its actionable guidance and the sign-in controls. Spec
   122 defines that error behavior.
4. Public Google or GitHub sign-in from `/` must use `/` as the provider return route and keep an
   `auth-return=dashboard` marker. A failed return stays on `/` so the landing page can show its
   notice. A successful authenticated return consumes the marker and navigates to `/vault`. Direct
   authenticated visits to `/` must continue rendering the public landing route.
5. The first version must not put the raw email address into the URL.

## Acceptance Criteria

- [x] Cold public landing visitors who fail to complete OAuth signup do not silently return to the
      default landing state.
- [x] The signup-closed state keeps the waitlist form available.
- [x] The signup-closed state does not expose auth controls.
- [x] A recognized authorization error takes priority over the signup-closed state and keeps the
      sign-in controls available.
- [x] Successful Google or GitHub sign-in clears the signup-return marker.
- [x] Public Google or GitHub OAuth returns to `/`, then successful authentication navigates to
      `/vault`.
- [x] Direct authenticated visits to `/` still render the public landing route.
- [x] Iframe-based OAuth preserves the signup-return marker through the popup bootstrap flow.
- [x] No raw provider email address is put into a URL query param.
