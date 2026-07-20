# Vault Multi-Branch Editor Spec

## Document Control

- Status: Accepted and implemented
- Owner: Samebase frontend/editor and Convex vault/GitHub
- Last updated: 2026-07-21
- Related specs:
  - [Pull request provider query](./115_PULL_REQUEST_PROVIDER_QUERY_SPEC.md)
  - [Vault route surface](./110_VAULT_ROUTE_SURFACE_SPEC.md)

## Current Contract

Samebase can open and edit one exact remote branch at a time. The dashboard discovers work through
live GitHub pull request pages. It does not maintain or display a persisted catalog of every remote
branch.

The durable vault row stores the repository identity and `defaultBranch`. Branch-scoped staging,
routes, and tree cache entries use the exact branch name supplied by the user or provider.

## Exact Branch Tree Cache

`observations_vaultRepository_branchTrees` contains one disposable tree cache entry per
`(vaultId, branch)`:

- `treeData` and `treeSHA` identify the recursive Git tree;
- `commitSHA` identifies the branch generation that named that tree;
- `lastTreeRefreshAt` records when the exact branch was read.

Every refresh first reads the branch commit, then reads the immutable tree SHA returned by that
commit. It must not fetch a mutable branch name twice and combine two generations.

An omitted branch resolves directly to `vault.defaultBranch`. Missing cache data means the exact
branch has not been hydrated yet; it does not mean the GitHub repository is disconnected.

The cache is not a source for dashboard pull requests, default-branch discovery, remote branch
existence, checks, ahead/behind counts, or deleted-branch tombstones.

## Routing

Canonical branch routes keep the branch in one encoded route segment:

- `/vault/:owner/:repoName/fs/:branch`
- `/vault/:owner/:repoName/fs/:branch/*`
- `/vault/:owner/:repoName/codespace/:branch/chat`
- `/vault/:owner/:repoName/db/:branch/root`
- `/vault/:owner/:repoName/db/:branch/mono/*`
- `/vault/:owner/:repoName/schema/:branch/root`
- `/vault/:owner/:repoName/schema/:branch/mono/*`

Branch names are encoded with `encodeURIComponent` and decoded exactly once. Code must not recover a
branch by splitting the file wildcard because valid branch names can contain `/`.

## Editor and Staging

- File view reads the exact branch from the route.
- Vault lookup returns that branch's cached tree and commit.
- A missing tree triggers hydration for only that branch.
- Staged files and collaborative updates remain keyed by vault and branch.
- Commit, comparison, media, and post-write refresh calls pass the selected branch explicitly.
- The file route may request the open pull request and ahead count for that one branch directly from
  GitHub. It does not read a repository branch mirror.

## Dashboard

The selected vault renders open pull requests from GitHub. A same-repository pull request links to
its exact branch route. A fork pull request does not invent a Samebase branch route in the base
repository.

The dashboard's primary branch comes from `vault.defaultBranch`, not from a branch catalog or a pull
request response.

## Deleted Model

There is no `observations_vaultRepository_branches` table, repository-wide branch synchronization,
deleted-upstream tombstone model, or compatibility fallback to vault-level tree mirrors. If a future
feature needs arbitrary branch discovery, it should call GitHub for that feature rather than
reintroducing a normalized branch database.

## Validation

- Branches containing `/` and encoded characters round-trip through routes.
- Tree reads and writes are isolated by `(vaultId, branch)`.
- Hydration reads the immutable tree for the observed commit.
- A non-default commit refreshes only the selected branch cache.
- Omitted branches resolve to the stored default branch.
- Fork pull requests never receive a base-repository Samebase route.
- Generated bindings contain no remote branch catalog function or table.

## Non-Goals

- Branch create, delete, or rename UI
- A complete remote branch browser
- Deleted-branch recovery state
- Local checkout semantics
- Merge or rebase UX inside Samebase
