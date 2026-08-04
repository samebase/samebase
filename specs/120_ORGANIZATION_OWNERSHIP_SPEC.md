# 120 GitHub-Backed Organization Ownership Spec

## Document Control

- Status: Accepted rollout contract
- Owner: Samebase backend
- Last updated: 2026-08-05
- Active rollout: `rfcs/120_ORGANIZATION_OWNERSHIP_ROLLOUT.md`
- Related:
  - `specs/018_AUTH_ALLOWLIST_PRELOGIN_ENFORCEMENT_SPEC.md`
  - `specs/113_ACCOUNT_DELETION_SPEC.md`
  - `specs/115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md`
  - `specs/119_POLAR_MONTHLY_BILLING_SPEC.md`
  - `rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`
  - `research/2026-06-18-workos-authorization-model.md`

This contract replaces the earlier independent-workspace model in this spec. Samebase organizations
are GitHub-backed workspaces. Signup does not create an organization, and GitHub is not a normal
provider connection.

## Current Contract

### Users, organizations, and memberships

Samebase has three separate domain entities:

1. A `users` row is one stable Samebase account and its personal state.
2. An `organizations` row is one workspace for exactly one GitHub repository owner.
3. An `organizationMemberships` row grants one user access to one organization.

A user can have zero, one, or several memberships. An organization can have several members. At most
one membership can exist for an exact organization and user pair. The schema must not put one
`organizationId` on `users` or put a user ID array on an organization.

Signup, sign-in, approval, and waitlist changes do not create an organization or billing account. A
user who has not created or joined an organization has zero memberships. This is a normal state,
including for waitlisted users.

Samebase authentication is independent from GitHub access. A user can sign in with Google or another
supported authentication method. An invited member does not need a GitHub account. GitHub login is
not required to read or operate an organization when Samebase membership and the GitHub App
installation authorize the operation.

The current membership model has no roles, invitation rows, or permission arrays. Membership row
presence grants the current organization access. The operator can add an existing Samebase user to
an organization through one idempotent internal function until a product invitation flow exists.
Adding a membership never creates another organization.

### GitHub owner identity

One Samebase organization maps to exactly one GitHub repository owner. A repository owner can be a
GitHub organization or a personal GitHub account.

The required organization identity is:

```text
githubOwnerId: string
githubOwnerType: "organization" | "user"
githubOwnerLogin: string
```

`githubOwnerId` is the stable external identity. The schema and creation function enforce that one
GitHub owner ID maps to at most one Samebase organization. `githubOwnerLogin` is current display and
route data. A GitHub rename updates the login without changing the Samebase organization or its
resources.

An organization is always bound to its GitHub owner when it is created. There is no unbound
organization state and no arbitrary personal organization created during signup.

### Samebase GitHub App

Creating an organization requires a verified installation of the Samebase GitHub App on the target
GitHub owner. The signed-in Samebase user who completes the verified setup becomes the initial
member. The same transaction creates the organization's Free billing row.

The GitHub App installation is the required connection to the GitHub owner. It is not a
`providerConnections` row and is not a Samebase login method. The organization stores the current
installation as replaceable connection state:

```text
githubInstallation:
  | { state: "active"; installationId: string }
  | { state: "suspended"; installationId: string }
  | { state: "removed"; installationId: string }
```

The installation ID is not the organization identity. Suspending or uninstalling the app keeps the
stable GitHub owner binding and Samebase data, but GitHub-backed operations fail closed. Installing
the app again on the same owner ID updates the installation connection and restores access. It does
not create another organization.

Samebase generates short-lived installation access tokens when an operation needs one. It never
stores installation access tokens in Convex. The GitHub App private key and webhook secret remain
deployment secrets.

The installation flow uses short-lived state bound to the signed-in Samebase user. The callback must
verify the installation and the installer's access. It must not trust a returned `installation_id`
by itself. GitHub webhooks update installation status, repository access, and owner login. Every
webhook verifies its signature and handles repeated deliveries idempotently.

GitHub App installation authentication is the default for repository reads, writes, and organization
repository creation. Some GitHub operations require a GitHub user access token. The current example
is creating a repository under a personal GitHub account. When Samebase retains a GitHub user
authorization for such an operation, it belongs to the exact Samebase user and GitHub user. It never
identifies an organization, grants membership, or becomes available to another member.

Sources:

- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url
- https://docs.github.com/en/rest/apps/apps#get-an-installation-for-the-authenticated-app
- https://docs.github.com/en/webhooks/webhook-events-and-payloads#installation

### Provider connections

`providerConnections` contains only deployment-provider connections, currently Convex and
Cloudflare. GitHub App installations and GitHub user authorizations use their own models.

Each provider connection has these ownership fields:

```text
organizationId: Id<"organizations">
connectedByUserId: Id<"users">
state: "connected" | "disconnected"
```

The schema permits several connections of one provider kind in one organization. The initial UI can
continue to select one current connection without making that UI limit a database uniqueness rule.
`connectedByUserId` records credential provenance and lifecycle dependency. It does not grant
access.

Provider credentials stay in backend-only functions. Product clients can request authorized provider
operations and read non-secret connection status. They cannot retrieve stored credentials or raw
provider failures.

Cloudflare and Convex resources and provisioning plans store the exact provider connection ID used
to create or attach them. Reloads and retries do not select credentials from the acting user.

GitHub-specific selected-provider fields and resource bindings do not exist. In particular, the
final schema has no `selectedGithubProviderConnectionId`, `vaults.githubProviderConnectionId`, or
`workflow_vaultProvisioning_plans.githubProviderConnectionId`.

### Vault identity and routing

Every vault belongs to one organization and one GitHub repository owned by that organization's
GitHub owner. Vault creation rejects a repository whose owner ID does not equal the organization's
`githubOwnerId`.

One GitHub repository identity maps to at most one retained Samebase vault. Repository identity is
stable across owner-login and repository-name changes.

The route `/vault/<owner>/<repository>` resolves the vault, then derives its Samebase organization.
It does not require or preserve an opaque `?organization=<id>` query parameter. Other
organization-scoped routes use the readable GitHub owner login as route context when they need
explicit context. Internal Samebase IDs remain authorization and database identities, not visible
URL selectors.

Existing-resource operations load the resource and derive its organization before checking
membership. Root creation operations identify the GitHub owner workspace and verify membership.
Client-supplied organization IDs, user IDs, provider credentials, or actor fields are never proof of
access.

### Authorization and ownership

An organization-scoped operation requires both:

```text
the current user has the function's required application access
AND the current user has a membership in the resource organization
```

The existing `access_*` keys remain the coarse application and waitlist gate. Membership is the
resource gate. Shared helpers implement membership checks.

Durable ownership is:

| Data                                       | Boundary                                               |
| ------------------------------------------ | ------------------------------------------------------ |
| GitHub App installation                    | Organization's stable GitHub owner                     |
| Vault                                      | Organization and matching GitHub repository owner      |
| Vault child data                           | Parent vault                                           |
| Convex or Cloudflare provider connection   | Organization, with connecting-user provenance          |
| Attached Convex or Cloudflare resource     | Parent vault plus exact provider connection            |
| Billing account, plan, quota, and usage    | Organization                                           |
| MCP grant                                  | User delegation bound to one organization              |
| Auth accounts, sessions, profile, approval | User                                                   |
| GitHub user authorization                  | Exact user, only for operations that need user context |
| UI preferences and actor provenance        | User                                                   |

Staged files remain one shared draft for a vault, branch, and path. FileView remains a staff-only
add-on and is not a release gate for this rollout. Multi-writer FileView recovery is outside this
contract.

MCP consent binds each grant to one explicit organization membership. Removing that membership
revokes the grant. Existing MCP requests keep one validated authorization snapshot for the request
boundary. Vault tools derive the organization from the grant or loaded vault, never from a first
membership.

### Billing

`organizationBillingAccounts` contains exactly one row for each organization and no row for a user
who has no organization. New organization rows start on Free with inactive provider billing state.

The organization owns its plan, quota, usage, checkout, and subscription. The GitHub App installer,
the member who starts checkout, and the external payer do not become the organization identity.
Invited members use the same organization plan and quota.

### Account and organization lifecycle

Deleting a user account is not organization deletion. User deletion removes authentication data,
personal state, memberships, MCP grants, and user-owned GitHub authorizations. It must not infer
that a GitHub-backed organization should be deleted because the user was its only Samebase member.

Convex or Cloudflare connections whose credential lifecycle depends on the deleting user are revoked
when possible and disconnected locally. The organization, vaults, billing row, and other members
remain.

Organization deletion is a separate operator action in this rollout. It is not part of user account
deletion or GitHub App uninstall.

## Migration

This pre-beta rollout uses a reset and final-schema deployment. It ships no fallback reads, dual
writes, compatibility fields, or general migration framework.

The operator can clear disposable organization, membership, billing, provider-connection, vault,
staging, workflow, and MCP authorization data before the final schema deploy. User, authentication,
approval, and waitlist rows remain.

After deployment:

1. A retained operator signs in through the normal Samebase authentication flow.
2. The operator installs and verifies the environment's Samebase GitHub App.
3. The verified flow creates the GitHub-backed organization, initial membership, and billing row.
4. The operator adds the second retained Samebase user through the internal membership function.
5. Waitlist users remain users with zero memberships.
6. The operator reconnects Convex, Cloudflare, retained vaults, and MCP clients as needed.

Development and production use separate GitHub App registrations, credentials, callback URLs, and
webhook secrets. The rollout does not start the GitHub App implementation until both registrations
and their required permissions are recorded.

## Non-Goals

- Automatic organization creation during signup
- Unbound organizations or independent personal organization names
- Requiring GitHub as the Samebase login method
- Treating GitHub as a normal provider connection
- Grouping repositories from several GitHub owners in one Samebase organization
- Organization rename independent from the GitHub owner login
- Email invitation, acceptance, membership-management, or role UI
- Fine-grained vault, branch, file, or provider-resource roles
- Persisted active-organization state or opaque organization query parameters
- WorkOS, Clerk, SSO, Directory Sync, or SCIM implementation in this rollout
- Changing the temporary waitlist and approval gate
- Multi-member FileView commit coordination
- Backward-compatible migration machinery before public beta

## Validation

The rollout is complete only when tests and manual checks prove:

- Signup and waitlist entry create a user with zero memberships and no billing row.
- A Google-authenticated user can have zero organizations or join an existing organization.
- A verified GitHub App installation creates exactly one organization for its stable owner ID, one
  initial membership, and one billing row.
- Reinstalling the app for the same owner ID restores the same organization without a duplicate.
- Suspending or uninstalling the app blocks GitHub-backed operations without deleting the
  organization.
- One user can belong to several GitHub-backed organizations, and one organization can have several
  users.
- An invited member receives no automatic personal organization and needs no GitHub login for
  installation-authenticated operations.
- A GitHub user authorization is never exposed to or used as another Samebase member's user
  identity.
- A vault owner ID must match its organization owner ID.
- `/vault/<owner>/<repository>` reloads without an organization query parameter and resolves the
  same vault, organization, GitHub repository, Cloudflare Worker, and Convex project.
- Two members see the same organization vaults, billing state, provider status, and observations.
- A member can create and reload a GitHub-organization repository, Convex project, and Cloudflare
  Worker through the organization GitHub App and provider connections.
- A user outside the organization cannot read or change its resources.
- Convex and Cloudflare connections are organization-owned, can have several rows per kind, record
  connecting-user provenance, and never return credentials to clients.
- Billing and quotas belong to the organization, not a user or GitHub installation.
- User deletion does not delete the GitHub-backed organization or shared resources.
- MCP consent and tool execution use the exact organization membership and resource boundary.
- No production caller or test preserves automatic personal organizations, GitHub provider
  connections, or opaque organization URL selection.
