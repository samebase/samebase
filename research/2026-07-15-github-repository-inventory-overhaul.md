# GitHub Repository Inventory Overhaul

## Question

Why did `/vault/<org>/<repo>` often show stale or incomplete pull request data until a user clicked
reload, and what is the smallest reliable design that works with the existing GitHub API-key and
OAuth connections?

## Production and Live Findings

The previous dashboard path mixed browser triggers, a durable refresh queue, repository metadata
staleness windows, and a full-repository REST crawl. On `samebase/samebase`, a manual refresh took
24.443 seconds and made approximately 549 REST requests across roughly 136 branches before a newly
created pull request appeared. Reopening the dashboard did not reliably make that pull request
visible first.

A draft probe pull request,
[samebase/samebase#1228](https://github.com/samebase/samebase/pull/1228), was then used against the
replacement collector. The first complete GraphQL snapshot showed the pull request without a browser
reload or manual action. Closing it removed it on the next normal poll, and reopening it restored it
on the next normal poll.

After validation, the probe was closed and its temporary branch was deleted. Its proven inactive
Cloudflare Worker preview version and exact Convex preview deployment were also deleted.

The probe inventory contained:

- 138 branches
- 99 open pull requests
- 237 visible rows because a branch remains visible when it also has a pull request
- complete labels split into 17 bounded storage chunks

The final strict-schema validation run reflected intervening GitHub changes: 137 branches, 98 open
pull requests, 235 visible rows, and 17 label chunks. It used 9 GraphQL primary-rate-limit points
and completed in 11.235 seconds. Across the live probes, complete crawls used 9 to 12 points and
took 11.235 to 13.951 seconds. An unchanged crawl began exactly 60 seconds after the preceding crawl
began, advanced the completed check time, and did not rewrite the active snapshot.

A fresh local reconnect kept inventory demand off until the vault became usable, retained the last
complete rows while the account rate coordinator showed `Update queued`, and returned to `Updated`
after the queued snapshot completed. The clean validation tab recorded no console errors and no
manual refresh control.

The production database still contains retired-state rows that block an immediate narrow schema
deploy:

- 4,366 `repositoryRefreshRequests`
- 0 `vaultBranchFilters`
- 148 `vaultRemoteBranches`
- 159 `githubCommitCheckSnapshots`
- 750 `githubCommitCheckItems`

Those 5,423 rows must be cleared during a maintenance window while the old schema is still live,
then independently verified empty before the narrow schema is deployed.

The refresh-request audit found no active work: 4,285 requests were `succeeded`, 81 were `failed`,
and none were `queued`, `scheduled`, or `running`.

## External Guidance

GitHub recommends webhooks over polling when an integration can install them, but also recommends
consolidated GraphQL queries when polling is necessary. GitHub's GraphQL guidance requires cursor
pagination, recommends smaller pages and split queries for resource-heavy data, and reports both
primary and secondary rate-limit state in the response. Requests should be serialized for a shared
rate-limit principal, and an integration must stop during a reported cooldown.

Relevant primary sources:

- [GitHub GraphQL rate and query limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
- [GitHub GraphQL pagination](https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api)
- [GitHub API best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
- [GitHub App best practices](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app)
- [GitHub repository events polling behavior](https://docs.github.com/en/rest/activity/events)

The repository events endpoint is not a correctness boundary for this feature. GitHub documents that
event delivery can lag from 30 seconds to 6 hours and that the endpoint contains a bounded history.
It can be a hint, but it cannot prove that the dashboard contains every current branch, open pull
request, label, or check.

## Chosen Algorithm

1. Poll only the selected, visible vault.
2. Request a crawl immediately on mount or visibility resume, then every 60 seconds from the prior
   crawl start time.
3. Serialize crawls by stable GitHub account ID, not by token or mutable Samebase connection row.
4. Crawl every branch and every open pull request through stable, cursor-paginated GraphQL
   connections.
5. Fetch the latest head commit, every check/status context, and every pull request label.
6. Use stable ascending page order. If GitHub reports a resource or timeout error, retry with a
   smaller page.
7. Validate repository identity, page counts, cursors, duplicates, and required nested data.
8. Stage immutable rows under a new snapshot ID. Publish the snapshot only after the complete crawl
   succeeds and its item and label counts match.
9. Keep the preceding snapshot visible while the next snapshot is collected and loaded by the
   browser. Display freshness and canonical identity from the same committed snapshot as its rows.
10. Fingerprint provider data. An unchanged crawl advances the completed-check time without
    rewriting rows.
11. Let ordinary visible demand expire without a trailing crawl. Preserve one required trailing
    crawl only when a confirmed GitHub write occurs after the active crawl starts.
12. Keep file trees separate and branch-scoped. Opening or focusing FileView may fetch that exact
    branch tree, but it must not rediscover the repository.

## Deliberate Deletions

The target has no manual dashboard reload, focus fan-out, all-vault polling, branch filters,
repository-wide REST metadata crawl, persistent REST check cache, or legacy refresh queue.
Post-write follow-up refreshes request the repository inventory and fetch only affected branch
trees.

This is not a compatibility layer over the old implementation. Inventory and refresh rows are
derived cache and can be deleted before Convex accepts the narrow target schema.

## Rollout

This is a single maintenance cutover, not a compatibility rollout. Close production Samebase tabs,
verify the retired queue and Workpool have no queued, scheduled, or running jobs, clear the five
retired cache tables under the old schema, and independently verify that all five are empty. Then
deploy the narrow snapshot schema immediately. Preserve vaults and provider credentials. Do not ship
dual readers, temporary validators, cleanup functions, or the migrations component. The exact
production commands live in `docs/github-repository-inventory-cutover.md`.

## Conclusion

The failure was not a missing browser focus event. It was an expensive, multi-owner REST system
whose successful completion was unclear and whose cached branch catalog could remain stale. The
replacement is one complete, atomic, rate-aware GraphQL inventory plus a separate exact-branch tree
cache.
