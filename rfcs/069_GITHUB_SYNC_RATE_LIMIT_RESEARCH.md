# 069 GitHub Sync Rate Limit Research

## Document Control

- Status: Research note
- Owner: Noter frontend/backend sync flows
- Last updated: 2026-03-25
- Depends on:
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/VaultDashboard.tsx`
  - `apps/noter/src/components/VaultSyncStatus.tsx`
  - `apps/noter/src/components/CommitStatus.tsx`
  - `apps/noter/convex/github.ts`
  - `apps/noter/convex/githubChecks.ts`
  - `apps/noter/convex/fileStagingActions.ts`
  - `apps/noter/convex/vault.ts`

## Summary

Noter's current GitHub sync traffic is vulnerable to request fanout across open
tabs, views, and branches. The biggest issue is not one hot loop in isolation.
It is that several independent UI surfaces can all trigger GitHub-backed refresh
work, and the app does not currently treat sync failure or rate limiting as a
shared per-user/per-repo cooldown state.

As a result:

- multiple open views can multiply expensive GitHub refreshes
- multiple connected repositories can also multiply dashboard-triggered
  refreshes
- branch-specific refreshes can bypass the shared backend tree-refresh lock
- sync failure often leads to another attempt on the next focus or visibility
  event
- the visible sync strip cannot show `failed`, `rate_limited`, or `cooldown`
  states, so the user sees either `Syncing...` or stale success metadata

This note captures the current behavior and the smallest credible direction for
stabilizing it.

## Research Questions

1. Which GitHub API limits are most relevant to Noter's current behavior?
2. Which Noter surfaces trigger GitHub-backed work automatically?
3. Does the sync strip itself keep retrying, or do retries come from other
   layers?
4. Why can the UI feel stuck in syncing or repeated failure?
5. What shared state is missing to degrade cleanly during rate limiting?

## GitHub Docs Research

### Primary rate limit

GitHub's current REST API docs say authenticated user traffic generally gets
`5,000` requests per hour per user.

Source:

- [GitHub Docs: Rate limits for the REST API](https://docs.github.com/en/enterprise-cloud@latest/rest/using-the-rest-api/rate-limits-for-the-rest-api)

### Secondary rate limits

For Noter, the more important limits are the secondary limits. GitHub currently
documents these relevant constraints:

- no more than `100` concurrent requests across REST and GraphQL
- no more than `900` REST points per minute
- most REST `GET` requests cost `1` point
- if rate limited, integrations should stop and wait for `retry-after` or
  `x-ratelimit-reset`
- if neither header provides a wait duration for a secondary limit, GitHub says
  to wait at least one minute and then use exponential backoff

Sources:

- [GitHub Docs: Rate limits for the REST API](https://docs.github.com/en/enterprise-cloud@latest/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [GitHub Docs: Best practices for using the REST API](https://docs.github.com/en/enterprise-cloud@latest/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
- [GitHub Docs: Troubleshooting the REST API](https://docs.github.com/en/enterprise-server@3.19/rest/using-the-rest-api/troubleshooting-the-rest-api)

### Guidance that maps directly to Noter

GitHub's best-practices guidance aligns closely with the failure mode seen in
Noter:

- avoid polling
- avoid concurrent requests
- stop on rate limit responses instead of continuing to hammer the API
- use conditional requests when appropriate instead of unconditional `GET`s

For Noter, the important implication is that even if the hourly `5,000` request
limit is not exhausted, the current app shape can still hit secondary limits
through concurrent repo refreshes and bursts of `GET` traffic.

GitHub also exposes `GET /rate_limit`, but its docs explicitly say to prefer
response headers over polling that endpoint because it can still count against
secondary limits. That makes it a poor candidate for a tight feedback loop in
Noter.

## Current Noter Refresh Surfaces

### 1. File view auto-refresh

`apps/noter/src/components/FileView.tsx` triggers repository refresh on:

- page load
- window focus
- visibility change to visible

Each refresh currently asks for:

- branch metadata refresh
- ahead/behind data
- pull request link refresh

This is debounced only by an in-memory frontend map in
`apps/noter/src/lib/treeRefreshDebounce.ts`.

### 2. Dashboard auto-refresh

`apps/noter/src/components/VaultDashboard.tsx` also refreshes ready vaults on:

- page load
- window focus
- visibility change to visible

This creates a second independent refresh source even when an individual file
view is already open for the same repository.

It also compounds as the user connects more repositories. On dashboard load,
every ready vault becomes eligible for refresh work, and the dashboard batches
those requests with `DASHBOARD_REFRESH_CONCURRENCY = 3`.

That means the current operator workflow of connecting multiple repositories is
not just a per-repo problem. Opening the dashboard can create a burst of
parallel repo refreshes across distinct repositories, each of which may itself
perform expensive repo-wide GitHub metadata sync.

### 3. Commit/check status polling

`apps/noter/src/components/CommitStatus.tsx` performs its own GitHub-backed
status fetches. Each fetch hits:

- checks for ref
- combined status for ref

This flow has its own retry and polling behavior, separate from tree refresh.

### 4. File content reads and project file hydration

Other GitHub-backed reads can happen through:

- `fileStagingActions.getFileForEditing`
- `fileStagingActions.batchReadFiles`
- `github.getRepositoryFileContent`

These are smaller than full tree refreshes, but they still matter once a user is
already rate limited.

## Why A Single Refresh Is Expensive

`apps/noter/convex/github.ts` currently performs repo-wide work during refresh.

Even when a specific branch is requested, `updateRepositoryTree` still does a
repo-wide remote branch sync first:

- `repos.get`
- paginated `repos.listBranches`
- per-branch `compareCommitsWithBasehead` when ahead/behind is requested
- per-head `git.getCommit` for commit timestamps
- open pull request listing when PR links are requested
- then `git.getTree`
- then `repos.listCommits` for the target branch

This means one branch view can still trigger work proportional to the whole
repository, not just the active branch.

## Retry And Failure Behavior Research

### The sync strip is not the retry loop

`apps/noter/src/components/VaultSyncStatus.tsx` is passive. It only knows:

- `treeRefreshStartedAt`
- `lastTreeRefreshAt`

It can render:

- `Syncing...`
- commit/check state
- commit SHA
- relative last-refresh time

It cannot render:

- last sync failed
- rate limited
- cooling down until
- stale cached metadata because refresh is paused

So the visible strip is not causing retries. It is simply too limited to show
them honestly.

### Tree refresh does not self-retry on a timer

The repository tree refresh action does not contain an internal timer-based
retry loop. Instead, retries are effectively event-driven:

- page load
- focus
- visibility regain
- repeated mounts across tabs and views

That still produces repeated attempts in practice, especially when the operator
switches between tabs or keeps multiple repository views open.

### Failure currently clears the client debounce

In both `FileView.tsx` and `VaultDashboard.tsx`, a failed refresh calls
`releaseRefreshDebounce(...)` on the client debounce map.

That means the app does not enter a failure cooldown after an error. It simply
becomes eligible to retry again on the next triggering browser event.

### Shared backend locking is incomplete

The default repository refresh path uses `internal.vault.claimTreeRefresh`, but
branch-specific refreshes currently bypass that backend claim path.

This is a major reason multiple branch views can still fan out GitHub work.

### Branch refresh still performs repo-wide work

The branch-specific path bypasses the shared backend lock, but still runs the
same repo-wide remote-branch sync described above.

That combination is the highest-value fix target in the current code.

### Commit status has local backoff, not shared backoff

`CommitStatus.tsx` has its own local retry logic:

- retries empty check/status results with an increasing delay sequence
- polls every 30 seconds while checks are running
- retries after rate-limit responses based on `retry-after` or reset headers

This is better than no backoff, but it is still local to each component
instance. Multiple mounted commit-status badges do not share a cooldown.

### Batch file reads have partial server-side cooldown

`fileStagingActions.batchReadFiles` has a process-local user cooldown map and
will stop uncached blob reads once it detects rate limiting.

That is useful, but it does not protect:

- repo tree refresh
- commit status fetches
- all other GitHub-backed actions

It also is not persisted in Convex, so it is not a durable shared state model.

### Manual pull can over-report success

`fileStagingActions.pullFromGitHub` always releases the tree refresh lock
through `releaseTreeRefresh` without explicitly marking failure when the pull
throws.

That means a failed manual pull can still update `lastTreeRefreshAt` as if the
refresh succeeded. This can make the sync strip look healthier than reality.

## Key Findings

1. The biggest issue is not that one component retries too aggressively by
   itself. The bigger issue is that retries are fragmented across several
   independent surfaces.
2. `VaultSyncStatus` is too minimal to communicate failure. It should not stay a
   pure `startedAt / lastSuccessAt` view.
3. Branch-specific refresh is currently the most important correctness and load
   bug because it bypasses the shared backend lock but still performs repo-wide
   refresh work.
4. GitHub secondary limits are a better fit for the observed production failure
   than the hourly primary limit alone.
5. Noter currently has no shared per-user/per-repo sync cooldown state for:
   - generic sync failure
   - GitHub rate limiting
   - backoff after repeated errors
6. The UI can therefore oscillate between:
   - `Syncing...`
   - stale cached success metadata
   - silent repeated re-attempts on the next browser event
7. Partial rate-limit handling exists, but it is not centralized. Each feature
   handles its own errors differently.
8. Per-repo backoff alone may not be sufficient once a user has many connected
   repositories. The dashboard can create a cross-repo burst even if each
   individual repository is internally deduplicated.

## Recommended Direction

### 1. Introduce shared repo sync state in Convex

Treat repository sync as a shared backend state machine instead of a fire-and-
forget action per tab.

Minimum useful fields per user/repo, or per user/vault plus branch when truly
needed:

- `syncStatus: "idle" | "syncing" | "cooldown" | "failed"`
- `lastSyncAttemptAt`
- `lastSyncSucceededAt`
- `lastSyncFailedAt`
- `lastSyncError`
- `cooldownUntil`
- `rateLimitResetAt`
- `lastSyncSource`

The exact table shape is still open, but the important part is that this state
must be shared across views and readable by the UI.

### 2. Make all auto-refresh entrypoints consult the same cooldown

When the repo is in cooldown:

- page-load refresh should skip
- focus refresh should skip
- visibility refresh should skip
- branch views should skip
- dashboard refresh should skip

Manual refresh can still be allowed as an explicit override, but it should not
silently become another background loop.

In addition, the dashboard likely needs a per-user global budget for automatic
GitHub refreshes so opening a workspace with many repositories does not start
too many repo refreshes at once.

### 3. Put branch refresh behind the same backend claim path

Branch-specific refresh should not bypass the shared backend lock.

Even if branch data stays separately cached, the claim/cooldown decision should
be shared at the repository level unless there is a strong product reason to
split it.

### 4. Split lightweight branch refresh from expensive repo-wide metadata sync

The current refresh path conflates:

- branch tree update
- remote branch inventory refresh
- ahead/behind refresh
- pull request metadata refresh
- Cloudflare preview comment refresh

These should not all run on every branch view refresh.

The most plausible direction is:

- a cheap branch-tree refresh for active file views
- a slower repo-metadata refresh on explicit request or on a much longer shared
  cadence

### 5. Make `VaultSyncStatus` failure-aware

The sync strip should be able to render at least:

- `Syncing...`
- `Up to date · 18s ago`
- `Sync paused · GitHub rate limited`
- `Retrying after 14:32`
- `Last sync failed · showing cached state`

This is important both for operator trust and for reducing unnecessary manual
retries.

### 6. Unify GitHub cooldown handling across features

Rate-limit and retry policy should not live separately in:

- tree refresh
- commit status
- batch file reads

Those features can have different freshness goals, but they should share the
same repository cooldown budget so one failing surface does not keep another one
hammering GitHub.

### 7. Prefer cached Convex metadata over immediate GitHub re-fetch

When GitHub is rate limited or cooling down, the UI should continue rendering
the latest known Convex-cached metadata rather than surfacing raw action errors
as if the data is gone.

## Short-Term Containment Ideas

These are containment ideas, not the final design:

1. Stop clearing the client debounce immediately after refresh failure.
2. Add a temporary shared server-side cooldown for tree refresh failures and
   rate-limit responses.
3. Disable auto-refresh on focus and visibility while the repo is cooling down.
4. Stop branch-specific refreshes from doing full ahead/behind and PR refresh by
   default.
5. Ensure failed manual pull does not advance `lastTreeRefreshAt`.
6. Cap dashboard auto-refresh more aggressively, or temporarily disable
   dashboard-wide page-load refresh while the user has many connected
   repositories.

## Open Questions

1. Should cooldown be keyed by user + repository, or user + vault, given that
   multiple vault rows can still reference the same upstream repo?
2. Should commit status participate in the exact same cooldown as tree refresh,
   or should it have a narrower sub-budget inside a shared repo budget?
3. Which repo metadata must stay near-real-time, and which metadata can be
   intentionally stale for a few minutes without harming UX?
4. Is there a pragmatic conditional-request path worth adding first for PR or
   branch metadata, or is reducing refresh fanout the higher-value first move?
5. Does the final design need both:
   - a per-user global automatic-refresh budget
   - a per-user/per-repo cooldown to handle the dashboard multi-repo case
     cleanly?

## Recommendation

Treat this as a shared sync-state and retry-policy problem, not as a cosmetic
`VaultSyncStatus` tweak.

The sync strip should become failure-aware, but the real fix is to centralize
repo refresh ownership, cooldown, and backoff in Convex so all open tabs and
views obey one shared policy.
