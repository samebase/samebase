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

`providerConnections` keeps its existing provider-specific identity and authentication fields and
adds these required ownership fields:

```text
organizationId: Id<"organizations">
connectedByUserId: Id<"users">
state: "connected" | "disconnected"
```

The schema permits several connections of one provider kind in an organization. The first product
surface still creates and displays at most one connected connection of each kind. It does not add a
connection selector. This current UI limit is not a database uniqueness rule.

`organizationId` controls who can use a connection. `connectedByUserId` records the member who
connected or last reauthorized the credential. It is provenance and a credential-lifecycle
dependency, not an access grant.

A connected row contains its provider credential. Disconnecting strips the credential and changes
the row to `disconnected`; it does not delete the stable connection identity. Reauthorization of a
selected connection restores that same row. Connecting a different external provider target creates
a different row and never silently rebinds resources that use the old row.

Provider credentials stay inside backend-only functions. Product clients can request an authorized
provider operation and can read non-secret connection status, but no product client can retrieve the
stored credential. The rollout keeps the existing OAuth and API-key methods. It does not add a
GitHub App authorization flow.

`providerOAuthCallbackStates` binds the initiating user to the target organization. The callback
rechecks that membership before it creates or reauthorizes the organization connection.

Every provider-backed resource records the exact provider connection that Samebase must use:

```text
vaults.githubProviderConnectionId: Id<"providerConnections">
vaultConvexProjects.providerConnectionId: Id<"providerConnections">
vaultCloudflareWorkers.providerConnectionId: Id<"providerConnections">
workflow_vaultProvisioning_plans.githubProviderConnectionId: Id<"providerConnections">
workflow_vaultProvisioning_plans.convexProviderConnectionId: Id<"providerConnections">
workflow_vaultProvisioning_plans.cloudflareProviderConnectionId: Id<"providerConnections">
```

The attachment or plan keeps resource ownership in the organization. Its connection ID only selects
the credential for provider reads and writes. Provider operations load the row by ID, require the
same organization and provider kind, and require `state: "connected"`. They never select a
credential from an actor user ID. A provisioning retry uses the connection IDs recorded when the
plan was created.

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
| Provider connection                                    | Organization, with `connectedByUserId` for credential provenance  |
| OAuth callback state                                   | Initiating user and target organization                           |
| Billing account and subscription                       | One organization billing row                                      |
| Billing resource quotas                                | Organization attachment counts                                    |
| MCP grant                                              | One user delegation bound to one organization                     |
| Auth account, sessions, profile, and approval          | User                                                              |
| Account deletion workflow                              | User, with organization cleanup selected from current memberships |
| UI settings, filters, folders, expansions, and layouts | User                                                              |
| Edit, provisioning, deletion, and audit actors         | User provenance only                                              |

Provider connections are organization-scoped even when the external provider granted the credential
through one member. Every organization member can request an authorized backend operation through
the connection. The provider still applies the external permissions represented by that credential.
Provider connections do not own vaults or attached provider resources.

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

FileView remains a staff-only add-on during this release. A normal one-person edit and commit is
supported. A successful commit clears its staged rows. Delayed saves after a commit, commit retries
after Git already accepted the change, simultaneous commits, structural edits during a commit, and
external Git changes during a commit are deferred until FileView becomes a shipped add-on. They are
not organization-rollout acceptance requirements.

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

Account deletion always removes the user's authentication data, personal UI data, OAuth callback
state, and organization membership. For each connected organization provider connection whose
`connectedByUserId` is the deleting user, it attempts provider-side OAuth revocation, strips the
local credential, and changes the stable row to `disconnected`. A remaining member can reauthorize
that connection without changing resource bindings.

When the deleting user is the only member of an organization, the existing deletion workflow also
deletes that organization's Samebase resources, billing state, and organization row. Provider-owned
infrastructure remains untouched under spec 113.

When another member remains, the workflow preserves the organization and its resources, then removes
the deleting user's membership, personal data, and connected provider credentials. Every current
membership has the same access. Transfer rules become necessary only when a less-privileged
membership role ships. Actor and workflow rows follow their table-specific deletion policy and must
not cause shared organization resources to be deleted.

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
user or a provider connection linked to that user. Work that does not depend on those credentials
continues.

## Migration Contract

The pre-beta rollout uses one manual reset and one final-schema deployment. It does not deploy a
mixed old and new ownership state.

The rollout follows this order:

1. Record the current Polar billing state and confirm that no destructive workflow is active.
2. Disconnect every provider connection and confirm that provider connection and OAuth callback
   state are empty. Pause product writes. While the old schema is still live, manually clear the
   approved local vault, staging, workflow, MCP authorization, and organization-scoped data. Remove
   legacy billing fields from the retained user rows.
3. Deploy the final schema and organization membership access checks.
4. Run one small bootstrap. It creates one shared organization for the two operator users, one
   organization for every other retained user, one membership for every user, and one billing row
   for every organization. It restores the recorded operator billing state after every checkout
   attempt is resolved. The bootstrap rejects a checkout attempt.
5. Verify the bootstrap counts and the two-member access paths, then resume product writes.

These steps ship in one implementation pull request. No old user ownership fields, fallback reads,
dual writes, migration indexes, or general data-conversion framework ship in the final runtime.

The manual reset deletes local provider connections and Samebase-local resource records. It does not
delete GitHub repositories, Cloudflare Workers, Convex projects, user accounts, waitlist accounts,
or authentication records. Provider accounts, Samebase vaults, and provider-resource links must be
connected again after deployment. MCP clients must authorize again. No provider-connection
migration, fallback read, dual write, or compatibility field ships.

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
- Replacing the current provider OAuth and API-key methods or adding a GitHub App flow
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
- A normal one-session FileView edit and commit succeeds and clears its staged rows. Delayed saves,
  commit retry recovery, and simultaneous FileView commit behavior are not release gates.
- A user actor field does not grant access to an organization resource.
- UI preferences and other personal state remain different for two members of one organization.
- Both members see the same organization plan, quota usage, and provider connection status. Both can
  use the organization connection through authorized backend operations.
- A waitlisted user has an organization membership but remains blocked by the current application
  access gate.
- The rollout adds no organization switcher, invitation surface, membership page, or organization
  chrome.
- Provider connections use the organization boundary, permit several rows per provider kind, and
  record the connecting member in required `connectedByUserId`. Public functions never return
  provider credentials or raw provider error text.
- Vault resources and provisioning plans use stable provider connection IDs. A retry or reload does
  not select a credential from the acting user or from an implicit current provider connection.
- Deleting one of several members preserves shared organization data.
- Deleting a member disconnects provider connections linked to that member without deleting their
  stable rows or provider infrastructure. A remaining member can reauthorize the same connection.
- Deleting the only member removes the organization's Samebase data but not provider infrastructure.
- Sole-member deletion waits for all organization and vault work. Shared-member deletion waits only
  for work that depends on the deleting user or a provider connection linked to that user.
- Repository-identity lookup indexes and guard checks use the organization boundary and keep the
  `not_connected` exclusion.
- No final tenant authorization check or ownership index depends on the legacy resource `userId`.
