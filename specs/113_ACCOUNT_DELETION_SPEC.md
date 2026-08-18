# 113 Account Deletion Spec

## Status

Accepted. This document is the source of truth for account deletion behavior. RFC 097 retains the
release plan and manual acceptance evidence.

## User Contract

A signed-in, non-staff user can start account deletion from `/settings`. The confirmation requires
the exact phrase `delete my account`.

The confirmation must distinguish the user's Samebase identity from organization data. Account
deletion removes the user's login, profile, personal preferences, MCP access, pending provider
authorization states, GitHub App user authorization, and every provider credential slot whose
current `connectedByUserId` identifies that user. It does not delete an organization, organization
invitation, organization billing, deployment destination, vault, staged file, attached resource,
observation, or organization workflow record. It deletes the organization provider credential
document only when it clears the last credential slot.

Account deletion is rejected while any organization membership exists. A member must leave each
shared organization first. A sole owner must remove every vault and delete the organization first.

Acceptance creates one durable queued deletion run, marks the user as deleting, and routes every
signed-in session to `/account-deletion`. The account is disabled immediately. The permanent
deletion workflow starts exactly seven days after the request. The status page shows that time and
directs the user to email `contact@samebase.com` to restore the account or for other inquiries. The
dialog and status page use the exact confirmation text
`Samebase will send you a confirmation email as account deletion finishes.` Repeated requests return
the same active run without rechecking the phrase.

A deleting user cannot use ordinary authenticated product routes or create new user-owned data. A
deleting user cannot create a new auth session. The initiating session remains available only for
account-deletion access until the workflow removes it or staff restores the queued account.

## User Lifecycle

The `users` table has one closed lifecycle union:

1. `active` contains the account profile and normal account authority.
2. `deleting` contains the profile, deletion run ID, and request time. It grants only the access
   that this deletion flow requires.
3. `deleted` contains only the existing Convex `_id`, system `_creationTime`, `state: "deleted"`,
   and `deletedAt`. It grants no authority and is terminal.

The normal forward transitions are `active` to `deleting` and `deleting` to `deleted`. Before the
permanent deletion workflow starts, staff can restore the queued account from `deleting` to
`active`. Restoration deletes the queued run and its request event in the same transaction. The
scheduled callback then does nothing because the run no longer exists. This flow does not retain a
canceled run or add a cancellation state.

A workflow failure leaves the user deleting and marks the run as needing attention. Staff cannot
restore an account after the permanent deletion workflow starts. No transition can leave `deleted`.
A later signup by the same person creates a new active row with a new user ID.

A missing user row means that a stored user reference is invalid or damaged. Product code must not
present it as a deleted account. An approved durable user reference resolves a deleted row to the
exact product term `Deleted Samebase account`. Referencing tables continue to store `Id<"users">`.
They do not store a second active-or-deleted union.

The terminal row keeps its opaque ID so retained organization records can keep valid attribution. It
keeps `_creationTime` because Convex stores this system field on every document. It keeps
`deletedAt` to record the terminal lifecycle event. These values are retained only for referential
integrity, corruption detection, and lifecycle timing. They are not used for authentication,
contact, account matching, approval, organization access, or reactivation. The workflow removes the
profile, auth, preference, provider, and other personal rows that could associate the opaque values
with the person. Organization memberships must be absent before the workflow starts.

## Completion And Browser Recovery

Before requesting deletion, the initiating browser stores a random 256-bit completion capability.
The authenticated request binds it to the run. A retry reuses the stored capability so a committed
request whose response was lost remains observable.

Before finalization, only the deleting user can read the run through the user-facing status query.
Staff have a separate admin-only operational projection. After authenticated identity cleanup, the
browser uses an unauthenticated connection and the capability to read only the matching successful
scrubbed receipt. The stale authenticated connection still rejects the deleted user. The capability
is stored in the browser, never put in the URL, and never grants access to account data.
Authentication loss, token expiry, or a missing receipt is not proof of success.

An authenticated terminal-deleted signal can start browser cleanup on another device without a local
completion capability. The signal proves that the authenticated account reached the terminal state,
but it does not grant access to the scrubbed receipt.

After a successful receipt or an authenticated terminal-deleted signal confirms the terminal state,
the browser signs out and clears Samebase local storage, session storage, IndexedDB, caches, service
workers, and PostHog browser identity before showing completion. If browser cleanup is blocked, the
page stays in a finishing state and tells the user to close other Samebase tabs and retry.

## Deletion Order

The run stays queued until its scheduled deletion time. Staff can start the same queued run early
after a direct user request. Starting the run manually or at its scheduled time uses the same
permanent deletion workflow.

The workflow must:

1. Stop the user's other Samebase sessions.
2. Revoke the user's GitHub App user authorization.
3. Clear each current Cloudflare credential slot whose `connectedByUserId` identifies the user. Do
   not revoke the upstream authorization automatically. The completion email tells the user to
   remove Samebase from Cloudflare Connected Applications if they also want to revoke that grant.
4. Clear each current Convex credential slot whose `connectedByUserId` identifies the user. When a
   slot used Convex OAuth, retain the manual revocation notice because Samebase cannot revoke the
   upstream authorization.
5. Delete personal preferences, MCP grants and tokens, provider callback states, and GitHub App
   setup states in bounded batches. Preserve organization invitations and their creator and acceptor
   user references. For each accepted invitation that names this user as acceptor, remove its code
   and GitHub recipient fields before finalization.
6. Attempt the confirmation email as account deletion finishes and include the opaque deletion
   operation ID as the support reference.
7. Repeat every final readiness check, then delete the final auth session. In the same transaction,
   replace the matching `deleting` user row with the exact PII-free `deleted` variant and replace
   the live deletion run with its scrubbed successful receipt. Use one completion time for
   `deletedAt` and the receipt.
8. Retain only the scrubbed operation receipt in application tables. The workflow component can
   retain an identity-free execution journal for operational recovery.

A failed required step leaves the account deletion-only and marks the run as needing staff
attention. It never silently reactivates the account. Staff can restore or start only a queued run,
or retry a run that needs attention, from `/admin/account-deletions`. Staff cannot skip required
steps or force success.

Row existence never grants authority. Active users get their normal account, staff, approval,
organization, provider, vault, billing, browser handoff, and MCP access. Deleting users get only
account-deletion access through an existing session and cannot create another session. Deleted users
get no authenticated access. Stale sessions, JWTs, MCP credentials, OAuth callbacks, browser
handoffs, provider callbacks, and provider refreshes must reject deleted users. Deleted and deleting
users do not count as staff, approved users, organization members, or active owners. A durable
workflow that already owns a run or lock can finish from that run or lock. It must not use the user
row as continuation authority. Manual provider-write locks store the initiating user ID. Account
deletion waits for an active lock owned by that user, and the lock authorizes its bounded local
completion writes. A new provider refresh claim requires an active user and the normal provider
authority. An exact refresh lock authorizes only its matching GitHub finish or release. A Cloudflare
replacement requires the exact expected authorization and lease. Cloudflare release requires only
the exact lease and clears only that lease. A Cloudflare continuation can finish after the actor is
deleting or deleted only while the unchanged shared credential slot and exact lease still exist. It
must fail and cannot recreate the slot if cleanup removed or changed it.

Clearing a matching local credential slot is required. Samebase does not call Convex or Cloudflare
revocation endpoints during account deletion. Manual provider revocation is not a completion gate.

## Data And External Resources

Every application table has an explicit account-deletion policy. The executable registry must fail
type checking when a new table has no policy.

The following organization-owned data always remains:

- Organizations and organization billing.
- Organization invitations, including creator and acceptor attribution. Accepted invitations for the
  deleting recipient keep no code or GitHub recipient fields.
- Vaults, staged files, file update history, observations, and provider resource attachments.
- Vault provisioning and deletion plans, locks, runs, and events.
- External GitHub repositories, Convex projects and deployments, Cloudflare Workers, and domains.

`organizationProviderCredentials` is one organization-owned document with optional Convex and
Cloudflare slots. Each slot has a `connectedByUserId` provenance field. Deleting that user clears
only a slot that still names the user. If this clears the last slot, Samebase deletes the credential
document. The organization destinations and provider-owned infrastructure remain. A slot that
another owner has already replaced names that owner and is not cleared.

Previously distributed Convex production and preview deploy keys remain usable after Samebase
deletes its local credential. They remain usable until the user manually revokes Samebase in Convex
Authorized Applications. Samebase does not promise that future builds keep working after that manual
upstream revocation.

PostHog processor deletion is not automated or a workflow completion gate in this release. Browser
PostHog reset is device cleanup only. Identified processor deletion remains a manual operator task
until real deletion volume justifies automation.

A terminal deleted union is appropriate only when a retained product record must keep a stable
foreign key and the product must distinguish a valid deleted subject from damaged data. Permission
rows, tokens, credentials, transient callback state, personal settings, and entities with no
retained-reference contract are hard-deleted or cleared. Organization memberships are a request
precondition and must already be absent. This rule does not create a generic deletion framework and
does not change another entity lifecycle by itself.

## Rollout

This pre-beta cutover uses the final closed lifecycle union. It does not add fallback reads, dual
writes, compatibility fields, or a migration framework. Existing pre-beta user data must match the
final union before the schema deploy. Existing manual provider-write lock rows must be absent or
carry `owner.userId` before that deploy. Every stored provider credential `connectedByUserId` must
resolve to an existing non-deleted user, or its damaged credential slot must be cleared. Previously
hard-deleted IDs cannot be restored.

## Required Validation

- A request is idempotent and capability retries keep observing the same run.
- A request disables the account immediately, stays queued for seven days, and exposes the exact
  permanent deletion start time.
- Staff can restore or start only a queued run. Restoration removes the run and returns the same
  user to active. A later scheduled callback is a no-op.
- A request with any organization membership is rejected without creating a deletion run.
- Normal routes and writes reject a deleting user.
- Viewer, session, OAuth, browser handoff, provider callback, and MCP state-matrix tests enforce the
  deleting and deleted boundaries. Missing user references fail as corruption.
- Staff, approval, membership, billing, and active-owner checks count only active users.
- Each matching local credential slot is cleared without a Convex or Cloudflare revocation request.
  The completion email gives the manual upstream revocation steps.
- At most one Convex and one Cloudflare slot per organization are processed in bounded batches
  across the user's organizations.
- Personal preferences, OAuth states, MCP grants and tokens, GitHub user authorization, and auth
  data are removed. Organization invitations keep their creator and acceptor user IDs. The original
  user ID resolves through the exact deleted variant. An accepted invitation does not keep GitHub
  recipient PII for that deleted acceptor.
- Organizations, billing, vaults, staged files, attached resources, observations, and organization
  workflows survive unchanged.
- Completion-email failure remains visible without retaining the account indefinitely.
- Successful runs retain only the scrubbed application receipt plus identity-free workflow state.
- The final transaction rechecks readiness and writes the deleted user variant and scrubbed receipt
  atomically. Failure leaves the user deleting, and retry can complete the same run.
- A later signup creates a new active user ID. It does not reactivate the deleted row.
- Approved retained attribution presents the exact term `Deleted Samebase account`. A missing
  reference is not presented as deletion.

The release acceptance walkthrough and its evidence remain in RFC 097 until rollout is complete.
