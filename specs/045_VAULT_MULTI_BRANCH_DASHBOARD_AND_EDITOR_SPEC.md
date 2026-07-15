# 045 Vault Multi-Branch Dashboard and Editor Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/editor + Convex vault/GitHub
- Last updated: 2026-07-15
- Related specs:
  - `specs/114_GITHUB_REPOSITORY_INVENTORY_SPEC.md`
  - `specs/110_VAULT_ROUTE_SURFACE_SPEC.md`
  - `rfcs/037_EDITOR_COMMIT_DIFF_RELIABILITY_SPEC.md`
  - `archive/069_FILE_VIEW_PR_COMPARE_MODE_SPEC.md`

## Current Contract

Samebase treats GitHub's current remote branches as the branch source of truth. The selected vault
dashboard and FileView share one published repository inventory for branch and open pull request
identity, while file contents and trees remain branch-scoped caches.

The dashboard lists every GitHub branch and every open pull request from the immutable active
inventory generation. A branch remains visible when an open pull request points at it. Branch names
are exact-case values and can contain slashes. Pull requests from forks are visible but link to
GitHub because their head repository is outside the connected vault.

## Source-of-Truth Boundaries

### Repository identity and branch membership

`vaultRepositoryInventories` selects the complete active generation. `vaultRepositoryInventoryItems`
contains the generation's branches and open pull requests. The inventory owns:

- GitHub's stable repository node id and canonical current full name
- current default branch
- exact current branch membership and head SHA
- current open pull request identity, head/base branches, labels, and latest head checks

The stable Samebase vault route can retain the full name used when the vault was connected. GitHub
links and displayed repository identity use the canonical name from the active generation, so a
rename or transfer is not presented as the old repository.

### File tree and editing state

`vaultBranchTrees` stores one explicit branch tree and commit SHA per `(vaultId, branch)`. FileView,
staging, commit, pull, chat, and file reads use the selected branch tree. A branch-tree refresh may
fetch only that exact branch. It must not list all branches, list all pull requests, compare every
branch, or hydrate repository-wide checks.

`fileStaging` and `collaborativeUpdates` remain branch-scoped. A repository inventory publication
never overwrites file content, staged changes, or collaborative editor state.

## Branch Resolution

FileView requests the active inventory context for its exact route branch.

1. Before the first inventory has published, Samebase keeps the requested route branch and does not
   claim that it is missing.
2. After publication, an exact branch row resolves the branch, current head SHA, default status,
   latest head check summary, canonical repository name, and the most recently updated
   same-repository open pull request for that branch.
3. After publication, a requested branch absent from the complete inventory resolves to the active
   default branch.
4. The lookup is bounded by active-generation indexes. It does not scan the repository inventory.

## Refresh Behavior

The active vault route owns exactly one repository inventory demand loop. The selected dashboard and
FileView routes are mutually exclusive and mount the same demand hook for their one vault. A direct
FileView load requests an inventory immediately and every 60 seconds while visible. Navigating
between dashboard and FileView tears down the old route loop before the new route owns demand.

FileView may request `refreshBranchTreeForFileView({ vaultId, branch })` on route activation, window
focus, or visibility resume. Backend debounce, lock, cooldown, and failure state apply only to that
branch-tree operation.

After a repository write:

1. refresh only the branch trees whose heads changed;
2. request an immediate repository inventory crawl so branch, pull request, label, and check data
   catches up;
3. never run the retired full-repository REST metadata crawl.

## Routing

Canonical branch-aware routes are defined by spec 110, including:

- `/vault/:owner/:repoName/fs/:branch`
- `/vault/:owner/:repoName/fs/:branch/*`
- `/vault/:owner/:repoName/codespace/:branch/chat`
- `/vault/:owner/:repoName/db/:branch/root`
- `/vault/:owner/:repoName/schema/:branch/root`

The branch is encoded as one route segment and decoded exactly once. Code must use shared route
builders and parsers rather than splitting wildcard paths or interpolating branch names by hand.

## Dashboard and FileView Behavior

- Clicking a branch row opens that exact branch.
- The default branch is identified from the active inventory generation.
- A nondefault branch can create a draft pull request when it exists in the active inventory and no
  open same-repository pull request already targets that head branch.
- The create-draft decision does not depend on a cached ahead/behind comparison.
- A fork pull request never exposes a Samebase route for the fork head.
- FileView GitHub file/tree links use the canonical current repository name.
- FileView renders the selected branch head check summary from the active inventory. It does not run
  a separate REST checks and statuses poll.
- Compare preview and deleted-file restore resolve canonical repository identity, exact branch, pull
  request identity, and pull request base branch from the active inventory. Their GitHub REST calls
  are limited to actual compare, tree, blob, and pull request file data.
- Branch-tree refresh failure preserves the last complete tree and exposes its existing sync status.

## Deliberate Deletions

Runtime code does not read or write `vaultRemoteBranches`, ahead/behind metadata, deleted-upstream
tombstones, the repository-wide REST metadata sync, or the persistent REST commit-check snapshot. It
does not keep a fallback branch catalog, FileView checks monitor, or REST identity discovery path
for compatibility.

The old tables can exist only as a temporary deploy-one schema surface while their production rows
are deleted. They are not product state and are removed in the follow-up narrow deploy.

## Validation

- The dashboard and FileView resolve the same exact-case branch from one active inventory.
- A branch containing `/` round-trips through route construction and parsing.
- A route branch is not redirected merely because no inventory has published yet.
- A missing branch is recognized only after a complete inventory proves absence.
- Direct FileView loads request repository inventory immediately, continue every 60 seconds while
  visible, and stop when the route unmounts or the document becomes hidden.
- Dashboard and FileView never keep concurrent demand loops for the same navigation state.
- FileView load, focus, and visibility requests make no repository-wide discovery calls.
- Compare preview and deleted-file restore make no repository or pull request identity discovery
  calls.
- A repository write refreshes affected branch trees and requests inventory freshness.
- A repository rename updates visible and outbound GitHub identity without breaking the stable vault
  route.
- Staging remains isolated by branch.

## Non-Goals

- Local checkout semantics for connected machines or Codex worktrees
- Branch create, delete, or rename UI
- Merge and rebase UX
- Webhooks or a GitHub App authorization migration
- Preserving the retired remote-branch catalog or refresh queue
