# 063 MCP Pre-Account Onboarding Flow Spec

## Document Control

- Status: Proposed
- Owner: Noter auth/MCP UX
- Last updated: 2026-03-19
- Related specs:
  - `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`
  - `rfcs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md`
  - `rfcs/062_MCP_DUAL_ORIGIN_CONSENT_LOGIN_REDIRECT_SPEC.md`

## Summary

Design a first-class MCP onboarding flow for users who reach Noter from an MCP client before they
have a usable Noter account.

Current production behavior is technically consistent with the existing closed signup policy, but
the UX is confusing:

1. MCP authorize creates an auth request and redirects the browser to
   `https://noter.md/oauth/mcp/consent?...`.
2. If the browser is unauthenticated, the app renders the generic landing sign-in screen.
3. If Google auth is denied by Noter allowlist policy, Convex Auth redirects back to the same route
   without any failure context.
4. The user sees the landing/sign-in experience again, with no explanation of whether sign-in
   failed, access is closed, or the MCP request expired.

This RFC keeps the existing closed-signup security policy, but replaces the silent loop with an
MCP-specific unauthenticated entry flow and a clearer "request access" path.

## Why This Spec Exists

We fixed the immediate redirect bug in `062`, so existing approved users can now finish the MCP
OAuth flow correctly. That does not solve the separate product problem for users who do not yet have
access to Noter.

Today, that user journey is weak in two ways:

1. The unauthenticated consent route is not MCP-specific; it falls back to the generic marketing
   landing/sign-in surface.
2. The auth callback path does not propagate allowlist denial or incomplete sign-in back to the app,
   so the user cannot tell what happened.

The result is a flow that looks broken even when the backend is behaving as designed.

## Current State Research

### MCP authorize creates a short-lived app-routed consent request

1. `apps/noter/convex/mcp/http.ts` creates an `mcpAuthRequests` row and redirects browser UX to
   `SITE_URL + /oauth/mcp/consent?...`.
2. `MCP_AUTH_REQUEST_TTL_MS` is currently `10 * 60 * 1000` (10 minutes).
3. This request is appropriate for an in-progress login/consent handoff, not a long-lived
   pending-signup ticket.

### The consent route currently renders generic unauthenticated UI

1. `apps/noter/src/App.tsx` renders `McpConsentView` for authenticated users.
2. The same route renders `SignInForm` for unauthenticated users.
3. `SignInForm` is the generic public landing/sign-in surface, not an MCP-specific entry view.

### Closed signup is enforced before session creation

1. `apps/noter/convex/auth.ts` rejects non-allowlisted emails inside `createOrUpdateUser`.
2. That means a new, unapproved user does not get a `users` row and does not get an authenticated
   session.
3. This behavior is intentional and matches `018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`.

### Convex Auth currently swallows callback failures for this flow

Research in the installed `@convex-dev/auth` source shows the OAuth callback handler catches errors
and redirects to the original destination URL anyway:

1. It computes `destinationUrl` from the stored `redirectTo`.
2. On success it appends a verification code and returns there.
3. On error it logs and returns `Response.redirect(destinationUrl)`.
4. No error code is attached to the redirect URL in the current library path.

That behavior is reasonable for a generic auth library, but it is a bad fit for MCP onboarding
because the browser returns to `/oauth/mcp/consent?...` still unauthenticated and the app cannot
distinguish:

1. access denied by allowlist,
2. OAuth canceled,
3. popup/embedded browser interruption,
4. other auth callback failure.

## Goals

1. Keep closed signup and allowlist enforcement exactly as-is for security.
2. Replace the generic landing page with an MCP-specific unauthenticated entry view on the consent
   route.
3. Give users without access a clear "request access" / waitlist path.
4. Preserve enough local context to explain when a sign-in attempt did not complete.
5. Avoid promising that an expired `mcp_consent_request` can be resumed later.

## Non-Goals

1. Opening self-serve signup to anyone with a Google account.
2. Replacing Convex Auth.
3. Turning `mcpAuthRequests` into long-lived onboarding records.
4. Completing the original MCP authorization request days later after manual approval.
5. Solving the separate latency issue in this RFC.

## Problem Statement

For a user who starts from an MCP client and does not already have Noter access, the current flow is
effectively:

1. click `Authenticate`,
2. arrive at `/oauth/mcp/consent?...`,
3. see the generic public landing/sign-in UI,
4. try Google,
5. return to the same route still signed out,
6. see the same landing/sign-in UI again,
7. conclude the product is broken.

From a product perspective, this is the wrong surface and the wrong outcome. We should fail closed
on access, but we should fail clearly.

## Proposal

### 1) Add an MCP-specific unauthenticated entry view

When the app is on `/oauth/mcp/consent` and the viewer is unauthenticated, render a dedicated
`McpConsentEntryView` instead of `SignInForm`.

Required behavior:

1. The page copy must clearly say the user is connecting an MCP client to Noter.
2. It must present two explicit paths:
   - `Continue with Google` for existing/approved users
   - `Request access` or `Join waitlist` for users who do not yet have access
3. It must avoid looking like the generic landing page, because the user did not intentionally
   browse to marketing.

### 2) Add a public request-summary read model for the unauthenticated page

The unauthenticated entry view should still identify what is being authorized.

Add a narrow public read path for `mcp_consent_request` that returns only safe display fields such
as:

1. `clientName`
2. `clientId`
3. `resource`
4. `status`
5. `expiresAt`

Constraints:

1. No token or grant data.
2. No user-specific authorization state.
3. If the request is missing or expired, show a restart message instead of a sign-in CTA.

### 3) Preserve an MCP auth-attempt marker in the browser

Because the current auth callback path does not expose precise failure reasons, the app should keep
an owned browser marker before launching Google from the MCP entry view.

Recommended shape:

1. Store a short-lived local marker keyed by `mcp_consent_request`.
2. Set it immediately before starting Google auth from the MCP entry view.
3. Clear it once the viewer becomes authenticated or the request is closed.

Use of the marker:

1. If the browser returns to the same consent route still unauthenticated and the marker is present,
   render a contextual banner such as:
   `Sign-in did not complete. This Google account may not have Noter access yet, or the login flow may have been interrupted.`
2. Offer two next actions:
   - try another Google account
   - request access

This does not perfectly classify the failure reason, but it is dramatically better than silently
looping back to the generic landing page.

### 4) Keep approval onboarding separate from MCP request completion

If the user requests access and is approved later, we should not attempt to resume the original
`mcp_consent_request`.

Required behavior:

1. If the request is no longer valid, show that it expired.
2. Approved users must start a fresh `Authenticate` attempt from the MCP client.
3. The onboarding copy should say this plainly.

This keeps the protocol model simple and matches the current 10-minute request TTL.

### 5) Optional later enhancement: explicit auth-denial propagation

If we later decide the local marker is not enough, a follow-up can explore a more precise
server-side error handoff for MCP sign-in failures.

That work would likely require one of:

1. a repo-owned wrapper around the auth callback surface, or
2. an upstream/forked Convex Auth change that appends an owned error param to the final redirect.

This RFC does not require that deeper change for the first user-facing improvement.

## Recommended Rollout

### Phase 1: Clear MCP entry UX

1. Add `McpConsentEntryView`.
2. Add the public request-summary query.
3. Add the local auth-attempt marker.
4. Render explicit retry/request-access messaging.

### Phase 2: Waitlist/access request polish

1. Reuse the existing waitlist path from the public app.
2. Tailor copy so the user understands they came from an MCP client.
3. Show a restart instruction after waitlist submission.

### Phase 3: Optional precise denial semantics

Only if Phase 1 still leaves too much ambiguity:

1. explore an auth-callback error param,
2. differentiate `access denied` from generic `sign-in incomplete`,
3. keep that behavior scoped to the MCP onboarding route.

## Testing Strategy

Add focused tests for the RFC implementation, not broad auth rewrites.

Required coverage:

1. Unauthenticated `/oauth/mcp/consent?...` renders `McpConsentEntryView`, not the generic
   `SignInForm`.
2. The entry view shows safe request summary metadata from the public query.
3. Starting Google auth from this view preserves the existing consent `redirectTo`.
4. Returning unauthenticated with an active local marker shows the contextual retry/request-access
   banner.
5. Expired or missing requests show a restart message instead of a misleading sign-in CTA.

## Acceptance Criteria

1. A signed-out approved user arriving from Codex sees an MCP-specific sign-in page and can continue
   to consent.
2. A user without Noter access sees a clear explanation and a request-access path instead of a
   silent landing-page loop.
3. The original security policy from `018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md` remains
   unchanged.
4. The UI does not imply that an expired authorization request can be resumed after later approval.

## Open Questions

1. Should `Request access` submit directly to the existing waitlist table, or should MCP onboarding
   get a distinct access-request record?
2. Do we want to capture which MCP client initiated the waitlist request, or is that unnecessary for
   v1?
3. Is the local "attempted sign-in" marker sufficient, or do we eventually want exact provider-error
   propagation from the auth callback?

## Source Notes

Primary code paths reviewed for this RFC:

1. `apps/noter/src/App.tsx`
2. `apps/noter/convex/mcp/http.ts`
3. `apps/noter/convex/mcp/oauth.ts`
4. `apps/noter/convex/auth.ts`
5. `@convex-dev/auth` OAuth callback implementation in the installed package source under
   `node_modules/.pnpm/.../@convex-dev/auth/src/server/implementation/index.ts`
