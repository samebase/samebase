# 041 Daytona Commit-Pinned Snapshot Spec

## Status

- Draft
- Date: 2026-03-06
- Supersedes direction in:
  - `010_DAYTONA_SANDBOX_INTEGRATION_SPEC.md`
  - `024_DAYTONA_IMAGE_AND_STARTUP_PERFORMANCE_SPEC.md`
  - `040_DAYTONA_USAGE_AND_FLOW_SPEC.md`

## Summary

Noter should build Daytona snapshots automatically when a new commit lands on
`main`.

Each snapshot must correspond to one exact Git commit. New Daytona sandboxes
must start from the latest snapshot for the branch, which means the latest
snapshot for `main` for the current rollout.

Users should not choose commits in the UI. The UI should expose only the latest
snapshot state for the branch. Commit identity is an internal correctness and
reproducibility guarantee.

## Product Decision

For now:

- Auto-build snapshots only for `main`
- Treat snapshot build failure as a serious blocking issue
- Retry automatically until resolved or explicitly disabled
- Surface failure prominently in Noter UI
- Keep only the latest 3 commit snapshots per branch

Later:

- Extend the same model to multiple branches
- Preserve the same branch-scoped "latest snapshot" UX

## Goals

- Build a Daytona snapshot as soon as Noter detects a new commit on `main`
- Make each snapshot immutable and tied to one exact commit SHA
- Ensure new sandboxes start from the latest snapshot for the branch
- Eliminate ambiguity about what code a new sandbox starts from
- Reuse deterministic dependency layers so per-commit builds stay affordable
- Retain only a small rolling window of recent snapshots per branch
- Make snapshot failures obvious and hard to ignore

## Non-Goals

- Commit picker UI
- Long-term historical snapshot retention
- Silent fallback to an older snapshot when the latest branch commit failed
- Full multi-branch product rollout in the first iteration

## Why The Existing Deps Image Flow Should Stay

There are two different build layers:

1. **Dependency base layer**
   - Node version
   - pnpm version
   - lockfile-driven dependencies
   - other stable build inputs
2. **Source snapshot layer**
   - the repository contents for one exact commit

The repository already builds an immutable Daytona deps image keyed by a full
input hash. That is the correct primitive for the dependency base layer because
it avoids rebuilding heavy dependency setup on every source commit while still
remaining deterministic.

This spec changes the **source snapshot** policy, not the **deps image** policy.

Target architecture:

- Keep deps images content-hash-based
- Build snapshots per branch commit on top of that deterministic base

This avoids the bad tradeoff of forcing a full dependency rebuild on every push
to `main`.

## Current Problems

Today the implementation is not commit-pinned:

- Snapshot names are branch-scoped, not commit-scoped
- Rebuilding a snapshot replaces the previous snapshot with the same name
- Sandbox reuse is keyed by vault and branch, not by commit
- Launch refreshes the repo to the latest branch tip after sandbox creation
- Vault schema stores only one Daytona snapshot name, not a commit-to-snapshot
  mapping
- Dashboard launch is still hardcoded to `main`

Because of that, "start from snapshot" does not currently mean "start from an
exact known commit".

## Required Behavioral Change

### Snapshot identity

Snapshot names must become immutable and commit-scoped.

Recommended shape:

`noter-prebuild-<env>-<owner>-<repo>-<branch>-<commitSha>`

Where:

- `<branch>` is sanitized but preserved
- `<commitSha>` is the full commit SHA unless Daytona naming limits force a
  shorter suffix

If a shorter suffix is required, Noter must still persist the full SHA in its
own data model.

### Trigger

First implementation:

- Trigger when Noter detects that `main` moved during GitHub sync
- Use the exact `commitSHA` Noter just observed for that repo

Later, if Noter adopts GitHub webhooks or repo-side automation, the same
commit-pinned contract can move to a more immediate push-driven trigger.

## Build Flow

### Trigger source

Use Noter's existing GitHub refresh path for the first rollout.

Input:

- repository owner/name
- branch name
- exact detected commit SHA

### Build steps

1. Detect that `main` advanced to a new commit in Noter
2. Queue a build record for that exact commit in Convex
3. Checkout the exact commit
4. Resolve the existing immutable deps image from the full dependency input hash
5. Build a Daytona snapshot whose contents correspond exactly to the checked-out
   commit
6. Mark the snapshot ready only after Daytona reports it as active
7. Persist the commit-to-snapshot mapping in Noter
8. Prune older snapshots so only the latest 3 commits for the branch remain

### Commit correctness rule

The snapshot build must be tied to the detected commit SHA, not to "whatever
`main` points to when the build starts later".

Acceptable ways to satisfy this:

- Clone by commit SHA inside Noter's Daytona build tooling
- Or use an equivalent future push-triggered checkout that is already pinned to
  one commit

The important contract is that the built snapshot is for one exact commit.

## Noter Data Model

Add a dedicated repo-scoped commit snapshot mapping table instead of overloading
fields on `vaults`.

Suggested shape:

- `ghRepoOwner`
- `ghRepoName`
- `branch`
- `commitSha`
- `snapshotName`
- `snapshotId`
- `status`
  - `queued`
  - `building`
  - `active`
  - `failed`
  - `removing`
- `attemptCount`
- `lastError`
- `logs`
- `logsUpdatedAt`
- `nextRetryAt`
- `createdAt`
- `updatedAt`

Keep `vault.daytonaSnapshotName` only as a compatibility field during migration,
or remove it once all reads use the new mapping table.

## Launch Contract

### UI

The user sees:

- one "latest snapshot" state for the branch
- one launch action
- one failure state if the latest branch commit snapshot is not ready

The user does not choose a commit.

### Backend

For `main`, launch must:

1. Determine the latest commit on the branch that Noter expects to be runnable
2. Find the snapshot record for that exact commit
3. Require that snapshot to be `active`
4. Create or reuse a sandbox only if the sandbox already matches that exact
   commit

### Reuse rule

Sandbox reuse must become branch-plus-commit aware.

A sandbox can be reused only when:

- it belongs to the same vault
- it belongs to the same branch
- it is already on the same commit SHA as the latest active snapshot for that
  branch

Otherwise a new sandbox must be created.

### Refresh rule

For commit-pinned launches, Noter must not refresh the repo to the newest branch
tip after sandbox creation.

Any post-create repo refresh to branch HEAD would break the exact-commit
guarantee.

## Failure Handling

Snapshot build failure is blocking and high severity.

Required behavior:

- automatic retry with backoff
- persistent failure state in Convex
- high-visibility UI alert in Noter
- structured logs including branch, commit SHA, snapshot name, and error
- no silent fallback to an older commit snapshot for new launches

For the first version, if the latest `main` commit snapshot is not active:

- launching a fresh sandbox for `main` should be blocked
- the UI should clearly say that the latest branch snapshot failed or is still
  building
- the failure should remain visible until the latest commit snapshot becomes
  active

Recommended UX:

- show a destructive alert on the vault dashboard and branch view
- keep the alert sticky while the latest commit is failing
- show retry activity and last error details

Optional later additions:

- email/Slack notifications
- internal on-call routing

## Retention

Keep only the latest 3 snapshots per branch.

Rules:

- prune older snapshots after a new snapshot becomes active
- always retain the latest 3 commit snapshots for the branch
- prune associated Noter mapping records for removed snapshots
- if Daytona has already inactivated an older snapshot, Noter can delete it
  immediately when it falls outside the retention window

For the first rollout on `main`, this means:

- keep the latest 3 `main` commit snapshots
- delete older `main` snapshots beyond that window

## Observability

Track:

- latest branch commit SHA
- latest successful snapshot commit SHA
- latest failed snapshot commit SHA
- snapshot queue latency
- snapshot build duration
- retry count
- time from Noter detecting a new commit to active snapshot
- time from active snapshot to successful sandbox launch

## Migration

1. Add new commit snapshot mapping storage
2. Change snapshot naming from branch-scoped to commit-scoped
3. Stop deleting/replacing the previous branch snapshot by name
4. Change launch selection to resolve latest branch commit -> exact snapshot
5. Remove post-launch refresh-to-branch-head behavior for commit-pinned flows
6. Add pruning for "latest 3 commits per branch"
7. Remove or rewrite outdated Daytona specs that assume branch-scoped mutable
   snapshots

## Spec Cleanup

Once this direction is accepted, old contradictory Daytona specs should not be
kept as parallel source-of-truth documents.

Preferred cleanup:

- rewrite or delete `010_DAYTONA_SANDBOX_INTEGRATION_SPEC.md`
- rewrite or delete `024_DAYTONA_IMAGE_AND_STARTUP_PERFORMANCE_SPEC.md`
- rewrite or delete `040_DAYTONA_USAGE_AND_FLOW_SPEC.md`

Git history is sufficient for recovering old thinking if needed.

## Open Questions

- Should the latest 3 retention window count only `active` snapshots, or all
  snapshot attempts including failed ones?
- Should existing already-running sandboxes on an older commit remain usable, or
  should Noter force recreation once a newer commit snapshot becomes active?
