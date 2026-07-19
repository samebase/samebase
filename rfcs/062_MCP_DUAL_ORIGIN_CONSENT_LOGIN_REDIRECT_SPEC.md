# 062 MCP Dual-Origin Consent Login Redirect Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-06-06
- Related specs:
  - `specs/012_DEV_ENV_ORIGIN_SITE_URL_SYNC_SPEC.md`
  - `rfcs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md`
  - `rfcs/044_CLOUDFLARE_MCP_AUTO_TOKEN_REFRESH_SPEC.md`

## Summary

Fix the MCP OAuth login handoff now that the public MCP/OAuth origin and the React app origin are
intentionally split:

1. MCP and OAuth protocol endpoints are now served from `https://api.noter.md`.
2. Browser login and consent UI are served from `https://noter.md`.
3. When an unauthenticated user is redirected to
   `/oauth/mcp/consent?mcp_consent_request=...&mcp_login_required=1`, Google sign-in must return the
   browser to that exact consent URL instead of the default `SITE_URL` root.

Without explicit return-path preservation, the user lands on the public landing page after Google
auth, the MCP consent request id is lost from the URL, and Codex cannot complete the connection
flow.

## Why This Spec Exists

Clicking `Authenticate` for the Noter MCP server in Codex now sends the browser to a consent URL
like:

`https://noter.md/oauth/mcp/consent?mcp_consent_request=<id>&mcp_login_required=1`

That is the correct UI destination. The regression happens on the next step: the unauthenticated
consent screen uses the standard Google sign-in flow, and that flow currently defaults back to
`SITE_URL` instead of the current consent route.

## Current State Research

### Production shape after domain change

1. The verified public API/MCP origin is now `https://api.noter.md`.
2. The React app and browser-facing login/consent UI remain on `https://noter.md`.
3. `apps/noter/convex/mcp/http.ts` already encodes this split by redirecting consent/login UX to
   `SITE_URL` instead of the Convex request origin.

### Current MCP consent flow

1. `GET /oauth/mcp/authorize` runs on the request origin and creates an `mcpAuthorizationRequests`
   row.
2. If the user must log in or approve access, `buildMcpConsentRedirectUrl()` redirects to
   `SITE_URL + /oauth/mcp/consent?...`.
3. `apps/noter/src/routes/mcp-consent.tsx` renders the consent page and reads `mcp_consent_request`
   from the query string.
4. If the user is unauthenticated, the authenticated route wrapper renders `SignInForm`.

### Pre-fix sign-in behavior that dropped consent state

1. Before this patch, `apps/noter/src/SignInForm.tsx` called `signIn("google")` without a
   `redirectTo` override in the top-level browser flow.
2. `apps/noter/src/authClient.ts` also triggers `signIn("google")` without a `redirectTo` override
   when the popup/auto-sign-in path is used.
3. `@convex-dev/auth` defaults OAuth completion redirects to `SITE_URL` unless the caller supplies
   `redirectTo`.
4. `@convex-dev/auth` only accepts relative `redirectTo` values or absolute URLs rooted at
   `SITE_URL`, which matches our need to return to the current app route on `noter.md`.

### Why the failure becomes visible now

1. The old implementation work focused on moving the consent UI off the Convex/`convex.site` root
   and onto the React app origin.
2. That part is already implemented in `apps/noter/convex/mcp/http.ts`.
3. The remaining bug is the next hop: once the user reaches the consent route, the browser login
   flow still behaves like a generic landing-page sign-in and forgets the active MCP consent
   request.
4. The fast landing bootstrap in `apps/noter/src/bootstrap.ts` is not the protocol bug itself, but
   it makes the failure obvious because the browser lands back on `/` after auth and shows the
   public landing shell instead of returning to consent.

## Goals

1. Preserve the exact consent route and query string through Google sign-in.
2. Support the intentional dual-origin split:
   - `api.noter.md` for MCP/OAuth protocol endpoints
   - `noter.md` for browser UI
3. Keep using Convex Auth as-is; do not replace the auth provider.
4. Fix the top-level browser sign-in and auto-sign-in entrypoints in this patch.
5. Keep the popup launch surface unchanged in this patch.
6. Add regression tests that fail on today’s behavior and pass only once the route is preserved.

## Non-Goals

1. Reworking MCP protocol metadata or token issuance.
2. Moving browser login UI onto `api.noter.md`.
3. Adding new environment variables.
4. Adding broad redirect/fallback abstractions beyond the concrete runtime path used by MCP consent
   login.

## Problem Statement

The current runtime loses MCP consent context because it treats sign-in from the consent screen like
a generic sign-in from `/`. As a result:

1. the user authenticates successfully,
2. Convex Auth returns to `SITE_URL`,
3. the browser lands on `/`,
4. `mcp_consent_request` is no longer in the URL,
5. the user never returns to the approval screen for the in-flight MCP auth request.

## Proposal

### 1) Preserve auth return path from the current app route

When the browser begins Google sign-in from the React app, pass an explicit relative `redirectTo`
representing the current `pathname + search + hash`.

Requirements:

1. The value must preserve unrelated query params.
2. The value must stay relative to `SITE_URL` so it remains valid under Convex Auth redirect
   validation.
3. The route must round-trip for MCP consent URLs without special casing the request id format.

### 2) Preserve `redirectTo` for auto-sign-in flows

When the shell or popup auto-triggers Google sign-in from `?auth=google`, `useAutoSignIn()` must
compute an explicit `redirectTo` from the current route after stripping `auth`.

Requirements:

1. `useAutoSignIn()` must call `signIn("google", { redirectTo })`.
2. The computed route must preserve unrelated query params while removing only `auth`.
3. `openAuthPopup()` may continue opening on `/` for shell UX reasons, but the auth completion
   redirect must target the popup's current route instead of relying on a previously cached provider
   redirect.

Patch note, 2026-03-19:

1. This patch changes the top-level browser sign-in path and the `useAutoSignIn()` path.
2. The popup launch behavior remains unchanged:
   - the opener already stays on the consent route,
   - the popup still opens on `/` with carried query params,
   - the popup still returns tokens to the opener and closes.
3. This patch does not change the popup close rules in `App.tsx`; it only makes the provider
   redirect explicit for auto-sign-in so stale redirect cookies are not reused.

### 3) Keep MCP consent route handling unchanged once the user returns

No MCP protocol changes are needed after the browser is sent back to the exact consent URL:

1. `App.tsx` already reads `mcp_consent_request`.
2. The authenticated consent screen already knows how to approve or deny and redirect back to the
   MCP client callback.

## Testing Strategy

### Failing regression test first

Add a focused frontend test that proves:

1. starting on `/oauth/mcp/consent?mcp_consent_request=...&mcp_login_required=1`
2. clicking `Google`
3. calls `signIn("google", { redirectTo: "/oauth/mcp/consent?..." })`

This should fail against the current implementation because the call is currently
`signIn("google")`.

Implemented validation, 2026-03-19:

1. Added `apps/noter/src/SignInForm.test.tsx`.
2. The test failed first because `SignInWithGoogle` called `signIn("google")` without a
   `redirectTo`.
3. Added `apps/noter/src/authClient.test.ts`.
4. The auto-sign-in test proves `useAutoSignIn()` strips `auth`, updates the URL in place, and
   passes the same relative route as `redirectTo`.
5. After the runtime fix, both tests pass and assert the exact consent route is preserved.
6. The redirect URL code later moved to TanStack Router search builders; keep auth redirect
   validation paired with router search serialization tests.

## Implementation Notes

1. Prefer a minimal helper for “current relative auth return path” only if it is used directly by
   runtime code in this patch.
2. Use TanStack Router search builders and `router.buildLocation()` for app-route redirect URLs
   rather than hand-building query strings.
3. Do not introduce absolute cross-origin redirect targets into the frontend.

## Acceptance Criteria

1. An unauthenticated user who reaches MCP consent on `noter.md` and signs in with Google returns to
   the exact consent URL.
2. After authentication, `App.tsx` renders `McpConsentView` with the original `mcp_consent_request`.
3. The flow works with the dual-origin deployment:
   - protocol origin `https://api.noter.md`
   - app origin `https://noter.md`
4. Focused regression tests cover the preserved `redirectTo` behavior.

## Execution Tracker

- Last updated: 2026-03-19
- Current status: `top-level and auto-sign-in consent redirect fix implemented`
- Next step: `manual Codex connection retry or broader auth smoke test`
- Findings confirmed before this patch:
  - `apps/noter/convex/mcp/http.ts` already redirects consent to `SITE_URL`
  - `SignInForm.tsx` did not preserve the consent route for top-level sign-in
  - `authClient.ts` did not pass an explicit `redirectTo` for auto-sign-in
  - `@convex-dev/auth` defaults back to `SITE_URL` without `redirectTo`
- Implemented in this patch:
  - `SignInWithGoogle` now passes the current relative route as `redirectTo`
  - `useAutoSignIn()` now passes the current relative route as `redirectTo`
  - the helper strips `auth` from the return URL so future callback loops are avoided
  - public-root sign-in now uses `/vault` as the provider return route instead of returning to `/`
    and relying on an authenticated-root redirect effect
  - failed unauthenticated public signup returns preserve `signup=google` by bouncing
    `/vault?signup=google` back to `/?signup=google`
  - authenticated users can still browse the public landing route because authenticated `/` renders
    are not redirected
  - popup launch still starts from `/`, and successful popup completion moves the opener to `/vault`
    when the popup authenticated on the dashboard route
- Validation in this patch:
  - `pnpm exec vp test run apps/noter/src/SignInForm.test.tsx apps/noter/src/authClient.test.ts apps/noter/src/lib/useAppAuthRuntimeEffects.test.ts apps/noter/src/lib/tanstackSearchParams.test.ts`
