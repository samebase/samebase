# Vault folders

## Document control

- Status: Superseded
- Owner: Samebase
- Last updated: 2026-08-06
- Superseded by: `specs/121_ORGANIZATION_CONTEXT_AND_ROUTE_MODEL.md`
- Related research: `research/2026-07-31-vault-folder-product-research.md`

This historical contract used the old premise that users owned vaults. Samebase organizations now
own vaults. Derived organization sections replace personal folders.

## Historical contract

Each user could organize vaults in personal, shallow folders. A vault was in one live folder or was
Ungrouped. Ungrouped was derived from missing, deleted, or stale folder assignment data. It was not
a saved folder.

Users could create an empty folder from the Vaults header, rename a folder, collapse a folder, move
a vault to another folder or Ungrouped, move a folder up or down, and delete a folder. New folders
appended after existing folders and started expanded. Folder order was stable. Folder collapse state
was saved for the user.

When named folders existed, Ungrouped displayed before all named folders. Empty Ungrouped stayed
hidden. Without named folders, the sidebar stayed a flat vault list.

Deleting a folder deleted only the folder. The vaults remained. They displayed as Ungrouped until a
later move replaced or removed their stale assignment.

Folder data was dashboard-only. It did not change provider data, vault behavior, or MCP vault
output. Deleting a vault removed its folder assignment. Account deletion removed folder assignments
through vault cleanup and then removed the user's folders.

## Historical non-goals

The feature did not add nested folders, labels, drag-and-drop, saved views, archive, or pinning.
