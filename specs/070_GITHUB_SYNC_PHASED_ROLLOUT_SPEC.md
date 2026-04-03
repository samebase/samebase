# GitHub Sync Phased Rollout Specification

## Document Control

- Status: Accepted phased rollout plan
- Owner: Noter backend/frontend sync flows
- Last updated: 2026-03-27
- Related research: none retained in-repo; Phase 1 scope shipped in `#347`

## Summary

Noter currently fans out GitHub-backed refresh work across open tabs, branch
views, and dashboard repository cards. Because GitHub requests are made with
each user's own GitHub credential, the external rate-limit budget is primarily
shared within that user account, not across all noter.md users.

This rollout plan is designed to:

1. stop runaway retries and bad sync states quickly
2. reduce normal background GitHub traffic without a full rewrite
3. move automatic sync toward a bounded backend-owned service
4. deploy in small phases with clear monitoring gates

## Goals

- Reduce automatic GitHub refresh traffic
- Deduplicate or suppress repeated refreshes across open views
- Back off cleanly after GitHub rate-limit or sync failures
- Show truthful sync state instead of lingering `Syncing...`
- Prefer Convex-cached metadata when refresh is paused or failing
- Roll out incrementally with measurable production checks

## Non-Goals

- Rebuild all GitHub integration flows in one patch
- Introduce Workpool in Phase 1
- Make every GitHub-backed feature share one queue immediately
- Eliminate all stale metadata in the first rollout

## Rate-Limit Model

Noter currently stores GitHub credentials per user and creates Octokit clients
from the connected user's GitHub credential. For the current OAuth/user-token
model, the primary GitHub REST rate limit is therefore primarily user-scoped.

Implementation consequence:

- each user's tabs, repositories, and branch views share that user's GitHub
  budget
- per-user global auto-refresh budgeting matters
- per-user/per-repo cooldown and deduplication still matter because one
  repository can create a large fanout inside that shared user budget

## Rollout Phases

### Phase 1: Containment and Truthful Sync State

Ship first. This is the smallest patch intended to stop the current production
failure mode.

Scope:

- add shared repo-level sync failure and cooldown state in Convex
- make repo tree refresh consult shared cooldown before retrying
- route branch refresh through the same backend refresh claim path as default
  branch refresh
- stop failed refresh from clearing the frontend debounce immediately
- make the sync strip show failed or rate-limited states instead of only
  `Syncing...`
- ensure failed pull/sync operations do not advance `lastTreeRefreshAt`

Explicitly out of scope:

- full refresh-queue orchestration
- commit/check polling unification
- splitting expensive repo metadata refresh from lightweight branch refresh
- Workpool adoption

Deploy gate:

- auto-refresh no longer re-attempts immediately after repeated failure
- branch views no longer bypass shared repo refresh claiming
- UI no longer stays indefinitely in a misleading sync state

### Phase 2: Traffic Reduction

Scope:

- separate cheap active-branch tree refresh from expensive repo-wide metadata
  sync
- reduce focus and visibility refresh pressure
- use cached Convex metadata more aggressively
- bring commit/check fetch behavior under shared cooldown policy

Deploy gate:

- opening multiple branch views or toggling focus repeatedly does not multiply
  GitHub traffic linearly

### Phase 3: Bounded Background Execution

Scope:

- move automatic refresh work behind a backend-owned execution layer
- bound concurrency for auto-refresh work
- preserve durable completion state for background refresh jobs

Convex Workpool becomes a candidate here, not before.

Deploy gate:

- dashboard-wide multi-repo loads no longer create uncontrolled refresh bursts

### Phase 4: Prioritization and Hardening

Scope:

- add per-user global auto-refresh budget across all connected repositories
- prioritize visible or active repo work over low-priority dashboard refreshes
- add targeted conditional requests where endpoint support is useful
- refine monitoring and operator tooling around cooldown and backlog state

Deploy gate:

- heavy multi-repo sessions remain stable under sustained use

## Phase 1 Design

### Shared Sync State

Phase 1 should extend the existing repo-level tree refresh lock instead of
introducing a brand-new sync table.

Minimum repo-level state:

- `lastTreeRefreshAt`
- `treeRefreshStartedAt`
- `lastTreeRefreshFailedAt?`
- `treeRefreshFailureKind?`
- `treeRefreshFailureMessage?`
- `treeRefreshCooldownUntil?`

This state must be readable from both:

- file view sync status
- dashboard repository cards

### Backend Behavior

Phase 1 backend behavior:

- `claimTreeRefresh` should skip while cooldown is active
- all repository refresh entrypoints should use the same claim path
- rate-limit failures should record cooldown from GitHub headers when possible
- non-rate-limit failures should still clear the active lock and record failure
- successful refresh should clear failure and cooldown state

### Frontend Behavior

Phase 1 frontend behavior:

- file view auto-refresh should not immediately re-arm on failure
- dashboard auto-refresh should not immediately re-arm on failure
- file view should suppress check polling while repo sync is in active cooldown
- sync UI should render truthful paused or failed copy based on shared backend
  state

### User-Facing States

Minimum user-visible states in Phase 1:

- `Syncing...`
- `Updated 18s ago`
- `GitHub rate limited`
- `Retrying in 4m`
- `Last sync failed`

## Phase 2 Design

### Refresh Split

Phase 2 splits the current mixed GitHub refresh path into two backend-owned
operations:

1. branch-tree refresh
2. repo-metadata sync

Branch-tree refresh is the cheap path. It fetches only the selected branch tree
and latest branch commit, then updates:

- `vaults.treeData` / `vaults.commitSHA` for the default branch
- `vaultBranchTrees.treeData` / `vaultBranchTrees.commitSHA` for non-default
  branches
- `lastTreeRefreshAt` on the tree record that was actually refreshed

Repo-metadata sync is the expensive path. It updates repository-wide cached
branch metadata in `vaultRemoteBranches`, including:

- remote branch list and default-branch membership
- branch head SHAs and `lastCommitAt`
- ahead/behind counts
- pull request URL / number / title / labels / draft state
- Cloudflare preview metadata when explicitly requested

Phase 2 must keep these paths independently selectable. A tree refresh must not
implicitly perform repo metadata sync unless the trigger contract below requires
it.

### Trigger Contract

Allowed Phase 2 trigger behavior:

- `page_load`
  - File view may run branch-tree refresh.
  - File view may run repo-metadata sync only when cached repo metadata is
    missing, stale, or the requested branch is not present in the cached branch
    list.
  - Dashboard may run default-branch tree refresh plus repo-metadata sync when
    cached metadata is missing or stale.
- `focus`
  - File view may run branch-tree refresh only.
  - Dashboard must not fan out repo refreshes across all vaults on plain window
    focus.
- `visibility`
  - File view may run branch-tree refresh only when the document becomes visible
    again, except for the requested-branch cache-miss reconfirmation rule below.
  - Dashboard may run repo-metadata sync only when cached metadata is stale.
- `manual`
  - May run both branch-tree refresh and repo-metadata sync.
  - Still respects any active shared cooldown; manual refresh does not bypass a
    live GitHub backoff window.
- `polling`
  - Reserved for commit/check status polling.
  - Must not trigger branch-tree refresh or repo-metadata sync directly.

### Cached Repo Metadata Freshness

Phase 2 treats repo metadata freshness separately from tree freshness.

Source of truth:

- repo metadata freshness comes from the latest
  `vaultRemoteBranches.lastSyncedAt` value for the vault
- tree freshness comes from `lastTreeRefreshAt` on the relevant tree cache row

Rules:

- missing repo metadata means the vault has no cached `vaultRemoteBranches` rows
- stale repo metadata means the latest `vaultRemoteBranches.lastSyncedAt` is
  older than the Phase 2 metadata freshness window
- requested-branch cache miss is a special case: a file view for branch `X` may
  force repo-metadata sync even if normal metadata freshness has not yet
  expired, but it must still debounce repeated "branch still missing" checks
- recent branch-tree success must not by itself make repo metadata count as
  fresh

Phase 2 should use a longer freshness window for repo metadata than for
branch-tree refresh so dashboard/page visibility churn stops multiplying GitHub
traffic.

### Shared Cooldown Contract for Commit/Check Polling

Commit/check polling joins the same repo-level cooldown contract introduced in
Phase 1.

Rules:

- commit/check polling must consult shared repo cooldown state before calling
  GitHub
- when repo cooldown is active, polling should return a paused/cooldown result
  from cached Convex state instead of attempting new GitHub requests
- when GitHub check/status APIs return a rate-limit response, polling must write
  the shared repo cooldown state so tree refreshes and future polls pause
  together
- generic non-rate-limit check polling failures do not need to create a new repo
  cooldown window, but they must not clear an existing one
- while checks are still running, frontend polling may continue on its normal
  cadence only when no shared cooldown is active

### Phase 2 Acceptance Checklist

- [ ] File-view focus/visibility churn only triggers the branch-tree refresh
      path
- [ ] Dashboard auto-refresh no longer fans out repo-wide metadata sync on plain
      window focus
- [ ] Repo metadata freshness is evaluated independently from tree freshness
- [ ] Requested-branch cache misses revalidate repo metadata without causing
      repeated burst retries
- [ ] Commit/check polling skips GitHub during active shared cooldown
- [ ] Commit/check rate-limit responses write the shared repo cooldown state
- [ ] Phase 2 ships as a standalone traffic-reduction deploy

## Monitoring and Rollout Gates

After each deploy, inspect:

- GitHub rate-limit errors per user
- refresh attempts per `user + repository`
- skipped refreshes due to cooldown
- branch refresh concurrency for one repository
- dashboard-triggered refresh burst size per user
- time spent in syncing state without a successful completion
- recovery behavior after cooldown expires

If production logs are used as a Phase 2 rollout gate for cooldown skips,
trigger attribution, or polling behavior, first add minimal structured logging
around refresh claim / skip / run decisions. Current logs are sufficient for
actual executions and failures, but not for proving skipped auto-refresh paths.

Phase advancement rule:

- do not start the next phase only because the code is ready
- advance when production behavior confirms the previous phase reduced the
  targeted failure mode

## Source of Truth Files

- `apps/noter/convex/schema.ts`
- `apps/noter/convex/vault.ts`
- `apps/noter/convex/github.ts`
- `apps/noter/convex/githubChecks.ts`
- `apps/noter/convex/fileStagingActions.ts`
- `apps/noter/src/components/FileView.tsx`
- `apps/noter/src/components/VaultDashboard.tsx`
- `apps/noter/src/components/VaultSyncStatus.tsx`
- `apps/noter/src/components/CommitStatus.tsx`

## Acceptance Checklist

- [x] Phase 1 repo-level cooldown state exists in Convex
- [x] Tree refresh skips while cooldown is active
- [x] Branch refresh uses the same backend claim path as default refresh
- [x] Failed refresh no longer looks like a fresh successful sync
- [x] Sync UI renders rate-limited and failed states
- [x] Phase 1 ships as a standalone deployable change
