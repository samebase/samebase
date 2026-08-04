# 120 Organization Ownership Spec

## Document Control

- Status: Accepted rollout contract
- Owner: Samebase backend
- Last updated: 2026-08-04
- Active rollout: `rfcs/120_ORGANIZATION_OWNERSHIP_ROLLOUT.md`
- Related:
  - `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`
  - `specs/113_ACCOUNT_DELETION_SPEC.md`
  - `specs/114_CONVEX_TABLE_TAXONOMY_AND_OWNERSHIP_SPEC.md`
  - `specs/115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md`
  - `specs/119_POLAR_MONTHLY_BILLING_SPEC.md`
  - `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`
  - `research/2026-06-18-workos-authorization-model.md`

This is the accepted target contract for the active rollout. The implementation updates all affected
accepted specs when the new behavior ships.

## Accepted Target Contract

### Tenant graph

Samebase uses three separate domain entities:

1. A `users` row is one stable Samebase account and its personal state. Its Samebase ID survives an
   authentication-provider change.
2. An `organizations` row is one customer workspace and owns durable customer resources.
3. An `organizationMemberships` row grants one user access to one organization.

Users and organizations are separate and connect through memberships. The schema must not put one
`organizationId` on `users` or put a user ID array on an organization. During this rollout, each
user has exactly one membership, while one organization can have several users. The membership table
can support several organizations per user when organization selection becomes a real feature.

Every user row gets an organization and membership during account creation. This includes waitlisted
users. The temporary approval system controls application access only. It does not control
organization creation, membership, or ownership.

The initial bootstrap creates one organization for each existing user group. The two known accounts
that represent the same operator share one organization through two explicit membership rows. Every
other existing user gets a separate organization. This mapping is explicit bootstrap input. Code
must never infer shared ownership from email, name, or another profile field.

The initial product has no organization switcher. A root-resource creation operation resolves the
current user's one membership. Access to an existing resource always derives the organization from
that resource. A future multi-organization product must put organization selection in verified
request or session context. It must not store hidden authorization state on the user row.

This model follows the durable part of the WorkOS and Clerk organization models: users and
organizations are independent records, memberships connect them, and organization data stays with
the organization. Samebase does not copy provider session state or provider IDs into this model.

Sources:

- https://workos.com/docs/authkit/modeling-your-app
- https://workos.com/docs/authkit/metadata
- https://workos.com/docs/authkit/users-organizations
- https://clerk.com/docs/reference/backend/types/backend-user
- https://clerk.com/docs/guides/organizations/overview
- https://clerk.com/docs/guides/how-clerk-works/multi-tenant-architecture

### Minimal schema

`organizations` uses Convex `_id` as the durable tenant identity and `_creationTime` as its creation
record. Its only application field is the optional active account-deletion lock:

```text
accountDeletionRunId?: Id<"workflow_accountDeletion_runs">
```

The lock prevents two members of one organization from deleting their accounts at the same time. A
name becomes required only when an organization surface needs to display or edit one.

`organizationMemberships` contains only:

```text
organizationId: Id<"organizations">
userId: Id<"users">
```

The table has `by_user` and `by_organization_and_user` indexes. App-owned mutations enforce exactly
one membership per user during this rollout and at most one membership for each organization and
user pair. Several users can be full members of one organization.

Membership presence is active access. Removing access deletes the membership. The current model has
no role, status, timestamps, invitation state, or permission arrays. A role field becomes required
only when two membership roles have different current behavior.

Other than the account-deletion lock, the organization has no name, slug, kind, status, lifecycle
field, creator field, update timestamp, active-user field, or external-provider field.

`organizationBillingAccounts` contains one row for each organization. Its final fields are:

```text
organizationId: Id<"organizations">
provider?: "polar"
plan: "free" | "pro"
status: "inactive" | "active" | "past_due"
updatedAt?: number
currentPeriodEndAt?: number
cancelAtPeriodEnd?: boolean
polarExternalCustomerId?: string
polarStateChangedAt?: number
polarObservationRevision?: number
polarAppliedObservationRevision?: number
polarCheckoutAttempt?:
  | { state: "pending"; attemptId: string }
  | { state: "open"; attemptId: string; checkoutId: string }
```

This moves the current billing fields from `users`, removes their redundant `billing` prefix, and
does not change their meaning. New rows start as Free and inactive. The table has `by_organization`
and `by_polar_external_customer_id` indexes. Billing mutations enforce one row for each organization
and one row for each nonempty Polar customer ID.

### External identity boundary

Samebase user and organization IDs stay canonical if the authentication or organization provider
changes. Before a WorkOS, Clerk, or other external-provider migration starts, that migration adds
separate provider-link rows and backfills them before session cutover. Provider user and
organization IDs never replace Samebase IDs or become fields on the primary user and organization
rows. A provider session organization resolves through its link to the local organization before
Samebase checks membership.

### Authorization

The existing `access_*` keys remain the coarse application gate. Organization membership becomes a
separate resource gate.

An organization-scoped operation requires:

```text
the current user has the function's required access key
AND the current user has a membership in the resource organization
```

The backend loads the resource and derives its organization before it checks membership. A client
user ID, organization ID, actor field, provider credential, or staff role is not proof of resource
access. Normal staff product access follows the same membership rule.

Shared helpers implement organization and vault membership checks. Product functions do not repeat
raw ID comparisons.

### Ownership boundary

| Data                                                   | Durable boundary                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| Vault                                                  | Organization through required `vaults.organizationId`             |
| Vault child data                                       | Vault, and therefore the vault organization                       |
| Provider connection and OAuth callback state           | User credential and user protocol state                           |
| Billing account and subscription                       | One organization billing row                                      |
| Billing resource quotas                                | Organization attachment counts                                    |
| MCP grant                                              | One user delegation bound to one organization                     |
| Auth account, sessions, profile, and approval          | User                                                              |
| Account deletion workflow                              | User, with organization cleanup selected from current memberships |
| UI settings, filters, folders, expansions, and layouts | User                                                              |
| Edit, provisioning, deletion, and audit actors         | User provenance only                                              |

Provider connections remain user-scoped because they store credentials that an external provider
granted to that user. A member uses their own provider connection when an organization action needs
provider access. A future organization-managed service credential requires its own accepted
contract. Provider connections do not own vaults or attached provider resources.

Existing vault repository-identity lookup indexes and guard checks move from the user boundary to
the organization boundary. The guards keep the current `not_connected` exclusion because those
vaults have no repository identity. One organization cannot have two retained vaults for the same
provider repository identity.

Vault children do not copy `organizationId` when loading the parent vault gives the authorization
boundary. Existing `userId` or `ownerId` fields that only repeat vault ownership are removed. The
two billable attachment tables copy `organizationId` only as the indexed quota-count key. Access
still derives from the parent vault, and writes must keep the copied key equal to the vault
organization.

Staged files are one shared collaborative draft for a vault, branch, and path. Vault membership
controls draft access. The final model removes `vaultStagedFiles.ownerId` and its access checks.
`lastEditUserId` records only the last editor and never authorizes access.

FileView remains a staff-only add-on during this release. Its supported operating mode is one active
editing and commit session for a vault branch. A normal commit keeps the same staged row so a
delayed save from that editor can finish. Simultaneous FileView commits, structural edits during a
commit, and external Git changes during a commit are deferred until FileView becomes a shipped
add-on. They are not organization-rollout acceptance requirements.

Provisioning and vault-deletion runs use `requestedByUserId`. Their event rows derive the requester
through `runId` and do not copy a user ID. `vaultStagedFileUpdates` uses `editUserId`. Manual
provider-write and repository-refresh locks use `requestedByUserId` to identify work that depends on
one member's credentials during account deletion. `requestedByUserId`, `lastEditUserId`, and
`editUserId` are provenance only. No actor field grants access.

MCP client registration remains system-wide. Only `mcpGrants` stores the required `organizationId`
beside its user subject. Consent resolves the user's membership before it creates the grant.
Authorization codes, access tokens, refresh tokens, and browser tokens derive the organization
through `grantId`. Removing a membership revokes that user's grants for the organization. Rejoining
requires new authorization and does not reactivate those grants.

Each MCP HTTP request creates one complete authorization snapshot before internal tool dispatch.
Token validation loads the access token, grant, client, and current organization membership. The
request then uses that snapshot for `tools/list` or `tools/call`, including tool execution. A
concurrent grant revocation, membership change, or client disable applies to the next MCP HTTP
request. Internal runtime actions receive trusted subject and scope data from this dispatcher. They
are not an independent public boundary and do not reload the grant.

Browser handoff creation and redemption are separate request boundaries. Creation and redemption
each reload the grant and recheck its user, organization membership, scope, and client state before
they create or consume the handoff.

### Account deletion

Account deletion always removes the user's authentication data, personal UI data, user-owned
provider connections and authorizations, and organization membership.

When the deleting user is the only member of an organization, the existing deletion workflow also
deletes that organization's Samebase resources, billing state, and organization row. Provider-owned
infrastructure remains untouched under spec 113.

When another member remains, the workflow preserves the organization and its resources, then removes
only the deleting user's membership and personal data. Every current membership has the same access.
Transfer rules become necessary only when a less-privileged membership role ships. Actor and
workflow rows follow their table-specific deletion policy and must not cause shared organization
resources to be deleted.

Vault-deletion runs and events belong to the parent vault lifecycle. They remain while the vault
exists, even if the deleting member requested the operation. Stored actor IDs are opaque historical
provenance only. They can refer to a deleted user, are not resolved for authorization, and do not
retain profile data. The bounded per-vault deletion path removes events before terminal runs.
Account cleanup drains that lifecycle immediately before it removes an owned vault. Normal vault
deletion removes the vault row, marks its active run successful, and then drains the lifecycle
through journaled workflow batches with an idempotent scheduled continuation as fallback. This
per-vault boundary prevents a later deletion by another member from racing past account
finalization.

Before sole-member cleanup starts, account deletion waits for all active work attached to the
organization or its vaults. Shared-member deletion waits only for work that depends on the deleting
user or their credentials. Work started by a remaining member continues.

## Migration Contract

The pre-beta rollout uses one manual reset and one final-schema deployment. It does not deploy a
mixed old and new ownership state.

The rollout follows this order:

1. Record the current Polar billing state and confirm that no destructive workflow is active.
2. Pause product writes. While the old schema is still live, manually clear the approved local
   vault, staging, workflow, MCP authorization, and organization-scoped data. Remove legacy billing
   fields from the retained user rows.
3. Deploy the final schema and organization membership access checks.
4. Run one small bootstrap. It creates one shared organization for the two operator users, one
   organization for every other retained user, one membership for every user, and one billing row
   for every organization. It restores the recorded operator billing state after every checkout
   attempt is resolved. The bootstrap rejects a checkout attempt.
5. Verify the bootstrap counts and the two-member access paths, then resume product writes.

These steps ship in one implementation pull request. No old user ownership fields, fallback reads,
dual writes, migration indexes, or general data-conversion framework ship in the final runtime.

The manual reset deletes Samebase-local resource records only. It does not delete GitHub
repositories, Cloudflare Workers, Convex projects, user accounts, waitlist accounts, authentication
records, or provider connections. Samebase vaults and provider-resource links must be connected
again after deployment. MCP clients must authorize again.

The operator performs the production reset from the accepted runbook. Codex does not execute the
destructive production step. Local and disposable preview data can be recreated.

## Non-Goals

- Organization management UI, organization switching, or a persisted active organization
- Invitations, verified domains, team discovery, or automatic email-domain membership
- Membership roles, custom permissions, or grant tables
- Organization names, slugs, statuses, kinds, lifecycle workflows, or soft-deleted memberships
- WorkOS, Clerk, AuthKit, SSO, Directory Sync, SCIM, or provider mapping tables in this rollout
- Fine-grained authorization for selected vaults, branches, files, or provider resources
- Automatic account linking or shared ownership inferred from profile data
- Replacing Convex Auth or changing the temporary waitlist and approval behavior
- Zero-downtime migration machinery before the public beta

## Validation

The rollout is complete only when tests and reset checks prove:

- Every newly created user, including a waitlisted or admin-created user, gets one organization,
  membership, and billing row.
- Repeated organization provisioning for one user is idempotent.
- The explicit two-account bootstrap produces one organization with two memberships.
- No generic profile or email match combines users.
- A member can use normal resources in their organization.
- A user from another organization cannot read or change those resources.
- Two members see the same organization vaults and can use the current dashboard, resource,
  provisioning, and deletion flows after the access cutover.
- A normal one-session FileView edit and commit keeps a delayed editor save. Simultaneous FileView
  commit behavior is not a release gate.
- A user actor field does not grant access to an organization resource.
- UI preferences and other personal state remain different for two members of one organization.
- Both members see the same organization plan and quota usage, while each member sees only their own
  provider connections.
- A waitlisted user has an organization membership but remains blocked by the current application
  access gate.
- The rollout adds no organization switcher, invitation surface, membership page, or organization
  chrome.
- Provider credentials stay user-scoped. Billing state, quota counts, and MCP grants use the
  organization boundary.
- Deleting one of several members preserves shared organization data.
- Deleting the only member removes the organization's Samebase data but not provider infrastructure.
- Sole-member deletion waits for all organization and vault work. Shared-member deletion waits only
  for work that depends on the deleting user or their credentials.
- Repository-identity lookup indexes and guard checks use the organization boundary and keep the
  `not_connected` exclusion.
- No final tenant authorization check or ownership index depends on the legacy resource `userId`.
