# 122 Account Sign-In Methods Specification

## Document Control

- Status: Accepted rollout contract
- Owner: Samebase auth/backend
- Last updated: 2026-10-29
- Related:
  - `specs/018_AUTH_APPROVAL_BOUNDARY_SPEC.md`
  - `specs/113_ACCOUNT_DELETION_SPEC.md`
  - `specs/117_MANUAL_PASSWORD_AUTH_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
  - `specs/123_ORGANIZATION_MEMBERSHIP_ADMINISTRATION_SPEC.md`
  - `rfcs/128_SAMEBASE_SSR_WITH_COOKIE_SESSIONS_ROLLOUT.md`

## Current Contract

An active or deleting `users` row is one Samebase account. GitHub, Google, and password are sign-in
methods for that account. Samebase signs in with Convex Auth 2: the core component keeps sessions
and maps each provider account to a user. GitHub and Google sign-in run through the team's identity
hub, an OpenID Provider at `HUB_ISSUER` that holds the GitHub and Google clients: the `hub-github`
and `hub-google` methods share one OAuth component, and each names its hub connector in the
authorize URL. The password component runs the password method. An `authAccounts` row is Samebase's
own record of one sign-in identity of a user. The Convex Auth callbacks and the password account
functions write it, and Samebase reads a user's identities from it. The Samebase user ID is the
product identity. An email address or GitHub login is not the product identity. Spec 113 defines the
terminal PII-free deleted row.

The hub's `sub` is pairwise: stable for Samebase and different for each connector, so the core keeps
one account for each hub subject. The id_token also carries `connector` (`github` or `google`) and
`connector_account_id`, the connector's own account id: GitHub's numeric user id as a string, or
Google's `sub`. A GitHub or Google `authAccounts` row is keyed by the connector and that id, the
same key as before the hub.

`users.email` is one stable, verified email on a non-deleted Samebase account. One normalized
account email belongs to at most one active Samebase account. A deleted row has no email. The email
is not recomputed from the user's sign-in methods. Each OAuth `authAccounts.emailVerified` value is
the latest verified email observation for that sign-in method. Settings shows the stable account
email separately from these method-specific observations. A GitHub `authAccounts.githubLogin` value
is the login that the GitHub method before the hub observed. The hub reports no GitHub login, so a
hub sign-in leaves it as it is, an identity that first signs in through the hub has none, and
Settings then shows the identity's GitHub email.

Google and GitHub sign-in require an email with `email_verified` true in the hub's id_token;
Samebase ignores any other email claim. The Google observation is the verified email of the selected
Google account. The GitHub observation is the primary address of the GitHub account when GitHub
verified it. Samebase normalizes an account email only by trimming it and converting it to
lowercase. It does not treat Gmail dots or `+` tags as equal.

The OAuth flows return to the app on the same origin: the hub sends the browser to
`<site>/auth/hub/callback` on the Convex deployment's site, then a redirect to a path on `SITE_URL`
or on the deployment's own `CONVEX_SITE_URL`. The Convex Auth client in the browser finishes the
sign-in from the `convexAuthCode` or `convexAuthError` search value, which the root route keeps for
it. A deployment without a hub (a linked worktree or CI, the `local_worktree` profile) holds no-hub
values for the three `HUB_` variables, and its sign-in page offers only the password form.

OAuth sign-in resolves the account with these rules, in order:

1. A hub subject that Convex Auth already knows signs in to its user.
2. A connector account ID with an `authAccounts` row signs in to that row's user. This keeps every
   identity from before the hub.
3. A new connector account ID whose verified email is the verified `users.email` of an account signs
   in to that account and becomes one of its sign-in methods. An account can have only one identity
   for each provider, so a second, different GitHub or Google identity is rejected.
4. A new connector account ID whose email belongs to an account without a verified email is
   rejected.
5. A new connector account ID whose email matches no account creates a Samebase account. Its
   approval follows `AUTO_APPROVE_NEW_USERS`.
6. A later provider email change does not change the Samebase account email.

A provider identity can create a session only for an active account. Deleting and deleted reject the
sign-in with a message that the landing page shows. A deleted row cannot match an email because
account deletion removes it and the user's `authAccounts` rows. The final deletion transaction also
deletes the user's Convex Auth 2 accounts, sessions, refresh tokens, and stored password. A later
sign-in with the same GitHub or Google account then creates a new Samebase account. Convex Auth
2.0.0-beta.0 has no deletion by user id, so `patches/@convex-dev__auth@2.0.0-beta.0.patch` adds
`deleteUser` to the core and password components until upstream ships it.

There is no Connect action. A user adds GitHub or Google to an account by signing out and signing in
with a provider account whose verified email is the account email (rule 3).

The signed-out UI and Account settings show GitHub as the only OAuth choice while
`GOOGLE_AUTH_UI_ENABLED` is false. This code constant hides Google sign-in buttons and the Google
Settings row. It does not delete stored Google identities. It also does not disable the Google OAuth
provider, direct `auth=google` starts, or Google callback processing.

Password authentication stays available for operator-created accounts and Codex verification. It
does not have a public sign-up or a Connect action. Spec 117 owns it.

## GitHub Boundaries

Samebase has three separate GitHub records:

1. A GitHub `authAccounts` row is one Samebase account's sign-in identity. Its stable identity is
   `providerAccountId`. Its email and login are provider observations.
2. An `organizations` row stores one GitHub App installation for its stable repository owner.
3. A `githubUserAuthorizations` row stores one Samebase user's GitHub App user authorization.

GitHub sign-in through the hub creates or refreshes only the first record, keyed by the raw GitHub
user id from `connector_account_id`; a Google sign-in does not touch it. The hub's GitHub connector
requests `read:user user:email`, and Samebase receives no GitHub token. The GitHub App flow supplies
repository permissions through the other two relationship types.

One Samebase user can have at most one GitHub sign-in identity and one GitHub App user
authorization. Their stable GitHub user IDs must match. Direct GitHub authorization and GitHub App
setup reject a missing sign-in identity before redirect. Their one-use state records the expected
stable GitHub user ID, and the callback checks that ID against both the current sign-in row and the
GitHub user. Authorization use repeats the identity check. Email and login values are never proof.

The direct GitHub authorization callback stores the access and refresh credentials in the
server-only `githubUserAuthorizations` row. The browser receives no GitHub token or credential
handle. `/org` uses this durable authorization to list visible GitHub App installations. Samebase
refreshes it silently when possible and asks the user to authorize GitHub only when it is missing,
expired, or revoked.

Only direct `user_authorization` OAuth exchanges an authorization code and issues or rotates these
credentials. GitHub App installation and reconnect callbacks use the saved authorization. They do
not issue or store another GitHub user token.

GitHub App installation and reconnect setup use the same linked identity and durable authorization.
They do not create a second GitHub actor or temporary connection credential. A personal owner also
requires the installation owner ID to match the GitHub user ID. The connection action repeats the
live GitHub installation, identity, personal-owner or organization-administrator, and Samebase
access checks.

The user authorization belongs to one Samebase user. It supports installation discovery and user
actions that require GitHub identity, including repository creation under that personal GitHub
account. Its management and revoke control appears only on that personal owner's Providers page. The
Organizations page shows the authorization recovery action when the credential is not usable.
Revoking it removes both discovery and personal repository creation access until the user authorizes
GitHub again. It does not remove the GitHub sign-in method, uninstall the GitHub App, or remove a
Samebase membership. The beta does not replace it with another GitHub identity.

GitHub organization setup requires the Samebase account's linked GitHub identity to be a live
administrator for the selected organization. Spec 120 owns the administrator and installation
checks. Organization repository creation and normal operations use installation authentication and
do not require the user's GitHub authorization.

An organization invitation uses one stable GitHub `providerAccountId` to identify its exact
recipient. A current Samebase owner grants the membership, and the matching recipient explicitly
accepts it. The GitHub identity does not grant membership by itself and is not an ongoing access
check after acceptance. GitHub login, email, and organization role are not acceptance proof.

## Non-Goals

- Silent account merging by an unverified email
- Automatic account-email selection from several provider observations
- Self-service account-email changes before a dedicated verification flow exists
- Self-service sign-in method removal or replacement
- Several Google or GitHub identities for one Samebase account
- Using a GitHub login or email as organization membership proof
- Requiring a connected GitHub sign-in identity for ongoing membership or GitHub organization
  operations

## Validation

- `identity/signIn.convex.test.ts` covers the hub profile mapping, GitHub and Google identities from
  before the hub with a changed email, the raw GitHub user id row, verified-email attachment, the
  one-identity-per-provider rule, unverified emails, GitHub access identity conflicts, approval,
  deleting and deleted users, and the new-user notification.
- `githubUserAuthorizations.convex.test.ts` covers durable authorization status, refresh,
  revocation, GitHub sign-in matching, and GitHub App identity conflicts.
- `githubAppInstallation.convex.test.ts` covers one-use setup state, callback identity checks,
  organization-bound setup, and exact personal-owner verification.
- `githubAppConnection.convex.test.ts` covers durable-authorization discovery, current GitHub
  administrator checks, Samebase membership classification, and final connection races.
- `UserSettingsPage.test.tsx` covers the visible GitHub method with and without a login, the hidden
  Google method, and no Connect or removal action.
- `ProviderConnectionsPage.test.tsx` covers the personal-owner authorization control and proves that
  it is absent for a GitHub organization owner.
- `SignInWithOAuth.test.tsx`, `authClient.test.ts`, and `PublicLandingAccountSection.test.tsx` cover
  the OAuth starts, direct `auth=` starts, the return markers, and the message of a rejected
  sign-in. `PublicLandingAuthControls.test.tsx` covers the password-only page of a deployment
  without a hub.

## Rollout

RFC 129 Phase 4 moves GitHub and Google sign-in onto the hub. The login OAuth App and the Google
client stay, now used only by the hub. Each deployment holds its own hub client, registered with the
callback URL `<site>/auth/hub/callback`; production's is `https://samebase.com/auth/hub/callback`.
Final validation must sign in through the hub with GitHub as an existing user and land on the same
`users` row, sign in with GitHub on a preview deployment, keep the password flow unchanged, list the
visible App installations, and authorize personal repository creation for the matching personal
owner.
