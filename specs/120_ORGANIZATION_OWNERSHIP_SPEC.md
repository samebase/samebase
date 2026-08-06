# 120 GitHub-Backed Organization Ownership Spec

## Document Control

- Status: Accepted rollout contract
- Owner: Samebase backend
- Last updated: 2026-08-06
- Active rollout: `rfcs/120_ORGANIZATION_OWNERSHIP_ROLLOUT.md`
- Related:
  - `specs/113_ACCOUNT_DELETION_SPEC.md`
  - `specs/115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md`
  - `specs/119_POLAR_MONTHLY_BILLING_SPEC.md`
  - `specs/121_ORGANIZATION_CONTEXT_AND_ROUTE_MODEL.md`
  - `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`
  - `research/2026-06-18-workos-authorization-model.md`

This contract defines the organization boundary before public beta. It replaces both user-owned
product resources and independent Samebase workspaces that group several GitHub owners.

## Domain Model

Samebase has three separate identity records:

1. A `users` row is one Samebase account.
2. An `organizations` row is one workspace for exactly one GitHub repository owner.
3. An `organizationMemberships` row grants one user access to one organization.

A user can have zero, one, or several memberships. An organization can have several members. At most
one membership can exist for an exact organization and user pair. The schema does not put one
organization ID on a user or a list of user IDs on an organization.

Signup, sign-in, approval, and waitlist changes do not create an organization or billing account. A
user with no membership is a valid user. Samebase login stays independent from GitHub. A member can
use Google login and does not need a GitHub account for operations that use organization
credentials.

Each membership has one required role: `owner` or `member`. Both roles can read and operate the
organization's vaults and use organization credentials. Both roles can create repositories for a
GitHub organization. Creating a repository for a personal GitHub owner additionally requires the
acting Samebase user to have a GitHub App user authorization for that exact GitHub user. Only owners
can manage provider connections, reconnect the GitHub organization, or manage billing. The first
verified GitHub App installation creates an owner membership. Until an invitation UI exists, an
idempotent internal function adds an existing Samebase user with an explicit `owner` or `member`
role.

Every organization must always have at least one owner. Account deletion, membership removal, and
role changes must reject a transition that would leave an organization without an owner. The first
release has no invitation records, general role-editing flow, permission arrays, or custom roles.

## GitHub Owner And App Installation

One Samebase organization maps to exactly one GitHub repository owner. The owner can be a GitHub
organization or a personal GitHub account. Its required identity is:

```text
githubOwnerId: string
githubOwnerType: "organization" | "user"
githubOwnerLogin: string
githubOwnerLoginNormalized: string
githubInstallationId: string
```

`githubOwnerId` is the stable external identity. One GitHub owner ID can map to at most one Samebase
organization. `githubOwnerLogin` is current display and route data. A rename updates the login
without changing the Samebase organization. The normalized login supports case-insensitive route
lookup.

An organization is always bound to its GitHub owner when it is created. There is no unbound
organization and no automatic personal organization during signup.

Creating an organization requires a verified installation of the environment's Samebase GitHub App.
For a GitHub organization, the signed-in GitHub user must have an active organization membership
with the GitHub administrator role, and the membership's stable organization ID must match the
installation owner ID. For a personal owner, the GitHub user ID must match the installation owner
ID. This GitHub authority check also applies when the App is reinstalled or reconnected. The
signed-in Samebase user who completes the first verified setup becomes the first owner. The same
transaction creates the organization's Free billing row. Reinstalling the app for the same owner
updates the installation ID and does not create another organization. Reconnecting an existing
organization also requires a Samebase owner membership.

The GitHub App requires organization Members read permission because the organization authority
check reads the signed-in GitHub user's live organization membership and role.

The installation is not a `providerConnections` row and is not a Samebase login method. Samebase
creates short-lived installation access tokens for repository operations and does not store those
tokens. The App private key and client secret stay in deployment secrets.

The setup callback uses short-lived state bound to the signed-in Samebase user. It exchanges the
GitHub code for that user's GitHub App authorization, reads the GitHub user, verifies the returned
installation through GitHub's App API, and only then creates or reconnects the organization. It does
not trust `installation_id` by itself.

The stored installation ID means "the last verified installation for this owner." GitHub is the
source of truth for its current status. Installation-token creation fails closed after suspension or
uninstall. A later webhook feature can add cached installation status, repository-selection status,
and rename updates when those states have a real consumer.

GitHub App installation authentication is the default for repository reads and writes. A GitHub App
user authorization is stored separately only for operations that require the acting GitHub user,
such as repository creation under a personal account. It belongs to one Samebase user and GitHub
user. It does not identify an organization, grant membership, or become available to another member.
One Samebase user has at most one current GitHub App user authorization. Supporting several personal
GitHub identities for one Samebase user is outside this contract.

## Deployment Provider Connections

`providerConnections` contains only Convex and Cloudflare connections. Each connection has:

```text
organizationId: Id<"organizations">
connectedByUserId: Id<"users">
kind: "convex" | "cloudflare"
```

The current schema permits several connections of one kind in one organization. This storage shape
is not a long-term cardinality promise. A focused provider-connection task can keep or replace it
when multi-connection behavior and disconnect semantics are defined. The first UI shows and uses one
selected connection. The organization stores an optional selected Convex connection ID and an
optional selected Cloudflare connection ID for this UI. It never stores a selected GitHub connection
ID. The user who connects a credential is provenance, not the authorization boundary. Organization
membership controls use. Any member can run operations through the selected connection. Only an
owner can create, replace, select, reauthorize, or disconnect an organization connection.

Provider credentials stay in backend-only functions. Product clients can request authorized
operations and read non-secret status. They cannot retrieve credentials or raw provider errors.

Long-lived `vaultConvexProjects` rows identify external resources with `teamId` and `projectId`.
Long-lived `vaultCloudflareWorkers` rows identify external resources with `accountId`, `workerName`,
and `workerTag`. They do not store a `providerConnections` ID. Operations resolve a current
organization Convex connection whose `teamId` matches the resource. Cloudflare operations use the
organization's current selected Cloudflare connection and address the resource through its
`accountId`; Cloudflare remains the source of truth for whether that credential can access the
account. Persistent provisioning plans and deletion retry snapshots also use external provider
resource IDs. One action or mutation call can carry the resolved `providerConnections` ID while it
runs, but it does not save that ID as resource identity.

Disconnect revokes OAuth access when the provider supports revocation, then removes the local
connection. If a user account is deleted, connections whose credential grant belongs to that user
are revoked and removed. Other organization data remains. Reconnecting the same Convex team or a
Cloudflare credential with access to the same account restores operations on existing resources
without rewriting their rows.

## Vault Identity And Routing

Every vault belongs to one organization and one GitHub repository owned by that organization's
GitHub owner. Vault creation rejects a repository whose stable owner ID differs from the
organization's `githubOwnerId`. One GitHub repository identity maps to at most one retained vault.

The route `/vault/<owner>/<repository>` resolves the current GitHub owner login to an organization
through the viewer's membership, then resolves the vault by `organizationId` and repository name. A
vault does not store another current copy of `organizations.githubOwnerLogin`. It does not use an
opaque `?organization=<id>` parameter. Internal Samebase IDs are database and authorization
identities, not URL selectors.

Organization setup pages use the current GitHub owner login in `/org/<owner>/providers`,
`/org/<owner>/new-app`, and `/org/<owner>/connect-repo`. Organization billing uses
`/org/<owner>/settings/billing`. A reload resolves the internal organization ID through the viewer's
current membership. These pages do not store a hidden active organization or expose an internal
organization ID in the URL or a selector.

Provider OAuth returns to `/org/<owner>/providers`. Checkout and subscription returns use
`/org/<owner>/settings/billing`. The server validates the owner-scoped return route. Return URLs
keep the GitHub owner login and never include an internal organization ID.

User settings remain separate from organization administration. They contain personal profile and
account actions, user-owned MCP clients, and the acting user's GitHub App user authorization. They
contain no organization selector or organization billing.

An operation on an existing resource loads that resource and derives its organization before it
checks membership. A root creation operation identifies the GitHub owner through the verified App
installation and checks membership. Client-supplied user IDs, actor fields, organization IDs, or
credentials are not proof of access.

## Authorization And Ownership

An organization operation requires both the existing Samebase application access gate and a current
membership in the resource organization. Provider administration, organization reconnection, and
billing management additionally require an owner membership.

Durable ownership is:

| Data                                       | Boundary                                          |
| ------------------------------------------ | ------------------------------------------------- |
| GitHub App installation                    | Organization's stable GitHub owner                |
| Vault                                      | Organization and matching GitHub repository owner |
| Vault child data                           | Parent vault                                      |
| Convex or Cloudflare connection            | Organization, with connecting-user provenance     |
| Attached Convex or Cloudflare resource     | Parent vault and stable external provider IDs     |
| Billing, quota, and usage                  | Organization                                      |
| MCP grant                                  | User delegation across current memberships        |
| Auth accounts, sessions, profile, approval | User                                              |
| GitHub App user authorization              | Exact user                                        |
| Actor provenance and personal UI settings  | User                                              |

Staged files remain one shared draft for a vault, branch, and path. FileView is not a release gate
for this rollout. A staged row has no user owner. Parent-vault organization membership authorizes
access, and `lastEditUserId` records the user who made the latest edit. Multi-writer FileView
recovery is outside this contract.

MCP consent delegates a subset of one user's Samebase access. It does not select or store an
organization. Each tool call uses the current user and the target resource or GitHub owner, then
applies the same current membership and role checks as the browser application. Existing-resource
tools derive the organization from the loaded resource. Root creation tools identify the GitHub
owner without accepting an opaque Samebase organization ID. A new membership becomes available to an
existing MCP grant, and removing a membership removes that organization's access on the next call.
Revoking the grant removes that MCP client's access for the user.

An MCP grant with the explicit `access_browser_login_handoff` scope can create a short-lived,
one-time sign-in URL for the grant user. The handoff stores no organization ID or membership
snapshot. The resulting browser session uses that user's current memberships and roles in the same
way as any other Samebase session.

## Billing And Lifecycle

`organizationBillingAccounts` contains exactly one row for each organization. A user with no
organization has no organization billing row. A new organization starts on Free with inactive
provider billing state. Plan, quota, usage, checkout, and subscription belong to the organization.
All members can read plan and usage. Only owners can start checkout or open subscription management.

Deleting a user is not organization deletion. User deletion removes authentication data, personal
state, memberships, MCP grants, user-owned GitHub authorizations, and provider grants connected by
that user. It does not delete an organization, vault, billing row, or another member's data.

Organization deletion is a separate future product or operator action. GitHub App uninstall also
does not delete Samebase data.

Whole-vault deletion remains available to both `owner` and `member` during pre-beta testing. This
rollout does not add commit-aware deletion rules or stronger deletion UX. A later vault-lifecycle
task must define those guardrails before deletion is treated as a general customer workflow.

## Reset Cutover

This pre-beta rollout uses a reset and the final schema. It has no fallback reads, dual writes,
compatibility fields, or general migration framework.

The operator can clear disposable organization, membership, billing, provider connection, vault,
staging, workflow, and MCP authorization data before the final schema deployment. User,
authentication, approval, and waitlist rows remain.

After deployment:

1. A retained user signs in.
2. The user installs the development Samebase GitHub App.
3. The verified callback creates the GitHub-backed organization, first membership, and billing row.
4. The operator adds the second retained user through the internal membership function.
5. Waitlist users keep zero memberships.
6. The operator reconnects Convex, Cloudflare, vaults, and MCP clients as needed.

Development and production use separate GitHub App registrations and secrets. Production secrets are
required before production deployment, not before development implementation and validation.

## Non-Goals

- Automatic organization creation during signup
- Unbound or independently named Samebase organizations
- Requiring GitHub as the Samebase login method
- Treating GitHub as a deployment provider connection
- Grouping repositories from several GitHub owners in one Samebase organization
- Email invitation, acceptance, role, or membership-management UI
- Fine-grained vault, branch, file, or provider-resource roles
- Persisted active-organization state or opaque organization query parameters
- WorkOS, Clerk, SSO, Directory Sync, or SCIM implementation
- GitHub installation lifecycle webhooks before the main installation flow works
- Unified GitHub organization and repository rename synchronization
- Multi-connection provider management and final provider-connection cardinality
- Changing the temporary waitlist and approval gate
- Multi-member FileView commit coordination
- Backward-compatible pre-beta migration machinery

## Release Validation

The rollout is ready only when focused tests and real manual checks prove:

- A new or waitlisted user has zero memberships and no billing row.
- A verified GitHub App installation creates one organization for one stable owner ID, one first
  membership, and one billing row.
- Reinstalling the App for that owner updates the existing organization without a duplicate.
- One user can belong to several organizations, and one organization can have several users.
- A second member can use the organization's App and provider connections without GitHub login or
  personal provider credentials.
- Every member can create a repository for a GitHub organization. A repository for a personal GitHub
  owner can be created only by a Samebase user authorized as that exact GitHub user.
- A vault owner ID must match its organization owner ID.
- `/vault/<owner>/<repository>` reloads without an organization query parameter and shows the same
  repository, Cloudflare Worker, Convex project, and observations.
- `/org/<owner>/providers`, `/org/<owner>/new-app`, and `/org/<owner>/connect-repo` reload with the
  same organization and never show an internal organization ID.
- Provider OAuth returns to `/org/<owner>/providers`. Checkout and billing-portal sessions return to
  `/org/<owner>/settings/billing`. Both keep the scoped route if membership was removed during the
  external flow.
- Both members see the same organization vaults, provider status, billing state, and observations.
- A member can create and reload a GitHub organization repository, Convex project, and Cloudflare
  Worker.
- A user outside the organization cannot read or change its resources.
- Convex and Cloudflare connections are organization-owned, allow several rows per kind, record the
  connecting user, and never return credentials to clients.
- Billing and quotas belong to the organization.
- User deletion does not delete the organization or shared resources.
- An MCP grant acts as its Samebase user across all current memberships, and each tool call applies
  current membership and role checks for its target.
- No caller or test keeps automatic personal organizations, GitHub provider connections, or opaque
  organization URL selection.
