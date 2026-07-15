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
replacement collector. The first complete GraphQL generation showed the pull request without a
browser reload or manual action. Closing it removed it on the next normal poll, and reopening it
restored it on the next normal poll.

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
began, advanced the completed check time, and did not rewrite the active generation.

A fresh local reconnect kept inventory demand off until the vault became usable, retained the last
complete rows while the account rate coordinator showed `Update queued`, and returned to `Updated`
after the queued generation completed. The clean validation tab recorded no console errors and no
manual refresh control.

The production database still contains retired-state rows that block an immediate narrow schema
deploy:

- 4,366 `repositoryRefreshRequests`
- 0 `vaultBranchFilters`
- 148 `vaultRemoteBranches`
- 159 `githubCommitCheckSnapshots`
- 750 `githubCommitCheckItems`

Those 5,423 rows need a bounded cleanup between a deploy that retains their validators and a second
deploy that removes the tables.

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
8. Stage immutable rows under a new generation. Publish the generation only after the complete crawl
   succeeds.
9. Keep the preceding generation visible while the next generation is collected and while its first
   UI page catches up. Display its matching freshness and canonical identity with those rows.
10. Fingerprint provider data. An unchanged crawl advances the completed-check time without
    rewriting rows.
11. Preserve one trailing demand while a crawl is active so an update request is never silently
    lost.
12. Keep file trees separate and branch-scoped. Opening or focusing FileView may fetch that exact
    branch tree, but it must not rediscover the repository.

## Deliberate Deletions

The target has no manual dashboard reload, focus fan-out, all-vault polling, branch filters,
repository-wide REST metadata crawl, persistent REST check cache, or legacy refresh queue.
Post-write follow-up refreshes request the repository inventory and fetch only affected branch
trees.

This is not a compatibility layer over the old implementation. The only temporary old schema is a
deployment constraint: production data must be deleted before Convex can accept the narrow target
schema.

## Rollout

Deploy one ships the new runtime, stops every old writer and reader, retains exact legacy validators
and the old Workpool component state only so pending jobs can be canceled, and exposes bounded,
resumable cleanup migrations. A temporary coordination row persists the time of the first
`cancelAll`, so cleanup also waits 15 minutes for an already-running job whose old request row was
deleted. After cleanup reports no remaining rows and removes that coordination row, deploy two
removes the legacy tables, the retired Workpool registration, and the migration component.

### Deploy-one cleanup runbook

Run this only after deploy one is live. First cancel the retired Workpool and move its requests to a
terminal state:

```bash
cd apps/samebase
CONVEX_DEPLOY_KEY= npx convex run --prod legacyRepositoryInventoryCleanup:quiesce
```

Repeat while it returns `needs_more`. If it returns `waiting`, rerun at or after its exact
`waitUntil`. The first cancellation always starts a persisted 15-minute grace, even when no active
request row exists, because an old vault deletion could have removed a row while its Workpool action
continued. When it returns `done`, confirm that no legacy refresh request is active and the grace is
complete:

```bash
cd apps/samebase
CONVEX_DEPLOY_KEY= npx convex run --prod legacyRepositoryInventoryCleanup:preflight
```

The command must return `safeToDelete: true`, `graceComplete: true`, and `false` for `queued`,
`scheduled`, and `running`. The migration runner also rejects a missing grace or any active request,
so later table migrations cannot start while retired repository work may still be live.

The migrations component logs example documents during a dry run. Validate rollback only against
synthetic local data so repository names, branch names, pull request titles, URLs, and lifecycle
messages do not enter production logs:

```bash
cd apps/samebase
npx convex run --deployment local legacyRepositoryInventoryCleanup:deleteRepositoryRefreshRequests '{"dryRun":true}'
```

The focused Convex tests seed every legacy table for the ordered cleanup and separately verify
dry-run rollback against synthetic data. After they pass, start or resume the five production
migrations in their declared order:

```bash
cd apps/samebase
CONVEX_DEPLOY_KEY= npx convex run --prod legacyRepositoryInventoryCleanup:run
```

Watch the component until all five `legacyRepositoryInventoryCleanup:*` migrations report
`state: "success"` and `isDone: true`:

```bash
cd apps/samebase
CONVEX_DEPLOY_KEY= npx convex run --prod --component migrations lib:getStatus --watch
```

Stop the watch, then verify the five app tables independently:

```bash
cd apps/samebase
CONVEX_DEPLOY_KEY= npx convex run --prod legacyRepositoryInventoryCleanup:verify
```

The final command must return `complete: true` and `false` for every field in `remaining`. Rerunning
the ordered migration is safe and resumes failed work or skips completed work. Then remove the
temporary grace marker:

```bash
cd apps/samebase
CONVEX_DEPLOY_KEY= npx convex run --prod legacyRepositoryInventoryCleanup:finalize
```

Deploy two may remove the five legacy table definitions, the now-empty coordination table, this
migration module, and the temporary components only after component status and independent
verification pass and `finalize` succeeds.

## Conclusion

The failure was not a missing browser focus event. It was an expensive, multi-owner REST system
whose successful completion was unclear and whose cached branch catalog could remain stale. The
replacement is one complete, atomic, rate-aware GraphQL inventory plus a separate exact-branch tree
cache.
