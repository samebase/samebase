# 097 Account Deletion Release Plan

## Document Control

- Status: Implemented, release acceptance pending
- Owner: Nicu Chiciuc
- Created: 2026-07-12
- Related research:
  - `research/2026-07-10-user-settings-and-account-deletion.md`
- Related RFCs:
  - `archive/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`
- Related specs:
  - `specs/018_AUTH_APPROVAL_BOUNDARY_SPEC.md`
  - `specs/098_REPOSITORY_REMOVAL_WORKFLOW_SPEC.md`
  - `specs/113_ACCOUNT_DELETION_SPEC.md`
- Related code:
  - `apps/samebase/convex/auth.ts`
  - `apps/samebase/convex/email.ts`
  - `apps/samebase/convex/schema.ts`
  - `apps/samebase/convex/vault/deletion/`
  - `apps/samebase/src/account/UserSettingsPage.tsx`

## Summary

The durable product contract now lives in `specs/113_ACCOUNT_DELETION_SPEC.md`. This RFC retains the
rollout sequence, release checklist, and manual validation evidence until release acceptance is
complete.

Before release, a signed-in user must be able to delete their Samebase account from Settings and
observe the deletion until it succeeds or needs attention. Staff must be able to observe the same
run and retry failed work.

Deletion has four product stages:

1. **Lock:** accept the request, create a durable deletion run, and deny normal account access.
2. **Wait:** keep the run queued for seven days so support can restore the account or start deletion
   sooner after a direct user request.
3. **Clean:** cancel billing, revoke access, and delete Samebase-owned user data in retryable steps.
4. **Finish:** delete authentication and user records, send completion email, and retain only a
   scrubbed operation receipt.

The feature is not finished merely when a workflow can start. It is finished when the manual release
acceptance test in this RFC passes with a dedicated real account.

## User Contract

### Starting deletion

The authenticated `/settings` Account section has a destructive `Delete account` action. It opens
the URL-owned `?delete-account` confirmation dialog with this meaning:

```text
Delete account?

Your account will be disabled now. Permanent deletion will start seven days
after you continue.

During those seven days, email contact@samebase.com to restore your account
or for other inquiries. Samebase will send you a confirmation email as
account deletion finishes.

Nothing outside Samebase is deleted: your apps, GitHub repositories, Convex
projects, and Cloudflare Workers keep running.

[ Cancel ] [ Schedule deletion ]
```

The current signed-in session proves which account is requesting deletion. The flow does not ask the
user to type their email and does not add a separate recent-authentication flow. The dialog requires
the exact phrase `delete my account`. The displayed phrase is selectable, and pasting into the
confirmation input is allowed.

The request is rejected while any organization membership exists. The user must leave every shared
organization. A sole owner must remove every vault and delete the organization first.

The confirmation action is disabled until the typed phrase matches and while the request is being
accepted. Acceptance atomically creates one durable queued account deletion run and gates the user.
The workflow is scheduled for exactly seven days after acceptance. Repeated submission returns the
same active run instead of creating another deletion and does not recheck the phrase.

### While deletion runs

After acceptance, the app navigates to `/account-deletion`.

While the run is queued, the user sees the exact permanent deletion start time, the
`contact@samebase.com` address for restoration and other inquiries, and the completion-email notice.
Support can restore the same account or start the existing deletion run early. Restoration removes
the queued run and request event. It does not retain a cancellation receipt or create a new
cancellation state.

After permanent deletion starts, the user can see:

- that deletion is in progress
- the current user-safe step and latest progress time
- whether the run needs attention
- that staff attention is required when the run cannot continue

The user cannot navigate to vaults, settings, providers, billing, MCP, or other authenticated
product surfaces. Public routes remain available. All other Samebase browser sessions and MCP grants
stop working. The initiating browser session retains only deletion-status and public-route access
until the terminal step, and the user can sign out from the deletion-status page. Retry is
staff-only in version one so the user cannot trigger destructive workflow steps.

If the user closes the browser or signs out before completion, protected app routes redirect another
existing session to the deletion status route. Public routes remain available. Authentication and
the `users` row are deleted last so a failed deletion does not leave the user without visibility.

Before requesting deletion, the initiating browser creates and stores a random 256-bit completion
capability. The authenticated request binds that capability to the new run. While the identity
exists, the deletion-only status query returns the same capability only to that run's owner. After
identity deletion, the browser uses the capability with a public, capability-gated completion query
to verify the scrubbed receipt. The random capability is not guessable in practice. Authentication
loss, expiry, or a missing receipt never infer deletion success.

### Success

On success:

1. Any active Samebase subscription is canceled.
2. Samebase sessions, MCP grants, and stored provider credentials are revoked or removed.
3. Samebase-owned profile, vault, file, storage, collaboration, preference, and workflow data
   belonging to the user is deleted according to the data-handling matrix below.
4. Samebase will send you a confirmation email as account deletion finishes. It is attempted after
   required cleanup succeeds and before the final identity is removed. Email delivery failure is
   visible to staff but does not retain the user's account indefinitely.
5. The final authentication session, authentication account, and `users` row are deleted.
6. The browser signs out, clears Samebase local storage, session storage, IndexedDB, caches, and
   service-worker state, then shows terminal confirmation under the signed-out application shell.
7. The deletion run retains only its random operation ID, browser completion capability, step
   outcomes, timestamps, and final result. It retains no email, display name, provider credential,
   repository path, or user ID.

Legacy scrubbed receipts created before completion tracking are admin-only because no browser
capability exists that could resolve them publicly.

A later sign-in with the same provider may create a new empty Samebase account through the normal
signup and approval flow. It must never restore the deleted account or its Samebase data.

### Failure

A failed step never silently reactivates the account. The deletion-only status page remains
available and explains at a user level that staff attention is required. Staff see the detailed safe
error and retry controls in the admin view.

Active billing cancellation is a hard completion boundary. The workflow cannot report success while
Samebase can continue charging the user. A provider revocation failure is recorded and retried, but
it does not retain the user's local Samebase data forever after Samebase has removed its stored
credential. Upstream provider revocation gets three attempts separated by five seconds. After that,
the workflow deletes the local credential, records that upstream revocation was not confirmed, and
continues local erasure.

## External Resources

Account deletion removes Samebase's access and Samebase-owned data. It does not delete the user's
GitHub repositories, Convex projects, Cloudflare Workers, domains, or other provider-owned
infrastructure.

Existing deployed applications keep running. Account deletion attempts supported upstream OAuth
revocation before deleting Samebase's local credential. Future builds that rely on a successfully
revoked credential can stop working until the user supplies a replacement credential outside
Samebase.

Convex does not currently expose an application-facing OAuth revocation endpoint. Account deletion
therefore deletes Samebase's stored Convex OAuth token but cannot revoke the authorized application
upstream. Previously distributed Convex production and preview deploy key strings remain usable
until the user revokes Samebase under Convex Authorized Applications. That manual revocation
invalidates the OAuth token and its re-prefixed production and preview key forms; it does not stop
already deployed applications.

## Data Handling

Version one uses this complete product-level matrix. The implementation cleanup registry expands
these classes into the concrete current schema tables and storage objects.

| Data class                                                           | Final action                                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| User profile, auth accounts, sessions, verification data             | Delete                                                                                                                       |
| Provider connections, MCP grants and tokens                          | Revoke where supported, then delete local rows and secrets                                                                   |
| Vaults, files, staged content, collaboration state, and preferences  | Delete Samebase rows and storage objects                                                                                     |
| Samebase subscription                                                | Immediately revoke before success, then delete the local customer link                                                       |
| Other provisioning, refresh, and deletion runs belonging to the user | Quiesce, then delete                                                                                                         |
| Current account deletion run and events                              | Replace with a scrubbed operation receipt                                                                                    |
| Provider backups and infrastructure logs                             | Keep beyond normal product use until automatic provider retention expires; never restore erased account data into active use |

No active application row is retained merely by setting `deletedAt`. The deleting user row is
temporary workflow state and is deleted at the terminal step.

Before release, the privacy and retention copy records the configured provider expiry behavior for
backups, application logs, PostHog, and billing records. Those provider-held copies are not active
Samebase account data and must not be used to recreate an erased account.

## Operational Visibility

Add a staff-only `/admin/account-deletions` route using the existing `access_admin` boundary. It is
an account-deletion operations page, not general user management.

The paginated list and detail view show:

- operation ID
- user email only while deletion is incomplete
- state, current step, and latest progress time
- retry count and latest safe error
- the permanent deletion start time for queued runs
- restore and delete-now controls for queued runs
- billing, provider revocation, and completion-email outcomes
- retry control for retryable failed work

Completed runs show the operation ID, timestamps, step outcomes, and result after the identity has
been scrubbed. Staff cannot restore a run after permanent deletion starts. Staff cannot skip
mandatory steps, force a run to success, impersonate the user, or initiate deletion for an account
that did not request it.

## Backend Contract

Add durable `workflow_accountDeletion_runs` and `workflow_accountDeletion_events` tables. The run ID
is the stable internal identifier used by the user state, workflow, authenticated status route,
admin route, events, and retries. A separate browser-generated completion capability resolves only
the terminal scrubbed receipt after authentication is removed. Email is never used as a workflow
identifier.

An active user's row has no deletion marker. A deleting user's row contains the run ID and request
time. Access resolution maps that user to a deletion-only role granting only public access and the
narrow account-deletion status function.

The request schedules the workflow for seven days later. A queued-only staff mutation can start it
early. A separate queued-only staff mutation restores the same user to active and deletes the run
and request event in one transaction. A scheduled callback with no run does nothing.

The workflow processes bounded, idempotent steps. A fail-closed policy registry classifies every
user-owned or user-referencing table as delete, detach, anonymize, or retain. Executable cleanup
registries have separate coverage tests because some account-owned rows are cleaned through their
vault or parent context. Adding an unclassified table fails validation so future schema additions
cannot silently escape account deletion.

The user progress timeline expands account-data deletion into vaults and staged changes,
preferences, app access and tokens, and access requests and history. These states are persisted by
the cleanup mutations that perform the work. Vault cleanup also records the number of vault rows
deleted and the current per-vault cleanup phase. It does not show a percentage or total-vault
denominator because vaults have different amounts of staged and associated data. New vault,
vault-deletion, staging, OAuth-state, app-provisioning, and repository refresh writes reject users
whose account deletion has started so completed progress cannot be recreated by an in-flight action.

Staff accounts cannot request self-deletion in version one. A non-staff account performs the release
acceptance flow so at least one staff operator retains access to inspect and retry a failed run.

PostHog deletion is not automated and is not a workflow completion gate in version one. At current
scale, the operator handles an identified PostHog deletion manually when required. Browser PostHog
reset remains device cleanup and is not proof of processor deletion. Automation is deferred until
real deletion volume justifies it, and the account run never retains identity only for PostHog.

## Non-Goals

- No deletion capability in the URL and no enumerable public deletion status.
- No general admin user-management system.
- No admin-initiated arbitrary account deletion.
- No staff-account self-deletion until recovery no longer depends on another staff operator.
- No automatic deletion of repositories, deployments, projects, Workers, domains, or other external
  provider resources.
- No automatic PostHog deletion integration.
- No self-service restoration, cancellation state, cancellation receipt, or permanent soft-deleted
  `users` row.

## Definition Of Done

Account deletion is release-ready only when all automated validation passes and the following manual
test succeeds in the production-like environment with a dedicated non-staff account.

### Manual release acceptance

1. Sign in to the dedicated account and record its Convex user ID.
2. Add the account to an organization. Open `/settings`, choose `Delete account`, enter the exact
   phrase `delete my account`, and verify that the request is rejected while the membership exists.
3. Leave every shared organization. If the account is a sole owner, remove every vault and delete
   the organization. Give the account one connected provider and sign in to the same account through
   a different browser or isolated browser profile. MCP and billing boundaries use automated
   fixtures rather than making the human walkthrough depend on optional setup.
4. Open `/settings`, choose `Delete account`, verify the destructive statement and external-resource
   reassurance are visually separate, verify the exact phrase `delete my account`, then confirm
   once.
5. Verify the app immediately navigates to `/account-deletion`, ordinary product navigation is no
   longer available, the exact deletion start time is seven days after the request, and a second
   confirmation cannot create another run.
6. Verify the staff `/admin/account-deletions` page shows the same queued operation, account
   identity, deletion start time, Restore account action, and Delete now action.
7. Restore the account and verify normal account access returns. Request deletion again, then use
   Delete now for the remaining acceptance steps.
8. Verify the other browser or isolated profile and the provider connection stop granting private
   Samebase access. Verify the initiating session can read deletion status and public routes, then
   verify Sign out opens the public landing page.
9. Let the run succeed. Verify the browser is signed out, local Samebase browser data is cleared,
   and the completion email arrives or its delivery failure is visible to staff.
10. Verify the auth account, sessions, user row, credentials, Samebase storage objects, and all
    classified user data are absent.
11. Verify the admin page retains a successful scrubbed receipt without the account's email, user
    ID, or other identity.
12. Verify the account's external repositories, Convex projects and deployments, Cloudflare
    resources, and deployed applications still exist and remain running.
13. Sign in again with the same identity. Verify the deleted data does not return and any resulting
    account is a new empty account governed by the normal signup and approval flow.

### Automated validation

- Exhaustively prove every user-owned and user-referencing table has a cleanup classification.
- Seed more than one cleanup batch and prove bounded deletion reaches completion.
- Prove all normal writes and routes reject the deleting role.
- Prove request acceptance is idempotent and creates one run.
- Prove the scheduled start waits seven days and a queued run can be restored or started early only
  by staff.
- Prove failure and retry at every durable step are idempotent.
- Prove billing cancellation failure prevents success.
- Prove provider-resource deletion is never requested.
- Prove successful runs scrub personal identity while retaining safe operational evidence.
- Prove completion email failure is visible and does not retain the account indefinitely.
- Add route and UI tests for confirmation, deletion-only progress, failure, retry, and success.
- Add real-route desktop and mobile screenshots, then pass `pnpm test:visual:linux`.

### Manual validation evidence

On 2026-07-13, after deleting the Samebase account that provisioned
`nicu-chiciuc/tmp-something-something` through Convex OAuth, two new non-main pull requests
completed Cloudflare Workers Builds and published live branch previews:
[PR #1](https://github.com/nicu-chiciuc/tmp-something-something/pull/1) and
[PR #2](https://github.com/nicu-chiciuc/tmp-something-something/pull/2). This template requires
`PREVIEW_CONVEX_DEPLOY_KEY` and runs `convex deploy --preview-name` for every non-main build. The
successful builds confirm that the previously distributed OAuth-backed Convex preview deploy key
remained usable after Samebase erased its local account and provider credentials. This does not
claim that the key survives the user manually revoking Samebase under Convex Authorized
Applications.

## Rollout

1. **Foundation:** add the deletion gate, run and event model, cleanup registry, bounded workflow,
   access restrictions, and staff operations page. Keep the Settings action unavailable.
2. **User flow:** enable confirmation, deletion-only progress, staff retry, browser cleanup, and
   completion email. Update privacy and retention copy in the same release.
3. **Release acceptance:** run the complete manual test above using the dedicated account. Enable
   deletion for release only after the full test passes and external applications are proven to
   survive.

The durable product contract and validation expectations are extracted to
`specs/113_ACCOUNT_DELETION_SPEC.md`. Archive this rollout plan when release acceptance is complete.
