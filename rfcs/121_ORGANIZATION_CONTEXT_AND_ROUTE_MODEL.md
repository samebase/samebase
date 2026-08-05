# 121 Organization Context And Route Model

## Document Control

- Status: Proposed
- Owner: Samebase product
- Last updated: 2026-08-05
- Depends on:
  [`specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`](../specs/120_ORGANIZATION_OWNERSHIP_SPEC.md)
- Evidence:
  [`research/2026-08-05-organization-context-ux-audit.md`](../research/2026-08-05-organization-context-ux-audit.md)
- Visual plan: [`plans/organization-context-ux/plan.mdx`](../plans/organization-context-ux/plan.mdx)

This RFC proposes product behavior. It does not change the accepted ownership contract. Do not move
this behavior into `specs/` until the product decisions at the end are approved.

## Outcome

Samebase should use this mental model:

> Your Samebase account signs you in. A Samebase organization owns the work. A vault is one GitHub
> repository inside that organization.

An organization is three things at the same time:

1. A route namespace for organization-owned pages.
2. A visible shell context while the user works in that namespace.
3. A section on the user-global vault inventory.

It is not a hidden application state. Samebase should not save a last active organization.

## Decisions In This Proposal

1. Add one organization route family: `/org/<github-owner>/...`.
2. Keep `/vault/<github-owner>/<repository>` as the stable vault route.
3. Keep `/vault` as a user-global inventory, but group every vault by organization.
4. Show the current organization in shared main-pane chrome on every organization and vault route.
5. Show a switch control only when the user has more than one organization. Always show the
   organization name.
6. Put profile, sign-out, account deletion, and MCP clients in user settings.
7. Put providers, GitHub connection health, billing, members, and roles in the organization route
   family.
8. Delete personal vault folders and replace them with derived organization sections.
9. Keep the route as the only source of scoped organization context. Do not persist a last active
   organization.
10. Keep no-membership and lost-membership states explicit. Never select another organization as a
    recovery action.

## Product Principles

### 1. Ownership must be visible before an action

Creating a repository, connecting a repository, changing a provider, managing billing, and changing
members all affect one organization. The owner login must be visible before the user starts the
action.

### 2. A URL is a contract, not a memory hint

An organization link carries the GitHub owner login. A vault link carries the owner and repository.
The server resolves that public coordinate to an internal organization ID after it checks current
Samebase membership.

The URL does not carry an internal organization ID. Local storage, browser history state, and an
authentication session do not supply a missing organization.

### 3. Global views must show boundaries

Samebase can show work from several organizations in one user-global view. It must use clear
organization sections. It must not flatten the resources or replace the owner boundary with a
personal folder name.

### 4. One organization still has a name

A one-organization user does not need a chooser. The user still needs to see the organization that
owns the page and action.

### 5. Missing access must stay missing

If a route names an organization that is not in the user's current memberships, Samebase must keep
the requested URL and show an unavailable state. It must not redirect to a remaining organization.

## Information Architecture

```text
Samebase account
├── All vaults                         /vault
├── Account settings                   /settings
│   └── MCP clients                    /settings/mcp
└── Organization: samebase             /org/samebase
    ├── Vaults                         /org/samebase/vaults
    ├── Providers                      /org/samebase/providers
    ├── New app                        /org/samebase/new-app
    ├── Connect repository             /org/samebase/connect-repo
    └── Organization settings          /org/samebase/settings
        ├── Members                    /org/samebase/settings/members
        └── Billing                    /org/samebase/settings/billing

Vault resource
└── samebase / samebase                /vault/samebase/samebase
    ├── Settings                       /vault/samebase/samebase/settings
    ├── Files                          /vault/samebase/samebase/fs/main/...
    ├── Database                       /vault/samebase/samebase/db/...
    └── Schema                         /vault/samebase/samebase/schema/...
```

`/org/<owner>` first resolves current membership. If access is valid, it redirects to
`/org/<owner>/vaults`. This redirect is deterministic. It does not depend on the number of
memberships or a saved preference. If access is not valid, `/org/<owner>` shows the organization
unavailable state without a redirect.

The members route is part of the stable information architecture. Do not ship an empty members page.
Add the route when membership management ships. Its place in the hierarchy is decided now so that
member and role work does not require a new navigation model.

## Recommended Route Table

### User-global routes

| Route                | Example                             | Exact role                                                                                          |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/vault`             | `https://samebase.com/vault`        | Show all current organizations as sections. Show their vaults inside each section.                  |
| `/settings`          | `https://samebase.com/settings`     | Profile, user preferences, sign-out, and account deletion. No organization selector and no billing. |
| `/settings/mcp`      | `https://samebase.com/settings/mcp` | List and revoke user-owned MCP grants.                                                              |
| `/oauth/mcp/consent` | Existing OAuth URL                  | Authorize the MCP client as the user across current memberships.                                    |
| `/agents/connect`    | Existing handoff URL                | Create a user session. Carry no organization.                                                       |
| `/account-deletion`  | Existing URL                        | Show user account deletion progress.                                                                |

### Organization routes

| Route                          | Example                          | Exact role                                                                          |
| ------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------- |
| `/org/:owner`                  | `/org/samebase`                  | After the access check, redirect to `/org/samebase/vaults`.                         |
| `/org/:owner/vaults`           | `/org/samebase/vaults`           | Show only vaults owned by this organization.                                        |
| `/org/:owner/providers`        | `/org/samebase/providers`        | Show Convex and Cloudflare connections for this organization.                       |
| `/org/:owner/new-app`          | `/org/samebase/new-app`          | Create a repository and provider resources in this organization.                    |
| `/org/:owner/connect-repo`     | `/org/samebase/connect-repo`     | Connect a repository owned by this GitHub owner.                                    |
| `/org/:owner/settings`         | `/org/samebase/settings`         | Show GitHub owner identity, Samebase role, and GitHub App installation health.      |
| `/org/:owner/settings/members` | `/org/samebase/settings/members` | Future member and role administration. Do not ship before it has real behavior.     |
| `/org/:owner/settings/billing` | `/org/samebase/settings/billing` | Show plan, usage, quota, checkout, and subscription controls for this organization. |

### Vault routes

| Route                                 | Example                              | Exact role                                                                      |
| ------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `/vault/:owner/:repo`                 | `/vault/samebase/samebase`           | Keep the clean GitHub-style coordinate. Resolve the organization from `:owner`. |
| `/vault/:owner/:repo/settings`        | `/vault/samebase/samebase/settings`  | Keep the vault coordinate and organization shell context.                       |
| `/vault/:owner/:repo/fs/:branch/*`    | `/vault/samebase/samebase/fs/main/*` | Keep the shipped FileView route. Change its shared shell, not its editor.       |
| Existing database and schema children | `/vault/samebase/samebase/db/...`    | Keep the vault coordinate and organization shell context.                       |

Do not move vault resource routes under `/org/<owner>/vaults/<repo>`. The existing route is shorter,
matches the GitHub repository coordinate, and already carries all required context.

### Current routes to retire

| Current route                             | New route                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `/providers/:owner`                       | `/org/:owner/providers`                                                    |
| `/new-app/:owner`                         | `/org/:owner/new-app`                                                      |
| `/connect-repo/:owner`                    | `/org/:owner/connect-repo`                                                 |
| `/settings?owner=:owner`                  | `/org/:owner/settings/billing`                                             |
| `/providers`, `/new-app`, `/connect-repo` | No unscoped product page. Enter through `/vault` or an organization route. |

These routes are not compatibility requirements. Update internal links directly and delete the
page-local owner selection model. A short server redirect for an already-public owner route is an
optional release measure, not part of the product contract.

## Organization Context And Switching

### Location

Put the organization context control in the shared main-pane header. It must be visible on every
organization route and every vault route. This location works on desktop and mobile because it does
not depend on the right navigation pane being open.

The header shows the GitHub owner login, for example `samebase`. The owner login is the label. Do
not add a second Samebase organization display name.

The right navigation pane uses routes for that owner:

- Vaults
- Providers
- New app
- Connect repository
- Organization settings

The global `/vault` page shows `All vaults` in the same header position. User settings show
`Account`. These labels make the boundary explicit without extra helper copy.

The shared account navigation always provides `All vaults` and `Account settings`. The `/vault`
header always provides `Install GitHub App`, including when the user already has one organization.
This action is how a one-organization user can add another owner without a false switch control.

### One organization

Show a static organization label without a chevron. It can link to `/org/<owner>/vaults`, but it is
not a select control. The user sees ownership without a false choice.

### Several organizations

Show a button with the owner login and a chevron. Its menu contains:

1. `All vaults`
2. One item for each current organization, sorted by owner login
3. `Install GitHub App`

Do not put user settings or sign-out in this menu. They belong to the account section.

### Switch behavior

| Current page                     | Target after selecting `nicu-typescript`                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/org/samebase/vaults`           | `/org/nicu-typescript/vaults`                                                                                    |
| `/org/samebase/providers`        | `/org/nicu-typescript/providers`                                                                                 |
| `/org/samebase/settings/billing` | `/org/nicu-typescript/settings/billing`                                                                          |
| `/vault/samebase/samebase`       | `/org/nicu-typescript/vaults`                                                                                    |
| `/vault`                         | The organization section link opens `/org/nicu-typescript/vaults`. There is no active organization on this page. |

An organization switch creates a normal browser history entry. Back returns to the prior
organization and route. Reload and direct links restore the route owner. Preserve unrelated query
parameters with the shared query parameter helpers. Remove only parameters that do not apply to the
target resource.

If the target role cannot use the same section, keep the target organization route and show the
permission state. Do not select a different organization.

## Global Vault Inventory

`/vault` is always user-global. Its meaning does not change when the user gains a second membership.

Use these rules:

1. Show one section for every current Samebase organization, including an organization with no
   vaults.
2. Sort organization sections by normalized GitHub owner login. Use a stable tie-breaker.
3. Sort vaults inside each section by the existing activity order.
4. Link the section heading to `/org/<owner>/vaults`.
5. Link each vault to `/vault/<owner>/<repo>`.
6. Do not show personal folders, an `Ungrouped` section, or a flat all-vault list.
7. For one organization, show one organization section. Do not redirect based on membership count.
8. Show `Install GitHub App` as a page action for users with zero, one, or several organizations.

The page is an inventory and an organization entry point. It is not a stored active context.

## Vault Detail Separation

A vault detail route must show only vaults from the same organization in its vault picker or left
sidebar. The organization switcher is the action that crosses the boundary.

This gives each control one job:

- The vault picker changes repositories inside one organization.
- The organization switcher changes the ownership boundary.
- `All vaults` returns to the user-global inventory.

Do not mix other organizations into the vault picker for convenience.

## User Settings And Organization Settings

| User settings                                   | Organization settings                             |
| ----------------------------------------------- | ------------------------------------------------- |
| Display name and user preferences               | GitHub owner identity                             |
| Sign-out                                        | Convex and Cloudflare provider connections        |
| Samebase account deletion                       | Organization billing plan, usage, and quota       |
| User-owned MCP clients and grants               | Members and roles                                 |
| Personal GitHub user authorization              | GitHub App installation and reconnect health      |
| Personal authentication and security when added | Organization-level destructive actions when added |

User settings use `/settings` and `/settings/mcp`. Organization administration uses
`/org/<owner>/settings/...` and `/org/<owner>/providers`.

Do not place an organization selector inside user settings. Do not place a user-owned MCP grant list
inside organization providers.

The GitHub App installation and its reconnect health belong to the organization. A separate GitHub
App user authorization belongs to the Samebase user. Put that authorization in user settings. Show
an inline authorization prompt in a personal-owner creation flow only when that operation needs it.
Do not use the user authorization as organization identity or membership proof.

## MCP Consent

MCP consent remains user-global. The consent page must not ask for an organization. It must state
that access follows the user's current Samebase memberships and the granted scopes.

An MCP link does not carry an active organization. Each MCP operation that targets an
organization-owned resource must resolve the target resource and check the user's current membership
and role at operation time.

The authorized-client list moves from Providers to `/settings/mcp`.

## URL And Resolution Contract

For an organization route:

1. Read `:owner` from the path.
2. Normalize it for lookup.
3. Find a current Samebase membership whose organization has that GitHub owner login.
4. Use the internal organization ID only after this check.
5. Render the organization page or the unavailable state for that same URL.

For a vault route, resolve the owner and repository as one vault coordinate, then confirm current
membership in that vault's organization.

For a signed-out direct link, preserve the full requested route through Samebase sign-in. Resolve
the organization and membership only after authentication is ready. Do not render protected
missing-content copy while the user state is still unknown.

Never put an internal organization ID in a public route, search parameter, redirect target, browser
history state, or user-facing error.

GitHub owner rename behavior remains outside this RFC. The accepted backend contract already defers
owner and repository rename synchronization as one later task.

## External Return Contract

Provider OAuth returns to `/org/<owner>/providers`. Checkout and billing-portal sessions return to
`/org/<owner>/settings/billing`. The return URL carries the GitHub owner login and never an internal
organization ID.

A full-page return resolves current membership before it shows organization data. If membership was
removed during the external flow, keep the scoped return URL and show `Organization unavailable`. Do
not return to an unscoped page or select another organization.

## Empty And Lost-Access States

### No organization membership

On `/vault`, show:

- Heading: `No organizations`
- Body: `Install the Samebase GitHub App for a repository owner.`
- Action: `Install GitHub App`

Do not show a folder action, provider selector, billing selector, or empty organization navigation.
User settings and user-owned MCP client management remain available.

### Lost or invalid organization membership

Keep the requested URL and show:

- Heading: `Organization unavailable`
- Body: `You do not have Samebase access to <owner>.`
- Action: `All vaults`

Do not reveal private organization data. Do not say whether the organization exists outside the
user's current memberships. Do not redirect to the sole remaining organization.

### Lost vault access

Keep the clean vault URL and show `Vault unavailable` with an `All vaults` action. Do not show
provider resources, Convex project IDs, Cloudflare resources, or the vault name from protected data.

## Vault Folder Decision

Delete `ui_vaultFolders` and `ui_vaultFolderAssignments`. Replace their visible result with derived
organization sections.

Reasons:

1. The folder spec used the old premise that vaults were user-owned.
2. The organization is now the shared owner for vaults, providers, billing, and members.
3. A cross-organization folder hides this boundary in the primary navigation.
4. An organization-scoped folder system would add a second hierarchy without current evidence.
5. The product is pre-beta, and there is no safe automatic mapping for mixed folder names.

After approval, do not preserve or transform folder data. Stop folder writes. Delete the
`ui_vaultFolderAssignments` table, then delete the `ui_vaultFolders` table. Verify that both tables
are absent in each persistent deployment. Then remove their schema entries, APIs, client state,
dialogs, menu actions, tests, and cleanup code. Replace or archive
[`specs/118_VAULT_FOLDER_SPEC.md`](../specs/118_VAULT_FOLDER_SPEC.md) as part of the accepted
implementation. Do not change that spec in this research task.

## Future Members, Roles, And Billing

The route family reserves a stable place for member and role administration without adding a new
account layer:

- `/org/<owner>/settings/members`
- `/org/<owner>/settings/billing`

The existing `owner | member` Samebase role controls actions. GitHub organization membership does
not admit a user. Invitations and role changes must use Samebase membership records.

The shared organization header and navigation remain the same when member management ships. Only the
settings section gains a real Members link for users who can view it.

## Non-Goals

- Do not change the one-GitHub-owner-per-Samebase-organization contract.
- Do not add an enterprise account layer.
- Do not admit GitHub members automatically.
- Do not make Samebase login depend on GitHub.
- Do not redesign FileView in this work.
- Do not add a second organization display name.
- Do not persist a last active organization.
- Do not add empty future pages or decorative navigation.
- Do not preserve the current route components or folder code only for compatibility.

## Implementation Slices

### Slice 1: Organization routes and shared context

- Add the `/org/:owner` route family and one shared route resolver.
- Move providers, new app, connect repository, GitHub installation health, and billing to scoped
  routes.
- Add the organization context control to shared main-pane chrome.
- Make the right navigation use the route owner.
- Move MCP clients to user settings.
- Remove page-local owner selectors and unscoped organization pages.
- Change provider OAuth, checkout, and billing-portal returns to the scoped organization routes.
- After approval, update the setup and billing route contract and its release validation in
  [`specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`](../specs/120_ORGANIZATION_OWNERSHIP_SPEC.md).

### Slice 2: Vault separation and folder deletion

- Change `/vault` to organization sections.
- Limit the vault detail picker to the current organization.
- Stop folder writes. Delete assignments before folders in each persistent deployment, and verify
  that both tables are absent.
- Remove the folder UI, schema entries, mutations, tests, and cleanup paths.
- Update screenshot coverage for desktop and mobile.
- Replace the accepted folder spec only after this RFC is approved.

### Slice 3: Access-state and route acceptance

- Add explicit zero-membership, lost-membership, and lost-vault states.
- Test one, several, zero, and removed memberships.
- Test reload, direct links, Back, Forward, mobile pane behavior, and role changes.
- Test full-page provider OAuth, checkout, and billing-portal returns, including membership removal
  during the external flow.
- Test that no public route or link contains an internal organization ID.
- Test that MCP consent stays user-global and each target operation checks current membership.

## Acceptance Scenarios

1. A user with one organization opens `/vault`, sees one named organization section, and can enter
   `/org/<owner>/vaults` without a select control.
2. A user with several organizations sees separate sections on `/vault`. No vault appears under the
   wrong owner.
3. The user opens `/org/samebase/providers`, switches to `nicu-typescript`, and reaches
   `/org/nicu-typescript/providers`. Back returns to `/org/samebase/providers`.
4. The user opens `/vault/samebase/repo`, reloads, and sees only `samebase` vaults in the vault
   picker.
5. A direct organization or vault link restores the same route and context in a new tab.
6. A signed-out direct link returns to the same route after Samebase sign-in, then checks current
   membership.
7. Removing membership while a route is open shows the unavailable state on the same URL.
8. The user can still open `/settings` and `/settings/mcp` with no organization membership.
9. A small-screen user can see and open the organization context control from the main pane.
10. Provider, billing, and member actions check the role in the route organization.
11. Provider OAuth and billing returns restore the same scoped owner. If access was removed during
    the flow, the return route shows `Organization unavailable`.
12. No public route, link, screenshot, or message shows an internal organization ID.

## Approval Request

The implementation can start after three product decisions:

1. Approve `/org/<github-owner>` as the organization route family while keeping
   `/vault/<owner>/<repo>` for vaults.
2. Approve `/vault` as an always-global inventory with organization sections and no saved active
   organization.
3. Approve deletion of personal vault folders without preserving or transforming folder data.

The recommendation is to approve all three together. They form one coherent ownership model.
