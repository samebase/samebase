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
do not schedule a trailing crawl behind one that is already running. A confirmed repository write
increments a write version and guarantees exactly one immediate trailing crawl when the active crawl
did not include that write. This distinction prevents abandoned tabs and repeated visibility signals
from consuming GitHub capacity while preserving read-after-write freshness.

GitHub account rate coordination is keyed by the stable GitHub account ID. Token rotation does not
split a budget, switching accounts does not inherit another account's cooldown, and two Samebase
connections for the same GitHub user cannot crawl concurrently. Each vault reserves the cost of its
own most recent crawl, subject to a conservative default and GitHub's remaining-point safety floor.
Leases renew only when needed. Primary and secondary cooldowns reported by GitHub stop new work.

## Atomic Snapshot Model

Completed inventory snapshots are immutable. The backend stages a new snapshot and publishes its ID
in the vault's single inventory state row only after the complete GraphQL crawl succeeds and the
stored item, label, and chunk counts exactly match the collector's counts. The previously published
snapshot remains authoritative while a crawl runs, waits for rate capacity, or fails.

If a crawl proves that provider data is unchanged, the backend deletes the empty staging snapshot,
advances `checkedAt`, and keeps the published snapshot ID. `publishedAt` records when the displayed
rows changed. `checkedAt` records the most recent complete provider check and is the timestamp shown
as `Updated` or `Last complete`.

The persistent model is intentionally small:

- `vaultRepositoryInventories`: one reactive lifecycle and publication root per vault
- `vaultRepositoryInventorySnapshots`: immutable snapshot counts
- `vaultRepositoryInventoryItems`: immutable branch and pull request rows
- `vaultRepositoryInventoryLabelChunks`: bounded, immutable pull request label chunks
- `githubGraphqlRateBudgets`: high-churn GitHub-account lease and cooldown state

Snapshot `_id` is the only snapshot identity. There are no numeric generation counters, separate
publication rows, separate refresh rows, compatibility readers, or duplicated user ownership on
child rows. Snapshot, item, and label-chunk rows retain `vaultId` only for indexed vault deletion.

The browser keeps exactly one reactive subscription for the inventory root. Snapshot item and label
pages are point-in-time queries cached under the immutable snapshot ID. They do not subscribe to the
root and do not create a reactive subscription per page. The browser loads a replacement snapshot
off-screen, validates stable totals, unique row keys, contiguous label chunks, and exact label
counts, then swaps the requested leading slice in one state update. A missing or invalid snapshot is
unavailable, never an authoritative empty list. Until the replacement is complete, the prior rows
and their matching freshness metadata stay visible.

The server orders the default branch first, then open pull requests from newest update time to
oldest, then remaining branches from newest commit time to oldest. Stable row keys break ties. The
first bounded page therefore contains the most useful active work without requiring the browser to
load the entire repository before showing anything.

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
- Repeated visibility demand during a crawl creates no trailing crawl. One or more confirmed writes
  during that crawl create exactly one required trailing snapshot.
- Deferred ordinary demand is abandoned after its visibility deadline expires.
- Publication becomes visible in one atomic root change. Readers never combine rows or labels from
  different snapshots.
- An unchanged crawl advances `checkedAt` without replacing the published snapshot.
- Branch and open pull request identity sets are verified again before publication, so equal-count
  membership churn cannot publish a mixed crawl.
- Fork pull requests link to their GitHub source and do not expose a Samebase file route for a head
  repository the vault does not own.
- API-key and OAuth-backed vaults use the same inventory contract.
- A GitHub account switch receives a new rate budget, while token rotation for the same account
  keeps the existing budget.
- The production preflight proves every retired table and retired work queue empty before the narrow
  schema is deployed.
