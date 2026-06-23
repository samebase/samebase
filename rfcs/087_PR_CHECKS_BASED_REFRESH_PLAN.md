# 087 PR Checks Based Refresh Plan

## Document Control

- Status: Partially implemented
- Owner: vault refresh, GitHub PR metadata, dashboard branch rows
- Created: 2026-06-23
- Last updated: 2026-06-23
- Related specs:
  - `specs/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md`
  - `specs/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`
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

This PR lands the urgent source-of-truth swap for dashboard preview hydration:

1. The Cloudflare PR comment parser and refresh comment lookup are removed.
2. Vault PR preview hydration now calls `checks.listForRef` for the branch head SHA.
3. Cloudflare Workers preview metadata is parsed from the check run:
   - `Preview URL`
   - `Preview Alias URL`
   - `details_url` for provider build/log details
4. Dashboard-triggered repository refreshes can request this check-based hydration. Existing
   large-repo budget logic still skips broad automatic hydration above the branch threshold.
5. Cached preview fields are replaced by the latest check snapshot instead of preserving partial old
   values.
6. Cached preview fields are cleared when the branch loses its PR, changes PR number, or the current
   PR head SHA changes.

The remaining work in this RFC is the provider-neutral check/status snapshot model: storing all
current PR check runs/status contexts in a child table, exposing a compact branch summary, and
rendering non-Cloudflare check state in the dashboard.

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
3. If a check run exposes a current preview URL in structured output, Samebase may render it as the
   branch's preview link.
4. If the provider is Cloudflare, Samebase may keep the existing `Cloudflare preview` label, but the
   underlying source must be GitHub check data.
5. If no preview environment URL exists, the row still shows the PR's check status and provider
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
2. `by_vault_and_pr_and_head` on `["vaultId", "pullRequestNumber", "headCommitSha"]`
3. `by_vault_and_syncedAt` on `["vaultId", "syncedAt"]` for pruning

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

## Rollout Plan

### Phase 1: Shared GitHub Status Reader

1. Extract the `checks.listForRef` and commit-status reads from `githubChecks.ts` into a shared
   server helper.
2. Include fields currently omitted by `githubChecks.ts`, especially check-run `details_url`, app
   name/slug when available, and timestamps.
3. Keep `githubChecks.getCommitStatus` working by returning its existing public shape.
4. Add unit tests for check/status normalization and aggregate state.

### Phase 2: Persist Current PR Check Snapshots

1. Add the child table and branch summary schema.
2. Add internal mutations to replace current check items for one
   `(vaultId, branchName, pullRequestNumber, headCommitSha)` tuple.
3. Clear summaries and child rows when a branch loses its PR, changes PR number, changes head SHA,
   or becomes deleted upstream.
4. Update `syncRepositoryMetadata` to hydrate PR status snapshots after PR metadata is written.

### Phase 3: Dashboard Read And Render

1. Return `pullRequestStatusSummary` from `vault.dashboard.getUserVaults`.
2. Add a dashboard branch-row checks summary using the existing compact `CommitStatus` visual
   language.
3. Render a provider/detail link when `primaryTargetUrl` exists.
4. Keep the existing Cloudflare preview affordance only when the normalized check data proves a
   current preview URL for the current PR/head SHA.

### Phase 4: Remove Comment-Based Preview Hydration

1. Remove `getLatestPullRequestCloudflarePreviewComment` and `getCloudflarePreviewLinksByBranch`
   from `github.ts`.
2. Delete `cloudflarePreviewComment.ts` and `cloudflarePreviewComment.test.ts`.
3. Stop writing preview metadata from PR comments.
4. Once normalized check data covers the real Cloudflare previews in production, archive or rewrite
   `specs/066_DASHBOARD_PR_CLOUDFLARE_BRANCH_PREVIEW_LINK_SPEC.md`.

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
4. Cloudflare preview link renders only when normalized check data proves a current preview URL.
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
