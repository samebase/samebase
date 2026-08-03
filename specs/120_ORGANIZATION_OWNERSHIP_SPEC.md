# 120 Organization Ownership Spec

## Document Control

- Status: Accepted rollout contract
- Owner: Samebase backend
- Last updated: 2026-08-03
- Active rollout: `rfcs/120_ORGANIZATION_OWNERSHIP_ROLLOUT.md`
- Related:
  - `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`
  - `specs/113_ACCOUNT_DELETION_SPEC.md`
  - `specs/114_CONVEX_TABLE_TAXONOMY_AND_OWNERSHIP_SPEC.md`
  - `specs/115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md`
  - `specs/119_POLAR_MONTHLY_BILLING_SPEC.md`
  - `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`
  - `research/2026-06-18-workos-authorization-model.md`

This is the accepted target contract for the active rollout. Until a rollout phase ships, current
code and the current clauses in specs 113, 115, and 119 remain effective. Each implementation phase
updates the affected current spec when its behavior changes.

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

The initial backfill creates one organization for each existing user group. The two known accounts
that represent the same operator share one organization through two explicit membership rows. Every
other existing user gets a separate organization. This mapping is explicit migration input. Code
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

`organizations` has no application fields. Convex `_id` is the durable tenant identity and
`_creationTime` records creation. A name becomes required only when an organization surface needs to
display or edit one.

`organizationMemberships` contains only:

```text
organizationId: Id<"organizations">
userId: Id<"users">
```

The table has `by_user`, `by_organization`, and `by_organization_and_user` indexes. App-owned
mutations enforce exactly one membership per user during this rollout and at most one membership for
each organization and user pair. Several users can be full members of one organization.

Membership presence is active access. Removing access deletes the membership. The current model has
no role, status, timestamps, invitation state, or permission arrays. A role field becomes required
only when two membership roles have different current behavior.

The organization has no name, slug, kind, status, lifecycle field, creator field, update timestamp,
active-user field, or external-provider field.

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

Existing vault repository-identity indexes move from the user boundary to the organization boundary.
One organization cannot have two retained vaults for the same provider repository identity.

Vault children do not copy `organizationId` when loading the parent vault gives the authorization
boundary. Existing `userId` or `ownerId` fields that only repeat vault ownership are removed. The
two billable attachment tables copy `organizationId` only as the indexed quota-count key. Access
still derives from the parent vault, and writes must keep the copied key equal to the vault
organization. Real actor fields remain and use exact names such as `lastEditUserId`,
`initiatedByUserId`, or `requestedByUserId`.

MCP client registration remains system-wide. Only `mcpGrants` stores the required `organizationId`
beside its user subject. Consent resolves the user's membership before it creates the grant.
Authorization codes, access tokens, refresh tokens, and browser tokens derive the organization
through `grantId`. Token validation, each tool list and tool call, tool execution, and browser
handoff reload the grant and recheck current membership.

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

## Migration Contract

The rollout uses widen, backfill, verify, switch, clean, and narrow steps. Optional organization
fields and old user ownership fields are temporary migration states, not accepted final schema.

The rollout follows this order:

1. Add organizations and memberships, then backfill every user.
2. Add the new organization fields and writes one domain at a time. Each prepared domain uses a
   shared helper that still requires the legacy user owner, so behavior does not widen early.
3. Run idempotent, bounded internal backfills and verify every prepared domain.
4. Use a planned pre-beta maintenance window to remove the legacy-user requirement from the shared
   helpers and switch account deletion only after billing, MCP, vault, staging, provisioning, and
   deletion data are ready.
5. Remove old values with bounded cleanup migrations.
6. Remove the old user ownership fields, fallback reads, dual writes, and indexes.

These steps ship in three implementation pull requests. Phase 1 performs steps 1 through 3 across
all domains. Phase 2 performs steps 4 and 5 as one coordinated authorization cutover and cleanup.
Phase 3 performs step 6 after production cleanup checks pass. Review size alone does not create more
rollout phases.

The explicit migration input for the shared operator organization also selects the canonical current
billing state and Polar customer. It selects the retained vault for every duplicate repository
identity. The migration stops on an unlisted collision. It never selects the first row implicitly.

The current deployment is small enough for table-specific bounded migrations. The rollout does not
install a general migration component. If row counts materially change before a phase starts, only
the batch runner decision is reopened. The organization contract does not change.

Production data is preserved by default. Clearing production tables requires separate operator
approval at the time of deletion. Local and disposable preview data can be recreated.

Account deletion must remain safe after every merged phase. A phase updates its domain cleanup or
keeps the verified old cleanup path until the new ownership cutover completes.

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

The rollout is complete only when tests and migration checks prove:

- Every newly created user, including a waitlisted or admin-created user, gets one organization,
  membership, and billing row.
- Repeated organization provisioning for one user is idempotent.
- The explicit two-account migration produces one organization with two memberships.
- The migration stops on an unlisted billing or duplicate-repository collision.
- No generic profile or email match combines users.
- A member can use normal resources in their organization.
- A user from another organization cannot read or change those resources.
- Two members see the same organization vaults and can use the current dashboard, editor, staging,
  resource, provisioning, and deletion flows after the access cutover.
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
- No final tenant authorization check or ownership index depends on the legacy resource `userId`.
