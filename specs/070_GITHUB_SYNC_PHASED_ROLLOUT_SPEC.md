# GitHub Sync Phased Rollout Specification

## Document Control

- Status: Accepted phased rollout plan
- Owner: Noter backend/frontend sync flows
- Last updated: 2026-03-26
- Related research: `rfcs/069_GITHUB_SYNC_RATE_LIMIT_RESEARCH.md`

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

## Monitoring and Rollout Gates

After each deploy, inspect:

- GitHub rate-limit errors per user
- refresh attempts per `user + repository`
- skipped refreshes due to cooldown
- branch refresh concurrency for one repository
- dashboard-triggered refresh burst size per user
- time spent in syncing state without a successful completion
- recovery behavior after cooldown expires

Phase advancement rule:

- do not start the next phase only because the code is ready
- advance when production behavior confirms the previous phase reduced the
  targeted failure mode

## Source of Truth Files

- `apps/noter/convex/schema.ts`
- `apps/noter/convex/vault.ts`
- `apps/noter/convex/github.ts`
- `apps/noter/convex/fileStagingActions.ts`
- `apps/noter/src/components/FileView.tsx`
- `apps/noter/src/components/VaultDashboard.tsx`
- `apps/noter/src/components/VaultSyncStatus.tsx`
- `apps/noter/src/components/CommitStatus.tsx`

## Acceptance Checklist

- [ ] Phase 1 repo-level cooldown state exists in Convex
- [ ] Tree refresh skips while cooldown is active
- [ ] Branch refresh uses the same backend claim path as default refresh
- [ ] Failed refresh no longer looks like a fresh successful sync
- [ ] Sync UI renders rate-limited and failed states
- [ ] Phase 1 ships as a standalone deployable change
