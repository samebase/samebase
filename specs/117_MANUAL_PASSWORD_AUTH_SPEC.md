# Manual Password Authentication Specification

## Document Control

- Status: Accepted
- Owner: Samebase auth/backend
- Last updated: 2026-10-20
- Related:
  - `docs/manual-password-auth.md`
  - `specs/018_AUTH_APPROVAL_BOUNDARY_SPEC.md`
  - `specs/122_ACCOUNT_SIGN_IN_METHODS_SPEC.md`

## Current Contract

Samebase supports four password authentication modes:

1. `local_worktree_seed` uses the fixed local worktree account and permits sign-in and sign-up.
2. `preview_seed` uses the preview seed account and permits sign-in only.
3. `manual` permits sign-in only for operator-created accounts. It is enabled only when
   `PASSWORD_AUTH_ENABLED` has the exact value `true`.
4. `off` rejects every password authentication flow.

The server checks the current mode for every password request. Hiding the password form is not the
security boundary.

Password sign-in is a Samebase method on the Convex Auth 2 component API. The public mutations
`auth:signInWithPassword` and `auth:signUpWithPassword` find the `authAccounts` password identity of
the email, check the password with the Convex Auth password component, and mint the session through
the core component. A wrong password returns an error result, so the password component's per-user
rate limit keeps the attempt. Only server functions create password accounts, so a password account
always belongs to an existing user.

An operator creates or rotates a manual account with the internal
`authAdmin:createOrUpdatePasswordAccount` mutation. Application clients cannot call this mutation.
The mutation:

- stores only the password hash, in the Convex Auth password component
- links to one existing verified user with the same email when available
- rejects duplicate verified users and conflicting account links
- marks a new user's email as verified
- approves the linked user

A password rotation does not end the user's existing sessions: Convex Auth 2 has no function that
removes the sessions of a user. Manual account creation does not send a new-user notification.

Disabling manual password authentication blocks new password sign-ins. It does not end sessions that
already exist.

## Non-Goals

- Public password sign-up
- Public password reset
- A self-service account creation UI
- Replacing Google or GitHub OAuth sign-in

## Validation

- `deploymentProfile.test.ts` covers mode selection and allowed flows.
- `authPassword.convex.test.ts` covers the public sign-in and sign-up boundary.
- `authAdmin.convex.test.ts` covers creation, linking, conflict rejection, rotation, and approval.
- `SignInForm.passwordAuth.test.tsx` and `publicLandingAuthState.test.ts` cover the visible sign-in
  surface.
