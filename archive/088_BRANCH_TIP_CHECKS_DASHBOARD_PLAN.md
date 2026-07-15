# 088 Branch Tip Checks Dashboard Plan

## Document Control

- Status: Archived and superseded by `specs/114_GITHUB_REPOSITORY_INVENTORY_SPEC.md`
- Owner: vault dashboard, GitHub checks, repository refresh
- Created: 2026-06-24
- Last updated: 2026-06-24
- Related RFCs:
  - `archive/087_PR_CHECKS_BASED_REFRESH_PLAN.md`
- Related specs:
  - `specs/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`

## Problem

The first GitHub checks implementation fixed the broken Cloudflare PR comment path, but its product
shape is still PR-centered. That misses an important case: the default branch also has commit
checks, and those checks matter after merges and deploys.

The dashboard should not become a full GitHub replacement. Samebase needs a compact operational view
that answers:

1. What branches or changes currently matter for this vault?
2. What commit does each one point at?
3. Are that commit's checks healthy?
4. Where are the useful provider links for that commit?

The UI can be designed before every backend endpoint is final, but the prototype must use the real
dashboard component tree. A fixture that renders fake row components, fake spacing, or fake branch
chrome is not useful because it can pass while the shipped UI is broken.

## Product Direction

Treat the dashboard branch area as a branch-tip health table, not a PR table.

Each row is a repository ref plus the health of its current head commit:

```text
Branch / change      Tip commit              Checks                 Links            Actions
main                 abc1234 - v1564...      passed: 4              deploy, logs     refresh, GitHub
PR #321 title        def5678 - Fix...        running: 2, passed: 3  preview, logs    refresh, GitHub
codex/foo            789abcd - WIP...        failed: 1, passed: 2   logs             refresh, GitHub
```

The primary row entity is:

```text
repository ref
  ref name: main / codex/foo
  kind: default | pull_request | branch
  head SHA
  optional pull request metadata
  head commit summary
  check snapshot for head SHA
```

Rules:

1. Pin the default branch at the top.
2. Show checks for the default branch head commit.
3. Show PR branches as branch rows with PR metadata, not as a separate PR-only model.
4. Key check state by GitHub repository ID plus commit SHA.
5. Use the same compact check summary everywhere.
6. Open the detailed check list from the compact summary instead of rendering every check inline by
   default.

## Default Branch History

The default branch may later show the latest two or three commits as an expanded stack:

```text
main
  abc1234  latest commit          passed: 4
  91ab222  previous commit        passed: 4
  77cd333  previous commit        failed: 1
```

This is allowed because it answers whether recent merges stayed healthy. It should not imply that
all branches need visible commit history. Other branches should show only their current tip unless a
future workflow proves that branch history is needed.

## Non-Goals

1. Do not build a full GitHub UI.
2. Do not show full branch history by default.
3. Do not model checks as PR-only data.
4. Do not keep Cloudflare-specific preview compatibility fields.
5. Do not keep backwards compatibility with the old PR comment or branch-level Cloudflare preview
   projection. Backwards compatibility is a bug for this cleanup path.
6. Do not create fixture-only dashboard components.

## View Model Contract

The UI should be designed around a small Samebase-owned view model. Production data adapters and
visual fixtures both pass this same shape into the same production component.

Recommended shape:

```ts
type VaultRepositoryChecksViewModel = {
  vaultId: string;
  repositoryFullName: string;
  defaultBranchName: string;
  sections: readonly VaultRepositoryChecksSectionViewModel[];
  refreshedAt: number | null;
};

type VaultRepositoryChecksSectionViewModel = {
  kind: "default" | "pull_requests" | "active_branches" | "stale_branches";
  rows: readonly VaultRepositoryRefRowViewModel[];
};

type VaultRepositoryRefRowViewModel = {
  refName: string;
  refKind: "default" | "pull_request" | "branch";
  headSha: string;
  headCommit: CommitSummaryViewModel | null;
  pullRequest: PullRequestSummaryViewModel | null;
  checks: CommitCheckSummaryViewModel | null;
  links: readonly RepositoryRefLinkViewModel[];
  recentDefaultBranchCommits?: readonly CommitWithChecksViewModel[];
};
```

Use the exact names that fit the implementation, but keep the ownership rule: the dashboard
component renders a view model and does not know whether the rows came from Convex, a local visual
fixture, or a later mocked endpoint.

## Fixture And Prototype Rules

UI-only exploration is useful if it exercises the real shipped surface.

Required:

1. The dashboard route and visual fixtures mount the same production component for the branch-tip
   table.
2. Fixtures may pass mock view-model data.
3. Fixtures may not define alternate row components, alternate spacing wrappers, or simplified
   branch chrome.
4. Fixture data should include:
   - default branch with successful checks
   - default branch with recent commit history
   - PR branch with running checks
   - PR branch with failed checks
   - non-PR active branch with checks
   - missing snapshot state
5. Screenshot tests should target the actual table/card area that paints the rows, not a route shell
   with unrelated scroll padding.

The clean split is:

```text
Convex query result -> production adapter -> view model -> production component
fixture data -----------------------------> view model -> production component
```

Do not use:

```text
fixture data -> fake visual-only table
```

## Data Model Direction

Future backend work should move from PR-specific check snapshots to commit-centered snapshots.

Recommended durable entities:

```text
vaultRepositoryRefs
  vaultId
  githubRepositoryId
  refName
  kind: default | pull_request | branch
  headSha
  pullRequestNumber?
  pullRequestTitle?
  pullRequestUrl?
  pullRequestIsDraft?
  updatedAt

commitCheckSnapshots
  githubRepositoryId
  commitSha
  state
  totalCount
  successCount
  failureCount
  runningCount
  neutralCount
  primaryTargetUrl?
  primaryLogUrl?
  syncedAt

commitCheckItems
  githubRepositoryId
  commitSha
  source: check_run | commit_status
  sourceKey
  name
  providerName?
  status
  conclusion?
  targetUrl?
  detailsUrl?
  previewUrl?
  previewAliasUrl?
  logUrl?
  startedAt?
  completedAt?
  updatedAt?
  syncedAt

commitSummaries
  githubRepositoryId
  commitSha
  message
  authorName?
  committedAt
  url
```

Exact table names may change, but the invariant should not: GitHub checks belong to a commit inside
one GitHub repository. Store check snapshots by `githubRepositoryId + commitSha`, not by
`vaultId + commitSha`, `repositoryFullName + commitSha`, or `branchName + commitSha`.

Rationale:

1. `branchName` is only the ref currently pointing at a commit; checks are not branch-scoped.
2. `vaultId` is Samebase's app container, not GitHub's check namespace.
3. Repository full names can change on GitHub rename and have casing concerns.
4. GitHub repository IDs are stable across renames, while the same SHA may have different checks in
   different repositories or forks.

Branch rows should read their vault's `githubRepositoryId`, take each row's `headSha`, and join to
the matching commit check snapshot. If `main` and a feature branch point at the same commit, they
must share one snapshot row.

Commit-check snapshots are cache data. Repository refresh should delete snapshots and check items
for commits no active branch currently points at, so the repository-level cache does not grow
forever as branch heads move.

Rollout is intentionally destructive for the old PR-check cache. The old `vaultRemoteBranches`
PR-check rollup field and old PR-check item table are not supported by this model. Production
deployment must clear those old rows/fields before the schema is narrowed, or reset the single-user
production database before deploying this change. Do not keep old PR-check schema fields as a
compatibility layer.

## Refresh Direction

Refresh triggers should enqueue commit snapshot work for affected SHAs:

1. `push` webhook updates branch heads and queues the new head SHA.
2. `pull_request` opened/synchronize updates PR metadata and queues the PR head SHA.
3. `check_run`, `check_suite`, `status`, and `workflow_run` update or refetch the affected SHA.
4. Manual refresh reconciles the default branch, open PR branches, and visible active branches.
5. Periodic or app-triggered reconciliation handles missed webhooks.

Dashboard render must read Convex snapshots. It must not call GitHub from React.

For repositories with many PRs, dedupe by SHA before fetching checks. A manual cold refresh may fan
out in bounded backend batches; passive refresh should preserve large-repo budgeting and keep
showing the last stored snapshot until a targeted trigger updates it.

## Rollout Sketch

1. Build the branch-tip table component behind a view model.
2. Add visual fixtures that feed mock view-model data into the production component.
3. Adapt the current Convex dashboard query result into the new view model, even before the backend
   tables are renamed.
4. Move persistence from PR-head snapshots to commit-SHA snapshots.
5. Hydrate the default branch check snapshot.
6. Delete PR-only snapshot fields/tables once the commit-centered model is live.

Because there is one operator and no backwards compatibility requirement, avoid dual runtime paths.
Each phase should delete the old shape as soon as the replacement is the live path.

## Acceptance Criteria

1. The dashboard shows the default branch check state.
2. The dashboard shows PR branch check state using the same component and summary vocabulary.
3. The dashboard can show active non-PR branch check state when present.
4. The default branch can expose the latest two or three commit snapshots without changing the row
   model for every branch.
5. Visual fixtures use the production table component with mock view-model data.
6. Visual fixtures fail if the production table layout regresses.
7. No Cloudflare-specific compatibility projection remains in the branch row contract.
8. No PR-comment parser or fallback is reintroduced.
