# Vault Folder Product Research

## Status

- Date: 2026-07-31
- Scope: personal organization of the vault list
- Question: should Samebase add shallow folders, labels, pins, saved views, or archive behavior?
- Recommendation: add shallow personal vault folders first

## Recommendation

Add one level of personal **Vault folders** to the vault sidebar.

Each vault can be in one folder or in `Ungrouped`. A folder has a stable identity and a user-chosen
name. The user can create, rename, reorder, collapse, and delete folders. The user can move a vault
with a menu action that works on desktop and mobile. Drag and drop can come later.

Use these rules:

1. A folder is for display organization only.
2. A folder does not change vault ownership, access, URLs, repository identity, provider resources,
   deployment behavior, or health checks.
3. A folder name can change without a change to its stable identity.
4. Deleting a folder moves its vaults to `Ungrouped`. It never deletes a vault.
5. New vaults start in `Ungrouped`. Vault creation does not require a folder choice.
6. Folder names are unique for one user without regard to letter case.
7. Folder order is manual. Vault order inside a folder keeps the current recent-activity sort.
8. A collapsed folder shows an attention signal if one of its vaults needs attention. This lets a
   user hide fixture rows but still monitor them.
9. Search, `All vaults`, and agent-facing list operations still return all vaults by default.
10. There is no folder nesting in this model.

Do not add labels, saved views, or a special archive state in the first version. Do not use a folder
named `Important` as a built-in product concept. If Samebase later needs a permanent importance
control, add a separate personal `Pin`. A pinned vault can still belong to `Fixtures`,
`Client work`, or another folder.

The UI should use the word `Folder`. `Group` is too general, and `Collection` often means an
overlapping filter or an access-control container in other products.

## Why This Fits Samebase

The existing vault sidebar is a flat list. It maps every returned vault directly to one route link
in
[`VaultOverviewSidebar.tsx`](../apps/samebase/src/components/vault-dashboard/VaultOverviewSidebar.tsx#L110).
The backend orders that list by the last edit time or creation time in
[`dashboard.ts`](../apps/samebase/convex/vault/dashboard.ts#L755). The earlier
[`Vault Sidebar Dashboard`](./2026-07-01-vault-sidebar-dashboard.md) research already records that a
list with almost every vault can feel overwhelming.

This creates a clear product problem:

1. Recent activity helps the user find recent work, but it does not separate fixtures from regular
   projects.
2. A fixture can be active and healthy. It is not archived work.
3. The user wants fewer visible rows, not a query language or a metadata system.
4. Folder membership is stable enough to remember, but simple enough to change with one action.
5. The current vault model is user-owned, so a personal folder does not need a new sharing or access
   model.

The folder is a view preference around the vault. It must not become another vault life-cycle axis.
The current vault model already keeps repository setup, provider setup, deletion, and health as
separate facts. The folder must keep that separation.

## Comparable Product Patterns

The current products use four different mechanisms. Each mechanism answers a different question.

| Mechanism           | Question it answers                        | Common behavior                                         |
| ------------------- | ------------------------------------------ | ------------------------------------------------------- |
| Folder or section   | Where does this item belong in my list?    | Stable, manual, and usually exclusive                   |
| Pin or favorite     | What do I need to reach quickly?           | Personal and independent from the main location         |
| Label or saved view | Which items match this category or filter? | Overlapping or dynamic membership                       |
| Archive             | Is this item no longer active?             | Removes normal focus and can restrict normal operations |

### Slack custom sections

[Slack custom sections](https://slack.com/help/articles/360043207674-Organize-your-sidebar-with-custom-sections)
are personal sidebar containers. The user can create, rename, delete, collapse, sort, and filter a
section. Slack uses `Move` for section membership. When a user removes a conversation from a custom
section, Slack moves it back to the standard Channels or Direct messages section.

This is the closest interaction model for Samebase. It gives a long sidebar a calm, user-controlled
shape without a change to the underlying object or its access.

### Netlify labels and pins

[Netlify project organization](https://docs.netlify.com/manage/projects/organize-projects/)
separates team-visible labels from personal pins. Its examples for labels include `staging`,
`sandbox`, and `production sites`. A pin puts a favorite project at the top for the current user
only.

This is strong evidence that project kind and project importance are separate facts. Samebase does
not need to copy Netlify labels first. A folder gives the requested sidebar result with less product
surface. A later pin can answer the importance question without changing folder membership.

### Linear favorite folders, labels, and views

[Linear Favorites](https://linear.app/docs/favorites) are personal shortcuts in the sidebar. Linear
lets the user put favorites into named folders and drag them in or out. Linear also has
[project labels](https://linear.app/docs/project-labels) and
[custom views](https://linear.app/docs/custom-views) for filter and reporting needs.

Linear shows why one mechanism should not do all jobs. Favorite folders control quick access. Labels
group projects by reusable metadata. Views collect items from filters. Samebase only has the first
stable-list problem now.

### 1Password collections

[1Password collections](https://support.1password.com/collections/) are named sets of vaults. A
collection can include vaults from different accounts. The user switches to a collection and then
sees only the selected vaults. A collection can also include new vaults automatically.

This pattern is useful when one vault must appear in several filtered contexts. It is heavier than
the requested Samebase behavior because it changes the current view instead of giving each vault one
stable sidebar location.

### GitHub repository saved views

[GitHub repository saved views](https://docs.github.com/en/repositories/creating-and-managing-repositories/viewing-all-your-repositories)
are named queries. A user can save up to 25 views. A repository can match several views, and its
membership changes when repository facts change.

This is a good later model if Samebase adds many filterable properties. It is not a good first model
for a simple `Fixtures` container. It needs filter fields, query rules, and view management before
it can reduce the list.

### Bitwarden folders and collections

[Bitwarden folders](https://bitwarden.com/help/folders/) are personal display organization. An item
has one folder, and folder deletion does not delete its items. Bitwarden also has
[collections](https://bitwarden.com/help/create-collections/) for shared access. An item can be in
several collections, and collection permissions decide who can use it.

The important lesson is the boundary. A personal folder is safe display metadata. A shared
collection is an access-control feature. Samebase vault folders must use the first model only.

### Sentry teams and Cloudflare resource groups

[Sentry teams](https://docs.sentry.io/api/teams/) can contain projects, but team membership is part
of project access.
[Cloudflare IAM resource groups](https://developers.cloudflare.com/api/resources/iam/subresources/resource_groups/)
also connect resource groups to access policies.

These are not good models for the requested feature. A user must be able to move a vault into
`Fixtures` without any permission or runtime effect.

### Archive behavior

[GitHub archive](https://docs.github.com/en/repositories/archiving-a-github-repository/archiving-repositories)
marks a repository as no longer actively maintained and makes it read-only.
[Linear project status](https://linear.app/docs/project-status) also connects project archive
behavior to completed or canceled work.

A monitored fixture is still active. Archive would communicate the wrong state and could hide the
health signal that the user wants to keep.

## Option Evaluation

| Option          | Separates fixtures | Shows importance | Reduces sidebar rows | Supports several categories | First-version fit |
| --------------- | ------------------ | ---------------- | -------------------- | --------------------------- | ----------------- |
| Shallow folders | Strong             | Partial          | Strong               | No                          | Best              |
| Pin only        | Weak               | Strong           | Weak                 | No                          | Later             |
| Labels          | Strong             | Partial          | Only with more UI    | Yes                         | Later             |
| Saved views     | Strong             | Partial          | Strong               | Yes                         | Too complex       |
| Archive or hide | Wrong meaning      | Weak             | Strong               | No                          | Separate feature  |
| Nested folders  | Strong             | Partial          | Strong               | No                          | Not needed        |

Shallow folders have the best fit because the user described a stable place and a list-layout
problem. Labels and views become valuable when one vault needs several independent classifications,
such as environment, customer, owner, and risk. There is no evidence for that larger system now.

## First-Version Behavior

The first version should stay small:

1. The sidebar keeps its current flat appearance until the user creates the first folder.
2. The vault menu gets `Move to folder` and `New folder` actions.
3. Each folder header has collapse, rename, reorder, and delete actions.
4. `Ungrouped` is a system section. The user cannot rename or delete it.
5. Empty user folders remain visible until the user deletes them.
6. Folder deletion asks for confirmation and states how many vaults will move to `Ungrouped`.
7. A collapsed folder shows its vault count and an attention indicator when necessary.
8. A folder rename does not change the selected vault route or reload the vault workspace.
9. The current vault status text and status dots remain on the vault rows.
10. The folder state persists across sessions.

Do not require drag and drop for acceptance. The menu action is necessary for keyboard, touch, and
small-screen use. Drag and drop can be an additional desktop interaction after the basic action is
reliable.

## Data And Product Boundaries

The later implementation should preserve these invariants:

1. Folder identity is a stable ID, not the folder name.
2. One user owns each folder.
3. One vault has zero or one folder membership for that user.
4. Folder order is explicit and deterministic.
5. Folder deletion and vault movement are atomic.
6. Folder operations do not write to provider resources.
7. The normal vault list and MCP list never omit a vault because its folder is collapsed.
8. Account deletion removes folder preferences with the other user-owned UI state.

The data location is an implementation decision for a later proposal. Do not add folder state to a
provider connection, repository coordinate, provisioning run, or derived health summary.

## Success Test

The first version succeeds when the user can do this:

1. Create a folder named `Fixtures`.
2. Move several active fixture vaults into it.
3. Collapse the folder and remove those rows from the normal sidebar scan.
4. Still see that the folder contains a vault that needs attention.
5. Rename the folder without a change to any vault URL or provider resource.
6. Delete the folder and confirm that all contained vaults move to `Ungrouped`.

## Next Decision

Approve or reject the shallow folder model before implementation. If it is approved, the next
artifact should be a short RFC for the exact Convex model, MCP return shape, sidebar interaction,
and route-level validation. Keep `Pin` out of that first slice unless the operator asks for it after
using folders.

## Research Method

Three read-only research agents covered developer platforms, secrets and knowledge products, and
project tools. The main research pass checked the Samebase vault model, dashboard query, sidebar,
and prior vault sidebar research. All market claims in this note use official product documentation.
