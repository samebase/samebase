# 069 File View PR Compare Mode Spec

## Document Control

- Status: Archived and superseded by `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
- Owner: Noter frontend/editor + Convex GitHub/file staging
- Last updated: 2026-03-25
- Related specs:
  - `specs/005_COMMIT_REVIEW_SIDEBAR_SPEC.md`
  - `rfcs/007_SIMPLE_VIEW_FRONTMATTER_SPEC.md`
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `archive/067_VAULT_BRANCH_FILTERS_SPEC.md`
- External references:
  - [Git Tree Compare README](https://github.com/letmaik/vscode-git-tree-compare)
  - [GitHub REST: compare two commits](https://docs.github.com/en/rest/commits/commits#compare-two-commits)
  - [GitHub REST: pull requests](https://docs.github.com/en/rest/pulls/pulls)

## Summary

Add a third file-view sidebar mode that shows the files changed in the current branch relative to
the branch targeted by the current pull request, plus current Noter staging on top of that branch
diff.

When the current branch has no open pull request, the mode falls back to the repository default
branch.

This is intentionally similar to VS Code's Git Tree Compare extension in its PR-like "merge base"
workflow, but Noter v1 should stay narrower:

1. no arbitrary base picker
2. no "full vs merge" diff mode toggle
3. no new dashboard surface
4. no hosted workspace git working-tree integration

## Problem

Today the file view has only two sidebar modes:

1. `Simple View`
2. `All Files`

That is enough for browsing the current branch tree, but not for answering the question: "Which
files are already part of this PR?"

Current file-view data only overlays local `fileStaging` state onto the current branch tree. Once
changes are committed to the branch and pushed, they disappear from staged-only navigation even
though they are still part of the current PR.

This is why the operator loses the ability to quickly revisit older changed files after making more
commits on the same branch.

## Current State

### Frontend

`apps/noter/src/components/FileView.tsx` currently derives sidebar data from:

1. the selected branch tree (`vault.treeData.tree` / `vaultBranchTrees`)
2. current `fileStaging` rows for that branch

That produces `finalTreeData`, which is sufficient for:

1. current branch files
2. local staged additions
3. local staged renames
4. local staged deletions

It is not sufficient for PR-relative compare mode because:

1. committed branch changes have no sidebar status unless they are also staged
2. committed-only deleted files do not exist in the current branch tree at all
3. there is no concept of "file changed relative to PR base"

The old review-coupled `Changes` mode was removed. That direction is now explicitly rejected by
`specs/005_COMMIT_REVIEW_SIDEBAR_SPEC.md` because it:

1. auto-switched during review
2. only represented staged changes
3. duplicated review navigation concerns

This RFC is different. It proposes an explicit branch-compare navigation mode, not a review-only
mode.

### Backend

Relevant current backend facts:

1. `vaultRemoteBranches` stores:
   - `pullRequestUrl`
   - `pullRequestNumber`
   - `pullRequestLabels`
   - `pullRequestTitle`
   - `pullRequestIsDraft`
2. `vaultRemoteBranches` does not store PR base branch
3. GitHub branch sync intentionally preserves older PR metadata when PR lookup fails, so persisted
   PR fields are not guaranteed to reflect live state
4. there is no action that returns a PR/base-relative changed-file list
5. `fileStaging` is the only in-app uncommitted-change model used by file view

### Local Change Model

For this surface, Noter currently has:

1. branch commits visible through GitHub branch/tree state
2. uncommitted local Noter changes visible through `fileStaging`

It does not currently have a separate file-view model for hosted-workspace dirty files from
`git status`.

This means the requested "staged and unstaged" behavior should be interpreted in v1 as:

1. committed branch changes already in the PR
2. current Noter-local uncommitted changes in `fileStaging`

True sandbox working-tree diff integration is a separate follow-up.

## External Research

### Git Tree Compare

The Git Tree Compare extension is relevant because it already solves the user's mental model:

1. compare the current working tree against a chosen base
2. render the result as a tree or flat list
3. keep the compare base attached to the repo context

Its README also calls out a "merge" comparison mode as the pull-request-like mode and a "full" mode
as a direct base-vs-head comparison.

That leads to the right v1 product boundary for Noter:

1. copy the PR-relative changed-files navigation idea
2. do not copy arbitrary base selection yet
3. do not copy dual compare semantics yet

### GitHub API

Research on the GitHub API suggests two different data paths:

1. For an open PR, use the PR file list endpoint.
   - This is the closest match to "show the files in the current PR".
   - It naturally respects PR base selection and PR diff semantics.
   - These PR files are only the remote committed baseline; current `fileStaging` rows still need to
     be applied on top.
2. When no open PR exists, fall back to branch-vs-default compare.
   - Use `compareCommitsWithBasehead`.
   - GitHub documents that file data is only present on the first page and is capped at 300 changed
     files for the whole comparison.

That means the open-PR path should use PR files as the remote committed baseline and then union
current staged DB changes on top, while the no-PR fallback should expose a truncation hint because
GitHub's compare endpoint is not fully lossless for very large diffs.

## Goals

1. Let the operator see files already changed in the current PR from inside file view.
2. Include current `fileStaging` rows on top of the committed branch diff.
3. Keep `Simple View` and `All Files` intact.
4. Keep commit review behavior stable and separate.
5. Support committed-only deleted files in the compare list.
6. Make the active compare base visible so the mode is trustworthy.

## Non-Goals

1. Arbitrary compare-base selection.
2. "Full vs merge" compare-mode selection.
3. A dashboard-level PR-files surface.
4. A full remote diff-review UI for every compare file in v1.
5. Hosted workspace git working-tree integration.
6. Fork-head PR browsing outside the current vault's repository branch model.

## Product Decisions

### 1. Add an explicit third sidebar mode

Add `compare` as a third sidebar mode in `FileView`.

Recommended label:

- `Changed Files`

Reasoning:

1. `Changes` is too easily confused with the removed review-only mode.
2. `PR Files` is wrong for the no-PR fallback case.
3. `Changed Files` still matches the user's intent.

### 2. Compare mode is opt-in, not review-coupled

Do not auto-enter compare mode when review opens.

Do not auto-exit compare mode when review closes.

This preserves the accepted direction in `specs/005_COMMIT_REVIEW_SIDEBAR_SPEC.md`: review must not
keep hijacking sidebar state.

### 3. Compare mode should not be persisted in localStorage

Keep current per-vault persistence only for `simple` and `all`.

`compare` should be ephemeral and URL-backed with a key-only query flag:

- `?compare`

Why:

1. compare mode is branch-contextual, unlike simple/all
2. persisting it across branches would produce confusing empty states
3. a query flag makes compare-only deleted-file routes reloadable
4. this follows the repo's current query-param helper conventions

### 4. Resolve compare context live, not from cached PR metadata

Do not add `pullRequestBaseBranch` to `vaultRemoteBranches` in v1.

Instead, resolve the current branch's live open PR inside a new on-demand action.

Why:

1. current branch metadata intentionally preserves stale PR fields on sync failure
2. compare mode needs correctness more than it needs cache reuse
3. a live fetch can return both PR number and base branch in one place

### 5. Compare mode must union remote branch diff and local staging

The compare list should represent:

1. files already changed on the branch relative to PR base/default base
2. current uncommitted Noter staging layered on top

It is not enough to show only staged changes, and it is not enough to show only remote committed
changes.

### 6. Deleted compare rows must be inspectable

Committed-only deleted files must appear in the list and must not route into the existing
staged-review-only deleted-file flow by accident.

The preferred direction is to reuse the same deleted-file review surface that is already used for
staged deleted files, but make that surface accept generic review payload data instead of assuming a
staged DB row exists.

For committed-only deleted rows, that reused surface should also expose:

- `Restore in staging`

That action should create a staged file from the deleted file's pre-deletion content so the operator
can bring it back intentionally.

## Proposed Architecture

### 1. Add a new action for compare mode

Add a new action, for example in `apps/noter/convex/fileStagingActions.ts`:

`getBranchCompareFiles({ repositoryFullName, branch })`

Suggested return shape:

```ts
type BranchCompareFile = {
  path: string;
  previousPath?: string;
  status: "added" | "modified" | "deleted" | "renamed";
  source: "remote" | "staged" | "both";
  patch?: string;
  patchTruncated?: boolean;
};

type BranchCompareResult = {
  branch: string;
  baseBranch: string;
  source: "pull_request" | "default_branch_fallback";
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  mayBeTruncated: boolean;
  files: BranchCompareFile[];
};
```

`patch` is optional in v1 but strongly recommended at least for committed-only deleted rows so the
existing deleted-file review surface can be reused without inventing a separate presentation path.

### 2. Live compare-context resolution

The new action should resolve compare context in this order:

1. look up the vault and current branch
2. call `pulls.list` with `head: owner:branch`
3. keep the latest same-repo open PR for that branch
4. if a PR exists:
   - use `pulls.listFiles`
   - treat that file list as the remote committed compare baseline only
   - return `source: "pull_request"`
   - return `baseBranch = pr.base.ref`
5. otherwise:
   - use vault `defaultBranch`
   - if `branch === defaultBranch`, remote compare file list is empty
   - else call `compareCommitsWithBasehead(defaultBranch...branch)`
   - return `source: "default_branch_fallback"`

This gives correct PR behavior when a PR exists and still supports the "compare my branch to
main/default" workflow before a PR is opened.

### 3. Compare/file combination logic

The frontend needs a new derived data path. Filtering `finalTreeData` is not enough because
`finalTreeData` only knows about current branch tree plus staged overlays.

Introduce a helper, for example:

- `apps/noter/src/lib/fileViewCompare.ts`

It should combine:

1. remote compare files from the new action
2. staged files from `api.fileStaging.listStagedFiles`
3. current branch tree metadata for folder structure and file existence

Recommended precedence:

1. start from remote compare rows
2. overlay staged changes by `initialFilePath` and `filePath`
3. if a staged row and remote row refer to the same logical file, staged path and status win
4. preserve the earliest useful `previousPath` when a committed rename is later re-renamed locally
5. include staged-only rows that are not in the remote compare set
6. include committed-only deleted rows even though they are not in the current branch tree

This should return a dedicated `comparedTreeData` dataset.

### 4. Introduce a richer navigation item contract

Today `FileTree` and `CommandPalette` callbacks are too narrow because they only pass `path` and
`status`.

That is no longer sufficient once compare mode can contain:

1. staged deleted rows
2. committed-only deleted rows
3. normal editor rows

Introduce a richer item model passed through the sidebar and command palette, for example:

```ts
type FileNavigationKind = "editor" | "staged_deleted_review" | "compare_deleted_preview";
```

This prevents compare-deleted rows from accidentally entering the staged-review surface.

### 5. Sidebar and command palette behavior

When `?compare` is present:

1. sidebar tree uses `comparedTreeData`
2. command palette uses `comparedTreeData`
3. ancestor folders for all compare rows auto-expand
4. persisted folder expansion state is not rewritten

When `?compare` is absent:

1. existing `simple` / `all` behavior remains unchanged

### 6. Compare context UI

When compare mode is active, show a compact compare-context line near the sidebar toggle:

Examples:

1. `PR #123 against main`
2. `PR #456 against release/1.2`
3. `Against main (no open PR)`

If `mayBeTruncated === true`, append a small warning such as:

- `Large compare may be truncated`

This is important because GitHub's non-PR compare endpoint does not guarantee a complete file list
beyond 300 files.

### 7. Content-surface behavior

For compare rows:

1. committed/staged added, modified, and renamed rows open the current branch editor surface as
   today
2. staged deleted rows keep using the existing review/deleted-file surface
3. committed-only deleted rows should open that same deleted-file review surface via a generic
   review payload, not a separate bespoke panel
4. committed-only deleted rows should offer `Restore in staging`

This keeps deleted rows usable without introducing a second deleted-file UI.

### 8. Refresh behavior

Compare data should load lazily when compare mode becomes active and refresh when any of these
change:

1. `branch`
2. `vault.commitSHA`
3. current staged-file signature
4. successful commit/reset/draft-PR creation events

Do not show a global loading panel. If loading exceeds 500ms, show only a small inline loading state
in the compare-context row.

On error:

1. keep compare mode active
2. show a compact inline error
3. do not silently fall back to `All Files`

## Expected Code Touch Points

### Frontend

1. `apps/noter/src/components/FileView.tsx`
2. `apps/noter/src/components/FileTree.tsx`
3. `apps/noter/src/components/CommandPalette.tsx`
4. `apps/noter/src/lib/queryParams.ts`
5. new helper such as `apps/noter/src/lib/fileViewCompare.ts`

### Backend

1. `apps/noter/convex/fileStagingActions.ts`
2. `apps/noter/convex/fileStagingActions.test.ts`

Schema changes are not required for the recommended v1 path.

## Alternatives Considered

### 1. Reuse the old `Changes` mode idea

Rejected.

That mode only filtered `finalTreeData`, which means:

1. committed-only PR files still would not exist
2. committed-only deletions still would not exist
3. the product would drift back toward the review-coupled behavior already rejected in
   `specs/005_COMMIT_REVIEW_SIDEBAR_SPEC.md`

### 2. Persist `pullRequestBaseBranch` in `vaultRemoteBranches`

Rejected for v1.

The current sync model preserves stale PR metadata when GitHub PR lookup fails. That is acceptable
for dashboard adornments, but not for a navigation mode whose main promise is "show me what is in
this PR right now."

If the repo later needs PR base data in more places, add it only alongside an explicit freshness
contract.

### 3. Add an arbitrary base picker

Rejected for v1.

The user's request is narrower than Git Tree Compare's full feature set. Noter should ship the
PR/default-base workflow first.

### 4. Integrate Hosted Workspace `git status`

Rejected for v1.

That is a different data model than current Noter editing. The file-view surface today is built
around GitHub branch state plus `fileStaging`, so that should remain the implementation boundary for
the first slice.

## Acceptance Criteria

1. File view exposes a third sidebar mode for changed files.
2. The mode lists files already changed on the current branch relative to the live PR base branch,
   or the default branch when no PR exists.
3. Current `fileStaging` changes appear in that same list.
4. Review mode does not auto-toggle the sidebar into compare mode.
5. `Simple View` and `All Files` persistence behavior remains unchanged.
6. Command palette uses the same compare dataset when compare mode is active.
7. Committed-only deleted files are visible and inspectable.
8. The active compare base is visible in the UI.
9. Large non-PR compare fallbacks can surface a truncation hint.

## Validation

1. Add backend tests for:
   - live PR resolution by head branch
   - default-branch fallback when no PR exists
   - combination of remote compare rows with staged-only rows
   - rename and deletion edge cases
2. Add frontend tests for:
   - `?compare` query-param behavior
   - compare-mode tree derivation
   - compare-mode command-palette filtering
   - no persistence of compare mode into the simple/all localStorage key
3. Add or update a visual fixture for the shipped toggle and compare-context line.
4. Add or update at least one screenshot test for the file-view sidebar in compare mode.

## Recommended Implementation Order

1. Add the backend compare action and pure helper tests first.
2. Add frontend compare-tree derivation in a dedicated helper module.
3. Extend `FileTree` / `CommandPalette` to pass richer navigation items.
4. Wire the `?compare` query param and third toggle in `FileView`.
5. Reuse the deleted-file review surface for committed-only deleted rows and add
   `Restore in staging`.
6. Finish with fixture/screenshot coverage.
