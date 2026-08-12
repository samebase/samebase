# 124 Organization Deletion Spec

## Document Control

- Status: Accepted
- Owner: Samebase product and engineering
- Last updated: 2026-08-12
- Related specifications: Specs 113, 119, 120, 121, and 123
- Provider validation: `research/2026-08-11-polar-organization-deletion-validation.md`
- Storage validation: `research/2026-08-12-organization-deletion-storage-validation.md`

## Current Contract

### Eligibility And Confirmation

An active organization owner can request organization deletion from Organization settings. The
request is allowed only when that owner is the organization's sole membership row. A pending
invitation is not a membership and does not block deletion. The deletion workflow removes pending
and accepted invitation rows with the rest of the organization data.

If another membership exists, Samebase does not change the organization. The user must use Members
to leave, remove members, or resolve ownership. This first release does not delete a shared
organization.

The confirmation phrase is `delete <GitHub owner login>`. The server computes and checks the phrase
again in the request transaction. A lost response can return the existing active run. It cannot
create a second run.

Account deletion never starts organization deletion and never removes a current organization
membership. Any membership blocks account deletion. The user must first leave each shared
organization through the normal ownership, active-work, and billing-payer rules. A sole member must
explicitly delete that Samebase organization. A designated Polar billing payer cannot leave a shared
organization until billing ownership is transferred.

### Organization Lifecycle

An organization has these deletion states:

1. An absent deletion gate means that the organization is active.
2. `deleting` identifies one active organization-deletion run and its request time.
3. `delete_failed` identifies the same recoverable run and its failure time.
4. Success removes the organization row. It leaves one scrubbed operation receipt that has no
   organization ID, user ID, provider ID, GitHub login, or error payload.

The request transaction creates the run and sets the organization gate before the first Polar call
or local cleanup write. New checkout, billing portal, member, invitation, provider connection,
vault, and provisioning actions reject a deleting or failed organization. An already authorized
workflow can finish its exact current work. Organization deletion waits for that work before it
removes local rows.

An action that can write Polar must acquire a durable organization billing-action lease before its
first provider call. The lease expires after the maximum action lifetime and is released after the
provider and local recording steps finish. Organization deletion waits for active billing-change,
Customer portal, and seat-synchronization leases. A lease request after the deletion gate is set
does not authorize a provider call.

The owner can read the running or failed status from Organization settings. Samebase staff can read
all failed runs and retry the same run. Retry does not create a new cleanup identity and does not
skip a required provider or data check.

Deleting and failed organizations remain visible only for their lifecycle status. Organization and
vault navigation routes the owner to Organization settings. Vault lists and deep vault pages do not
show organization data while cleanup is active.

Execution uses a scheduled state machine. Each scheduled action re-reads the exact run and
organization gate. It performs one bounded provider step or one bounded local-data batch, commits
its progress, and schedules the next action with the same run and execution attempt. Duplicate or
late scheduler delivery cannot take authority from a different attempt. A configured step or batch
limit changes the run to `needs_attention`; it does not claim success. The lifecycle keeps its
explicit run and the latest 64 safe events. One stopped execution can restart automatically for each
staff attempt. A second stopped execution changes the run to `needs_attention`. It does not keep a
second component journal with copied organization, user, or provider arguments.

### Polar Cleanup

Polar billing belongs to the Polar team Customer for the Samebase organization. The designated payer
is a billing actor. Samebase does not delete the Polar seller Organization.

When the billing row has a Polar external Customer ID, the workflow must perform these steps before
it deletes the local billing row:

1. List every `open` and `confirmed` checkout for the exact external Customer identity and, after
   resolution, the exact Polar Customer ID. Polar has no documented checkout cancel or expire
   endpoint. `confirmed` means that the buyer clicked Pay and does not prove payment success. If
   either state exists, keep the run recoverable and do not claim deletion. Retry after the checkout
   expires or reaches a final state.
2. Resolve and retain the Polar Customer ID in the active run before any destructive provider call.
   A missing Customer is acceptable only after the checkout read proves that no unsettled checkout
   exists.
3. List subscription pages for that Customer in bounded calls. Immediately revoke every
   `incomplete`, `trialing`, `active`, `past_due`, or `paused` subscription. This includes a
   subscription that is set to cancel at period end or can resume later. `unpaid`,
   `incomplete_expired`, and `canceled` are terminal states. Re-read until no subscription can cause
   a future charge.
4. Delete the Customer with `anonymize=true`. This immediately cancels remaining active
   subscriptions, revokes benefits, clears the external ID, and anonymizes Customer data that Polar
   can anonymize. Polar can keep historical orders and subscriptions.
5. Verify that the exact Customer or external Customer identity no longer has an active billing
   relation. Only then record provider cleanup as complete.

Customer deletion is the provider cleanup for the Polar team Customer, its Members, seats, and
benefits. Samebase does not delete each Member or CustomerSeat as a separate first-release step.
Official Polar documentation states that Customer deletion revokes benefits and active
subscriptions, but it does not define the retained presentation of team Members and CustomerSeats.
Sandbox validation must record that behavior. A remaining historical Member or seat is not itself a
future-charge relation. A readable Customer identity, nonterminal subscription, or unsettled
checkout keeps the run incomplete.

Provider timeouts, rate limits, server errors, conflicts, and unexpected responses are unknown
outcomes. The workflow reads provider state before it retries. A second revoke or Customer delete
can count as complete only when the run retained the exact provider ID and current reads prove that
no chargeable relation remains.

If the billing row has no Polar external Customer ID, Polar cleanup is not required. The workflow
does not depend on the local plan or provider status because a failed checkout can reserve a
Customer identity before a subscription becomes active.

Polar webhooks cannot restore billing for a deleting organization. A delayed seat synchronization
job must stop safely when the organization is deleting or missing.

### Samebase Data Cleanup

The scheduled state machine deletes Samebase-owned organization data in bounded, repeatable batches.
Each retry starts from current database state and deletes the next remaining batch. A batch is safe
to run again after a timeout or process stop.

The cleanup includes:

- organization memberships and invitations
- organization billing and Polar checkout state
- Convex and Cloudflare provider credentials and pending provider callback state
- pending GitHub App setup state for the organization
- vault rows, staged files, staged updates, file and branch observations, and Convex storage blobs
- Convex project and Cloudflare Worker attachment rows
- vault folders, assignments, disclosure settings, filters, layouts, and resource-link settings
- provisioning plans, write locks, runs, and events
- vault-deletion runs and events
- all other organization-scoped UI state

Storage cleanup deletes a Convex storage object only after no surviving Samebase row refers to its
storage ID. Every browser media upload and action cache write first creates an organization-owned
reservation. The browser receives a Samebase upload capability, not an unrestricted Convex upload
URL. The Samebase HTTP action stores the blob with the reservation marker, so the client cannot omit
or change its cleanup identity. An action cache write creates the same marker before storage. A
successful database write removes its reservation only after the storage ID is referenced. A stopped
action leaves the reservation and marker for bounded expiry cleanup. Organization deletion waits for
active reservations and removes every unreferenced marked blob before it removes the reservation.

Child rows are deleted before their parent. Before provisioning history is removed, the workflow
removes the vault's direct run reference. The final transaction rechecks that all required provider
and data cleanup is complete, deletes the retained progress events, sole membership, and
organization row, and scrubs the successful run.

Every application table has an executable organization-deletion policy. Adding a table without a
policy must fail type checking.

### External Infrastructure

Organization deletion removes Samebase records and access only. It does not call provider deletion
or uninstall APIs for these external resources:

- GitHub repositories and GitHub App installations
- Convex projects and deployments
- Cloudflare Workers and domains

These resources stay at their providers. Samebase can no longer show or manage them after local
cleanup. A separate accepted product decision is required before organization deletion can offer an
external resource deletion option.

Deleting Samebase provider credentials is a local data action. This lifecycle does not uninstall the
GitHub App and does not call Convex or Cloudflare to delete deployments, revoke credentials, or
remove provider resources.

### Failure And Recovery

A provider or data failure keeps the organization row, the sole membership, the deletion gate, the
active run, and the bounded recent safe progress history. Earlier local batches can already be
absent. The UI does not say that deletion succeeded. Normal organization writes stay blocked so they
cannot recreate data behind the cleanup cursor.

The owner and staff see a safe status. Provider response bodies, credentials, tokens, checkout URLs,
and personal billing data are not stored in events or shown in UI. A retry uses the same run and the
retained exact provider identity. Success deletes progress events and retains only the scrubbed
receipt.

## Required UI Copy

The confirmation must state both parts of the boundary:

> Samebase will permanently delete this organization, its vault records, staged changes, provider
> connections, billing state, and saved settings.

> GitHub repositories, Convex projects and deployments, Cloudflare Workers, and domains will stay
> online. Samebase will not uninstall or delete them.

The action label is `Delete organization`. The pending label is `Deleting...`. The running status
states that external infrastructure stays online. A member-count blocker states that Samebase will
not delete a shared organization and links the owner to Members.

## Non-Goals

- Deleting an organization that has more than one membership
- Automatically deleting an organization during account deletion
- Self-serve designated payer transfer
- Deleting or uninstalling external provider resources
- Refunding a Polar order or subscription
- Removing Polar historical order or subscription records
- A generic deletion framework for unrelated product entities

## Validation

Focused Convex tests must prove:

- only an active sole-member owner can create a run
- a second member, a non-owner, an invalid phrase, and a concurrent run do not start deletion
- the gate blocks new billing, membership, provider, vault, and provisioning work
- any organization membership blocks account deletion, and a sole member must use explicit
  organization deletion first
- active user billing and scheduled seat-synchronization actions block cleanup until their leases
  end
- provider cleanup waits for `open` and `confirmed` checkouts
- every nonterminal subscription is revoked before anonymized Customer deletion
- timeouts and already-removed provider objects are reconciled without a false success
- local cleanup is bounded, retryable, storage-safe, and complete for every policy table
- active vault work blocks cleanup and a terminal retry can continue
- failure keeps the organization and staff-visible status
- finalization removes the organization and membership atomically and scrubs the receipt
- external resource APIs are not called

Focused UI tests must prove the owner confirmation, the shared-organization blocker, the external
infrastructure copy, the pending state, and the recoverable failure state.

Polar Sandbox acceptance must record checkout, subscription, Customer, team Member, CustomerSeat,
benefit, webhook, and repeated-delete behavior. The scheduled state machine must keep the
conservative checkout wait when Polar does not document or prove a faster safe path.

## Rollout

This work starts from the default branch and stays separate from PR 1414. After PR 1414 merges, the
organization-deletion branch must rebase and keep its designated payer, pooled Customer, checkout,
seat, and stale seat-synchronization contracts. The organization deletion code must not copy or
replace PR 1414 billing work.

The deletion gate is an optional organization field for the first deployment. Existing rows with no
gate are active. New deletion requests write the gate before cleanup. A later schema-tightening
change can add an explicit active variant only after a bounded backfill has completed.
