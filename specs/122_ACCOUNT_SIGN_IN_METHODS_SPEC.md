# 122 Account Sign-In Methods Specification

## Document Control

- Status: Accepted rollout contract
- Owner: Samebase auth/backend
- Last updated: 2026-08-10
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
observations. A GitHub `authAccounts.githubLogin` value is the latest login observation for that
GitHub sign-in identity. It can change without changing the stable `providerAccountId`.

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

The account-linking backend can connect Google or GitHub to the current account. The action creates
a five-minute link intent on the current authenticated session for one exact provider. The OAuth
callback must return through that session. Samebase rejects an expired intent, the wrong provider, a
provider identity owned by another Samebase account, or a second different identity for the same
provider. A missing or expired starting session fails the Connect action and cannot become a
signed-out sign-in. A safe provider-specific route error explains when the selected Google account
email or the selected GitHub account's primary email is already used by another Samebase account.
Both errors tell the user to sign in to that account with an existing method. The GitHub error also
tells the user to connect GitHub in Account settings. The errors do not reveal the existing
account's sign-in methods, account email, or other provider details. The first beta does not have a
Remove or Replace action.

The signed-out UI and Account settings show GitHub as the only OAuth choice while
`GOOGLE_AUTH_UI_ENABLED` is false. This code constant hides Google sign-in buttons, the Google
Settings row and Connect action, and Google prehydration placeholders. It does not delete stored
Google identities. It also does not disable the Google OAuth provider, direct `auth=google`
compatibility starts, Google callback processing, or safe Google-specific return errors.

Password authentication stays available for operator-created accounts and Codex verification. It
does not have a public sign-up or self-service Connect action.

## GitHub Boundaries

Samebase has three separate GitHub records:

1. A GitHub `authAccounts` row is one Samebase account's sign-in identity. Its stable identity is
   `providerAccountId`. Its email and login are provider observations.
2. An `organizations` row stores one GitHub App installation for its stable repository owner.
3. A `githubUserAuthorizations` row stores one Samebase user's GitHub App user authorization.

The GitHub OAuth App creates or refreshes only the first record. It requests `read:user user:email`,
always asks the user to select an account, and discards the OAuth access token. The GitHub App flow
supplies repository permissions through the other two relationship types.

The target-neutral new-install flow can start without a GitHub sign-in row. It records the current
GitHub `providerAccountId`, if one exists, in its one-use setup state. A returned personal target
succeeds only when that recorded ID, the current sign-in row, the returned owner ID, and the
returned GitHub App user ID all match. Connecting GitHub after setup starts cannot make that setup
valid.

A personal reconnect and an explicit personal authorization know their target. They reject a missing
or different GitHub sign-in identity before redirect, record the matching stable ID, and check it
again at callback. Authorization use checks the identity again. Email and login values are never
proof. A successful personal installation or reconnect stores or refreshes both the installation and
the matching user authorization. A rejected personal callback creates no local relationship,
attempts to revoke its uncommitted user token, and does not uninstall the GitHub App.

The personal user authorization belongs to one Samebase user and is used only to create a repository
under that personal GitHub account. Its control appears only on that personal owner's Providers
page. Revoking it does not remove the GitHub sign-in method or uninstall the GitHub App. The beta
does not replace it with another GitHub identity.

GitHub organization setup does not require a connected GitHub sign-in identity on the Samebase
account. If one exists, the GitHub App setup actor can differ. Spec 120 owns the administrator and
installation checks. Samebase attempts to revoke the actor's short-lived setup token through GitHub
and does not store it as personal authorization. Organization repository creation and normal
operations use installation authentication.

## Non-Goals

- Silent account merging by email
- Automatic account-email selection from several provider observations
- Self-service account-email changes before a dedicated verification flow exists
- Self-service sign-in method removal or replacement
- Several Google or GitHub identities for one Samebase account
- Using a GitHub login or email as organization membership proof
- Requiring a connected GitHub sign-in identity for membership or GitHub organization operations

## Validation

The temporary Convex Auth 0.0.94 patch exposes the starting session and stable provider ID to the
custom user callback, corrects its link flags, stores the GitHub login observation on the auth
account, and maps only allowlisted callback failures to safe route errors. Tests must cover these
behaviors before the patch changes or is removed.

- `authAccountLinking.convex.test.ts` covers known identities, stable account email, explicit
  session-bound linking, missing and expired sessions, cross-table identity conflicts, and account
  deletion.
- `githubSignIn.test.ts` covers the verified primary email parser, exact OAuth parameters, and
  provider API failures.
- `githubUserAuthorizations.convex.test.ts` covers target-scoped status, revocation, GitHub sign-in,
  required personal identity matching, and GitHub App identity conflicts.
- `githubAppInstallation.convex.test.ts` covers organization-bound setup and exact personal owner
  verification. It rejects a personal setup that did not have the identity at its start, even if the
  user connects it before the callback. It also proves that a GitHub organization setup actor can
  differ from the Samebase sign-in identity.
- `authOAuthCallback.convex.test.ts` covers account-selection parameters, exact scopes, and safe
  callback error returns through the patched auth boundary.
- `UserSettingsPage.test.tsx` covers the visible GitHub method and Connect action, the hidden Google
  method and Connect action, and no removal action.
- `ProviderConnectionsPage.test.tsx` covers the personal-owner authorization control and proves that
  it is absent for a GitHub organization owner.
- `SignInForm.test.tsx` and `authClient.test.ts` cover both provider implementations, direct
  compatibility starts, provider-specific account-linking guidance, and safe return state. The
  public landing tests cover the visible GitHub entry point and the absence of Google controls.

## Rollout

The development and production OAuth Apps must use the Convex Auth callback path
`/api/auth/callback/github`. Existing user grants from the older broad-scope flow must be revoked
before final validation so the new authorization contains only the current scopes. Final validation
must connect GitHub from Settings before a personal App installation, authorize personal repository
creation from that owner's Providers page, and complete a signed-out GitHub sign-in with the same
account. It must also install the Samebase GitHub App for a GitHub organization through an
administrator whose stable GitHub user ID differs from the Samebase account's linked GitHub provider
ID, without changing that sign-in identity.
