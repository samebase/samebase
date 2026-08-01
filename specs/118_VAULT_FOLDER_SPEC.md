# Vault folders

## Document control

- Status: Accepted
- Owner: Samebase
- Last updated: 2026-08-01
- Related research: `research/2026-07-31-vault-folder-product-research.md`

## Current contract

Each user can organize vaults in personal, shallow folders. A vault is in one live folder or is
Ungrouped. Ungrouped is derived from missing, deleted, or stale folder assignment data. It is not a
saved folder.

Users can create an empty folder from the Vaults header, rename a folder, collapse a folder, move a
vault to another folder or Ungrouped, move a folder up or down, and delete a folder. New folders
append after existing folders and start expanded. Folder order is stable. Folder collapse state is
saved for the user.

When named folders exist, Ungrouped displays before all named folders. Empty Ungrouped stays hidden.
Without named folders, the sidebar stays a flat vault list.

Deleting a folder deletes only the folder. The vaults remain. They display as Ungrouped until a
later move replaces or removes their stale assignment.

The sidebar computes vault health from existing vault state. A collapsed folder shows attention only
when a hidden vault has a real failure. Running, loading, and unavailable state do not show folder
attention. Collapsing a folder hides every vault row without changing the selected route or
workspace. If the selected vault is hidden, the folder header uses the selected background until the
folder expands again.

Folder data is dashboard-only. It does not change provider data, vault behavior, or MCP vault
output. Deleting a vault removes its folder assignment. Account deletion removes folder assignments
through vault cleanup and then removes the user's folders. Existing users need no migration and
start with Ungrouped vaults.

## Non-goals

This feature does not add nested folders, labels, drag-and-drop, saved views, archive, or pinning.

## Validation

Convex tests verify name normalization and collisions, empty-folder creation, ownership checks,
moves to folders and Ungrouped, order, collapse state, deleted-folder fallback, vault cleanup,
account cleanup, and unchanged complete MCP vault output. UI tests verify header creation, grouping,
literal collapse, selected-folder highlighting, and the hidden-failure attention signal.
