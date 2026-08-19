# Auth Approval Boundary Specification

## Document Control

- Status: Implemented
- Owner: Samebase auth/backend
- Last updated: 2026-08-19
- Related specs:
  - `specs/117_MANUAL_PASSWORD_AUTH_SPEC.md`
  - `specs/123_ORGANIZATION_MEMBERSHIP_ADMINISTRATION_SPEC.md`
  - `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`

## Summary

Samebase keeps signup approval in `users.isApproved`. A signed-in user whose account exists but is
not approved is a pending-access account, not an anonymous viewer and not a member. Backend viewer
resolution derives `role_pending_access` for that state. An approved account that has not accepted
the Terms derives `role_terms_pending`. That role grants only public access, account settings, and
account deletion until the account records `termsAcceptedAt`.

Approving a user is a data change: set `users.isApproved` to `true`. Accepting the Terms is a second
required data change that stores `users.termsAcceptedAt`. The next viewer resolution derives
`role_member` for an approved account with accepted Terms, unless the user's email is staff, in
which case it derives `role_staff`. During the temporary release gate, accepting an exact
identity-bound organization invitation can approve a pending account in the same transaction that
creates membership. The approved account must then accept the Terms before it can read or change
organization data.

## Historical Context

This file originally targeted pre-login allowlist enforcement: deny unauthorized OAuth callbacks,
avoid creating a `users` row, and avoid issuing an authenticated session. The member rollout chose a
different current product boundary so operators can test and approve real signed-in accounts through
standard data state instead of editing code-side email allowlists.

The pre-login-denial model is no longer the active contract for member onboarding. If Samebase later
returns to callback-time denial, that change needs a new rollout spec because it would remove the
authenticated pending-access account state defined here.

## Required Behavior

1. Signed-out viewers resolve to `role_anonymous`.
2. Signed-in users with `users.isApproved !== true` resolve to `role_pending_access`.
3. `role_pending_access` grants public access, account deletion, user preferences, and the ability
   to accept an identity-bound organization invitation.
4. Active approved users without `users.termsAcceptedAt` resolve to `role_terms_pending`.
5. `role_terms_pending` grants only `access_public`, `access_account_deletion`, and
   `access_account_settings`. The account settings key admits the restricted settings route and the
   Terms acceptance mutation. The account deletion key admits the deletion dialog and account
   deletion functions. These keys do not grant user preference mutations, organization, provider,
   vault, billing, MCP, or provisioning access.
6. `users.acceptCurrentTerms` stores `termsAcceptedAt` and the current Terms version. The next
   viewer resolution grants normal member access without another approval step.
7. Staff users without accepted Terms resolve to `role_terms_pending`. After acceptance, staff email
   resolution derives `role_staff` independently of `users.isApproved`.
8. App authorization checks use access keys. Functions do not repeat Terms checks.
9. UI surfaces that need to explain account state may read the derived role from
   `users.currentViewerAccess.role` or `users.currentViewerRole`.
10. Public app shell preferences that make public routes usable, such as workspace sidebar pane
    state, require `access_user_preferences`, which signed-in pending-access users hold and
    anonymous users do not.

## Non-Goals

- Persisting `users.role`.
- Building a full admin invite management UI.
- Reworking waitlist marketing copy or waitlist submission behavior.

## Acceptance Criteria

- [x] Signed-out viewers resolve to `role_anonymous` and `access_public`.
- [x] Unapproved signed-in users resolve to `role_pending_access`, `access_public`, and
      `access_user_preferences`.
- [x] Approved signed-in users without accepted Terms resolve to `role_terms_pending` and only
      account-level access keys.
- [x] Accepting the Terms changes the next viewer resolution to `role_member` without another
      approval step.
- [x] Staff emails resolve to `role_terms_pending` before Terms acceptance and `role_staff` after
      acceptance.
- [x] Provider/dashboard/file functions deny pending-access users through access-key checks.
- [x] Organization, provider, vault, billing, MCP, and provisioning functions deny Terms-pending
      users through access-key checks.
- [x] Pending-access users can persist public workspace sidebar state through
      `access_user_preferences` so they can leave the right sidebar on public routes.
