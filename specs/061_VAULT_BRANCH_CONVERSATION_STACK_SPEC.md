# 061 Vault Branch Conversation Stack Spec

## Document Control

- Status: Proposed
- Owner: Vault dashboard + GitHub integration
- Last updated: 2026-03-18
- Related specs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/046_VAULT_MULTI_BRANCH_ROLLOUT_PLAN.md`
  - `specs/048_DASHBOARD_REMOTE_BRANCH_DELETE_SPEC.md`
  - `specs/050_T3_CODE_REFERENCE_ARCHITECTURE_SPEC.md`

## Summary

Treat each remote branch row in the vault dashboard as a conversation container.

Instead of copying GitLens's full repository graph, Noter should keep the
existing branch list as the primary surface and let each branch expand into the
commit stack that is unique to that branch versus the repository default branch.

This assumes the team norm the user asked for:

1. active work branches are regularly rebased onto the latest default branch
2. the meaningful history for a work branch is the linear suffix ahead of that
   default branch

Under that assumption, a branch-first accordion is the right product model and a
full graph is unnecessary complexity.

## Product Framing

For local agent workflows, the user is not primarily thinking in terms of Git
topology.

The stronger mental model is:

1. vault = project
2. branch or worktree = conversation container
3. commits = timeline inside that conversation container

This matches the interaction pattern in T3 Code and gmux:

1. T3 Code groups work inside project containers and then shows nested thread
   rows rather than showing raw repository topology.
2. gmux groups work by directory and enriches the parent row with git and PR
   metadata, with nested session rows underneath.

For Noter, the closest translation is:

1. keep branch rows as the parent objects
2. treat nested branch commits as the conversation timeline
3. do not flatten commits into sibling rows beside branches

## Why Not a GitLens Graph

GitLens's commit graph is built for arbitrary repository history:

1. multiple branches at once
2. merge structure
3. hidden and visible refs
4. cross-branch context

That is useful when the user needs raw topology.

It is the wrong default for this dashboard because:

1. the dashboard already has a strong branch list abstraction
2. the user asked for a rebased-branch assumption
3. rebased feature branches reduce to a linear commit suffix
4. a graph would spend a lot of UI complexity to display information we already
   know structurally

The dashboard should therefore answer:

- "What work is on this branch?"

Not:

- "What does the whole repository DAG look like?"

## Current Runtime Fit

Most of the parent-row data already exists.

### Frontend

`VaultDashboard` already renders one row per remote branch with:

1. branch name
2. head commit SHA
3. optional PR link
4. ahead/behind counts versus the default branch
5. staged-file summary
6. branch delete affordance for safe cases

### Backend

The existing GitHub sync path already:

1. lists remote branches
2. determines the default branch
3. computes `aheadBy` and `behindBy` with GitHub compare
4. stores branch metadata in `vaultRemoteBranches`

That means the missing capability is narrow:

1. fetching the branch-only commit stack
2. rendering it as nested detail under the branch row

## Goals

1. Make branch work scannable from the dashboard without opening the editor.
2. Preserve the existing branch list as the dashboard's top-level structure.
3. Show the commits unique to a branch in a nested, conversation-like stack.
4. Keep the default branch as the comparison anchor rather than rendering a full
   graph.
5. Avoid bloating `vault.getUserVaults` with per-branch commit arrays.
6. Degrade safely when a branch is no longer rebased cleanly onto the default
   branch.

## Non-Goals

1. Full repository graph or minimap.
2. Multi-branch merge-base visualization.
3. Local worktree discovery in Daytona, Codex, or browser sandboxes.
4. Branch create, rename, or restore UX.
5. Commit diff rendering inside the dashboard.
6. Rebase, merge, or conflict-resolution UX.

## Proposed UX

### 1. Keep branch rows as the primary objects

The existing dashboard branch list remains the top-level surface.

Branch rows keep their current responsibilities:

1. open the editor on the branch
2. show branch-level metadata
3. expose safe destructive actions where already supported

### 2. Make non-default active branches expandable

Each active non-default branch row becomes an accordion item inside the vault
card.

Behavior:

1. collapsed by default
2. one expanded branch at a time per vault card
3. deleted-upstream rows remain non-expandable tombstones
4. default branch remains a summary row and is not expandable in this spec

Rationale:

The nested commit list represents commits ahead of the default branch. The
default branch has no branch-only suffix under that model.

### 3. Branch header content

The collapsed branch row should show:

1. branch name
2. default badge when relevant
3. PR badge or link when present
4. staged-file count
5. short head SHA
6. ahead count, and behind count only when non-zero
7. exceptional warning badge when `behindBy > 0`

Interpretation:

1. `aheadBy` is the expected commit-stack length
2. `behindBy > 0` means the branch no longer matches the rebased-branch
   expectation and should be marked as stale or needing rebase

### 4. Expanded commit stack

When a branch is expanded, show its branch-only commits newest first.

Each commit row should include:

1. commit subject
2. short SHA
3. author name
4. authored time
5. link to open the commit on GitHub

Optional secondary data if cheap to fetch:

1. author avatar
2. one-line body preview

The branch name remains the primary navigation link to open the editor.

Commit rows should not change the selected editor branch in MVP. They are a
read-only review affordance.

### 5. Preview length and overflow

Show only the first 6 commit rows by default.

If more commits exist:

1. show `Show more`
2. expand the list inline within that branch panel
3. allow `Show less` to collapse back to 6

This mirrors the density pattern that works well in T3 Code's nested thread
lists without making a vault card vertically explode.

### 6. Empty and degraded states

#### `aheadBy === 0`

Do not show an expand caret.

The row is still useful as a branch summary row, but there is no branch-only
commit stack to render.

#### `behindBy > 0`

Still allow expansion, but mark the branch as `Needs rebase`.

The UI should not attempt to visualize branch topology. It should simply:

1. show the unique commits we can compare against default
2. warn that the branch is behind and the conversation model is stale

#### Compare unavailable

If the server cannot fetch the stack:

1. keep the branch row usable
2. show a lightweight inline error inside the expanded panel
3. include a GitHub compare link when we can build one

## Data Contract

### 1. Do not extend `vault.getUserVaults` with commit stacks

The dashboard summary query should remain lightweight.

Reasons:

1. most branches will stay collapsed
2. commit stacks are the heaviest branch detail in this UI
3. fetching them for every vault card on page load would multiply GitHub API
   work and dashboard payload size

### 2. Add an on-demand action

Add a read action dedicated to the expanded panel:

- `vaultActions.getBranchConversationStack({ vaultId, branchName })`

Returns:

```ts
{
  repositoryFullName: string;
  branchName: string;
  defaultBranch: string;
  headCommitSha: string;
  aheadBy?: number;
  behindBy?: number;
  compareUrl: string;
  stackState:
    | "ready"
    | "empty"
    | "needs_rebase"
    | "unavailable";
  commits: Array<{
    sha: string;
    messageHeadline: string;
    authorName: string;
    authoredAt?: number;
    htmlUrl: string;
    authorAvatarUrl?: string;
  }>;
  truncated?: boolean;
}
```

Notes:

1. `stackState="empty"` is used when the branch is active but has no commits
   ahead of default.
2. `stackState="needs_rebase"` is used when `behindBy > 0`.
3. `stackState="unavailable"` is used when GitHub comparison fails or the
   branch/default reference cannot be resolved safely.

### 3. Action behavior

Server steps:

1. verify vault ownership
2. load the target branch from `vaultRemoteBranches`
3. reject deleted-upstream branches for stack reads
4. resolve the active default branch from `vaultRemoteBranches`
5. if the target branch is the default branch, return `stackState="empty"`
6. call GitHub compare for `defaultBranch...branchName`
7. return the branch-only commits in newest-first order for UI rendering

No schema change is required for MVP.

This should stay an on-demand read path rather than introducing a new cached
table immediately.

## GitHub API Basis

Use GitHub's compare API rather than `listCommits` alone.

Rationale:

1. the compare API directly answers "what commits are on this branch and not on
   default?"
2. it already produces `aheadBy` and `behindBy`
3. it matches the mental model for a rebased branch suffix

Important behavior:

1. compare results are chronological, so the server or client should reverse
   them for newest-first UI
2. unpaginated compare results are capped at 250 commits
3. paginated compare results return commit pages but only include changed-file
   details on the first page

MVP rule:

1. paginate commit results up to a sane cap of 200 commits
2. if the cap is exceeded, set `truncated=true`
3. the UI should then expose the GitHub compare link rather than trying to fully
   emulate a history tool

The `200` cap is intentionally below the API's unpaginated ceiling and reflects
that this UI is a dashboard summary, not a full commit browser.

## Frontend State Model

State should remain local to `VaultDashboard`.

Recommended local state:

1. `openBranchByVaultId: Partial<Record<Id<"vaults">, string | null>>`
2. `branchStackByKey: Record<string, BranchConversationStackState>`
3. `expandedCommitPreviewByKey: Record<string, boolean>`

Where `key = vaultId + ":" + branchName`.

This keeps the interaction cheap and avoids turning dashboard expansion state
into a cross-device setting prematurely.

## Interaction Details

### Initial branch scan

The user should be able to scan the collapsed list and answer:

1. which branches are active
2. which branch has staged work
3. which branch has an open PR
4. how many commits are ahead of default
5. which branch is stale because it is behind default

### Branch expansion

On first expand:

1. fetch the branch conversation stack
2. keep the parent row visible and stable
3. show a minimal inline loading treatment only inside the expanded area

On subsequent expand:

1. reuse cached client state while `headCommitSha` is unchanged
2. invalidate local cache for a branch when its `headCommitSha` changes in the
   dashboard payload

## Relationship to Existing Specs

This spec extends, but does not replace, the multi-branch dashboard work in
`045`.

Positioning:

1. `045` made branches visible and navigable
2. `048` added a safe destructive action for branch rows
3. this spec turns the branch row into a richer conversation container

This spec also intentionally borrows only the interaction model from T3 Code and
gmux:

1. parent container with lightweight status metadata
2. nested child rows for the current work inside that container

It does not copy T3 Code's local-desktop architecture or gmux's process model.

## Validation

### Manual

1. Expand a branch with `aheadBy > 0` and confirm the commit stack appears
   newest first.
2. Expand a branch with `aheadBy = 0` and confirm there is no expand affordance.
3. Expand a branch with `behindBy > 0` and confirm the warning state is shown.
4. Confirm branch name still opens the editor route while commit rows open
   GitHub commit pages.
5. Confirm only one branch stack is open at a time per vault card.
6. Confirm long stacks show `Show more` and `Show less`.

### Tests

1. Add a small pure helper test for branch row expandability rules.
2. Add a pure helper test for branch stack state mapping:
   - ready
   - empty
   - needs_rebase
   - unavailable
3. Add an action test for compare pagination and truncation behavior.
4. Add a component test for:
   - one-open-at-a-time accordion behavior
   - commit preview expansion
   - local cache invalidation on `headCommitSha` change

## Out of Scope Follow-Ups

1. Persisted branch-panel open state in Convex.
2. Inline commit diffs inside the dashboard.
3. Selecting a commit to open the editor at a historical revision.
4. Local worktree surfacing from Daytona or Codex sandboxes.
5. Merging branch timelines with chat threads into one unified object.

## Recommended Implementation Order

1. Add the on-demand action for branch conversation stacks.
2. Add a small frontend state layer in `VaultDashboard` for per-vault accordion
   behavior.
3. Convert branch rows into accordion headers while preserving existing links
   and delete controls.
4. Add the nested commit preview list with `Show more`.
5. Add tests for expandability, degraded states, and compare truncation.

## Research Basis

### Noter current code

1. `apps/noter/src/components/VaultDashboard.tsx`
2. `apps/noter/convex/github.ts`
3. `apps/noter/convex/vault.ts`

### Local references

1. `/Users/nicu/dev/forks/t3code/apps/web/src/components/Sidebar.tsx`
2. `/Users/nicu/dev/forks/gmux/README.md`

### External reference

1. GitLens Commit Graph docs:
   `https://help.gitkraken.com/gitlens/gl-commit-graph/`
2. GitHub compare commits docs:
   `https://docs.github.com/en/enterprise-cloud@latest/rest/commits/commits#compare-two-commits`
