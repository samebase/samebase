# 122 Account Sign-In Methods Specification

## Document Control

- Status: Accepted rollout contract
- Owner: Samebase auth/backend
- Last updated: 2026-08-08
- Related:
  - `specs/113_ACCOUNT_DELETION_SPEC.md`
  - `specs/117_MANUAL_PASSWORD_AUTH_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`

## Current Contract

A `users` row is one Samebase account. Google, GitHub, and password are sign-in methods for that
account. An `authAccounts` row stores one stable provider identity. The Samebase user ID is the
product identity. An email address or GitHub login is not the product identity.

Google and GitHub sign-in require a verified provider email. GitHub sign-in reads the one primary,
verified address from the GitHub email API. Samebase normalizes an account email only by trimming it
and converting it to lowercase. It does not treat Gmail dots or `+` tags as equal. Both OAuth
providers ask the user to select an account for each sign-in or Connect action.

Signed-out OAuth resolution follows these rules:

1. A known provider ID signs in to its current Samebase account.
2. A new provider ID with an email that another Samebase account uses is blocked. The user must sign
   in with an existing method and connect the new method in Settings.
3. A new provider ID with a unique email creates a Samebase account.
4. A later provider email change does not change the Samebase account email.

Settings can connect Google or GitHub to the current account. The action creates a five-minute link
intent on the current authenticated session for one exact provider. The OAuth callback must return
through that session. Samebase rejects an expired intent, the wrong provider, a provider identity
owned by another Samebase account, or a second different identity for the same provider. A missing
or expired starting session fails the Connect action and cannot become a signed-out sign-in. A safe
route error reports a canceled or failed OAuth return without exposing provider error details. The
first beta does not have a Remove or Replace action.

Password authentication stays available for operator-created accounts and Codex verification. It
does not have a public sign-up or self-service Connect action.

## GitHub Boundaries

The GitHub OAuth App is a sign-in method. It requests only `read:user user:email`, always asks the
user to select a GitHub account, and does not store the OAuth access token. Samebase follows the
paginated GitHub email response until it finds the primary verified address.

GitHub App access is a separate personal authorization in `githubUserAuthorizations`. Samebase uses
it for GitHub actions that require the acting GitHub user. Revoking this access does not remove the
GitHub sign-in method and does not uninstall the GitHub App.

When both records exist, the GitHub App user ID and GitHub sign-in provider ID must match. One
GitHub user ID cannot belong to different Samebase accounts across the sign-in and GitHub App access
tables. A user cannot replace stored personal GitHub App access with a different GitHub identity.

A GitHub organization installation belongs to the Samebase organization and its stable GitHub owner.
Another GitHub organization administrator can install or reconnect the App when the organization
authority checks pass. That action does not change any Samebase user's sign-in method or personal
GitHub authorization.

## Non-Goals

- Silent account merging by email
- Self-service sign-in method removal or replacement
- Several Google or GitHub identities for one Samebase account
- Using a GitHub login or email as organization membership proof
- Making a GitHub account necessary for an invited Samebase organization member

## Validation

- `authAccountLinking.convex.test.ts` covers known identities, stable account email, explicit
  session-bound linking, missing and expired sessions, cross-table identity conflicts, and account
  deletion.
- `githubSignIn.test.ts` covers the verified primary email parser, exact OAuth parameters, and
  provider API failures.
- `githubUserAuthorizations.convex.test.ts` covers GitHub sign-in and GitHub App identity conflicts.
- `authOAuthCallback.convex.test.ts` covers account-selection parameters, exact scopes, and safe
  callback error returns through the patched auth boundary.
- `UserSettingsPage.test.tsx` covers connected methods, Connect actions, no removal action, and the
  separate GitHub access section.
- `SignInForm.test.tsx`, `authClient.test.ts`, and the public landing tests cover both OAuth entry
  points and provider-neutral return state.

## Rollout

The development and production OAuth Apps must use the Convex Auth callback path
`/api/auth/callback/github`. Existing user grants from the older broad-scope flow must be revoked
before final validation so the new authorization contains only the current scopes. Final validation
must connect GitHub from Settings and then complete a signed-out GitHub sign-in with the same
account.
