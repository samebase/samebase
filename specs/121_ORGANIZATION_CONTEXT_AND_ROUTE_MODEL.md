# 121 Organization Context And Route Model

## Document Control

- Status: Accepted rollout contract
- Owner: Samebase product
- Last updated: 2026-09-29
- Depends on: `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`
- Related: `specs/123_ORGANIZATION_MEMBERSHIP_ADMINISTRATION_SPEC.md`
- Supersedes: `archive/118_VAULT_FOLDER_SPEC.md`
- Approved proposal: <https://github.com/samebase/samebase/pull/1371>
- Active reset coordination: `rfcs/122_ORGANIZATION_DEPLOYMENT_PROVIDER_ROLLOUT.md`

## Current Contract

A Samebase account signs a user in. A Samebase organization owns the work. A Samebase repository is
a direct connection to one GitHub repository inside that organization.

An organization is a route namespace, a visible page context, and a section in the global repository
inventory. It is not hidden application state. Samebase does not save a last active organization.
The route is the source of organization context.

One Samebase organization continues to map to exactly one GitHub repository owner. This contract
does not change the organization schema or membership model in Spec 120.

## Route Model

User-owned pages use these routes:

| Route       | Contract                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `/repo`     | Show all current organizations as sections and their repositories.                             |
| `/org`      | Show current Samebase memberships, then GitHub App installation choices that the user can add. |
| `/settings` | Show profile, sign-in methods, MCP grants, sign-out, and account deletion.                     |

Organization-owned pages use these routes:

| Route                          | Contract                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `/org/:owner`                  | Check access, then redirect to `/org/:owner/repositories`.                                                                   |
| `/org/:owner/repositories`     | Show only repositories owned by this organization.                                                                           |
| `/org/:owner/providers`        | Show GitHub App health, the GitHub user authorization for a personal owner when needed, and deployment provider connections. |
| `/org/:owner/new-app`          | Create a repository and provider resources in this organization.                                                             |
| `/org/:owner/connect-repo`     | Connect a repository owned by this GitHub owner.                                                                             |
| `/org/:owner/settings/members` | List and administer Samebase membership and show live GitHub relationship information.                                       |
| `/org/:owner/settings`         | Show identity, role, the Convex production region default, billing, usage, quota, and plan controls.                         |

The public invitation route is `/invite/:code`. Its opaque code identifies one invitation, but the
exact linked GitHub identity and explicit recipient action authorize acceptance. Spec 123 owns this
route and the Members page behavior.

Repository resources use `/repo/:owner/:repository` and its existing child routes. This includes the
shipped FileView path `/repo/:owner/:repository/fs/:branch/*`. This work changes the shared context
around FileView. It does not redesign the editor.

The routes `/providers`, `/new-app`, and `/connect-repo`, including their old owner variants, are
not product pages. Internal links use the organization route family directly. User settings do not
use an owner search parameter.

## Organization Context

The standard right navigation pane shows `All repositories` and `Organizations` directly below the
signed-in account section. Shared main-pane chrome does not repeat these links. The `Organizations`
link stays visible on global repository and organization routes. On small screens, `/repo`, `/org`,
`/org/:owner/*`, and `/repo/:owner/:repository/*` show the standard right-pane toggle. User settings
do not show an organization context control.

A user with one organization sees its owner name as text below the global links, followed by the
organization navigation links. This also applies on `/repo` and `/org`, without changing those
global routes. There is no dropdown or `No organization selected` label for that user.

A user with several organizations sees the switch control on the global repository and scoped
organization or repository routes. The switch contains only current organizations, with personal
owners first and each owner type sorted by owner login. A user with no organizations sees no switch
control. Account settings have no organization context or organization navigation links.

The switch keeps the same organization section when the target route supports it. A switch from a
repository route opens the target organization's repository list. Each switch creates a normal
browser history entry. Back, Forward, reload, and direct links read the owner from the route.

On a scoped route, the right navigation pane uses the route owner. An unavailable route owner never
falls back to another membership. Below the organization name or switch control, the pane provides
`Repositories`, `Providers`, `New app`, `Connect repository`, `Members`, and `Organization settings`
in that order. The global repository empty state provides an `Add organization` action that opens
`/org`.

## Organizations Directory

`/org` is a user-global route with the standard right navigation pane. A sole membership supplies
navigation links without filtering the directory. The page first lists every current Samebase
membership. These rows do not depend on GitHub sign-in, authorization, or installation discovery.
Each membership row shows `Connected to Samebase` and an `Open` action for
`/org/:owner/repositories`.

GitHub discovery runs as an independent second data source. The page links to Account settings when
the GitHub identity is missing and asks the user to authorize GitHub only when the authorization is
missing, expired, or revoked. Existing membership rows stay visible during GitHub loading,
authorization recovery, and load failure. When discovery is ready, Samebase lists the environment's
visible GitHub App installations that are not already represented by a current membership.

GitHub installation visibility does not authorize Samebase organization creation. Each list item
uses this order:

1. If GitHub does not verify the exact personal owner or a live organization administrator, show
   `Owner required`. Do not reveal if that GitHub owner is already connected to Samebase.
2. If GitHub verifies owner authority but the owner is already connected without this user's
   Samebase membership, show `Invite required` and
   `Someone already connected this GitHub organization to Samebase. Ask a Samebase organization owner to invite you.`
3. If GitHub verifies owner authority and the owner is unbound, show `Not connected to Samebase` and
   a `Connect` action.

Every connection uses the exact linked GitHub sign-in identity that Spec 122 defines.
`Install GitHub App` starts the GitHub App installation flow. Installing or configuring the App is
not required when the selected installation already appears in this list.

## Global Repository Inventory

`/repo` is always user-global. It shows one section for each current organization, including an
organization with no repositories. Sections use normalized owner-login order with a stable
tie-breaker. Each section shows that user's folders for the organization, followed by repositories
that are not in a folder. Repositories inside each group keep the existing activity order.

The page uses the same organization, folder, and repository tree component as the repository detail
picker. Each organization row is a disclosure control with the same layout and actions in both
placements. When no saved disclosure choice exists, `/repo` starts each organization open. Each
repository links to `/repo/:owner/:repository`. A one-organization user still sees one named
section. The page never redirects because of the membership count.

A repository detail picker groups all current organizations with the same tree. When no saved
disclosure choice exists, the route organization is expanded and the other organizations are
collapsed. A user's explicit open or closed choice for an organization is saved and appears in
`/repo`, `/org/:owner/repositories`, and the repository detail picker. Changing a disclosure does
not change the route or save an active organization. An empty organization shows `No repositories`
when expanded. FileView keeps its file tree instead of this picker.

## User And Organization Settings

User settings own profile data, sign-in methods, personal preferences, sign-out, account deletion,
and MCP grants. User settings contain no organization selector, personal repository authorization,
or organization billing.

Organization settings own the GitHub owner identity, Samebase role, the Convex production region
default, billing, and member administration. Convex and Cloudflare connections use the organization
providers route.

An owner can edit the region default. A member sees it as read-only text. Spec 120 owns its storage
and fallback behavior.

The providers route shows `Personal repository creation` only when the selected organization has
`githubOwnerType: "user"`. Its management and revoke control owns the same user-owned GitHub
authorization that installation discovery uses. `/org` shows the authorization recovery action when
this credential is not usable. The authorization also lets Samebase call GitHub as the exact
personal owner when it creates a repository. The Providers control is not shown for a GitHub
organization because that owner creates repositories with the GitHub App installation token.

The control is in organization context, but the credential remains owned by the current Samebase
user. It is not organization identity, membership proof, or a shared credential. Revoking it removes
installation discovery and the user's ability to create repositories for that personal owner until
the user authorizes GitHub again. It does not remove GitHub sign-in or the GitHub App installation.

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
- Action: `All repositories`

The state does not reveal if the organization exists. It does not select another organization. A
one-time GitHub callback notice can explain an existing connection only after GitHub verifies that
the current user controls the selected GitHub account or organization. The notice does not identify
another Samebase member or expose an internal organization ID.

A missing or inaccessible repository keeps its clean route and shows `Repository unavailable` with
an `All repositories` action. It does not show protected repository or provider data.

When a signed-out user opens a direct link, Samebase preserves the full route through sign-in. It
checks organization or repository access after authentication is ready.

A user with no memberships can still use `/settings`. On `/repo`, Samebase shows:

- Heading: `No organizations`
- Body: `Connect a GitHub account or organization to Samebase.`
- Action: `Add organization`

## External Returns

Provider OAuth returns to `/org/:owner/providers`. Checkout and billing-portal sessions return to
`/org/:owner/settings#billing`. The return value carries the GitHub owner login and no internal
organization ID. Provider OAuth passes through `/oauth/provider-complete` first. A provider
authorization that another Samebase account completes returns to `/org`, because that account can be
outside the organization.

GitHub authorization returns to `/org` without a credential or connection-session search parameter.
The route keeps unrelated accepted search and hash values across the external return, then reads the
current user's durable authorization from the server. After a successful connection, Samebase
replaces this route in browser history. A Back action does not return to the directory.

The server validates the return route and owner. A full-page return checks current membership before
it shows organization data. If access changed during the external flow, Samebase keeps the scoped
return route and shows the organization unavailable state.

## Organization-Scoped Repository Folders

Repository folders are a personal organization aid inside one Samebase organization. Each folder
stores one organization ID. A folder can contain only repositories owned by that organization.
Folder names, order, and collapsed state belong to one user and one organization. An empty folder
remains visible.

Organization disclosure choices also belong to one user and one organization. They control only the
shared repository tree presentation and do not define organization access or active context.

The same folder layout appears in `/repo`, `/org/:owner/repositories`, and the repository detail
picker. The create action belongs to an organization section because `/repo` has no active
organization. Deleting a folder makes its repositories ungrouped inside the same organization.

Folders do not own repositories, grant access, change membership, or create a route context. If the
user loses organization access, its folders and assignments stay stored but do not appear and cannot
be changed. This rollout adds no automatic migration or compatibility path for old folder rows.

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
- one shared global inventory and repository detail tree with persisted organization disclosures
- organization-scoped folders, empty folders, ungrouped repositories, and cross-organization move
  denial
- organization access before the `/org/:owner` redirect
- reload, direct-link, Back, and Forward behavior
- small-screen access to the shared organization context
- scoped provider OAuth, checkout, and billing-portal returns
- user-owned sign-in methods and MCP clients in user settings
- the GitHub user-authorization management and revoke control only on a personal owner's
  organization providers route, with authorization recovery on `/org`
- membership-first organization display during missing sign-in, authorization recovery, discovery
  loading, and discovery failure
- connection discovery with a saved authorization, Invite required, Owner required, Connect, and
  final race states
- no internal organization ID in public links or messages

Screenshot coverage must include the global inventory, one-organization and several-organization
context, the Organizations directory and its connection choices, organization settings, user
settings, zero membership, lost organization access, and lost repository access. Final UI acceptance
uses the canonical Linux visual test command.
