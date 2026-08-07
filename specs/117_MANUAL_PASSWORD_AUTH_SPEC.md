# Manual Password Authentication Specification

## Document Control

- Status: Accepted
- Owner: Samebase auth/backend
- Last updated: 2026-07-28
- Related:
  - `docs/manual-password-auth.md`
  - `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`

## Current Contract

Samebase supports four password authentication modes:

1. `local_worktree_seed` uses the fixed local worktree account and permits sign-in and sign-up.
2. `preview_seed` uses the preview seed account and permits sign-in only.
3. `manual` permits sign-in only for operator-created accounts. It is enabled only when
   `PASSWORD_AUTH_ENABLED` has the exact value `true`.
4. `off` rejects every password authentication flow.

The server checks the current mode for every password request. Hiding the password form is not the
security boundary.

An operator creates or rotates a manual account with the internal
`authAdmin:createOrUpdatePasswordAccount` action. Application clients cannot call this action. The
action:

- stores only the password hash
- links to one existing verified user with the same email when available
- rejects duplicate verified users and conflicting account links
- marks a new user's email as verified
- approves the linked user
- deletes the user's stored sessions and refresh tokens after a password rotation

Manual account creation does not send a new-user notification. Password operations fail while
`AUTH_LOG_LEVEL=DEBUG` because Convex Auth debug output can contain credential fragments.

Disabling manual password authentication blocks new password sign-ins. It does not end sessions that
already exist.

An access token that was issued before a password rotation can remain valid for up to one hour.

## Non-Goals

- Public password sign-up
- Public password reset
- A self-service account creation UI
- Replacing Google authentication

## Validation

- `deploymentProfile.test.ts` covers mode selection and allowed flows.
- `authPassword.convex.test.ts` covers the public sign-in boundary.
- `authAdmin.convex.test.ts` covers creation, linking, conflict rejection, rotation, approval, and
  session invalidation.
- `SignInForm.passwordAuth.test.tsx` and `publicLandingAuthState.test.ts` cover the visible sign-in
  surface.
