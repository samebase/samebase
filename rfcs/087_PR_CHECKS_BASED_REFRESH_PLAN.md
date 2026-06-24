# 087 PR Checks Based Refresh Plan

## Document Control

- Status: Partially implemented
- Owner: vault refresh, GitHub PR metadata, dashboard branch rows
- Created: 2026-06-23
- Last updated: 2026-06-23
- Related specs:
  - `specs/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md`
  - `specs/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`
- Follow-up RFC:
  - `rfcs/088_BRANCH_TIP_CHECKS_DASHBOARD_PLAN.md`
- Related research:
  - `research/2026-04-08-dashboard-vault-pr-refresh.md`
  - `research/2026-05-15-samebase-workers-provisioning-migration.md`
- External references:
  - GitHub REST check runs: https://docs.github.com/en/rest/checks/runs
  - GitHub REST commit statuses: https://docs.github.com/en/rest/commits/statuses
  - GitHub GraphQL `statusCheckRollup`: https://docs.github.com/en/graphql/reference/commits

## Problem

Samebase currently tries to hydrate PR preview metadata by scraping pull request comments from
`cloudflare-workers-and-pages[bot]`. That was acceptable for the original Cloudflare Pages branch
preview feature, but it has become the wrong source of truth:

1. The parser only recognizes Cloudflare Pages-style HTML table comments.
2. Cloudflare Workers Builds may post different comments, different links, or no compatible comment.
3. Dashboard background refresh does not request Cloudflare preview hydration at all.
4. A comment miss can clear cached preview fields even when GitHub checks already know the deploy
   state.
5. Comment scraping makes Samebase depend on one provider's prose instead of GitHub's standard PR
   status surfaces.

The replacement should refresh a vault's PR state from GitHub check runs and commit statuses for
each current PR head commit. Cloudflare links should be discovered from those GitHub records, not
from PR comments.

## Follow-Up Direction

This RFC documents the PR-check replacement that removed comment scraping. It is not the final
dashboard model. Future dashboard work should use `rfcs/088_BRANCH_TIP_CHECKS_DASHBOARD_PLAN.md`:
checks belong to `githubRepositoryId + commitSha`, and PRs/default branches/active branches are
views over those commit snapshots.

The PR-specific data model below is historical implementation context, not current guidance. New
work must not key check snapshots by PR number, branch name, vault ID, or repository full name.

## Live Probe Result

On 2026-06-23, a read-only GitHub API probe against `samebase/samebase` found:

1. PR #1041 (`codex/samebase-rebrand-rollout-plan`, head `2de6f6b3602dd288273397d3ee42b233456fb0f7`)
   has a `Workers Builds: noter-worker` check run from the `cloudflare-workers-and-pages` GitHub
   App.
2. That check run's `details_url` is the Cloudflare build dashboard URL.
3. That check run's `output.summary` contains:
   - `Preview URL`
   - `Preview Alias URL`
   - `Build ID`
   - `Script`
   - `Version ID`
4. The same PR head's combined commit status only contained CodeRabbit.
5. GitHub deployments for the same SHA and branch returned zero rows.
6. PR #883 (`ssr`, head `5577105062a058d754cc4b740ff3525ced77075b`) shows the failed-build path: the
   Cloudflare Workers check run still has the Cloudflare build dashboard URL in `details_url`, while
   `output.summary` contains build/script links and no preview URLs because the build failed.

For the current Samebase Cloudflare Workers setup, v1 should read Cloudflare preview and log/detail
metadata from check runs. Do not implement GitHub deployment-status reads in v1 unless a later real
provider sample proves they are needed.

## Implementation Landed In This PR

This PR lands the snapshot-first replacement:

1. The Cloudflare PR comment parser and refresh comment lookup are removed.
2. `vaultPullRequestCheckItems` stores the current GitHub-native snapshot for each hydrated PR head:
   - check runs from `checks.listForRef`
   - legacy commit statuses from `repos.getCombinedStatusForRef`
3. `vaultRemoteBranches.pullRequestStatusSummary` stores the compact branch-row rollup.
4. Cloudflare Workers preview metadata is derived from normalized check items:
   - `Preview URL`
   - `Preview Alias URL`
   - check `details_url` for provider build/log details
5. Dashboard branch rows render a provider-neutral compact check summary such as pending, failed, or
   all passed.
6. The old branch-level Cloudflare preview/log projection is removed from runtime reads and writes.
   Preview/log URLs remain on the normalized check item rows until the detailed checks UI renders
   them directly.
7. Cached summaries and check rows are cleared when the branch loses its PR, changes PR number,
   changes head SHA, or is marked deleted upstream.
8. Dashboard/manual/source-setup repository refreshes can request check snapshots. Existing
   large-repo budget logic still skips broad passive dashboard hydration above the branch threshold.

There is intentionally no PR-comment fallback.

## Pre-Implementation Map

The refresh system before this PR was already centralized enough to reuse:

1. `apps/samebase/convex/repositoryRefresh.ts`
   - `enqueueDashboardRepositoryRefresh` records background vault refresh demand.
   - `enqueueManualRepositoryRefresh` records one explicit vault refresh.
   - `runRepositoryRefreshRequest` calls `internal.github.refreshRepositoryTreeForUser`.
   - `shouldHydrateCloudflarePreviewLinks` returned `false` for dashboard demand and `true` only for
     manual/source setup demand.
2. `apps/samebase/convex/github.ts`
   - `syncRepositoryMetadata` lists branches, lists open PRs, writes `vaultRemoteBranches`, then
     optionally calls `getCloudflarePreviewLinksByBranch`.
   - `getOpenPullRequestsByBranch` uses `octokit.rest.pulls.list`.
   - `getLatestPullRequestCloudflarePreviewComment` uses `octokit.rest.issues.listComments`.
   - `parseCloudflarePreviewComment` is the only current Cloudflare preview parser.
3. `apps/samebase/convex/schema.ts`
   - `vaultRemoteBranches` stores branch head SHA, PR URL/number/title/labels/draft, and flat
     Cloudflare preview cache fields.
4. `apps/samebase/convex/vault/branches.ts`
   - `syncVaultRemoteBranches` wrote PR metadata and cleared preview cache when the current PR
     number changed or disappeared.
   - `syncVaultRemoteBranchCloudflarePreviews` wrote parsed comment metadata.
5. `apps/samebase/convex/vault/dashboard.ts`
   - `getUserVaults` returns cached branch metadata for dashboard rendering.
6. `apps/samebase/src/components/vault-dashboard/VaultDashboard.tsx`
   - renders PR links, commit links, labels, draft state, Cloudflare preview links, and Convex
     preview dashboard links from cached branch rows.
7. `apps/samebase/convex/githubChecks.ts`
   - already reads `checks.listForRef` and `repos.getCombinedStatusForRef` for a commit.
8. `apps/samebase/src/components/CommitStatus.tsx`
   - already classifies check runs and commit statuses for FileView's `VaultSyncStatus`.

## Target Contract

Refreshing one vault's PR metadata means:

1. Discover the current open PR for each active branch exactly as today.
2. For every branch with a current PR and `headCommitSha`, fetch the GitHub-native status records
   for that head commit:
   - check runs from `checks.listForRef`
   - legacy commit statuses from `repos.getCombinedStatusForRef` or `repos.listCommitStatusesForRef`
3. Normalize those records into Samebase-owned check items and a compact branch summary.
4. Render PR check state and useful provider links from the normalized data.
5. Do not read PR comments for deploy or preview metadata.

The product-facing behavior should be provider-neutral:

1. A branch row with a current PR can show a checks/status summary independent of Cloudflare.
2. Each check/status item can link to its provider detail URL.
3. If a check run exposes a current preview URL in structured output, the detailed checks UI may
   render that URL from the check item row.
4. If no preview environment URL exists, the row still shows the PR's check status and provider
   detail/log links instead of scraping comments.

## Data Model

Do not store all check records as an unbounded array on `vaultRemoteBranches`.

Add a child table for current PR check items:

```ts
type VaultPullRequestCheckItem = {
  vaultId: Id<"vaults">;
  branchName: string;
  pullRequestNumber: number;
  headCommitSha: string;
  source: "check_run" | "commit_status";
  sourceKey: string;
  name: string;
  providerName?: string;
  status: string;
  conclusion?: string;
  targetUrl?: string;
  detailsUrl?: string;
  githubUrl?: string;
  previewUrl?: string;
  previewAliasUrl?: string;
  logUrl?: string;
  startedAt?: number;
  completedAt?: number;
  updatedAt?: number;
  syncedAt: number;
};
```

Indexes:

1. `by_vault_and_branch_and_pr` on `["vaultId", "branchName", "pullRequestNumber"]`

Add one compact optional summary to `vaultRemoteBranches`:

```ts
type PullRequestStatusSummary = {
  pullRequestNumber: number;
  headCommitSha: string;
  state: "pending" | "success" | "failure" | "neutral" | "unknown";
  totalCount: number;
  checkRunCount: number;
  statusContextCount: number;
  successCount: number;
  failureCount: number;
  runningCount: number;
  neutralCount: number;
  primaryTargetUrl?: string;
  primaryLogUrl?: string;
  syncedAt: number;
};
```

The summary is optional because branches without a current PR and branches not yet hydrated have no
PR status snapshot. It must be cleared when `pullRequestNumber` changes, disappears, or the branch
is marked `deleted_upstream`.

## Normalization Rules

Reuse the existing `CommitStatus` classification vocabulary:

1. Check runs with `queued` or `in_progress` are running.
2. Completed check runs with `success` are success.
3. Completed check runs with `failure`, `cancelled`, `timed_out`, `action_required`, or `stale` are
   failure.
4. Completed check runs with `neutral` or `skipped` are neutral.
5. Commit statuses with `pending` are running.
6. Commit statuses with `success` are success.
7. Commit statuses with `error` or `failure` are failure.

Link selection:

1. Check run primary URL: `details_url` when present, otherwise `html_url`.
2. Commit status primary URL: `target_url`.
3. Cloudflare Workers preview URLs: parse `Preview URL` and `Preview Alias URL` from the Cloudflare
   check run `output.summary`.
4. Cloudflare Workers detail/log URL: use the check run `details_url`.
5. Ignore non-HTTPS URLs for dashboard preview rendering.

The backend should derive TypeScript response types from `RestEndpointMethodTypes` where practical
instead of hand-maintaining parallel GitHub response shapes.

## Refresh Policy

Keep the queue contract from `specs/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`: callers send demand, and
the backend chooses provider depth.

Recommended policy:

1. Manual vault refresh and source setup refresh always hydrate PR status snapshots for all current
   open PR branches in the vault.
2. Dashboard passive refresh hydrates PR status snapshots only when the snapshot is missing, stale,
   or tied to an old PR/head SHA, and should preserve existing large-repo budget rules.
3. FileView may keep live `CommitStatus` polling for the currently open branch, but the shared
   backend normalizer should be reused so FileView and dashboard classify states the same way.
4. Branch-scoped refresh should hydrate only the requested branch's current PR status when the
   branch has a current PR.

Do not add frontend-selected flags such as `includeChecks` to public mutations. If implementation
needs internal knobs, keep them inside `github.ts`/`repositoryRefresh.ts` the same way metadata
depth is handled today.

## Efficiency Contract

The steady-state dashboard must read Convex snapshots, not GitHub.

For a repo with 100 open PRs:

1. A cold manual/source-setup refresh may perform two GitHub reads per current PR head: one
   check-run read and one combined-status read. Run these in bounded backend batches.
2. Passive dashboard refresh may skip broad check hydration when the repo exceeds the automatic
   enrichment branch budget. The UI should continue showing the last stored snapshot until manual
   refresh, targeted refresh, webhook invalidation, or a later scheduled reconciliation replaces it.
3. Future webhook or polling work must enqueue the same snapshot writer. Webhooks, internal app
   events, and polling are invalidation triggers only; they must not introduce separate provider
   parsers or cache paths.
4. Running-check polling should be branch/head scoped and stop when all items are terminal or after
   a fixed TTL.

## Rollout Plan

### Phase 1: Shared GitHub Status Reader

Status: implemented for repository refresh snapshot hydration.

1. `github.ts` reads check runs and commit statuses for each hydrated current PR head.
2. `pullRequestChecks.ts` normalizes check runs and commit statuses into a shared snapshot item
   shape.
3. `githubChecks.getCommitStatus` still serves FileView's existing live/polling UI.
4. Unit tests cover check/status normalization and aggregate state.

### Phase 2: Persist Current PR Check Snapshots

Status: implemented.

1. `vaultPullRequestCheckItems` stores the child check/status rows.
2. `vaultRemoteBranches.pullRequestStatusSummary` stores the compact rollup.
3. `pullRequestChecks.replacePullRequestCheckSnapshot` replaces one
   `(vaultId, branchName, pullRequestNumber, headCommitSha)` tuple and updates only the compact
   branch summary.
4. Branch sync clears summaries and child rows when a branch loses its PR, changes PR number,
   changes head SHA, or becomes deleted upstream.
5. `syncRepositoryMetadata` hydrates PR status snapshots after PR metadata is written.

### Phase 3: Dashboard Read And Render

Status: compact summary implemented; detailed popover still pending.

1. `vault.dashboard.getUserVaults` returns `pullRequestStatusSummary`.
2. Dashboard branch rows show a compact checks summary using the stored rollup.
3. The summary links to `primaryTargetUrl` when available, otherwise the commit checks page.
4. The old Cloudflare preview/log branch-row affordance is removed; links should return through the
   detailed item list/popover from `vaultPullRequestCheckItems`.
5. Pending follow-up: render the detailed item list/popover from `vaultPullRequestCheckItems`.

### Phase 4: Remove Comment-Based Preview Hydration

Status: implemented.

1. Comment lookup and parser code are removed.
2. Preview metadata is no longer written from PR comments.
3. The direct Cloudflare-only check hydration path has been replaced by the generic snapshot writer.
4. The branch-level Cloudflare preview/log compatibility projection has been removed from runtime
   reads and writes.
5. Production `vaultRemoteBranches` data has been cleared of the old Cloudflare preview fields.
6. The deprecated schema fields have been removed from `vaultRemoteBranches`.
7. Pending follow-up: archive or rewrite
   `specs/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md` once the replacement has been
   verified in production.

## Validation

Backend tests:

1. Normalize check runs and commit statuses into the shared state buckets.
2. Prefer `details_url` over `html_url` for check runs.
3. Parse Cloudflare Workers `Preview URL` and `Preview Alias URL` from check run output.
4. Upsert check items idempotently for the same PR/head SHA.
5. Clear summary/items on PR disappearance, PR number change, head SHA change, and deleted upstream
   branches.
6. Verify dashboard passive refresh does not regress large-repo budgeting.
7. Verify manual/source setup refresh hydrates PR status snapshots.

UI tests:

1. Dashboard row shows a check summary when a branch has a current PR status snapshot.
2. Dashboard row suppresses stale summaries whose PR number or head SHA does not match the branch.
3. Dashboard row keeps existing PR title, labels, draft badge, commit link, and Samebase link.
4. Detailed check UI renders provider links from `vaultPullRequestCheckItems`.
5. FileView `CommitStatus` still handles running, failed, successful, empty, cooldown, and
   rate-limited states.

Manual validation:

1. Create or find a vault PR with Cloudflare preview checks.
2. Run manual vault refresh.
3. Confirm Samebase records check/status items for the PR head SHA.
4. Confirm dashboard shows fresh PR check state without reading PR comments.
5. Confirm the row links to GitHub/provider detail URLs.
6. Confirm a new push to the PR clears or replaces the old head SHA snapshot.

## Open Questions

1. Should dashboard passive refresh hydrate all current PR checks for small repos, or only rows
   whose status summary is stale/missing?
2. Should the detailed check list get a dashboard popover immediately, or should the first
   implementation render only the compact summary and primary link?

These questions do not change the core decision: PR comments are not part of the refresh system.
