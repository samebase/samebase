# Repository Observation Validation

## Status

- Date: 2026-07-16
- Contract under test: `specs/114_GITHUB_REPOSITORY_INVENTORY_SPEC.md`
- Environment: clean worktree-local anonymous Convex deployment, local Samebase app, existing GitHub
  API-key connection

This note records measured evidence. The accepted behavior remains in the spec.

## Provider measurements

| Repository                                | Branches | Open PRs | Requests | GraphQL points | Collection time |
| ----------------------------------------- | -------: | -------: | -------: | -------------: | --------------: |
| `samebase/samebase`                       |      137 |       98 |       10 |             13 |        18.687 s |
| `nicu-chiciuc/meteor-import-issue`        |        2 |        1 |        5 |              7 |         2.317 s |
| `nicu-chiciuc/tmp-c3d0-observation-probe` |        1 |        0 |        4 |              6 |         1.597 s |

The Samebase crawl includes two pull request comparison batches, final compact branch and pull
request signature passes, and all required label and check continuations. The final signatures add
one point compared with the earlier identity-only verification. At 13 points, ordinary Samebase
inventory eligibility is 65 seconds under the accepted 12-points-per-minute pacing formula.

Each fresh connection produced one inventory root and one ready snapshot. Connection completion did
not start a duplicate full crawl after an earlier visibility request had already published or was in
flight.

The live crawls used an API-key connection, as allowed for local development. OAuth callback tests
verify that OAuth stores the same required numeric GitHub account ID and server-side credential
shape. The inventory and summary actions read only `auth.credential` after validating the GitHub
connection kind, so there is no auth-method-specific collection branch.

## Real UI matrix

The same live test passed in Chromium desktop and mobile against the real local routes. It proved:

- `/vault` and the selected-vault sidebar render the same three repository summaries;
- exact zero, one, and 98 open pull request counts;
- default branch name, head, checks, and checked time;
- default filtering from 98 total pull requests to 53 non-drafts;
- persistent exclusion of `research`, reducing the visible set from 53 to 50;
- draft inclusion and bounded pagination to pull request 1199;
- pull request 883 as `↑1 ↓0 vs main · +38 −21 · 2 files`;
- pull request 1199 as
  `↑1 ↓0 vs codex-remove-dead-workspace-layout-experiments · +54 −2,178 · 27 files`;
- branch `ssr` as one commit ahead and zero behind `main`.

The mobile filter surface is intentionally modal and locks page scroll. The live test closes that
sheet before advancing the virtualized list; desktop closes the corresponding popover by toggling
its Filters button. Product pagination itself required no exception.

## FileView route probe

Before a direct `meteor-import-issue/fs/master` visit, the inventory had last started
at 1784189521016. Opening the real FileView route advanced `lastStartedAt` to 1784191820275 and
`checkedAt` to 1784191822536; the five-request, seven-point unchanged crawl took 2.243 seconds. The
rendered file header used the published branch context and showed head `55bec04` plus `No checks`.

A one-tab SPA round trip from FileView to the repository dashboard and back before the next
eligibility boundary left `lastStartedAt` unchanged and only extended visible demand. The execution
window contained one `runRepositoryInventoryRefresh` action and no standalone checks action. In
code, FileView reads `getRepositoryInventoryBranchContext` for the head and checks, so it has no
second REST checks polling loop. The shared demand-hook test separately proves immediate visible
demand, the 60-second heartbeat, hidden-tab suspension, and cleanup on unmount.

## Convex and browser shape

The published Samebase generation retains these useful derived rows:

- 1 inventory root;
- 1 ready snapshot;
- 235 immutable items, consisting of 137 branches and 98 open pull requests;
- 17 bounded label chunks and 3 label facets;
- 1 fixed-size filter root, 1 complete filter view, and 53 visible memberships;
- 1 fixed-size repository summary.

That is 313 current rows, with no retained raw check-context archive or refresh history. Their raw
JSON encoding totaled 259,486 bytes: 233,444 bytes were immutable branch and pull request items,
18,006 bytes were visible memberships, and the other eight fixed or bounded groups totaled 8,036
bytes. The largest observed pull request, branch, and membership documents were 1,395, 994, and 339
JSON bytes respectively.

Local Convex function-completion records provide execution-level usage even though the aggregate
Insights command is cloud-only. For the measured changed Samebase generation:

- the inventory action call tree ran 24 functions, read 69 documents and 33,225 database bytes,
  wrote 396,084 database bytes, and received 74,454 network-egress bytes from GitHub;
- the user demand mutation and one local filter-materialization mutation raised the core path total
  to 194 documents and 176,877 bytes read plus 431,947 database bytes written;
- materializing the default filter alone read 111 documents and 137,784 bytes and wrote 32,432
  bytes;
- retiring the previous generation ran eight cleanup batches and read 636 documents and 547,431
  bytes. Each cleanup transaction remains capped at 100 rows.

The same records measured the selected browser load after publication. Five reactive state results,
one ten-row branch page, two ten-row pull request pages, one facet page, and 19 label-page results
returned 34,795 bytes before transport framing. The branch page read 13 documents and returned 7,310
bytes. Each pull request page read 25 documents; together they returned 20,437 bytes. The facet page
read six documents and returned 492 bytes. The 19 label queries, most for zero-label pull requests,
read 80 documents and returned 5,039 bytes. A two-vault directory page read six documents and
returned 1,258 bytes.

The server caps pagination collections at 10 branch or pull request memberships, 5 label chunks, 25
filter facets or exclusions, and 25 vaults. Including authenticated-viewer and fixed-root reads, the
total query bounds are 13 documents for a branch page, 25 for a pull request page, 9 for a label
page, 28 for a facet or exclusion page, and 52 for a full directory page. The selected dashboard
adds three fixed reactive roots for directory revision, selected inventory publication, and filter
revision. Immutable pages are point-in-time queries; there is no subscription per row or loaded
page. A publication-root change invalidates only the selected inventory, while a directory revision
reloads only the already requested directory depth.

## Failure and cost boundaries

- One generation permits at most 250 requests, 500 measured points, and eight minutes.
- Every GraphQL connection permits at most 1,000 pages.
- Required initial or confirmed-write observations retry after 5, 15, and 45 seconds, then stop
  automatically while preserving explicit failure debt for later visible demand.
- Vault and account deletion quiescence schedules no replacement work.
- Read-only pull and existing-PR discovery use ordinary demand and do not advance the write version.
- A confirmed GitHub write is not reported as fully synchronized if three bounded requests cannot
  record its required observation.
- Final provider signatures reject branch head, pull request update/head, and aggregate check-state
  or count changes before publication. GitHub has no multi-query transaction; an individual check
  detail change with identical head, rollup state, and aggregate counts remains the explicit narrow
  limitation.

## Temporary mutation probe

The temporary repository has numeric GitHub ID `1302515589`. Pull request 1 was created at 08:18:26Z
while `samebase/samebase` remained selected. Without selecting or reloading the temporary vault, its
summary changed from zero to one open pull request at 08:23:03.086Z, 277 seconds after the GitHub
write and inside the five-minute nonselected pacing boundary. The selected-vault crawl then rendered
pull request 1 as `↑1 ↓0 vs main · +1 −0 · 1 file`.

GitHub closed the pull request at 08:26:52Z. A replacement snapshot containing two branches and zero
open pull requests was observed at 08:27:28.926Z and published at 08:27:28.961Z, about 37 seconds
later. The next live view showed zero pull requests and no pull request row while retaining the
former head as an ordinary standalone branch. Neither transition used the browser reload control or
a manual refresh action.

Cleanup used the dashboard deletion flow with external repository removal unavailable and unchecked.
The deletion workflow succeeded, the vault disappeared from `/vault`, and no temporary inventory
root, summary, or snapshot remained. A second GitHub identity check still returned numeric ID
`1302515589`; only then was that exact repository deleted. A final GitHub read returned HTTP 404.
