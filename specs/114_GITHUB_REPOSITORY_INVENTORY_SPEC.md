# 114 GitHub Repository Inventory Spec

## Document Control

- Status: Accepted
- Owner: Samebase vault dashboard repository freshness
- Last updated: 2026-07-16
- Supersedes:
  - `archive/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`
  - `specs/065_GITHUB_REPOSITORY_PICKER_DISCOVERY_SPEC.md`
- Related docs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/065_GITHUB_REPOSITORY_PICKER_DISCOVERY_SPEC.md`

## Product Contract

The active `/vault/<org>/<repo>` route stays as fresh as practical while always showing a complete,
internally consistent view of its GitHub repository. A refresh inventories every branch and every
open pull request, including drafts and pull requests from forks. Each row includes its latest head
commit, checks, and commit statuses. Pull requests include every label. The dashboard does not hide
a branch merely because that branch also has a pull request.

Every nondefault branch and pull request carries an exact comparison against the ref it actually
targets. A pull request also carries GitHub's additions, deletions, changed-file count, and
cross-repository classification. The compact pull request row reads
`↑6 ↓2 vs main · +1,240 −318 · 17 files`. A fork is identified explicitly, and a pull request
targeting another base says `vs <actual-base>`. An unavailable comparison has an explicit reason; it
is never presented as zero.

The collector uses GitHub GraphQL with the vault's existing GitHub connection credential. It
paginates until it has read every branch, open pull request, check context, status context, and
label. It validates repository identity, total counts, cursors, duplicates, required nested data,
and a final identity-only pass over branch names and open pull request node IDs. A repository rename
or transfer is accepted only when the stable repository identity still matches. GitHub's canonical
repository name is used for links.

Branch comparisons are collected inline against the repository default branch and add no GraphQL
request. GitHub reports that comparison in the receiver ref's direction, so the collector validates
both target SHAs and deliberately maps the raw `behindBy` to product `aheadBy` and raw `aheadBy` to
product `behindBy`. Pull request comparisons use the pull request's actual base and qualified head,
validate both target SHAs, and use GitHub's counts directly. They are collected sequentially in
batches of at most 50 aliases, adding `ceil(open pull requests / 50)` requests and normally the same
number of GraphQL points. Actual cost remains part of the account budget and becomes the next
crawl's reservation.

The GraphQL client rejects partial responses by default. Comparison batches accept only alias-local
`NOT_FOUND` errors at the exact generated comparison path. A missing base or head ref, or unrelated
history, becomes the matching item-level unavailable state while ready sibling aliases remain
usable. Permission, rate-limit, schema, repository, mixed, and unclassified errors fail the
generation and leave the prior snapshot visible.

The dashboard has one visibility-demand loop. On mount it requests the selected full inventory
first, then requests lightweight repository summaries. It repeats every 60 seconds while the page is
visible, stops while hidden, and requests immediately after becoming visible. The selected dashboard
and FileView are mutually exclusive owners of this loop. It has no manual reload control and no
window-focus listener. Only the selected vault requests a full inventory; summary demand may
schedule eligible work for other vaults. Stable ordered vault IDs are the demand identity, so a
directory publication that contains the same vaults cannot restart the loop. On a selected route,
the loop remains disabled until the indexed selected-vault detail resolves; background summary work
therefore cannot claim that vault before its first full-inventory request.

Ordinary visible demand expires after 135 seconds. Repeated route requests extend that deadline but
do not schedule a trailing crawl while GitHub collection or local filter materialization is active.
The active generation satisfies ordinary route demand even if its provider collection finished a few
seconds before that signal. A confirmed repository write increments a write version and guarantees
exactly one immediate trailing crawl when the active crawl did not include that write. This
distinction prevents duplicate full crawls from visibility and polling signals while preserving
write-after-refresh correctness.

The 60-second client request is a visibility heartbeat, not a promise to crawl GitHub every minute.
After the first successful crawl, ordinary full-inventory eligibility is derived from the last start
time and measured GraphQL cost:

`intervalMs = max(60,000, ceil(measuredCost × 60,000 / 12))`

For a repository whose crawl cost remains stable, this targets at most 12 points per minute, or 720
points per hour, before the account-wide budget applies. Costs 1 through 12 have one-minute
eligibility; 13 points becomes eligible after 65 seconds, 50 after 250 seconds, 100 after 500
seconds, and 500 after 2,500 seconds. The 60-second visibility heartbeat starts the crawl on or
after that eligibility boundary. The measured Samebase crawl costs 12 points, so its ordinary
cadence remains one minute. A new vault with no measurement uses the one-minute floor. A repository
can grow between observations, so the GitHub-account lease, reserved estimate, and remaining-point
safety floor are the hard capacity guardrail. Provider cost is persisted immediately after a
complete GitHub collection, before local snapshot staging and filter materialization, so a later
local failure cannot discard the next pacing estimate.

Required post-write crawls bypass ordinary freshness pacing. A required request replaces a future
ordinary job, or coalesces into one immediate trailing crawl when collection or materialization is
already active. It still obeys the GitHub-account lease, safety floor, and primary or secondary
cooldowns. The cost formula is a per-selected-vault pacing guardrail; the shared account budget is
the aggregate hard stop.

GitHub account rate coordination is keyed by the stable GitHub account ID. Token rotation does not
split a budget, switching accounts does not inherit another account's cooldown, and two Samebase
connections for the same GitHub user cannot crawl concurrently. Each vault reserves the cost of its
own most recent crawl, subject to a conservative default and GitHub's remaining-point safety floor.
Leases renew only when needed. Primary and secondary cooldowns reported by GitHub stop new work.

## Repository Summary Directory

`/vault` and the selected-vault sidebar render the same repository directory component from the same
data. Each connected repository has one fixed-size summary publication containing:

- the canonical repository name;
- the default branch name and head SHA, or an explicit no-default-branch state;
- the default branch check rollup as none, running, passing, or failing;
- the exact open pull request count;
- the last complete GitHub check time.

The summary does not contain branch pages, pull request rows, labels, comparisons, or diff
statistics. Those belong only to the selected full inventory. Repository summary collection uses one
GraphQL `nodes(ids)` request for a scheduled batch of at most 25 repositories. The collector has a
hard input limit of 50, validates every stable repository identity, and accepts only an exact
item-local unavailable response. Actual GraphQL cost is charged to the same GitHub-account budget as
full inventory work.

Each summary is eligible at most once every five minutes. A demand request prioritizes the selected
and first visible directory rows, accepts at most 25 unique priority IDs, then fills the batch with
the oldest eligible summaries so repositories beyond the loaded page still make progress. Summary
and full-inventory jobs share one Workpool with maximum parallelism three and the same serialized
GitHub-account rate budget. Scheduling a selected full inventory immediately reserves that vault's
summary lifecycle, so the lightweight batch cannot duplicate its GitHub work. A completed full
inventory publishes the matching summary from the same provider observation.

The directory serializes every user-visible state: provisioning, setup failed, connected but not
observed, updating, waiting for GitHub, update failed, repository unavailable, deleting, and
deletion failed. A complete publication remains visible while replacement work runs, waits, or
fails. The UI shows the default branch, checks, pull request count including zero, last checked
time, and the current lifecycle. It never turns a missing or failed summary into an empty healthy
repository.

Vault rows paginate in stable creation order. A page requests and may read at most 25 vaults. The
browser keeps exactly one reactive subscription for `{ ownerId, revision }`; directory pages are
point-in-time queries cached by owner, revision, and cursor. The server rejects a page when its
requested revision is no longer current. The browser reloads every previously requested page for a
new revision and swaps them together. It retains the prior rows during a same-owner replacement but
never retains or reuses rows after the authenticated owner changes. The selected repository's full
dashboard detail is loaded through its owner/name index, not by collecting all vault details.

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
- `vaultRepositorySummaries`: one fixed-size summary lifecycle and publication per connected vault
- `vaultRepositorySummaryDirectoryStates`: one owner-scoped directory revision per user
- `githubGraphqlRateBudgets`: high-churn GitHub-account lease and cooldown state
- `githubObservationActionLeases`: bounded deletion safety for active GitHub observations

Snapshot `_id` is the only snapshot identity. There are no numeric generation counters, separate
publication rows, separate refresh rows, compatibility readers, or duplicated user ownership on
child rows. Snapshot, item, and label-chunk rows retain `vaultId` only for indexed vault deletion.

For the selected repository, the browser keeps one reactive subscription for full-inventory
freshness and one for the saved filter and published view. Snapshot branch, visible pull request,
label, and facet pages are point-in-time queries cached under immutable snapshot and view IDs. They
do not create a reactive subscription per page. The browser loads a replacement snapshot and filter
view off-screen, validates stable totals, unique row keys, contiguous label chunks, and exact label
counts, then swaps the requested leading slice in one state update. A missing or invalid snapshot or
view is unavailable, never an authoritative empty list. Until the replacement pair is complete, the
prior rows and their matching freshness metadata stay visible.

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

Repository observation has one visibility-demand path. It does not use a manual refresh action,
browser-focus fan-out, an all-vault full-inventory fan-out, the legacy REST refresh queue, or
branch-by-branch REST discovery.

Repository file trees remain a separate branch-scoped operation because opening and editing files
requires different data and timing. FileView reads branch identity, pull request identity, and head
checks from the published inventory. It does not run a separate checks monitor. Its route lifecycle
may fetch only the exact selected branch tree. Compare preview and deleted-file restore read
published inventory identity before making their compare and file requests. Repository writes
request a required inventory crawl and refresh only affected branch trees.

GitHub authentication behavior does not change. Existing API-key and OAuth connections supply the
same server-side credential. The connect screen makes one REST request for the ten most recently
updated repositories returned by `GET /user/repos`; it never paginates through the account's full
repository set. That list is a convenience preview, not the connection boundary.

A user may enter an exact `owner/repo` outside the preview. Connect then calls
`GET /repos/{owner}/{repo}` once before any vault, run, event, or resource-link write. Samebase
requires a positive stable repository ID, GitHub's canonical owner and name, and a nonempty default
branch. An unreadable, missing, empty, or malformed repository fails with one generic unreadable
message and leaves no local connection state. The normal provisioning workflow revalidates the
repository while completing setup. Connecting a readable public repository requires neither a GitHub
App installation nor repository administration.

The browser checks connection membership for the ten preview rows plus at most one exact input with
one bounded Convex query. The query accepts no more than 25 unique identities, reads the
user-and-GitHub-ID index first and canonical coordinates second, preserves input order, and returns
only name plus connected status. It does not load vault infrastructure, file staging, or branch
data.

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
- Run a full inventory for every connected vault when the user is viewing one selected vault.
- Put multiple branch or pull request rows into the lightweight repository summary.
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
- A 12-point selected crawl remains eligible every 60 seconds. Costs 13, 50, 100, and 500 derive
  65-second, 250-second, 500-second, and 2,500-second eligibility intervals. A heartbeat before the
  boundary creates no snapshot or Workpool job, so lightweight summaries remain eligible. The first
  heartbeat on or after the boundary schedules the full crawl.
- A changed provider crawl persists its measured cost before local staging. Required writes still
  schedule immediately and multiple writes during an active generation still create one trailing
  crawl.
- Publication becomes visible in one atomic root change. Readers never combine rows or labels from
  different snapshots.
- An unchanged crawl advances `checkedAt` without replacing the published snapshot.
- Branch and open pull request identity sets are verified again before publication, so equal-count
  membership churn cannot publish a mixed crawl.
- Fork pull requests link to their GitHub source and do not expose a Samebase file route for a head
  repository the vault does not own.
- A known branch comparison maps raw GitHub `aheadBy: 2, behindBy: 4` to `↑4 ↓2`. Pull request
  comparisons preserve GitHub's direction, including forks and nondefault bases.
- Fifty-one open pull requests require exactly two bounded comparison requests. A comparison target
  mismatch fails the generation, while one exact alias-local missing-ref error does not discard
  valid sibling comparisons.
- Comparison-only changes alter the snapshot fingerprint. Unavailable comparisons retain their
  reason through storage and the browser and never render fabricated zero counts.
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
- Repository discovery makes one ten-row preview request and never performs an automatic full
  account scan. Entering a readable public `owner/repo` outside the preview connects it
  successfully.
- Exact connection validates stable identity, canonical coordinates, and the default branch before
  any local write. An unreadable repository leaves vault, run, event, and resource-link tables
  unchanged.
- Repository connection membership accepts at most 25 unique identities and uses only user-scoped
  repository ID or coordinate indexes.
- `/vault` and the selected sidebar render the same fixed summary rows, including exact zero pull
  requests, default-branch checks, checked time, and explicit incomplete or failed states.
- Directory pages read at most 25 vaults, reject a stale revision, retain a same-owner prior
  generation until the replacement is complete, and never reuse a same-numbered revision across
  authenticated users.
- Visible summary demand accepts at most 25 unique priority vaults, schedules at most 25 eligible
  summaries, and continues fair oldest-first progress for vaults outside the loaded page.
- Scheduling an eligible selected full inventory before summary demand prevents the selected vault
  from entering the lightweight batch. A cost-paced inventory that is not eligible creates no work
  and leaves the lightweight summary available. A full inventory completion publishes its summary
  without a second GitHub request.
- A GitHub account switch receives a new rate budget, while token rotation for the same account
  keeps the existing budget.
- The production preflight proves every retired table and retired work queue empty before the narrow
  schema is deployed.
