# 113 Account Deletion Spec

## Status

Accepted. This document is the source of truth for account deletion behavior. RFC 097 retains the
release plan and manual acceptance evidence.

Spec 120 defines the accepted organization transition. The current user-owned resource contract
below stays effective until Phase 2. Phase 1 makes the narrow membership and billing cleanup changes
defined below.

## Accepted Organization Transition

The transition changes account deletion in these phases:

- Phase 1 removes the deleting user's membership. It preserves an organization when another member
  remains and removes the empty organization after the sole member's normal cleanup finishes. It
  cancels and deletes organization billing only for a sole member. Shared subscription stakes and
  billing stay with the organization.
- Phase 2 applies the same sole-member decision to the organization's vaults, staged changes, and
  other Samebase-owned resources. The existing full cleanup order applies only to sole-member
  organizations.
- Every phase deletes the user's personal data, provider connections, and provider authorizations.
- Actor and workflow rows on retained organization data follow their table-specific delete, detach,
  or anonymize policy. They do not grant access and do not cause shared resources to be deleted.

Vault-deletion runs and events are vault lifecycle data. Account deletion preserves them while the
parent vault exists, including when the deleting user requested the failed deletion. Their actor IDs
are opaque historical provenance. They can refer to a deleted user, are never resolved for
authorization, and do not preserve user profile data. The bounded vault deletion path owns their
removal. Account cleanup deletes terminal lifecycle events, then terminal runs, immediately before
it deletes a vault. A normal vault deletion deletes the vault row, marks the active run successful,
then deletes lifecycle events and terminal runs through journaled workflow batches. An idempotent
scheduled continuation completes the same per-vault cleanup if the workflow completion path needs a
fallback. No actor-wide account cleanup scan owns vault lifecycle data.

The confirmation list, counts, and phrase include only the data that this deletion request will
delete. Provider-owned infrastructure stays outside the deletion boundary in all phases. Each
implementation phase updates the Current Contract below when its transition ships.

## User Contract

A signed-in, non-staff user can start account deletion from `/settings`. The `Delete account` action
opens the URL-owned `?delete-account` confirmation dialog. The confirmation must say that Samebase
data and uncommitted staged changes are permanently deleted, while nothing outside Samebase is
deleted: apps, GitHub repositories, Convex projects and deployments, Cloudflare Workers, domains,
and other external resources keep running. The permanent-deletion statement and the
external-resource reassurance are visually separate, with stronger emphasis on what is deleted.

When uncommitted file changes exist, the dialog shows the exact count and says they will be
permanently deleted without being pushed to GitHub. It lists every affected repository and branch,
including the per-branch count, with direct links to staged-changes review. A bounded internal
scroller contains long lists. The warning is absent for a confirmed zero count and while stakes are
loading. Above the 500-change cap, or when the backend cannot produce a complete reviewable list,
the dialog links to the vault list instead of showing a partial list.

The confirmation dialog shows the viewer's current deletion stakes and requires typing a dynamic
confirmation phrase before the destructive action enables. The base phrase is `delete my account`;
nonzero counts extend it with the vault count and the uncommitted file change count, for example
`delete my account, 3 vaults, and 5 uncommitted file changes`. Counting uncommitted file changes
stops at 500, after which the phrase reads `more than 500 uncommitted file changes`. The displayed
phrase is selectable and pasting is allowed. The request mutation recomputes the phrase from current
data and compares the complete displayed stakes, including affected repositories, branches, and
cancellable-subscription state. It rejects either mismatch with a `stakes_changed` result instead of
creating a run. The subscribed stakes query remains the only source of displayed details, and the
dialog clears the typed phrase and asks for confirmation again.

Acceptance creates one durable deletion run, marks the user as deleting, and routes every signed-in
session to `/account-deletion`. Repeated requests return the same active run without rechecking the
phrase. A deleting user cannot use ordinary authenticated product routes or create new user-owned
data.

The request rejects while a manual provider change is active and tells the user to wait for it to
finish. A manual provider change rejects after the request marks the user as deleting. These two
start checks prevent account deletion and a provider change from owning the same account at the same
time.

If a deletion request reports a pending billing checkout, the dialog attempts one Polar
reconciliation and repeats the same request once, even if reconciliation fails, before it shows the
support message.

The deletion page is a direct projection of persisted backend progress. It shows these groups:

- Vaults and staged changes, including the number of deleted vaults and current cleanup phase.
- Preferences.
- App access and tokens.
- Access requests and history.

Vault and staged-data cleanup repeats bounded mutations until the persisted group reaches
completion. It has no fixed batch-count ceiling. Each action attempt remains subject to Convex's
execution limit and the workflow retry policy, while committed progress lets staff retry continue
from the last completed batch. Every destructive batch rechecks active vault deletion, provisioning,
and repository-refresh work before deleting rows. During Phase 1, the verified legacy `userId`
dual-write makes this indexed check cover all organization vault work for a sole member. For a
shared organization, the same check covers only work that depends on the deleting user. Work owned
by a remaining member continues. The UI does not estimate percent complete or display steps the
backend does not persist.

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

1. Stop other sessions and wait for active Samebase work to quiesce.
2. Cancel active Samebase billing.
3. Attempt supported provider authorization revocation, then remove local provider credentials.
4. Delete Samebase-owned vault, staged, storage, profile, preference, access, and workflow data in
   retryable batches.
5. Recheck billing, then attempt the completion email with the opaque deletion operation ID as the
   user's support reference.
6. Recheck late sessions, credentials, and cleanup invariants.
7. Delete the final auth session, auth account, and user row.
8. Retain only the scrubbed operation receipt in application tables. The workflow component can
   retain an identity-free execution journal for operational recovery.

A failed required step leaves the account deletion-only and marks the run as needing staff
attention. It never silently reactivates the account. Staff can inspect and retry the same run from
`/admin/account-deletions` but cannot skip required steps or force success.

## Data And External Resources

Every application table has an explicit account-deletion policy. Executable cleanup registries and
tests separately prove that owned rows are deleted, detached, anonymized, or intentionally retained.
The active `users` row is workflow state, not a soft-deleted account, and is removed at completion.

Samebase never deletes provider-owned infrastructure during account deletion. Existing deployments
continue running. Previously distributed Convex production and preview deploy keys remain usable
after Samebase deletes its local account and provider data. They remain usable until the user
manually revokes Samebase in Convex Authorized Applications. Samebase does not promise that future
builds keep working after that manual upstream revocation.

PostHog processor deletion is not automated or a workflow completion gate in this release. Browser
PostHog reset is device cleanup only. Identified processor deletion remains a manual operator task
until real deletion volume justifies automation.

## Required Validation

- A request is idempotent and capability retries keep observing the same run.
- Account deletion and manual provider changes reject each other at their start mutations.
- More than 96 vault cleanup batches complete successfully.
- Every detailed destructive batch fails closed when conflicting work appears.
- Vault deletion removes lifecycle events before runs, does not remove an active run, and leaves no
  lifecycle rows after its bounded continuation completes.
- Normal routes and writes reject a deleting user.
- Billing failure prevents success, while completion-email failure remains visible without retaining
  the account indefinitely.
- Provider-owned infrastructure is never deleted.
- Successful runs remove identity and owned data while retaining only the scrubbed application
  receipt plus identity-free workflow execution state.
- Desktop and mobile route tests cover confirmation, running progress, and needs-attention states.
  Component tests cover staff retry and capability-gated browser completion.

The release acceptance walkthrough and its evidence remain in RFC 097 until rollout is complete.
