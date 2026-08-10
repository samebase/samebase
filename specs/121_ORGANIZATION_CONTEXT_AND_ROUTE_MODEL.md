# 121 Organization Context And Route Model

## Document Control

- Status: Accepted rollout contract
- Owner: Samebase product
- Last updated: 2026-08-11
- Depends on: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Related: `specs/123_ORGANIZATION_MEMBERSHIP_ADMINISTRATION_SPEC.md`
- Supersedes: `archive/118_VAULT_FOLDER_SPEC.md`
- Approved proposal: <https://github.com/samebase/samebase/pull/1371>
- Active reset coordination: `rfcs/122_ORGANIZATION_DEPLOYMENT_PROVIDER_ROLLOUT.md`

## Current Contract

A Samebase account signs a user in. A Samebase organization owns the work. A vault is one GitHub
repository inside that organization.

An organization is a route namespace, a visible page context, and a section in the global vault
inventory. It is not hidden application state. Samebase does not save a last active organization.
The route is the source of organization context.

One Samebase organization continues to map to exactly one GitHub repository owner. This contract
does not change the organization schema or membership model in Spec 120.

## Route Model

User-owned pages use these routes:

| Route       | Contract                                                                   |
| ----------- | -------------------------------------------------------------------------- |
| `/vault`    | Show all current organizations as sections and their vaults.               |
| `/settings` | Show profile, sign-in methods, MCP grants, sign-out, and account deletion. |

Organization-owned pages use these routes:

| Route                          | Contract                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `/org/:owner`                  | Check access, then redirect to `/org/:owner/vaults`.                                                        |
| `/org/:owner/vaults`           | Show only vaults owned by this organization.                                                                |
| `/org/:owner/providers`        | Show GitHub App health, personal repository authorization when needed, and deployment provider connections. |
| `/org/:owner/new-app`          | Create a repository and provider resources in this organization.                                            |
| `/org/:owner/connect-repo`     | Connect a repository owned by this GitHub owner.                                                            |
| `/org/:owner/settings/members` | List and administer Samebase membership and show live GitHub relationship information.                      |
| `/org/:owner/settings`         | Show identity, role, billing, usage, quota, and plan controls.                                              |

The public invitation route is `/invite/:code`. Its opaque code identifies one invitation, but the
exact linked GitHub identity and explicit recipient action authorize acceptance. Spec 123 owns this
route and the Members page behavior.

Vault resources keep `/vault/:owner/:repo` and its existing child routes. This includes the shipped
FileView path `/vault/:owner/:repo/fs/:branch/*`. This work changes the shared context around
FileView. It does not redesign the editor.

The routes `/providers`, `/new-app`, and `/connect-repo`, including their old owner variants, are
not product pages. Internal links use the organization route family directly. User settings do not
use an owner search parameter.

## Organization Context

The standard right navigation pane shows the organization context directly below the signed-in
account section. Shared main-pane chrome does not repeat this context. On small screens, `/vault`,
`/org/:owner/*`, and `/vault/:owner/:repo/*` show the standard right-pane toggle. User settings do
not show an organization context control.

A user with one or more organizations sees the same switch control. A user with no organizations
sees a static `All vaults` label. The switch control contains these items:

1. `All vaults`
2. Current organizations, sorted by owner login
3. `Install GitHub App`

The switch keeps the same organization section when the target route supports it. A switch from a
vault route opens the target organization's vault list. Each switch creates a normal browser history
entry. Back, Forward, reload, and direct links read the owner from the route.

The right navigation pane uses the route owner. Below the context control, it provides `Vaults`,
`Providers`, `New app`, `Connect repository`, `Members`, and `Organization settings` in that order.
Shared account navigation provides All vaults and Account settings. The global vault page always
provides Install GitHub App.

## Global Vault Inventory

`/vault` is always user-global. It shows one section for each current organization, including an
organization with no vaults. Sections use normalized owner-login order with a stable tie-breaker.
Each section shows that user's folders for the organization, followed by vaults that are not in a
folder. Vaults inside each group keep the existing activity order.

The page uses the same organization, folder, and vault tree component as the vault detail picker.
Each organization row is a disclosure control with the same layout and actions in both placements.
When no saved disclosure choice exists, `/vault` starts each organization open. Each vault links to
`/vault/:owner/:repo`. A one-organization user still sees one named section. The page never
redirects because of the membership count.

A vault detail picker groups all current organizations with the same tree. When no saved disclosure
choice exists, the route organization is expanded and the other organizations are collapsed. A
user's explicit open or closed choice for an organization is saved and appears in `/vault`,
`/org/:owner/vaults`, and the vault detail picker. Changing a disclosure does not change the route
or save an active organization. An empty organization shows `No vaults` when expanded. FileView
keeps its file tree instead of this picker.

## User And Organization Settings

User settings own profile data, sign-in methods, personal preferences, sign-out, account deletion,
and MCP grants. User settings contain no organization selector, personal repository authorization,
or organization billing.

Organization settings own the GitHub owner identity, Samebase role, GitHub App installation health,
billing, and member administration. Convex and Cloudflare connections use the organization providers
route.

The providers route shows `Personal repository creation` only when the selected organization has
`githubOwnerType: "user"`. This authorization lets Samebase call GitHub as the exact personal owner
when it creates a repository. It is not shown for a GitHub organization because that owner creates
repositories with the GitHub App installation token.

The control is in organization context, but the credential remains owned by the current Samebase
user. It is not organization identity, membership proof, or a shared credential. Revoking it removes
the user's ability to create repositories for that personal owner. It does not remove GitHub sign-in
or the GitHub App installation.

MCP consent stays user-global. It carries no active organization. Each target operation resolves its
resource and checks the user's current membership and role.

## Resolution And Access States

An organization route reads and normalizes `:owner`, then finds a current membership for that GitHub
owner login. It uses the internal organization ID only after this check. An internal organization ID
must not appear in a public route, search parameter, redirect, browser history state, screenshot, or
user-facing error.

`/org/:owner` checks access before its redirect. If the membership is missing or removed, Samebase
keeps the requested URL and shows:

- Heading: `Organization unavailable`
- Body: `You do not have Samebase access to <owner>.`
- Action: `All vaults`

The state does not reveal if the organization exists. It does not select another organization.

A missing or inaccessible vault keeps its clean route and shows `Vault unavailable` with an
`All vaults` action. It does not show protected vault or provider data.

When a signed-out user opens a direct link, Samebase preserves the full route through sign-in. It
checks organization or vault access after authentication is ready.

A user with no memberships can still use `/settings`. On `/vault`, Samebase shows:

- Heading: `No organizations`
- Body: `Install the Samebase GitHub App for a repository owner.`
- Action: `Install GitHub App`

## External Returns

Provider OAuth returns to `/org/:owner/providers`. Checkout and billing-portal sessions return to
`/org/:owner/settings#billing`. The return value carries the GitHub owner login and no internal
organization ID.

The server validates the return route and owner. A full-page return checks current membership before
it shows organization data. If access changed during the external flow, Samebase keeps the scoped
return route and shows the organization unavailable state.

## Organization-Scoped Vault Folders

Vault folders are a personal organization aid inside one Samebase organization. Each folder stores
one organization ID. A folder can contain only vaults owned by that organization. Folder names,
order, and collapsed state belong to one user and one organization. An empty folder remains visible.

Organization disclosure choices also belong to one user and one organization. They control only the
shared vault tree presentation and do not define organization access or active context.

The same folder layout appears in `/vault`, `/org/:owner/vaults`, and the vault detail picker. The
create action belongs to an organization section because `/vault` has no active organization.
Deleting a folder makes its vaults ungrouped inside the same organization.

Folders do not own vaults, grant access, change membership, or create a route context. If the user
loses organization access, its folders and assignments stay stored but do not appear and cannot be
changed. This rollout adds no automatic migration or compatibility path for old folder rows.

## Folder Schema Rollout Gate

Before a deployment first requires `organizationId` on `ui_vaultFolders` and
`ui_vaultFolderAssignments`, the operator must confirm the exact Convex deployment and its current
schema.

If that deployment still has the legacy folder schema:

1. Delete all legacy `ui_vaultFolderAssignments` rows.
2. Delete all legacy `ui_vaultFolders` rows.
3. Confirm that no retained folder or assignment row lacks `organizationId`.
4. Deploy the organization-scoped folder schema.

If the organization-scoped folder schema is already deployed, preserve its rows, including valid
empty folders. Do not run this reset automatically. This folder gate is independent from the
provider reset in RFC 122, although the operator can perform both gates in one maintenance window.

## Non-Goals

- No change to one GitHub owner per Samebase organization
- No enterprise account layer
- No automatic admission from GitHub organization membership
- No GitHub requirement for Samebase login
- No second organization display name
- No saved active organization
- No decorative navigation or empty future page
- No FileView editor redesign
- No nested folder hierarchy
- No compatibility shell for retired page-local owner selection

## Validation

Focused route, backend, and UI tests must prove:

- one, several, zero, and removed membership states
- one shared global inventory and vault detail tree with persisted organization disclosures
- organization-scoped folders, empty folders, ungrouped vaults, and cross-organization move denial
- organization access before the `/org/:owner` redirect
- reload, direct-link, Back, and Forward behavior
- small-screen access to the shared organization context
- scoped provider OAuth, checkout, and billing-portal returns
- user-owned sign-in methods and MCP clients in user settings
- personal repository authorization only on a personal owner's organization providers route
- no internal organization ID in public links or messages

Screenshot coverage must include the global inventory, one-organization and several-organization
context, organization settings, user settings, zero membership, lost organization access, and lost
vault access. Final UI acceptance uses the canonical Linux visual test command.
