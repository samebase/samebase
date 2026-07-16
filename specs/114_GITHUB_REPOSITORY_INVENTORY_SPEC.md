# 114 GitHub Repository Inventory Spec

## Document Control

- Status: Accepted
- Owner: Samebase vault dashboard repository freshness
- Last updated: 2026-07-16
- Supersedes:
  - `specs/096_INITIALIZING_VAULT_GITHUB_PROVISIONING_SPEC.md`
  - `specs/097_EXISTING_REPOSITORY_WORKFLOW_ONBOARDING_SPEC.md`
  - `archive/099_REPOSITORY_REFRESH_QUEUE_SPEC.md`
  - `specs/065_GITHUB_REPOSITORY_PICKER_DISCOVERY_SPEC.md`
  - `specs/068_ADD_VAULT_FAST_REPOSITORY_PICKER_SPEC.md`
- Related docs:
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`

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
and a final compact signature pass. That pass verifies the default branch name and head, every
branch name and head, every open pull request node ID, `updatedAt`, head OID, and latest commit,
plus the raw check-rollup state and aggregate check counts for every observed head. A repository
rename or transfer is accepted only when the stable repository identity still matches. GitHub's
canonical repository name is used for links.

GitHub does not provide a transaction spanning these GraphQL requests. The final signature pass
detects membership, head, pull request metadata, rollup state, and check-cardinality changes during
collection and retries instead of publishing them together. It does not detect an individual check
context detail changing while its head OID, raw rollup state, total count, check-run count, and
status-context count all remain identical. Re-reading every full check payload would approximately
duplicate the most expensive nested data; the accepted contract keeps that limitation explicit.

Every GraphQL connection has a hard limit of 1,000 pages in one generation. Reaching a page beyond
that limit fails the entire generation and leaves the previous complete publication visible. The
limit is a provider-cost and runaway-pagination guardrail, not permission to publish a prefix. One
full generation also stops after 250 GraphQL requests, 500 measured points, or eight minutes. These
generation-wide bounds include pagination, comparison batches, continuations, verification, and the
one smaller-page retry.

The Samebase route identity and current GitHub identity are intentionally separate. A vault keeps
the owner and repository name captured when it connected as its stable Samebase route, so a GitHub
rename or transfer does not silently invalidate bookmarked Samebase URLs. Each complete provider
publication carries GitHub's current canonical owner and name for display and GitHub links. The
directory exposes both identities: Samebase navigation uses the stable connection-time route, while
the visible repository title and external link use the canonical provider identity. Stable GitHub
repository ID uniqueness prevents the renamed repository from being connected as another vault for
the same user.

The vault row names these facts directly: `routeRepositoryKey`, `routeOwner`, and `routeName` are
Samebase navigation identity; `ghRepoId` and `ghRepoNodeId` are stable provider identity; and
`githubOwner` plus `githubName` are the latest verified provider coordinates. Vault and directory
DTOs use `routeRepositoryFullName` and `githubRepositoryFullName`; they do not expose a
context-dependent generic repository-name alias.

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

Checks are an exact compact rollup, not a retained context archive. The collector paginates and
validates every check run and commit status context for each observed head commit before deriving
the row's overall state, total count, typed counts, outcome counts, and primary target URL. Snapshot
rows retain that rollup only. Raw check-run and status-context payloads are not stored as child rows
or copied into the immutable snapshot.

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

Initial connection and confirmed-write observations are required work. A failed required observation
retries automatically after 5, 15, and 45 seconds, then remains explicitly failed until new visible
demand or another write requests it again. Its root records the target write version, the latest
successfully observed write version, and the bounded required-failure count. Vault and account
deletion quiescence never creates replacement observation work.

Repository actions distinguish reads from writes. A pull or an already-existing pull request sends
ordinary demand and does not advance the write version. After GitHub confirms a write, the action
makes up to three bounded requests for required observation. Duplicate successful requests only
advance an internal version and still coalesce into one required crawl. If all three fail, the
action reports that GitHub accepted the change but Samebase could not schedule reconciliation; it
never reports the operation as fully synchronized.

The 60-second client request is a visibility heartbeat, not a promise to crawl GitHub every minute.
After the first successful crawl, ordinary full-inventory eligibility is derived from the last start
time and measured GraphQL cost:

`intervalMs = max(60,000, ceil(measuredCost × 60,000 / 12))`

For a repository whose crawl cost remains stable, this targets at most 12 points per minute, or 720
points per hour, before the account-wide budget applies. Costs 1 through 12 have one-minute
eligibility; 13 points becomes eligible after 65 seconds, 50 after 250 seconds, 100 after 500
seconds, and 500 after 2,500 seconds. The 60-second visibility heartbeat starts the crawl on or
after that eligibility boundary. The measured Samebase crawl costs 13 points, so its ordinary
cadence is 65 seconds. A new vault with no measurement uses the one-minute floor. A repository can
grow between observations, so the GitHub-account lease, reserved estimate, and remaining-point
safety floor are the hard capacity guardrail. Provider cost is persisted immediately after a
complete GitHub collection, before local snapshot staging and filter materialization, so a later
local failure cannot discard the next pacing estimate.

The inventory root also records the latest complete provider request count and collection duration.
These are operational evidence, not scheduling inputs, and are not sent in the browser's freshness
DTO. GraphQL point cost remains the pacing and account-reservation input.

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

The hard safety floor is `max(50, ceil(provider limit × 0.05))` points. A lease cannot start when
its reservation would cross that floor. During a multi-request inventory, the GraphQL client checks
the provider-reported remaining balance after every response and sends no next request when the
balance is at or below the floor. Pagination retries and smaller-page retries cannot bypass this
per-request stop.

A network failure or timeout gets one attempt because its provider cost is unknowable. The one
smaller-page retry is allowed only after a valid current response supplies complete, internally
consistent rate headers above the safety floor. Partial, missing, stale, or contradictory headers
cannot authorize another request. When final usage is unknown, the account reservation is retained
rather than refunded.

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

After a successful observation, each summary is eligible at most once every five minutes. A failed
summary becomes eligible after one minute so a transient provider or local failure does not stay
stale for the full success interval. A demand request prioritizes the selected and first visible
directory rows, accepts at most 25 unique priority IDs, then fills the batch with the oldest
eligible summaries so repositories beyond the loaded page still make progress. Summary and
full-inventory jobs share one Workpool with maximum parallelism three and the same serialized
GitHub-account rate budget. Scheduling a selected full inventory immediately reserves that vault's
summary lifecycle, so the lightweight batch cannot duplicate its GitHub work. A completed full
inventory publishes the matching summary from the same provider observation. If a summary request
has already reached GitHub when selected full work starts, the full crawl takes ownership of the
summary lifecycle and the late summary result is ignored. This race can spend one bounded one-point
summary request, but it cannot schedule a second summary or a second full crawl.

The directory serializes every user-visible state: provisioning, setup failed, connected but not
observed, updating, waiting for GitHub, update failed, repository unavailable, deleting, and
deletion failed. A complete publication remains visible while replacement work runs, waits, or
fails. The UI shows the default branch, checks, pull request count including zero, last checked
time, and the current lifecycle. It never turns a missing or failed summary into an empty healthy
repository.

Vault rows paginate in stable creation order. A page requests at most 25 vault rows, then reads at
most one fixed summary for each connected row plus the fixed directory-revision and authenticated
viewer rows, for a total bound of 52 documents. The browser keeps exactly one reactive subscription
for `{ ownerId, revision }`; directory pages are point-in-time queries cached by owner, revision,
and cursor. The server rejects a page when its requested revision is no longer current. The browser
reloads every previously requested page for a new revision and swaps them together. It retains the
prior rows during a same-owner replacement but never retains or reuses rows after the authenticated
owner changes. The selected repository's full dashboard detail is loaded through its case-folded
repository-key index, not by collecting all vault details.

The older MCP vault-detail aggregate is not a dashboard data source. It fails explicitly above 25
vaults or above 1,000 staged-file rows in one vault, so it cannot reintroduce an unbounded all-vault
read behind the new directory.

A directory page reads one fixed-size revision row, at most 25 vault rows, and at most one
fixed-size summary row for each connected vault on that page. It does not return devcontainer
configuration, tree-refresh state, infrastructure, staging, branch, or pull request data to the
browser. Vault devcontainer configuration is capped at 32,000 characters, and tree, summary, and
selected-inventory failure messages are capped at 4,000 characters so these bounded reads and
subscriptions cannot inherit unbounded text.

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
as `Updated` or `Last complete`. Its value is captured immediately after the complete GitHub request
set returns, before local staging and filter materialization. It is not the visibility-demand time
or local publication-completion time. A changed full inventory and its derived repository summary
share that provider-observation time. Only a successfully committed unchanged observation or
publication advances the visible value; a later local failure leaves the prior `checkedAt` visible.

The persistent model is intentionally small:

- `vaultRepositoryInventories`: one reactive lifecycle and publication root per vault
- `vaultRepositoryInventorySnapshots`: immutable snapshot counts
- `vaultRepositoryInventoryItems`: immutable branch and pull request rows
- `vaultRepositoryInventoryLabelChunks`: bounded, immutable pull request label chunks
- `vaultRepositoryInventoryFilters`: one fixed-size saved pull request filter root per user and
  vault
- `vaultRepositoryInventoryExcludedLabels`: one bounded row per saved label exclusion
- `vaultRepositoryInventoryFilterViews`: immutable, snapshot-scoped filter view totals
- `vaultRepositoryInventoryFilterViewRows`: visible pull request membership for a filter view
- `vaultRepositoryInventoryLabelFacets`: complete per-snapshot pull request label counts
- `vaultRepositorySummaries`: one fixed-size summary lifecycle and publication per connected vault
- `vaultRepositorySummaryDirectoryStates`: one owner-scoped directory revision per user
- `githubGraphqlRateBudgets`: high-churn GitHub-account lease and cooldown state
- `githubObservationActionLeases`: bounded deletion safety for active GitHub observations

Snapshot `_id` is the only snapshot identity. There are no numeric snapshot generation counters,
separate publication rows, separate refresh rows, compatibility readers, or duplicated user
ownership on child rows. Snapshot, item, label-chunk, and excluded-label rows retain `vaultId` only
for indexed vault deletion. The filter root advances an excluded-label cleanup generation on reset
so retired rows can be deleted in fixed-size batches without being visible to current reads.

For the selected repository, the browser keeps one reactive subscription for full-inventory
freshness and one fixed-size subscription for the saved filter root. Snapshot branch, visible pull
request, label, facet, and excluded-label pages are point-in-time queries cached under immutable
snapshot, view, or filter revision identities. They do not create a reactive subscription per page.
The browser validates stable totals, unique keys, deterministic order, contiguous label chunks, and
exact label counts before swapping a replacement generation in one state update. A missing or
invalid snapshot or view is unavailable, never an authoritative empty list. Until the replacement
pair is complete, the prior rows and their matching freshness metadata stay visible.

Every browser pagination loop rejects an empty, repeated, or cyclic nonterminal cursor. Cursor
history is retained when a branch or pull request prefix pauses at the requested depth, so a later
load-more request cannot resume a cursor cycle.

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

The mutable filter root stores only the two booleans, revision, excluded-label generation, and exact
excluded-label count. Each excluded label is one separately indexed row. A checkbox sends one
intent, so a change reads or writes one excluded-label row instead of resending an unbounded array.
Reset atomically advances the generation and restores defaults, then deletes the retired generation
in batches of 100. The browser loads excluded labels in point-in-time pages of at most 25 and swaps
them only after their exact count and order match the reactive root.

The backend derives a snapshot-scoped pull request view from the saved selection without contacting
GitHub. With no excluded labels it evaluates at most 100 fixed-size pull request rows per mutation.
With label exclusions it evaluates at most five pull requests and one bounded label chunk per
candidate per mutation. Candidates with more chunks carry only a fixed-size continuation record to
the next mutation. The existing immutable label chunks are the sole source of pull request labels;
items do not duplicate an unbounded label-key array. The backend records only visible pull request
membership and publishes the view only after the processed count exactly matches the snapshot pull
request count. The published view carries the source snapshot ID, filter revision, and exact visible
and total pull request counts. A filter change or a new snapshot keeps the prior committed dashboard
rows visible until the replacement snapshot and filter view pair is complete.

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

Pull-request and staged-commit entrypoints resolve the current GitHub owner and name from the stable
GraphQL node ID and verify the numeric repository ID before beginning coordinate-only REST work.
Starter seeding carries both stable IDs through the provisioning workflow, performs the same
resolution immediately before its first repository write, and uses the returned canonical
coordinates. That resolution costs one GraphQL point per created repository. These ordinary
multi-request REST operations are not atomic against an external repository rename or transfer
followed by exact former-name reuse while the operation is already running. Removing that narrow
race requires replacing the complete write transaction with ID-addressed GraphQL mutations; a
preflight identity check must not be described as stronger than it is. GitHub repository deletion
has an additional destructive guard: Samebase first renames the exact node-ID repository to a
persisted random tombstone with GraphQL, resolves and verifies both stable IDs again, verifies the
numeric ID through REST, and only then deletes the tombstone coordinate. This explicit deletion
costs two GraphQL points plus the REST verification and delete requests. Missing access, an identity
mismatch, an ambiguous response, or a reused name fails closed. Samebase-managed classification
follows the stable repository identity across a rename or transfer; remote deletion still requires
the user's explicit remove-repository choice and current GitHub permission.

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
user-and-GitHub-ID index first and the case-folded repository-key index second, preserves input
order, and returns only name plus connected status. The normalized connection-time key prevents case
variants from becoming distinct local repositories and remains the stable Samebase route. Later
canonical owner and name observations are display and GitHub-link data. The membership query does
not load vault infrastructure, file staging, or branch data.

## Clean Cutover

Samebase currently has one real operator, so this release uses an explicit no-compatibility reset.
It preserves users and non-GitHub provider connections and credentials. It deliberately removes the
GitHub provider connection because the new connection row requires the stable numeric GitHub account
ID that old rows do not contain. It preserves no vault IDs, vault-scoped product state, old
inventory, branch catalog, check cache, refresh history, or Workpool state. External GitHub
repositories, Convex resources, Cloudflare resources, and Codespaces are not part of the reset.

Their external provider objects remain, but deleting the old vault removes Samebase's vault-scoped
associations to them. Reconnecting creates a new vault and does not reconstruct those associations;
the operator must reattach or recreate the relevant Convex, Cloudflare, domain, and Codespaces
connections afterward.

Before deploying the narrow schema to production, the operator must:

1. Keep the old runtime deployed and delete every current vault through its dashboard removal flow.
   Leave every optional external-resource removal choice unchecked and wait for each deletion to
   complete.
2. Verify `/vault` and the production `vaults` table are empty. Disconnect GitHub through the
   provider UI, verify it is disconnected, verify every non-GitHub provider connection that should
   survive remains connected, then close every production Samebase tab.
3. Verify the retired repository refresh queue and Workpool have no queued, scheduled, or running
   jobs.
4. Clear every row from the retired refresh, branch catalog, branch filter, check snapshot, and
   check item tables while the old schema is still deployed.
5. Independently verify all retired tables are empty.
6. Deploy the narrow snapshot schema and runtime immediately. Reconnect GitHub first so the new row
   records its stable account ID, then reconnect repositories as new vaults.

The executable operator procedure is `docs/github-repository-inventory-cutover.md`.

This is an explicit maintenance cutover. It does not ship migration validators, dual readers,
temporary cleanup functions, the migrations component, or a compatibility deployment. If the
preflight is not empty, deployment stops and the operator investigates instead of widening the new
runtime.

## Non-Goals

- Preserve the old repository refresh queue, request history, cached inventory, or trigger
  vocabulary.
- Preserve existing vaults, vault IDs, or vault-scoped state across the production cutover.
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
- Public pagination collections read at most ten branch or pull request membership rows, five label
  chunks, 25 label facets or exclusions, and 25 directory vault rows. Including fixed ownership and
  publication roots, the authenticated viewer, and pull request dereferences, the total query bounds
  are 13 documents for a branch page, 25 for a pull request page, 9 for a label page, 28 for a
  label-facet or excluded-label page, and 52 for a directory page. Every public pagination endpoint
  rejects `maximumRowsRead` above its collection bound. The browser accepts a generation only when
  every required row, chunk, label, and facet is present.
- Empty, repeated, and cyclic nonterminal cursors fail closed in GitHub collection and browser
  pagination. A GraphQL connection that would exceed 1,000 pages fails the whole generation while
  the prior publication stays visible.
- A full generation fails before sending request 251, after exceeding 500 measured points, or at its
  eight-minute deadline, and leaves the prior complete publication visible.
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
- Costs 1 through 12 remain eligible every 60 seconds. Costs 13, 50, 100, and 500 derive 65-second,
  250-second, 500-second, and 2,500-second eligibility intervals. A heartbeat before the boundary
  creates no snapshot or Workpool job, so lightweight summaries remain eligible. The first heartbeat
  on or after the boundary schedules the full crawl.
- A changed provider crawl persists its measured cost before local staging. Required writes still
  schedule immediately and multiple writes during an active generation still create one trailing
  crawl.
- Publication becomes visible in one atomic root change. Readers never combine rows or labels from
  different snapshots.
- An unchanged crawl advances `checkedAt` without replacing the published snapshot.
- `checkedAt` equals the provider-observation time captured after GitHub collection, not the later
  local publication time. A post-collection local failure leaves the prior visible value unchanged.
- Branch and open pull request signatures are verified again before publication, so equal-count
  membership churn, head changes, pull request metadata changes, and aggregate check-state or count
  changes cannot publish a mixed crawl.
- Initial connection and confirmed-write failures retry after 5, 15, and 45 seconds, then stop
  automatically. Visible demand keeps outstanding required work required. Successful publication
  advances the observed write version and clears the failure count; deletion quiescence schedules no
  replacement work.
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
- The live inventory probe may use an API-key connection. OAuth connection tests must prove that
  OAuth stores the same required account identity and server-side credential shape; inventory then
  uses the shared credential path without auth-method branches.
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
- Directory pages paginate at most 25 vaults and read at most 52 total documents, reject a stale
  revision, retain a same-owner prior generation until the replacement is complete, and never reuse
  a same-numbered revision across authenticated users.
- Visible summary demand accepts at most 25 unique priority vaults, schedules at most 25 eligible
  summaries, and continues fair oldest-first progress for vaults outside the loaded page.
- Scheduling an eligible selected full inventory before summary demand prevents the selected vault
  from entering the lightweight batch. A cost-paced inventory that is not eligible creates no work
  and leaves the lightweight summary available. A full inventory completion publishes its summary
  without a second GitHub request.
- A GitHub account switch receives a new rate budget, while token rotation for the same account
  keeps the existing budget.
- No GraphQL request starts after a response reports remaining points at or below
  `max(50, ceil(provider limit × 0.05))`, including pagination and smaller-page retry requests.
- The production preflight proves the vault table, every retired table, and the retired work queue
  empty, proves GitHub disconnected, and preserves required non-GitHub provider connections before
  the narrow schema is deployed. GitHub reconnects after deployment and before any repository.
