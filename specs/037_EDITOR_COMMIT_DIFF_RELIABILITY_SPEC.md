# Editor Commit Diff & Reliability Spec

## Document Control

- Status: Draft (implementation started)
- Owner: Noter frontend/editor + Convex staging/commit pipeline
- Last updated: 2026-03-05

## Summary

Noter must keep commits correct under remote branch drift (especially `main`),
while preserving a smooth one-click commit UX. It must also stop silent state
drift where local edits and staged/committed content diverge.

Primary user goal:

- One-click commit from FileView and ChatFab should not overwrite newer upstream
  commits.
- If `origin/main` moved, replay staged edits on top of the latest remote head
  before commit.
- Auto-resolve non-overlapping updates; stop only on true unresolved conflicts.
- Keep diff review available for users who want it, but do not require an extra
  confirmation step for standard commit flows.
- Never silently commit stale/incomplete edits.

## Problem Statement

Recent phases added commit preview and richer diff UI, but commit correctness
under remote branch movement still needs to be explicit and provable.
Sync/commit gaps can still make users feel like commit "removed stuff"
unexpectedly when upstream moved.

## Current State (Observed)

- File-level staged categories and diff review are shown in UI.
- Manual commit and chat approval both commit all staged changes.
- Commit review is available in FileView, but is not the canonical gate for all
  commit entry points.
- Collaborative push failures can leave client sync in a bad state.
- Commit path does not yet explicitly guarantee "always rebase/replay on latest
  remote `main` before write."

## Goals

1. Ensure editor -> staging synchronization is robust and observable.
2. Ensure commit success/failure is explicit and not silently swallowed.
3. Ensure chat commit metadata reflects real commit outcome.
4. Ensure commit correctness under remote drift by basing commits on the latest
   remote head.
5. Auto-resolve non-overlapping upstream/staged changes; fail safely on true
   unresolved conflicts.
6. Preserve smooth one-click commit UX in both FileView and ChatFab (no
   mandatory extra confirmation step).

## Non-Goals (Iteration 1)

- Perfect branch-awareness across all vault APIs.
- Full semantic markdown AST diff.
- Multi-parent/merge commit visualization.
- Mandatory extra approval UI steps before every commit.

## Phased Delivery

Status snapshot (2026-03-05):

- Phase 0: Shipped
- Phase 1: Shipped
- Phase 2: Shipped
- Phase 3: In progress (`updateRef.force = false` and remote-head replay added)
- Phase 4: In progress (race retry hardening + conflict telemetry/tests started)

### Phase 0: Reliability Foundation (must ship first)

- Fix collaborative push lock handling in both editor implementations so failed
  push attempts always release locks and retry.
- Surface sync failure state in editor UI (non-blocking but visible).
- Remove silent failure swallowing from staged commit action path.
- Ensure chat commit proposal is marked committed only after successful commit.
- Remove obvious hardcoded-branch commit assumptions in staging/commit path.
- Add guardrails against accidental destructive operations:
  - path collision checks on rename,
  - prevent creating files that already exist in repo/staging.

Acceptance:

- A transient push failure does not permanently stop syncing.
- Commit errors are visible to caller and do not silently look successful.
- Chat card does not show "Committed" if commit failed.

### Phase 1: Commit Preview Data Contract

- Add server-side commit preview endpoint over staged changes returning:
  - per-file status (`A/M/D/R`),
  - old/new path,
  - line stats,
  - unified patch text.
- Include safety metadata (large diff truncation, destructive-count hints).

Acceptance:

- Preview payload deterministically matches staged content used for commit.

### Phase 2: Diff UI (GitHub-style markdown first)

- Add a dedicated "Review Changes" surface before commit.
- Markdown files:
  - default rich presentation,
  - toggle to source patch.
- Non-markdown files:
  - source diff (unified/split).

Acceptance:

- User can inspect every staged file diff before confirming commit.

### Phase 3: Remote-Drift-Safe Commit Engine

- Keep one-click commit behavior in both FileView and ChatFab. Do not require an
  extra review/approval step to execute commit.
- In the commit action path, always resolve the latest remote head for the
  target branch (`main` by default) immediately before write.
- Update branch refs with non-force semantics (`updateRef.force = false`) so
  stale commit attempts cannot rewind newer upstream commits.
- Replay staged edits onto that latest remote head before creating commit
  objects.
- Auto-resolve non-overlapping changes when upstream moved and staged edits
  touch different lines/files.
- Add bounded retry for non-fast-forward/race conditions when remote head moves
  during commit attempt.
- Never overwrite upstream history (no destructive force behavior in this flow).
- If unresolved conflicts remain, abort safely, keep staging intact, and return
  conflict details (at minimum: file paths and conflict reason) for UI display.
- Use the same commit engine semantics for both entry points:
  - FileView manual commit
  - ChatFab commit proposal approval

Acceptance:

- If `origin/main` receives new commits before commit execution, noter commit is
  based on latest remote head and does not overwrite upstream work.
- Non-overlapping upstream/staged edits commit successfully without extra user
  steps.
- True unresolved conflicts fail safely with explicit conflicted file list and
  preserved staging state.
- FileView and ChatFab keep one-click commit UX while using equivalent commit
  correctness guarantees.

### Phase 4: Verification, Hardening, and Observability

- Add tests for:
  - remote head moved before commit start,
  - remote head moved mid-commit (race + retry),
  - non-overlapping change replay success,
  - overlapping conflict stop behavior with structured conflict output,
  - rename/delete/new-file conflict matrix,
  - chat commit status correctness on success/failure/conflict,
  - parity between FileView and ChatFab commit outcomes.
- Add targeted manual/integration scenarios around network instability and
  concurrent upstream pushes.
- Add commit-path telemetry and logs:
  - retry counts,
  - conflict categories,
  - commit latency and failure rates.
- Add bounded retry policy with deterministic backoff and explicit terminal
  failure state.
- Current implementation progress:
  - bounded retry backoff added to commit engine (`409/422` only),
  - structured conflict categories added in commit logs,
  - race retry and conflict-matrix tests added for commit engine.

Acceptance:

- Reliability regressions are covered by automated and manual checks.
- No regression where newer upstream commits are overwritten by noter commits.
- Conflict and retry behavior is observable and debuggable in production logs.
- Retry loops converge (success or terminal failure) without leaving commit
  state ambiguous.

## Implementation Notes (Phases 3-4)

- Prioritize correctness over additional UI complexity.
- Preserve existing one-click commit UX and treat review UI as optional.
- Keep changes minimal and reversible.
- Prefer explicit error propagation through existing action/mutation flows.
- Ensure conflict payloads are structured for UI and logs (not free-form only).

## Source of Truth Files (Phases 3-4 focus)

- `apps/noter/convex/fileStagingActions.ts`
- `apps/noter/convex/fileStaging.ts`
- `apps/noter/convex/chat/index.ts`
- `apps/noter/convex/commitPreview.test.ts`
- `apps/noter/src/components/FileView.tsx`
- `apps/noter/src/components/ChatFab.tsx`
- `apps/noter/e2e/commit-review-visual.spec.ts`

## References

- GitHub compare views (unified/split/rich/source/rendered)
- CodeMirror merge API
- Monaco diff editor API
- GitHub REST create-tree and compare endpoints
