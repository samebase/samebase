# 122 Account Sign-In Methods Specification

## Document Control

- Status: Accepted rollout contract
- Owner: Samebase auth/backend
- Last updated: 2026-08-09
- Related:
  - `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`
  - `specs/113_ACCOUNT_DELETION_SPEC.md`
  - `specs/117_MANUAL_PASSWORD_AUTH_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`

## Current Contract

A `users` row is one Samebase account. Google, GitHub, and password are sign-in methods for that
account. An `authAccounts` row stores one stable provider identity. The Samebase user ID is the
product identity. An email address or GitHub login is not the product identity.

`users.email` is one stable, verified Samebase account email. One normalized account email belongs
to at most one active Samebase account. It is not recomputed from the user's connected sign-in
methods. Each OAuth `authAccounts.emailVerified` value is the latest verified email observation for
that sign-in method. Settings shows the stable account email separately from these method-specific
observations.

Google and GitHub sign-in require a verified provider email. The Google observation is the verified
email returned for the selected Google account. The GitHub observation is only the current primary,
verified address from the GitHub email API. Samebase reads every required email page to find that
address, but it does not use a secondary GitHub address for account resolution, even when GitHub
marks the address as verified. Samebase normalizes an account email only by trimming it and
converting it to lowercase. It does not treat Gmail dots or `+` tags as equal. Both OAuth providers
ask the user to select an account for each sign-in or Connect action.

Signed-out OAuth resolution follows these rules:

1. A known provider ID signs in to its current Samebase account.
2. A new provider ID whose current provider email observation matches a stable `users.email` value
   is blocked. The user must sign in with an existing method and connect the new method in Settings.
3. A new provider ID whose current provider email observation matches no stable `users.email` value
   creates a Samebase account.
4. A later provider email change does not change the Samebase account email.

For an unlinked GitHub provider ID, changing the primary GitHub email changes the email observation
used by the next signed-out attempt. If that new primary email is unique in Samebase, the attempt
can create a separate Samebase account. After the GitHub provider ID is linked, that stable provider
ID always resolves the same Samebase account, regardless of later primary-email changes.

The account email lifecycle is:

1. Account creation initializes `users.email` from the verified email observation that created the
   account.
2. Connecting another sign-in method records its provider identity and email observation without
   changing `users.email`.
3. A later sign-in can refresh a method-specific email observation without changing `users.email`.
4. No current self-service action changes `users.email`. A future account-email action must require
   explicit user intent, verify the new address, enforce account-email uniqueness, and then update
   the account email without relinking any sign-in method. Because `role_staff` currently derives
   from `users.email`, that future action must include the staff-authorization effect in its
   security design. It cannot be implemented as a profile-only mutation.

Settings can connect Google or GitHub to the current account. The action creates a five-minute link
intent on the current authenticated session for one exact provider. The OAuth callback must return
through that session. Samebase rejects an expired intent, the wrong provider, a provider identity
owned by another Samebase account, or a second different identity for the same provider. A missing
or expired starting session fails the Connect action and cannot become a signed-out sign-in. A safe
provider-specific route error explains when the selected Google account email or the selected GitHub
account's primary email is already used by another Samebase account. It tells the user to sign in to
that account with an existing method, then connect the selected provider in Account settings. It
does not reveal the existing account's sign-in methods, account email, or other provider details.
The first beta does not have a Remove or Replace action.

Password authentication stays available for operator-created accounts and Codex verification. It
does not have a public sign-up or self-service Connect action.

## GitHub Boundaries

The GitHub OAuth App is a sign-in method. It requests only `read:user user:email`, always asks the
user to select a GitHub account, and does not store the OAuth access token. Samebase follows the
paginated GitHub email response until it finds the primary verified address.

GitHub App access is a separate personal authorization in `githubUserAuthorizations`. Samebase uses
it only to create a repository under a personal GitHub account. Repository creation under a GitHub
organization and all normal operations on existing repositories use GitHub App installation
authentication.

The durable authorization belongs to the Samebase user. Its control appears in the selected
organization's Providers page only when that organization maps to a personal GitHub owner. The OAuth
setup state stores the selected Samebase organization ID, and the callback requires the exact stable
GitHub user ID of that personal owner before it stores the token. Revoking the token does not remove
the GitHub sign-in method and does not uninstall the GitHub App.

When both records exist, the GitHub App user ID and GitHub sign-in provider ID must match. One
GitHub user ID cannot belong to different Samebase accounts across the sign-in and GitHub App access
tables. A user cannot replace stored personal GitHub App access with a different GitHub identity.

A GitHub organization installation belongs to the Samebase organization and its stable GitHub owner.
Another GitHub organization administrator can install or reconnect the App when the organization
authority checks pass. That action does not change any Samebase user's sign-in method or personal
GitHub authorization.

## Non-Goals

- Silent account merging by email
- Automatic account-email selection from several provider observations
- Self-service account-email changes before a dedicated verification flow exists
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
- `githubUserAuthorizations.convex.test.ts` covers target-scoped status, revocation, GitHub sign-in,
  and GitHub App identity conflicts.
- `githubAppInstallation.convex.test.ts` covers organization-bound setup and exact personal owner
  verification.
- `authOAuthCallback.convex.test.ts` covers account-selection parameters, exact scopes, and safe
  callback error returns through the patched auth boundary.
- `UserSettingsPage.test.tsx` covers connected methods, Connect actions, and no removal action.
- `ProviderConnectionsPage.test.tsx` covers the personal-owner authorization control and proves that
  it is absent for a GitHub organization owner.
- `SignInForm.test.tsx`, `authClient.test.ts`, and the public landing tests cover both OAuth entry
  points, provider-specific account-linking guidance, and safe return state.

## Rollout

The development and production OAuth Apps must use the Convex Auth callback path
`/api/auth/callback/github`. Existing user grants from the older broad-scope flow must be revoked
before final validation so the new authorization contains only the current scopes. Final validation
must connect GitHub from Settings, authorize personal repository creation from the selected personal
owner's Providers page, and then complete a signed-out GitHub sign-in with the same account.
