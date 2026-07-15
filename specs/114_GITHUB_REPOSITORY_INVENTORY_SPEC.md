# 114 GitHub Repository Inventory Spec

## Document Control

- Status: Accepted
- Owner: Samebase vault dashboard repository freshness
- Last updated: 2026-07-15
- Supersedes: `archive/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`
- Related docs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/065_GITHUB_REPOSITORY_PICKER_DISCOVERY_SPEC.md`

## Product Contract

The active `/vault/<org>/<repo>` route stays as fresh as practical while always showing a complete,
internally consistent view of its GitHub repository. A refresh inventories every branch and every
open pull request, including drafts and pull requests from forks. Each row includes its latest head
commit, checks, and commit statuses. Pull requests include every label. The dashboard does not hide
a branch merely because that branch also has a pull request.

The collector uses GitHub GraphQL with the vault's existing GitHub connection credential. It
paginates until it has read every branch, open pull request, check context, status context, and
label. It validates repository identity, total counts, cursors, duplicates, required nested data,
and a final identity-only pass over branch names and open pull request node IDs. A repository rename
or transfer is accepted only when the stable repository identity still matches. GitHub's canonical
repository name is used for links.

Opening a selected vault route while the page is visible requests an inventory immediately. The
selected dashboard and FileView are mutually exclusive owners of the same demand hook. While that
route remains mounted and visible, the client requests another inventory every 60 seconds. A hidden
page does not poll, and becoming visible again requests an inventory immediately. Only the selected
vault polls.

Ordinary visible demand expires after 135 seconds. Repeated route requests extend that deadline but
do not schedule a trailing crawl while GitHub collection or local filter materialization is active.
The active generation satisfies ordinary route demand even if its provider collection finished a few
seconds before that signal. A confirmed repository write increments a write version and guarantees
exactly one immediate trailing crawl when the active crawl did not include that write. This
distinction prevents duplicate full crawls from focus and polling signals while preserving
write-after-refresh correctness.

GitHub account rate coordination is keyed by the stable GitHub account ID. Token rotation does not
split a budget, switching accounts does not inherit another account's cooldown, and two Samebase
connections for the same GitHub user cannot crawl concurrently. Each vault reserves the cost of its
own most recent crawl, subject to a conservative default and GitHub's remaining-point safety floor.
Leases renew only when needed. Primary and secondary cooldowns reported by GitHub stop new work.

## Atomic Snapshot Model

Completed inventory snapshots are immutable. The backend stages a new snapshot, verifies that the
stored item, label, facet, and chunk counts exactly match the complete GraphQL crawl, then derives
the current user's pull request filter view in bounded mutations. It publishes the snapshot ID and
filter view ID together in the vault's single inventory state row only after both are complete. The
previously published pair remains authoritative while a crawl runs, waits for rate capacity,
materializes, or fails.

If a crawl proves that provider data is unchanged, the backend deletes the empty staging snapshot,
advances `checkedAt`, and keeps the published snapshot ID. `publishedAt` records when the displayed
rows changed. `checkedAt` records the most recent complete provider check and is the timestamp shown
as `Updated` or `Last complete`.

The persistent model is intentionally small:

- `vaultRepositoryInventories`: one reactive lifecycle and publication root per vault
- `vaultRepositoryInventorySnapshots`: immutable snapshot counts
- `vaultRepositoryInventoryItems`: immutable branch and pull request rows
- `vaultRepositoryInventoryLabelChunks`: bounded, immutable pull request label chunks
- `vaultRepositoryInventoryFilters`: one saved pull request filter per user and vault
- `vaultRepositoryInventoryFilterViews`: immutable, snapshot-scoped filter view totals
- `vaultRepositoryInventoryFilterViewRows`: visible pull request membership for a filter view
- `vaultRepositoryInventoryLabelFacets`: complete per-snapshot pull request label counts
- `githubGraphqlRateBudgets`: high-churn GitHub-account lease and cooldown state

Snapshot `_id` is the only snapshot identity. There are no numeric generation counters, separate
publication rows, separate refresh rows, compatibility readers, or duplicated user ownership on
child rows. Snapshot, item, and label-chunk rows retain `vaultId` only for indexed vault deletion.

The browser keeps one reactive subscription for repository freshness and one for the selected
vault's saved filter and published view. Snapshot branch, visible pull request, label, and facet
pages are point-in-time queries cached under immutable snapshot and view IDs. They do not create a
reactive subscription per page. The browser loads a replacement snapshot and filter view off-screen,
validates stable totals, unique row keys, contiguous label chunks, and exact label counts, then
swaps the requested leading slice in one state update. A missing or invalid snapshot or view is
unavailable, never an authoritative empty list. Until the replacement pair is complete, the prior
rows and their matching freshness metadata stay visible.

The server orders the default branch first, then open pull requests from newest update time to
oldest, then remaining branches from newest commit time to oldest. Stable row keys break ties. The
first bounded page therefore contains the most useful active work without requiring the browser to
load the entire repository before showing anything.

## Pull Request Filtering

Filtering is a presentation rule over open pull requests, not a repository collection rule. Every
published snapshot still contains every branch and every open pull request. Branch rows always
remain visible, including a branch whose corresponding pull request is filtered out.

Each user has one saved filter selection per vault. Draft pull requests are excluded by default,
unlabeled pull requests are included by default, and every label is included by default. Label
matching trims names and compares them case-insensitively. A pull request is excluded when it is a
draft and drafts are disabled, when it has no labels and unlabeled pull requests are disabled, or
when any of its labels is excluded. A saved excluded label remains removable even when the current
snapshot no longer contains that label.

The backend derives a snapshot-scoped pull request view from the saved selection without contacting
GitHub. It evaluates the immutable pull request rows in bounded batches, records only visible pull
request membership, and publishes the view only after the processed count exactly matches the
snapshot pull request count. The published view carries the source snapshot ID, filter revision,
exact visible and total pull request counts, and complete label facets. A filter change or a new
snapshot keeps the prior committed dashboard rows visible until the replacement snapshot and filter
view pair is complete.

Each materialization batch rechecks the current filter revision and source snapshot before writing.
Rapid filter changes therefore retire stale work and only the latest revision can publish. A durable
watchdog resumes missing batches. A corrupt source or invalid total exits the materializing
lifecycle, retains the prior publication, and allows the next visibility request to start a fresh
crawl.

Branches paginate directly from the immutable snapshot. Visible pull requests paginate through the
published filter view. The browser composes the default branch, visible pull requests ordered newest
first, and all remaining branches. It never filters only the rows it has already loaded and never
scans hidden pull request pages to discover later branches. The dashboard reports visible versus
total pull request counts whenever the filter excludes anything.

## Runtime Boundaries

Repository inventory freshness has one path. It does not use a manual refresh action, browser focus
fan-out, an all-vault dashboard fan-out, the legacy REST refresh queue, or branch-by-branch REST
discovery.

Repository file trees remain a separate branch-scoped operation because opening and editing files
requires different data and timing. FileView reads branch identity, pull request identity, and head
checks from the published inventory. It does not run a separate checks monitor. Its route lifecycle
may fetch only the exact selected branch tree. Compare preview and deleted-file restore read
published inventory identity before making their compare and file requests. Repository writes
request a required inventory crawl and refresh only affected branch trees.

GitHub connection behavior does not change. Existing API-key and OAuth connections continue to be
used. Connecting a public repository does not require a GitHub App installation or repository
administration solely for inventory polling.

## Clean Cutover

The repository inventory is derived cache, not user-authored product data. Samebase currently has
one real operator, so the cutover preserves vault identities and provider credentials but preserves
none of the old inventory, branch catalog, check cache, refresh history, or Workpool state.

Before deploying the narrow schema to production, the operator must:

1. Close production Samebase tabs so the retired client stops requesting work.
2. Verify the retired repository refresh queue and Workpool have no queued, scheduled, or running
   jobs.
3. Clear every row from the retired refresh, branch catalog, branch filter, check snapshot, and
   check item tables while the old schema is still deployed.
4. Independently verify all retired tables are empty.
5. Deploy the narrow snapshot schema and runtime immediately.

The executable operator procedure is `docs/github-repository-inventory-cutover.md`.

This is an explicit maintenance cutover. It does not ship migration validators, dual readers,
temporary cleanup functions, the migrations component, or a compatibility deployment. If the
preflight is not empty, deployment stops and the operator investigates instead of widening the new
runtime.

## Non-Goals

- Preserve the old repository refresh queue, request history, cached inventory, or trigger
  vocabulary.
- Preserve existing vault inventory rows across the production cutover.
- Refresh every connected vault when the user is viewing one selected vault.
- Use inventory polling to load file contents or full branch trees.
- Add a webhook, GitHub App installation, or new GitHub authorization flow.
- Keep a manual reload control as a fallback for an unreliable automatic path.
- Filter branches or let filtering change which repository data the collector stores.

## Validation

- A branch-heavy repository publishes all branches, all open pull requests, checks, statuses, and
  labels without partial dashboard data.
- Server item pages return at most ten rows. Label pages return at most five bounded chunks, and the
  browser accepts them only when every chunk and label is present.
- A newly opened, closed, or updated pull request appears after the next successful inventory crawl
  without a page reload or manual action.
- A direct FileView load requests an inventory immediately, keeps the 60-second visible cadence,
  renders published head checks, and performs no second REST checks poll.
- Navigating between the selected dashboard and FileView leaves exactly one active demand loop.
- A failed or rate-delayed crawl leaves the previous complete snapshot visible and reports the
  current lifecycle accurately.
- Repeated visibility demand during GitHub collection or local materialization creates no trailing
  crawl. One or more confirmed writes during either phase create exactly one immediate required
  snapshot.
- Deferred ordinary demand is abandoned after its visibility deadline expires.
- Publication becomes visible in one atomic root change. Readers never combine rows or labels from
  different snapshots.
- An unchanged crawl advances `checkedAt` without replacing the published snapshot.
- Branch and open pull request identity sets are verified again before publication, so equal-count
  membership churn cannot publish a mixed crawl.
- Fork pull requests link to their GitHub source and do not expose a Samebase file route for a head
  repository the vault does not own.
- Default filters hide draft pull requests but retain every branch. Excluding a label or unlabeled
  pull requests changes only pull request rows, reports the exact visible and total pull request
  counts, and can still reach matching pull requests after multiple excluded pages.
- Filter changes persist per user and vault, rebuild only local derived membership, and never
  request GitHub data. A replacement view becomes visible only after every pull request in its
  source snapshot has been evaluated.
- Rapid filter revisions publish only the latest revision. A missing batch is resumed, and an
  invalid batch leaves the prior publication usable instead of leaving the vault materializing
  indefinitely.
- API-key and OAuth-backed vaults use the same inventory contract.
- A GitHub account switch receives a new rate budget, while token rotation for the same account
  keeps the existing budget.
- The production preflight proves every retired table and retired work queue empty before the narrow
  schema is deployed.
