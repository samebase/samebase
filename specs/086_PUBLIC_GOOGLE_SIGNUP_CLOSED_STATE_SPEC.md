# Public Google Signup Closed State Specification

## Document Control

- Status: Implemented
- Owner: Noter auth/frontend
- Last updated: 2026-04-15

## Summary

When a cold public landing visitor starts Google auth from `/` and returns still
unauthenticated, Noter should show a dedicated signup-closed landing state
instead of silently dropping the user back onto the default landing page.

## Goals

- Make public Google signup failures legible on the landing page.
- Reuse the existing waitlist form instead of inventing a second signup flow.
- Keep the copy minimal and action-oriented.
- Avoid carrying raw email addresses in query params or other client-visible
  transport.

## Non-Goals

- Prefilling the waitlist form from the Google profile email.
- Distinguishing allowlist denial from every other unauthenticated Google return
  case in this first version.
- Reworking the post-authenticated approval gate.

## Required Behavior

1. The public landing Google button must mark its OAuth `redirectTo` with an
   app-owned signup-return flag.
2. If that OAuth round-trip returns to `/` without producing an authenticated
   session, the landing page must render a signup-closed state.
3. The signup-closed state must hide Google and password auth controls and keep
   only the minimal notice plus the waitlist form.
4. Successful authentication must clear the signup-return flag so it does not
   survive into later signed-out sessions.
5. The first version must not put the raw email address into the URL.

## Acceptance Criteria

- [x] Cold public landing visitors who fail to complete Google signup do not
      silently return to the default landing state.
- [x] The signup-closed state keeps the waitlist form available.
- [x] The signup-closed state does not expose auth controls.
- [x] Successful Google sign-in clears the signup-return marker.
- [x] No raw Google email address is put into a URL query param.
