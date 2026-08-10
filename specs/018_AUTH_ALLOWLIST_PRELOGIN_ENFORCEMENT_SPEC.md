# Auth Approval Boundary Specification

## Document Control

- Status: Implemented
- Owner: Samebase auth/backend
- Last updated: 2026-08-10
- Related specs:
  - `specs/117_MANUAL_PASSWORD_AUTH_SPEC.md`
  - `specs/123_ORGANIZATION_MEMBERSHIP_ADMINISTRATION_SPEC.md`
  - `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`

## Summary

Samebase keeps signup approval in `users.isApproved`. A signed-in user whose account exists but is
not approved is a pending-access account, not an anonymous viewer and not a member. Backend viewer
resolution derives `role_pending_access` for that state and projects `access_public` plus the
signed-in-only `access_user_preferences` key.

Approving a user is a data change: set `users.isApproved` to `true`. The next viewer resolution
derives `role_member` unless the user's email is staff, in which case staff resolution wins. During
the temporary release gate, accepting an exact identity-bound organization invitation can make this
change in the same transaction that creates membership. This does not let an organization owner
approve an unrelated signup.

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
3. `role_pending_access` grants `access_public` and `access_user_preferences`.
4. Signed-in users with `users.isApproved === true` resolve to `role_member`, unless staff email
   resolution applies.
5. Staff email resolution resolves to `role_staff` independently of `users.isApproved`.
6. App authorization checks use access keys, not `users.isApproved` directly.
7. UI surfaces that need to explain account state may read the derived role from
   `users.currentViewerAccess.role` or `users.currentViewerRole`.
8. Public app shell preferences that make public routes usable, such as workspace sidebar pane
   state, require `access_user_preferences`, which signed-in pending-access users hold and anonymous
   users do not.

## Non-Goals

- Persisting `users.role`.
- Building a full admin invite management UI.
- Reworking waitlist marketing copy or waitlist submission behavior.

## Acceptance Criteria

- [x] Signed-out viewers resolve to `role_anonymous` and `access_public`.
- [x] Unapproved signed-in users resolve to `role_pending_access`, `access_public`, and
      `access_user_preferences`.
- [x] Approved signed-in users resolve to `role_member` and member access keys.
- [x] Staff emails resolve to `role_staff`.
- [x] Provider/dashboard/file functions deny pending-access users through access-key checks.
- [x] Pending-access users can persist public workspace sidebar state through
      `access_user_preferences` so they can leave the right sidebar on public routes.
