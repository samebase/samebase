# Editor Commit Diff & Reliability Spec

## Document Control

- Status: Draft (implementation started)
- Owner: Noter frontend/editor + Convex staging/commit pipeline
- Last updated: 2026-03-05

## Summary

Noter must make "what will be committed" explicit before commit, and must stop silent state drift
where local edits and staged/committed content diverge.

Primary user goal:

- Before pressing commit, see the exact diff of the next commit.
- For markdown files, default to a GitHub-like rich diff experience.
- Never silently commit stale/incomplete edits.

## Problem Statement

Current behavior provides file-level change categories, but no true patch preview. At the same time,
sync/commit reliability gaps can make users feel like commit "removed stuff" unexpectedly.

## Current State (Observed)

- File-level staged categories are shown in UI (`modified/new/deleted/renamed`).
- Manual commit commits all staged changes.
- No pre-commit patch preview exists.
- Collaborative push failures can leave client sync in a bad state.

## Goals

1. Make editor -> staging synchronization robust and observable.
2. Make commit success/failure explicit and not silently swallowed.
3. Introduce a true commit preview model and UI.
4. Provide markdown-first diff UX similar to GitHub defaults.

## Non-Goals (Iteration 1)

- Perfect branch-awareness across all vault APIs.
- Full semantic markdown AST diff.
- Multi-parent/merge commit visualization.

## Phased Delivery

### Phase 0: Reliability Foundation (must ship first)

- Fix collaborative push lock handling in both editor implementations so failed push attempts always
  release locks and retry.
- Surface sync failure state in editor UI (non-blocking but visible).
- Remove silent failure swallowing from staged commit action path.
- Remove obvious hardcoded-branch commit assumptions in staging/commit path.
- Add guardrails against accidental destructive operations:
  - path collision checks on rename,
  - prevent creating files that already exist in repo/staging.

Acceptance:

- A transient push failure does not permanently stop syncing.
- Commit errors are visible to caller and do not silently look successful.

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

### Phase 3: Commit Confirmation

- Require explicit confirmation when destructive changes exist.

Acceptance:

- Manual commit relies on the preview source.

### Phase 4: Verification & Hardening

- Add tests for:
  - sync retries,
  - stale version recovery,
  - rename/delete/new-file edge cases,
- Add targeted manual test scenarios around network instability.

Acceptance:

- Known reliability regressions are covered by automated and manual checks.

## Implementation Notes (Phase 0)

- Prioritize correctness over new UI complexity.
- Keep changes minimal and reversible.
- Prefer explicit error propagation through existing action/mutation flows.

## Source of Truth Files (Phase 0 focus)

- `apps/noter/src/components/CodeEditor.tsx`
- `apps/noter/src/components/MonacoEditor.tsx`
- `apps/noter/convex/collaborative.ts`
- `apps/noter/convex/fileStagingActions.ts`
- `apps/noter/convex/fileStaging.ts`

## References

- GitHub compare views (unified/split/rich/source/rendered)
- CodeMirror merge API
- Monaco diff editor API
- GitHub REST create-tree and compare endpoints
