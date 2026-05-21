# Auth Allowlist Pre-Login Enforcement Specification

## Document Control

- Status: Implemented
- Owner: Noter auth/backend
- Last updated: 2026-02-19

## Summary

The current auth flow allows users to complete OAuth, create/update a local user record, and
establish a session before Noter blocks access with a waitlist screen.

This spec changes the policy to reject unauthorized users during auth callback handling, before
account creation and before session establishment.

## Problem Statement

Current behavior is post-login gating:

1. OAuth succeeds.
2. `createOrUpdateUser` writes/updates a user in `users`.
3. UI checks approval and renders "You're on the waitlist" for non-approved users.

Relevant files:

- `apps/noter/convex/auth.ts`
- `apps/noter/convex/users.ts`
- `apps/noter/src/App.tsx`

Implications:

- Non-allowlisted users can still create local accounts.
- Session cookies/tokens can still be issued before UI blocks access.
- Relying on Google-side "allow/test users" is not sufficient for product-level signup control.

## Goals

- Enforce allowlist at auth callback time on the backend.
- Prevent non-allowlisted users from creating local user records.
- Prevent non-allowlisted users from getting an authenticated app session.
- Treat empty allowlist as closed signup (`deny all`), not open signup.

## Non-Goals

- Reworking waitlist marketing copy/UX.
- Replacing provider OAuth configuration.
- Building a full admin invite management UI in this change.

## Required Behavior

1. Authorization decision must be made server-side in auth callbacks.
2. If user identity is not allowlisted, auth flow returns an authorization error.
3. No `users` row is inserted for denied sign-ins.
4. Existing users who are no longer allowlisted must be denied on next sign-in.
5. Empty allowlist denies all new sign-ins (except explicit emergency/admin bypasses, if
   configured).

Allowlist source:

- Hardcoded `ALLOWED_EMAILS` constant in `apps/noter/convex/users.ts` (case-insensitive match via
  lowercasing input email).

## Rollout Notes

- Existing already-approved users may remain in the database; this is expected.
- Enforcement applies to new authentication attempts after deployment.
- If emergency access is needed, explicitly add the email to allowlist before sign-in.

## Acceptance Criteria

- [ ] Non-allowlisted OAuth account cannot complete sign-in to an authenticated app session.
- [ ] Non-allowlisted OAuth account does not create a `users` record.
- [ ] Allowlisted account can sign in normally.
- [ ] Empty allowlist blocks all sign-ins by default.
- [ ] Frontend waitlist page is no longer the primary security gate.
