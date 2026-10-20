# Public OAuth Return Notice Specification

## Document Control

- Status: Implemented
- Owner: Samebase auth/frontend
- Last updated: 2026-10-20
- Related specs:
  - `specs/018_AUTH_APPROVAL_BOUNDARY_SPEC.md`
  - `specs/122_ACCOUNT_SIGN_IN_METHODS_SPEC.md`

## Current Contract

Samebase supports self-service OAuth signup. When a visitor starts Google or GitHub authentication
and returns without an authenticated session, Samebase shows an OAuth return notice instead of
silently returning to the default landing state.

The generic notice means only that sign-in was not completed. It must not say that signup is closed,
that Samebase is internal or private, or that access needs manual approval. A recognized, safe
authorization error takes priority and shows its specific guidance.

## Required Behavior

1. Every public landing Google or GitHub auth entrypoint must mark its OAuth `redirectTo` with the
   app-owned `signup` return marker.
2. If the OAuth round-trip returns without an authenticated session, the app must show the OAuth
   return notice on public and protected routes. The MCP consent route and organization invitation
   routes must ignore a stale marker and keep their own authentication flow.
3. The OAuth return notice must say `Sign-in was not completed.` and provide one `Try again` link to
   `/`. It must hide Google, GitHub, and password auth controls until the user follows that link.
4. A recognized authorization error, or a sign-in that Samebase rejected with a message (Convex Auth
   reports it as a `REJECTED` flow error), must replace the generic notice with actionable guidance
   and keep the sign-in controls available. Spec 122 defines the sign-in rejections.
5. Public Google or GitHub authentication from `/` must keep `auth-return=dashboard`. A successful
   authenticated return consumes the marker and navigates to `/repo`. A direct authenticated visit
   to `/` continues to render the public landing route.
6. The return marker and authorization error transport must not put a raw email address in the URL.

## Non-Goals

- Guessing whether the user canceled, the provider rejected the request, or the callback failed.
- Defining account-linking error semantics.
- Defining pending-account access. Spec 018 owns that state.

## Validation

- The public landing state tests cover marked returns, route exceptions, and authorization-error
  priority.
- The account-section component tests cover the notice text, retry link, and hidden auth controls.
- The protected-route visual test owns the rendered right-sidebar state.
