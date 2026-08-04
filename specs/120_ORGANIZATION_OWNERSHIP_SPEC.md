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
2. An `organizations` row is one customer workspace, has one required durable name, and owns durable
   customer resources.
3. An `organizationMemberships` row grants one user access to one organization.

Users and organizations are separate and connect through memberships. The schema must not put one
`organizationId` on `users` or put a user ID array on an organization. One user can have several
memberships, and one organization can have several users. At most one membership can exist for an
exact organization and user pair.

Account creation gives a user an organization and membership only when the user has no membership.
This includes waitlisted users. A later sign-in or account update preserves every existing
membership and does not create another organization. The temporary approval system controls
application access only. It does not control organization creation, membership, or ownership.

The initial bootstrap creates one organization for each existing user group. The two known accounts
that represent the same operator share one organization through two explicit membership rows. Every
other existing user gets a separate organization. This mapping is explicit bootstrap input. Code
must never infer shared ownership from email, name, or another profile field. The shared operator
organization name is explicit bootstrap input. Each personal organization receives the same initial
name that normal account provisioning would create.

Every organization-scoped request identifies one organization. A root read or creation operation
receives an explicit `organizationId`. An existing-resource operation can instead load the resource
and use its required organization ID. The backend then verifies the exact user and organization
membership. No product backend function selects the first or only membership from `userId`.

Development password seeding is the only non-product exception. It runs during fresh environment
bootstrap, after account creation and before another membership is added. The seed user must have
exactly one membership. If it has several memberships, the operator must reset the disposable local
or preview data. The seed action does not accept an organization argument or store a default
organization.

The web app keeps the selected organization in explicit URL request context. If one membership is
available, the client can select it without showing a choice, but it still sends the organization ID
to the backend. If several memberships are available, the user must select one. The selection is not
stored on `users`, and it never grants access.

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
record. Its required core field and optional active account-deletion lock are:

```text
name: string
accountDeletionRunId?: Id<"workflow_accountDeletion_runs">
```

The name is trimmed, nonempty display data. It is durable, is not required to be unique, and never
grants access. Normal account provisioning builds the initial personal organization name from the
account display name, name, or email. The lock prevents two members of one organization from
deleting their accounts at the same time.

`organizationMemberships` contains only:

```text
organizationId: Id<"organizations">
userId: Id<"users">
```

The table has `by_user` and `by_organization_and_user` indexes. App-owned mutations enforce at most
one membership for each organization and user pair. Both sides of the relation can have several
memberships.

Membership presence is active access. Removing access deletes the membership. The current model has
no role, status, timestamps, invitation state, or permission arrays. A role field becomes required
only when two membership roles have different current behavior.

The operator can add an existing Samebase user directly to an organization through one idempotent
internal mutation. This inserts only the missing membership. It does not move the user, delete the
organization created at sign-up, change approval, or create invitation state. Email invitations and
acceptance are a later product surface.

`providerConnections` keeps its existing provider-specific identity and authentication fields and
adds these required ownership fields:

```text
organizationId: Id<"organizations">
connectedByUserId: Id<"users">
state: "connected" | "disconnected"
```

The schema permits several connections of one provider kind in an organization. The first product
surface still displays and changes one selected connection of each kind. It does not add a
connection selector. This current UI limit is not a database uniqueness rule.

`organizations` stores the selected default connection for each provider kind:

```text
selectedGithubProviderConnectionId?: Id<"providerConnections">
selectedConvexProviderConnectionId?: Id<"providerConnections">
selectedCloudflareProviderConnectionId?: Id<"providerConnections">
```

Provider status and new resource creation use the selected connection. Connecting or reauthorizing a
connection selects that row. Disconnecting keeps the selection so reauthorization restores the same
stable row. Existing vault resources and provisioning plans never follow a changed selection. They
use the exact connection ID stored on the resource or plan.

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
GitHub App authorization flow. GitHub OAuth requests the `workflow` scope because the shipped
starter creates `.github/workflows/ci.yml`. GitHub API-key health checks report this scope as
granted, missing, or unknown with the other required scopes.

`providerOAuthCallbackStates` binds the initiating user to the target organization and stores one
required root-relative same-site return path. Every provider OAuth start receives and validates that
path. The callback rechecks membership before it creates or reauthorizes the organization
connection, then returns to the exact URL context that started the flow. This preserves the selected
organization through a full-page OAuth redirect.

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

Other than the required name, account-deletion lock, and selected provider connection IDs, the
organization has no slug, kind, status, lifecycle field, creator field, update timestamp, or
active-user field.

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

For a root read or creation operation, the client supplies the selected organization ID and the
backend verifies the exact membership. For an operation on an existing resource, the backend loads
the resource and derives its organization before it checks membership. The request selection does
not replace that resource-derived boundary. A client user ID, organization ID, actor field, provider
credential, or staff role is not proof of resource access. Normal staff product access follows the
same membership rule.

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

FileView remains a staff-only add-on and is deferred. Its current one-person edit and commit path
remains available, but no FileView behavior is an organization-rollout release gate. Delayed saves
after a commit, commit retries after Git already accepted the change, simultaneous commits,
structural edits during a commit, and external Git changes during a commit remain deferred until
FileView becomes a shipped add-on.

Provisioning and vault-deletion runs use `requestedByUserId`. Their event rows derive the requester
through `runId` and do not copy a user ID. `vaultStagedFileUpdates` uses `editUserId`. Manual
provider-write and repository-refresh locks also use `requestedByUserId`. `requestedByUserId`,
`lastEditUserId`, and `editUserId` are provenance only. No actor field grants access.

MCP client registration remains system-wide. Only `mcpGrants` stores the required `organizationId`
beside its user subject. Consent requires one explicit organization choice, verifies that exact
membership, and binds the grant to that organization. Authorization codes, access tokens, refresh
tokens, and browser tokens derive the organization through `grantId`. Removing a membership revokes
that user's grants for the organization. Rejoining requires new authorization and does not
reactivate those grants.

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

Account deletion for a user with one membership removes the user's authentication data, personal UI
data, OAuth callback state, and organization membership. For each connected organization provider
connection whose `connectedByUserId` is the deleting user, it attempts provider-side OAuth
revocation, strips the local credential, and changes the stable row to `disconnected`. A remaining
member can reauthorize that connection without changing resource bindings.

Account deletion fails before it writes when the user has several memberships. Member management is
operator-only in this release, so the operator must remove the additional memberships or complete a
manual account cleanup first. Full deletion across several organizations ships with the member
management product surface. This fail-closed rule prevents the current workflow from deleting or
locking an organization chosen through an implicit membership.

When the deleting user is the only member of an organization, the existing deletion workflow also
deletes that organization's Samebase resources, provider connection rows, billing state, and
organization row. Provider-owned infrastructure remains untouched under spec 113.

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

Account deletion waits while any vault in the organization has a queued or running vault-deletion or
app-provisioning run. The same organization-wide rule applies to sole-member and shared-member
deletion. Manual provider-write and repository-refresh locks do not block account deletion.

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
   for every organization. Every organization receives its required durable name. It restores the
   recorded operator billing state after every checkout attempt is resolved. The bootstrap rejects a
   checkout attempt.
5. Verify the bootstrap counts, direct membership addition, explicit organization selection, and the
   two-member access paths, then resume product writes.

These steps ship in one implementation pull request. No old user ownership fields, fallback reads,
dual writes, migration indexes, or general data-conversion framework ship in the final runtime.
Production schema, authorization contracts, and production callers change to the final model first.
Tests that describe the former one-membership model are then rewritten or deleted. An old test does
not justify a compatibility helper or fallback path in production.

The manual reset deletes local provider connections and Samebase-local resource records. It does not
delete GitHub repositories, Cloudflare Workers, Convex projects, user accounts, waitlist accounts,
or authentication records. Provider accounts, Samebase vaults, and provider-resource links must be
connected again after deployment. MCP clients must authorize again. No provider-connection
migration, fallback read, dual write, or compatibility field ships.

The operator performs the production reset from the accepted runbook. Codex does not execute the
destructive production step. Local and disposable preview data can be recreated.

## Non-Goals

- Organization creation, rename, deletion, or membership-management UI
- Email invitations, acceptance, verified domains, team discovery, or automatic email-domain
  membership
- A persisted active organization. The selected organization stays in request context.
- Membership roles, custom permissions, or grant tables
- Organization slugs, statuses, kinds, lifecycle workflows, or soft-deleted memberships
- WorkOS, Clerk, AuthKit, SSO, Directory Sync, SCIM, or provider mapping tables in this rollout
- Fine-grained authorization for selected vaults, branches, files, or provider resources
- Automatic account linking or shared ownership inferred from profile data
- Replacing Convex Auth or changing the temporary waitlist and approval behavior
- Replacing the current provider OAuth and API-key methods or adding a GitHub App flow
- Zero-downtime migration machinery before the public beta

## Validation

The rollout is complete only when tests and reset checks prove:

- Every newly created user with no membership, including a waitlisted or admin-created user, gets
  one organization with a required durable name, one membership, and one billing row.
- Repeated organization provisioning preserves all memberships and does not add an organization.
- One user can access two organizations through two explicit organization selections. Neither
  request can read the other organization's vaults, billing, or providers.
- The operator membership mutation adds an existing user to a second organization without changing
  the user's first organization, billing, approval, provider state, or personal settings. Repeating
  it does not add a duplicate membership.
- The explicit two-account bootstrap produces one organization with two memberships.
- No generic profile or email match combines users.
- A member can use normal resources in their organization.
- A user from another organization cannot read or change those resources.
- Two members see the same organization vaults and can use the current dashboard, resource,
  provisioning, and deletion flows after the access cutover.
- A user actor field does not grant access to an organization resource.
- UI preferences and other personal state remain different for two members of one organization.
- Both members see the same organization plan, quota usage, and provider connection status. Both can
  use the organization connection through authorized backend operations.
- A waitlisted user has an organization membership but remains blocked by the current application
  access gate.
- The rollout adds only the organization selector required to choose request context. It adds no
  invitation surface, membership page, or organization-management page.
- Provider connections use the organization boundary, permit several rows per provider kind, and
  record the connecting member in required `connectedByUserId`. Public functions never return
  provider credentials or raw provider error text.
- Vault resources and provisioning plans use stable provider connection IDs. A retry or reload does
  not select a credential from the acting user or from an implicit current provider connection.
- Deleting one of several members preserves shared organization data.
- Account deletion for a user with several organization memberships fails before any write.
- Deleting a member disconnects provider connections linked to that member without deleting their
  stable rows or provider infrastructure. A remaining member can reauthorize the same connection.
- Deleting the only member removes the organization's Samebase data but not provider infrastructure.
- Sole-member deletion waits for all organization and vault work. Shared-member deletion waits only
  for work that depends on the deleting user or a provider connection linked to that user.
- Repository-identity lookup indexes and guard checks use the organization boundary and keep the
  `not_connected` exclusion.
- No final tenant authorization check or ownership index depends on the legacy resource `userId`.
