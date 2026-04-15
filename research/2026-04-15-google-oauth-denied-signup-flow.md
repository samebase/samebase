# Google OAuth Denied Signup Flow

## Context

This note records the current Google OAuth callback behavior for blocked
signups, plus the safest app-owned hooks for showing a waitlist-style fallback
surface.

## Current Callback Shape

- Convex Auth builds the provider callback URL as
  `${CUSTOM_AUTH_SITE_URL ?? CONVEX_SITE_URL}/api/auth/callback/<provider>`.
- In the current dev deployment, Google redirects back to
  `https://quiet-robin-508.convex.site/api/auth/callback/google`.
- The exact hostname is deployment-specific, but the `/api/auth/callback/google`
  suffix is stable for the Google provider.

Relevant code:

- `apps/noter/src/SignInWithGoogle.tsx`
- `apps/noter/src/lib/googleAuthRedirect.ts`
- `apps/noter/convex/auth.ts`
- `node_modules/@convex-dev/auth/dist/server/oauth/convexAuth.js`
- `node_modules/@convex-dev/auth/dist/server/oauth/authorizationUrl.js`
- `node_modules/@convex-dev/auth/dist/server/implementation/index.js`

## What We Know Today

- Google profile data includes `profile.email` during callback handling.
- `createOrUpdateUser` checks the email allowlist before creating a `users`
  record.
- If the email is not allowlisted, the callback throws
  `Access denied: account is not allowlisted`.
- Convex Auth currently catches callback errors and redirects back to the saved
  `redirectTo` destination without adding an error code or reason.

## What The Frontend Can Detect

Today the frontend can safely know that the user started a Google auth flow if
we put an app-owned marker into `redirectTo`.

Example:

- `/` becomes `/?auth_source=google_signup`

Because Convex Auth persists and reuses `redirectTo`, that marker survives both
successful and failed Google round-trips.

What this does not tell us by itself:

- whether Google auth was denied by the product allowlist
- whether the user cancelled the Google flow
- whether the provider failed for some unrelated reason

If product needs a distinct "Google signup denied" surface, the callback flow
must forward an explicit app-owned failure reason for the allowlist-denied case.

## Email Prefill Recommendation

Do not put the raw email address in the URL query string for waitlist prefill.

Risks:

- it lands in browser history
- it can appear in logs, screenshots, and copied links
- it may leak through referrer headers on later navigation

Preferred options:

1. Set a short-lived first-party cookie during the denied callback redirect,
   read it on the waitlist page, prefill the form, then delete it.
2. Use a short-lived opaque token in the URL and resolve it server-side to the
   email only on the waitlist page.

If product only needs a different message and not prefilled email, the
`redirectTo` marker is enough and avoids carrying personal data in the URL.
