# 097 Account Deletion Release Plan

## Document Control

- Status: Implemented, release acceptance pending
- Owner: Nicu Chiciuc
- Created: 2026-07-12
- Related research:
  - `research/2026-07-10-user-settings-and-account-deletion.md`
- Related RFCs:
  - `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`
- Related specs:
  - `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`
  - `specs/098_VAULT_DELETION_WORKFLOW_SPEC.md`
  - `specs/113_ACCOUNT_DELETION_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Related code:
  - `apps/samebase/convex/auth.ts`
  - `apps/samebase/convex/email.ts`
  - `apps/samebase/convex/schema.ts`
  - `apps/samebase/convex/vault/deletion/`
  - `apps/samebase/src/components/UserSettingsPage.tsx`

## Summary

The durable product contract now lives in `specs/113_ACCOUNT_DELETION_SPEC.md`. This RFC retains the
rollout sequence, release checklist, and manual validation evidence until release acceptance is
complete.

Before release, a signed-in user must be able to delete their Samebase account from Settings and
observe the deletion until it succeeds or needs attention. Staff must be able to observe the same
run and retry failed work.

Deletion has three product stages:

1. **Lock:** accept the request, create a durable deletion run, and deny normal account access.
2. **Clean:** revoke personal access and delete personal data in retryable steps. For a sole member,
   also cancel organization billing and delete Samebase-owned organization data.
3. **Finish:** delete authentication and user records, send completion email, and retain only a
   scrubbed operation receipt.

The feature is not finished merely when a workflow can start. It is finished when the manual release
acceptance test in this RFC passes with a dedicated real account.

## User Contract

### Starting deletion

The authenticated `/settings` Account section has a destructive `Delete account` action. It opens
the URL-owned `?delete-account` confirmation dialog with this meaning:

```text
Delete account?

This permanently deletes your Samebase account and data.

Nothing outside Samebase is deleted: your apps, GitHub repositories, Convex
projects, and Cloudflare Workers keep running.

[ Cancel ] [ Delete account ]
```

The current signed-in session proves which account is requesting deletion. The flow does not ask the
user to type their email and does not add a separate recent-authentication flow.

When the account has uncommitted file changes, the dialog includes an exact warning sourced from the
same live stakes as the typed phrase:

```text
5 uncommitted file changes will be permanently deleted. They will not be
pushed to GitHub.
```

One change uses singular grammar. More than 500 changes uses the capped wording from the typed
phrase. The dialog does not show a staged-changes warning when the count is zero or still loading.
For exact counts, it lists every affected repository and branch with its change count and a direct
link to the staged-changes review. The list is bounded by an internal scroller. If the count is over
the cap, or a complete reviewable list cannot be produced, the dialog links to the vault list
instead of presenting a partial list.

Account deletion never commits, exports, or publishes staged changes. The user can cancel, commit
the work normally, and return to deletion without a second confirmation mechanism.

When a sole-member account has an active Samebase subscription, the same dialog also states that
deletion immediately revokes the subscription and does not automatically refund unused time. A
shared-member deletion preserves organization billing.

The dialog shows the viewer's current deletion stakes and requires typing a dynamic confirmation
phrase before the destructive action enables. The base phrase is `delete my account`; nonzero counts
extend it with the vault count and the uncommitted file change count, for example
`delete my account, 3 vaults, and 5 uncommitted file changes`. Counting stops at 500 uncommitted
file changes, after which the phrase reads `more than 500 uncommitted file changes`. The displayed
phrase is selectable, and pasting into the confirmation input is allowed.

The request mutation recomputes the phrase and the complete displayed stakes from current data. It
rejects either mismatch with a `stakes_changed` result instead of creating a run, so confirmation
cannot silently survive a change moving between repositories or branches, or an applicable
sole-member subscription becoming cancellable. The subscribed stakes query remains the only source
of displayed details. The dialog then clears the typed phrase, shows a short notice, and asks the
user to confirm again.

The confirmation action is disabled until the typed phrase matches and while the request is being
accepted. Acceptance atomically creates one durable account deletion run and gates the user.
Repeated submission returns the same active run instead of creating another deletion and does not
recheck the phrase.

### While deletion runs

After acceptance, the app navigates to `/account-deletion`.

The user can see:

- that deletion is in progress
- the current user-safe step and latest progress time
- whether the run needs attention
- that staff attention is required when the run cannot continue

The user cannot navigate to vaults, settings, providers, billing, MCP, or other authenticated
product surfaces. All other Samebase browser sessions and MCP grants stop working. The initiating
browser session remains valid only for deletion status until the terminal step. Retry is staff-only
in version one so the user cannot trigger destructive workflow steps.

If the user closes the browser or signs out before completion, signing in again reaches only the
deletion status route. Authentication and the `users` row are deleted last so a failed deletion does
not leave the user without visibility.

Before requesting deletion, the initiating browser creates and stores a random 256-bit completion
capability. The authenticated request binds that capability to the new run. While the identity
exists, the deletion-only status query returns the same capability only to that run's owner. After
identity deletion, the browser uses the capability with a public, capability-gated completion query
to verify the scrubbed receipt. The random capability is not guessable in practice. Authentication
loss, expiry, or a missing receipt never infer deletion success.

### Success

On success:

1. A sole member's active organization subscription is canceled. A shared organization keeps its
   subscription.
2. Samebase sessions, MCP grants, and stored provider credentials are revoked or removed.
3. Personal profile, preference, and credential data is deleted. Organization vault, file, storage,
   collaboration, billing, and workflow data is deleted only when no member remains.
4. A completion email is attempted after required cleanup succeeds and before the final identity is
   removed. Email delivery failure is visible to staff but does not retain the user's account
   indefinitely.
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

Sole-member billing cancellation is a hard completion boundary. Shared-member deletion preserves
organization billing. A provider revocation failure is recorded and retried, but it does not retain
the user's local Samebase data forever after Samebase has removed its stored credential. Upstream
provider revocation gets three attempts separated by five seconds. After that, the workflow deletes
the local credential, records that upstream revocation was not confirmed, and continues local
erasure.

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

| Data class                                                          | Final action                                                                                                                 |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| User profile, auth accounts, sessions, verification data            | Delete                                                                                                                       |
| Provider connections, MCP grants and tokens                         | Revoke where supported, then delete local rows and secrets                                                                   |
| Personal preferences                                                | Delete                                                                                                                       |
| Organization vaults, files, staged content, and collaboration state | Preserve when another member remains; delete Samebase rows and storage objects for a sole member                             |
| Samebase organization subscription                                  | Preserve when another member remains; immediately revoke before sole-member success, then delete the local customer link     |
| Provisioning, refresh, and deletion runs                            | Preserve with a shared vault; quiesce and delete with the sole-member organization                                           |
| Current account deletion run and events                             | Replace with a scrubbed operation receipt                                                                                    |
| Provider backups and infrastructure logs                            | Keep beyond normal product use until automatic provider retention expires; never restore erased account data into active use |

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
- billing, provider revocation, and completion-email outcomes
- retry control for retryable failed work

Completed runs show the operation ID, timestamps, step outcomes, and result after the identity has
been scrubbed. Staff cannot skip mandatory steps, force a run to success, impersonate the user, or
initiate arbitrary account deletion from this page in version one.

## Backend Contract

Add durable `workflow_accountDeletion_runs` and `workflow_accountDeletion_events` tables. The run ID
is the stable internal identifier used by the user state, workflow, authenticated status route,
admin route, events, and retries. A separate browser-generated completion capability resolves only
the terminal scrubbed receipt after authentication is removed. Email is never used as a workflow
identifier.

An active user's row has no deletion marker. A deleting user's row contains the run ID and request
time. Access resolution maps that user to a deletion-only role granting only public access and the
narrow account-deletion status function.

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
- No grace-period restore or permanent soft-deleted `users` row.

## Definition Of Done

Account deletion is release-ready only when all automated validation passes and the following manual
test succeeds in the production-like environment with a dedicated non-staff account.

### Manual release acceptance

1. Sign in to the dedicated account and record its Convex user ID.
2. Give the account exactly this minimum state: one vault containing at least one uncommitted staged
   change, one connected provider, and the same account signed in through a different browser or
   isolated browser profile. MCP and billing boundaries use automated fixtures rather than making
   the human walkthrough depend on optional setup.
3. Open `/settings`, choose `Delete account`, verify the destructive statement and external-resource
   reassurance are visually separate, verify the exact uncommitted-change warning and every affected
   repository and branch are shown with working review links, then confirm once.
4. Verify the app immediately navigates to `/account-deletion`, ordinary product navigation is no
   longer available, and a second confirmation cannot create another run.
5. Verify the staff `/admin/account-deletions` page shows the same operation, account identity,
   current step, and progress.
6. Verify the other browser or isolated profile and the provider connection stop granting Samebase
   access while the initiating session can only read deletion status.
7. Let the run succeed. Verify the browser is signed out, local Samebase browser data is cleared,
   and the completion email arrives or its delivery failure is visible to staff.
8. Verify the auth account, sessions, user row, credentials, Samebase storage objects, and all
   classified user data are absent.
9. Verify the admin page retains a successful scrubbed receipt without the account's email, user ID,
   or other identity.
10. Verify the account's external repositories, Convex projects and deployments, Cloudflare
    resources, and deployed applications still exist and remain running.
11. Sign in again with the same identity. Verify the deleted data does not return and any resulting
    account is a new empty account governed by the normal signup and approval flow.

### Automated validation

- Exhaustively prove every user-owned and user-referencing table has a cleanup classification.
- Seed more than one cleanup batch and prove bounded deletion reaches completion.
- Prove all normal writes and routes reject the deleting role.
- Prove request acceptance is idempotent and creates one run.
- Prove failure and retry at every durable step are idempotent.
- Prove sole-member billing cancellation failure prevents success and shared-member deletion
  preserves billing.
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
