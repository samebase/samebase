# Public OAuth Signup Closed State Specification

## Document Control

- Status: Implemented
- Owner: Samebase auth/frontend
- Last updated: 2026-08-08

## Summary

When a cold public landing visitor starts Google or GitHub auth from `/` and returns still
unauthenticated, Samebase should show a dedicated signup-closed landing state instead of silently
dropping the user back onto the default landing page.

## Goals

- Make public OAuth signup failures legible on the landing page.
- Reuse the existing waitlist form instead of inventing a second signup flow.
- Keep the copy minimal and action-oriented.
- Avoid carrying raw email addresses in query params or other client-visible transport.

## Non-Goals

- Prefilling the waitlist form from the provider profile email.
- Distinguishing allowlist denial from every other unauthenticated OAuth return case in this first
  version.
- Reworking the post-authenticated approval gate.

## Required Behavior

1. Every public landing Google or GitHub auth entrypoint, including the iframe popup fallback, must
   mark its OAuth `redirectTo` with an app-owned signup-return flag.
2. If that OAuth round-trip returns to `/` without producing an authenticated session, the landing
   page must render a signup-closed state.
3. The signup-closed state must hide Google, GitHub, and password auth controls and keep only the
   minimal notice plus the waitlist form.
4. Successful authentication must clear the signup-return flag so it does not survive into later
   signed-out sessions. Public Google or GitHub sign-in from `/` must use `/vault` as the provider
   return route and clear its `signup=<provider>` marker after a successful authenticated return.
   Direct authenticated visits to `/` must continue rendering the public landing route.
5. The first version must not put the raw email address into the URL.

## Acceptance Criteria

- [x] Cold public landing visitors who fail to complete OAuth signup do not silently return to the
      default landing state.
- [x] The signup-closed state keeps the waitlist form available.
- [x] The signup-closed state does not expose auth controls.
- [x] Successful Google or GitHub sign-in clears the signup-return marker.
- [x] Successful public Google or GitHub sign-in completion returns to `/vault` instead of leaving
      the signed-in user on the public landing route.
- [x] Direct authenticated visits to `/` still render the public landing route.
- [x] Iframe-based OAuth preserves the signup-return marker through the popup bootstrap flow.
- [x] No raw provider email address is put into a URL query param.
