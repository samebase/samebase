# 113 Account Deletion Spec

## Status

Accepted. This document is the source of truth for account deletion behavior. RFC 097 retains the
release plan and manual acceptance evidence.

## User Contract

A signed-in, non-staff user can start account deletion from `/settings`. The confirmation requires
the exact phrase `delete my account`.

The confirmation must distinguish the user's Samebase identity from organization data. Account
deletion removes the user's login, profile, personal preferences, organization memberships, MCP
access, pending provider authorization states, GitHub App user authorization, and every provider
connection that user created. It does not delete an organization, organization billing, vault,
staged file, attached resource, observation, or organization workflow record.

An organization can continue to exist after its last membership is removed. Inviting or adding a new
member later restores access to its existing data. Removing the user who connected a provider
removes that provider credential and can make operations that depend on it unavailable until a
member reconnects the provider.

Acceptance creates one durable deletion run, marks the user as deleting, and routes every signed-in
session to `/account-deletion`. Repeated requests return the same active run without rechecking the
phrase. A deleting user cannot use ordinary authenticated product routes or create new user-owned
data.

## Completion And Browser Recovery

Before requesting deletion, the initiating browser stores a random 256-bit completion capability.
The authenticated request binds it to the run. A retry reuses the stored capability so a committed
request whose response was lost remains observable.

While the identity exists, only the deleting user can read the run through the user-facing status
query. Staff have a separate admin-only operational projection. After identity deletion, the browser
can use the capability to read only the matching successful scrubbed receipt. The capability is
stored in the browser, never put in the URL, and never grants access to account data. Authentication
loss, token expiry, or a missing receipt is not proof of success.

After the receipt confirms success, the browser signs out and clears Samebase local storage, session
storage, IndexedDB, caches, service workers, and PostHog browser identity before showing completion.
If browser cleanup is blocked, the page stays in a finishing state and tells the user to close other
Samebase tabs and retry.

## Deletion Order

The workflow must:

1. Stop the user's other Samebase sessions.
2. Revoke the user's GitHub App user authorization.
3. Revoke supported Cloudflare authorizations, then delete the user's Cloudflare connections.
4. Delete the user's Convex connections. When a connection used Convex OAuth, retain the manual
   revocation notice because Samebase cannot revoke the upstream authorization.
5. Delete personal preferences, organization memberships, MCP grants and tokens, provider callback
   states, and GitHub App setup states in bounded batches.
6. Attempt the completion email with the opaque deletion operation ID as the support reference.
7. Delete the final auth session, auth accounts, and user row.
8. Retain only the scrubbed operation receipt in application tables. The workflow component can
   retain an identity-free execution journal for operational recovery.

A failed required step leaves the account deletion-only and marks the run as needing staff
attention. It never silently reactivates the account. Staff can inspect and retry the same run from
`/admin/account-deletions` but cannot skip required steps or force success.

## Data And External Resources

Every application table has an explicit account-deletion policy. The executable registry must fail
type checking when a new table has no policy.

The following organization-owned data always remains:

- Organizations and organization billing.
- Vaults, staged files, file update history, observations, and provider resource attachments.
- Vault provisioning and deletion plans, locks, runs, and events.
- External GitHub repositories, Convex projects and deployments, Cloudflare Workers, and domains.

Provider credentials are organization connections with a `connectedByUserId` provenance field.
Deleting that user revokes supported remote authorization before deleting each matching local
connection. The organization and provider-owned infrastructure remain.

Previously distributed Convex production and preview deploy keys remain usable after Samebase
deletes its local credential. They remain usable until the user manually revokes Samebase in Convex
Authorized Applications. Samebase does not promise that future builds keep working after that manual
upstream revocation.

PostHog processor deletion is not automated or a workflow completion gate in this release. Browser
PostHog reset is device cleanup only. Identified processor deletion remains a manual operator task
until real deletion volume justifies automation.

## Required Validation

- A request is idempotent and capability retries keep observing the same run.
- Normal routes and writes reject a deleting user.
- Supported remote provider revocation succeeds before its local credential is removed.
- Multiple Convex and Cloudflare connections are processed in bounded batches.
- Personal preferences, memberships, OAuth states, MCP grants and tokens, GitHub user authorization,
  auth data, and the user row are removed.
- Organizations, billing, vaults, staged files, attached resources, observations, and organization
  workflows survive unchanged.
- Completion-email failure remains visible without retaining the account indefinitely.
- Successful runs retain only the scrubbed application receipt plus identity-free workflow state.

The release acceptance walkthrough and its evidence remain in RFC 097 until rollout is complete.
