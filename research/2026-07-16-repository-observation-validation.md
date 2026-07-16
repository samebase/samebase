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

## Convex and browser shape

The published Samebase generation retains these useful derived rows:

- 1 inventory root;
- 1 ready snapshot;
- 235 immutable items, consisting of 137 branches and 98 open pull requests;
- 17 bounded label chunks and 3 label facets;
- 1 fixed-size filter root, 1 complete filter view, and 53 visible memberships;
- 1 fixed-size repository summary.

That is 313 current rows, with no retained raw check-context archive or refresh history. The first
stored ten-row item page was 11,688 JSON bytes before the public query removed storage-only fields;
its largest stored row was 1,272 bytes. All three stored summary roots together were 1,555 JSON
bytes, with a largest row of 526 bytes.

The server caps item pages at 10 rows, label pages at 5 chunks, filter facets and exclusions at 25
rows, and directory pages at 25 vaults. The browser keeps fixed reactive roots and loads immutable
pages as point-in-time queries; it does not subscribe once per row or loaded page.

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
