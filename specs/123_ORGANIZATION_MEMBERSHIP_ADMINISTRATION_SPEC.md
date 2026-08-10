# 123 Organization Membership Administration Spec

## Document Control

- Status: Accepted
- Owner: Samebase product/backend
- Last updated: 2026-08-11
- Related:
  - `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`
  - `specs/113_ACCOUNT_DELETION_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
  - `specs/121_ORGANIZATION_CONTEXT_AND_ROUTE_MODEL.md`
  - `specs/122_ACCOUNT_SIGN_IN_METHODS_SPEC.md`

## Product Contract

The organization Members page is `/org/:owner/settings/members`. Every current organization member
can see the Samebase member list. Only a current Samebase owner can create or cancel invitations,
change roles, remove another member, or see live GitHub organization relationship data. Any member
can leave the organization. Staff status does not bypass organization membership.

Samebase membership and GitHub membership are separate:

1. A Samebase owner grants Samebase access through an invitation or a role action.
2. A stable GitHub user ID identifies the exact invitation recipient.
3. GitHub organization membership and role are live information for Samebase owners. They never
   create, change, or remove Samebase membership.

An invitation always grants the `member` role. A Samebase owner can promote the member after the
recipient joins. The first beta does not send invitation email and does not search Samebase
accounts. The owner enters one exact GitHub username, creates a link, and shares that link.

## Invitation Model

At most one live `organizationInvitations` row exists for an exact organization and stable GitHub
user ID. Its closed state is one of:

- `pending`, with creator user ID, creation time, expiry, current GitHub login observation, optional
  avatar URL, and an opaque 256-bit code.
- `accepted`, with the same invitation data plus acceptance time and accepting Samebase user ID.
- `accepted_recipient_deleted`, with organization ID, creator and acceptor user IDs, creation time,
  and acceptance time. It has no code, GitHub ID, login, avatar, or expiry.

The code is an observable locator. It is not bearer authority. A forwarded link cannot be accepted
by a different GitHub account. Samebase can keep the raw code so the owner can copy the same link
after reload and recover from a response that was lost after creation.

An invitation expires seven days after creation. Repeating creation for the same unexpired pending
recipient returns the same row and code. An expired invitation, or an accepted invitation whose
membership was later removed, can become a new pending invitation with a new code. Canceling a
pending invitation deletes it. Repeating a completed action is safe.

When an accepting user deletes their Samebase account, account deletion changes each matching
`accepted` row to `accepted_recipient_deleted`. This keeps stable Samebase attribution without
linking the deleted user to GitHub PII. The old link becomes unavailable. A later invitation for the
same GitHub user creates a new live row.

Before creation, Samebase resolves the entered login through GitHub. Creation resolves it again and
requires the same stable GitHub user ID that the owner previewed. Samebase rejects GitHub
organizations and bot accounts as recipients. The preview and creation response do not state whether
the target has a Samebase account.

The invitation page is `/invite/:code`. It is public, not prerendered, and hidden from route
suggestions. Analytics replace the code with a fixed placeholder. Session replay blocks the
invitation surface. Opening the page does not create a membership. The signed-in recipient must
select `Join organization`.

Acceptance requires all of these facts in one mutation:

- The invitation is pending and not expired.
- The current Samebase user exists and is not deleting.
- The user has a linked GitHub `authAccounts` row whose stable `providerAccountId` equals the
  invitation recipient ID.
- The organization still exists.

Acceptance sets `users.isApproved` to `true` when required, creates a `member` membership when one
does not exist, and changes the invitation to `accepted`. It never changes an existing membership
role. The approval effect is temporary release-gate compatibility. It is not a durable rule that an
organization owner controls general Samebase account admission.

If the recipient already has a membership, the page asks them to accept the invitation so the link
becomes closed while their existing role stays unchanged.

The same recipient can repeat acceptance and receive an `already accepted` result. A wrong account
cannot accept either a pending or accepted invitation. Concurrent creation, cancellation,
acceptance, and reissue read and write the same invitation record so Convex transaction conflict
handling preserves one valid result.

An accepted link shows organization access only while the accepting user still has a membership. If
that membership was removed, the page says that the invitation was already used and asks the user to
get a new invitation.

## Member List And GitHub Information

Members use stable ordering: Samebase owners first, then normalized display label, then membership
ID. The label uses `users.displayName`, then the linked GitHub login, then `Samebase member`. The
page does not expose another user's Samebase account email.

The page uses these exact role and relationship terms:

- `Samebase owner`
- `Samebase member`
- `GitHub organization owner`
- `GitHub organization member`
- `Not in GitHub organization`
- `GitHub account not connected`
- `GitHub status unavailable`
- `GitHub owner account`
- `Different GitHub account`
- `Only Samebase owner`

For a GitHub organization, Samebase uses the existing installation and Members read permission to
read current organization members and owners. It compares stable GitHub IDs. For a personal GitHub
owner, it compares each linked GitHub ID with the organization's stable owner ID. The result is not
stored. A failed or unavailable GitHub request does not block the page or a membership action.

## Role, Removal, And Leave Rules

Only a current Samebase owner can promote a member, demote an owner, or remove another member. An
owner cannot use the remove action on their own membership. They must use `Leave organization`.
Changing to the current role is an idempotent success.

An active owner has an `owner` membership and an active `users` row. Approval and temporary release
gates do not decide owner continuity. A role change, removal, leave, or account deletion must not
leave an organization without an active owner. The check and write occur in one mutation. A deleting
or deleted user does not satisfy the active-owner rule. A deleting member can be removed, but a
deleting user cannot be promoted.

Leave or removal is blocked only while the target user owns a queued or running vault provisioning
run or vault deletion run in that organization. The membership mutation reads those indexed active
ranges in its transaction. Role changes are not blocked.

Leave or removal also deletes a pending invitation that matches the target user's currently linked
GitHub identity. This makes the access loss durable when a legacy member linked GitHub after the
owner created the invitation.

Provider OAuth, a GitHub App callback, billing checkout, a credential lease, or other organization
work is not a membership blocker. Those flows use their existing access rechecks and organization
ownership rules.

For a personal GitHub owner, only a Samebase owner with the exact linked GitHub owner identity can
reconnect the GitHub App or authorize personal repository creation. Demotion, removal, and leave are
allowed when another active Samebase owner remains. Their confirmations warn that the exact GitHub
identity must become an owner again before it can reconnect the App.

## Data And Access Effects

Removing a membership or leaving deletes only the membership. It preserves:

- The Samebase account and its sign-in methods.
- The organization, billing, GitHub App installation, vaults, and workflows.
- Organization provider credentials, including `connectedByUserId` provenance.
- User-owned GitHub authorization, browser sessions, MCP grants, and MCP tokens.
- Organization-scoped personal preferences and folder state.

Existing browser sessions remain signed in. Organization routes show `Organization unavailable`
after the membership subscription updates. MCP calls check current membership and lose access to
that organization on the next call. Preserved organization-scoped preferences are hidden after leave
and become visible if the user later rejoins.

Account deletion preserves organization invitation records and their `createdByUserId` and
`acceptedByUserId` references. It scrubs the GitHub recipient fields from an accepted invitation
when that recipient deletes the account. The terminal user row keeps the Samebase references valid
without retaining PII. A creator presentation uses display name, then normalized account email. A
deleted creator uses the exact term `Deleted Samebase account`. A missing referenced user is data
damage and the query fails. Future organization deletion must remove every invitation for that
organization.

## Page Behavior

The standard right navigation shows `Members` before `Organization settings`. Organization switching
keeps the Members section. The page uses a responsive semantic row list and the existing right
sidebar. It does not use a route-owned scroll container.

The owner action is `Invite member`. Member row actions are `Make Samebase owner`,
`Make Samebase member`, and `Remove member`. The current user's action is `Leave organization`.
Pending invitation rows show `Created by <account presentation>`, use `Cancel invitation`, and keep
the copyable link available after reload. Only owners receive pending invitation data.

Destructive and role actions use confirmation dialogs. Controls are disabled while the mutation is
pending, the confirm button shows the pending operation, and a mutation error stays in the open
dialog with an alert role. A user who loses access stays on the requested route and sees the normal
organization-unavailable state.

## Deferred Scope

- Invitation email, delivery notifications, and owner notifications
- Automatic Samebase admission or removal from GitHub organization membership
- Importing or filtering a directory of GitHub organization members
- Invitations that grant the owner role
- Outside-collaborator repository discovery
- Expiry extension, invitation history UI, and a general organization audit log
- Custom roles and resource-specific permissions
- Organization deletion

## Focused Validation

- One Convex invitation owner covers stable identity binding, wrong-account denial, explicit
  acceptance, scoped approval, expiry, repeat creation, cancellation, replay, and reissue.
- One Convex membership owner covers visibility authority, role changes, deleting users, last active
  owner, removal, leave, and the two active-work blockers.
- The account-deletion boundary owner proves that invitation attribution survives account deletion
  and resolves the deleted creator safely.
- One frontend interaction owner covers owner and member actions, confirmation and pending states,
  invitation link recovery, and unavailable GitHub status.
- One invitation-page owner covers signed out, matching account, wrong account, accepted, expired,
  and canceled states.
- One desktop and mobile visual owner covers the Members page.
- A two-account manual check covers invitation creation, forwarded-link denial, GitHub sign-in,
  explicit join, promotion, demotion, removal or leave, access loss, and re-invitation.
