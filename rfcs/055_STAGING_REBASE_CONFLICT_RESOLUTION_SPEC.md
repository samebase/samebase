# 055 Staging Rebase Conflict Resolution Spec

## Document Control

- Status: Draft
- Owner: Noter editor/review UX + Convex staging/commit pipeline
- Last updated: 2026-03-14

## Summary

Noter should stop treating commit-time rebase conflicts as a plain terminal error. The simplest path
is to reuse the existing staging model, commit preview, and merge editor to materialize conflicts
into a resolvable review state inside the app.

Primary user goals:

- Understand why commit failed without reading backend logs.
- See `base`, `ours`, and `upstream` in a debuggable UI.
- Resolve the conflict manually in Noter when needed.
- Keep a low-friction fallback for "copy this to Codex/Claude and fix it".

This spec recommends a staged rollout:

1. Make conflict debugging explicit.
2. Reuse the current review pane as a manual rebase/conflict editor.
3. Improve backend auto-rebase for simple cases.
4. Add richer agent- and git-native resolution later.

## Problem Statement

Current commit flow rebases staged files onto the latest GitHub branch head in
`fileStagingActions.commitAllStaged`. If any file fails to apply cleanly, the action throws:

- `Commit conflicts with upstream changes. Resolve and retry: <path>`

That message is technically correct, but it is operationally weak:

- the user does not see what changed upstream
- the user does not see whether the conflict is real or a patch-placement issue
- the user cannot resolve it in the same surface where they already review diffs
- the review UI does not currently pivot into "conflict resolution" mode

The result is a backend-correct but user-hostile workflow.

## Current State

### What already exists

- Commit preview exists and is loaded in review mode from `fileStagingActions.getCommitPreview`.
- Review mode already has:
  - unified patch output
  - markdown-rich preview
  - an editable CodeMirror merge surface via `ProsemarkMergeEditor`
- The backend already has a rebase-on-pull flow in `fileStagingActions.pullFromGitHubInternal` that:
  - fetches latest upstream blobs
  - runs `rebaseStagedContent(...)`
  - writes rebased content back into staging

### What is misaligned today

- The merge editor is rendered with `mergeControls: false`, so the built-in merge affordances are
  intentionally hidden.
- The editor’s `baseValue` comes from `selectedPreviewStagedFile.initialContent` instead of the
  latest upstream preview content.
- Conflict state is not persisted as a first-class review/debug artifact.
- `parentCommitSha` in staging is used like a blob SHA even though the schema comment says "commit",
  which makes debugging and future GitHub linking more confusing than it should be.

## Actual Failure Class We Observed

On March 13-14, 2026, a real production failure on `TODO.md` showed that the system can report a
conflict even when the staged edit is just an inserted line and upstream only inserted nearby lines.

Observed shape:

- staged change: add one bullet under `## Companies to Research`
- upstream change: add several nearby bullets in surrounding sections
- result: patch application fails because context shifted
- user-visible outcome: generic conflict error, no visible resolution path

This is exactly the class of problem where the UI should help the user understand:

- "you added this"
- "GitHub added these nearby lines"
- "your line can probably just be inserted here"

## Goals

1. Treat conflict resolution as part of review UX, not only backend plumbing.
2. Provide a manual path that works before any "smart agent resolver" exists.
3. Reuse existing review/editor primitives instead of introducing a second diff system.
4. Preserve a clean agent handoff path via a conflict bundle.
5. Keep automatic rebase logic conservative and auditable.

## Non-Goals

- Full git worktree/sandbox conflict resolution inside Convex runtime.
- GitHub PR-based conflict resolution as the primary path.
- General-purpose semantic merge for all file types in phase 1.
- A polished AI auto-resolve experience in this patch.

## Research Findings

### 1. CodeMirror merge view is already the right primitive

Noter already uses CodeMirror’s `unifiedMergeView(...)` in `ProsemarkMergeEditor`, which is the
right foundation for a single-editor manual conflict UI.

Why this matters:

- we do not need to invent a bespoke conflict renderer
- we can keep the current markdown-focused review surface
- the editor can stay editable while showing upstream deltas

Reference:

- [CodeMirror merge docs](https://codemirror.net/docs/ref/#merge.unifiedMergeView)

### 2. GitHub is not the primary answer here

GitHub’s web conflict editor only applies in narrower PR conflict cases and is not suitable as the
default pre-commit conflict flow for Noter staging.

Why this matters:

- many Noter conflicts happen before a PR exists
- even with a PR, GitHub web resolution is limited and not always available
- pushing users out to GitHub loses the staging context Noter already has

Reference:

- [GitHub conflict editor docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/addressing-merge-conflicts/resolving-a-merge-conflict-on-github)

### 3. Diff3 remains the simplest human debugging format

For manual debugging, the most useful artifact is still a 3-way view:

- base
- ours
- theirs/upstream

This aligns with standard git tooling and with `git merge-file --diff3`.

Why this matters:

- it is much easier to reason about than a plain "conflict happened" message
- it is easy to persist in staging and easy to paste into an LLM

Reference:

- [git merge-file](https://git-scm.com/docs/git-merge-file)

### 4. Repeated conflict classes can be learned later

If Noter eventually performs conflict resolution inside real git sandboxes, standard git facilities
like `rerere` become relevant for repeated resolution reuse. That is not phase 1, but it is a strong
future direction.

Reference:

- [git rerere](https://git-scm.com/docs/git-rerere)

## Product Recommendation

### Core decision

Use the existing review UI as the manual conflict resolution surface.

This means:

- no separate "merge tool" product
- no special GitHub dependency
- no new file type or parallel editor mode

### Simplest viable behavior

When commit-time rebase detects a conflict:

1. Do not only throw a string error.
2. Materialize a conflict state for each conflicting file.
3. Open review mode on the first conflicting file.
4. Show the user:
   - upstream content
   - their staged content
   - the original base
   - patch summaries for `base -> ours` and `base -> upstream`
5. Let them edit the resolved content directly in the merge editor.
6. Retry commit after save.

This is the minimum that makes the system understandable and recoverable.

## Proposed UX

### Conflict entry state

On commit conflict:

- keep the review sidebar open
- keep the selected file pinned to the first conflicting path
- show a banner:
  - `Commit blocked by upstream changes in TODO.md`
- show actions:
  - `Rebase onto latest GitHub`
  - `Show conflict patches`
  - `Copy conflict bundle`
  - `Reset to GitHub`

### Conflict editor mode

For markdown files:

- use `ProsemarkMergeEditor`
- set `baseValue` to latest upstream content, not stale staging base
- re-enable merge affordances only in conflict mode
- keep raw patch view available as a toggle

For non-markdown files:

- start with patch + plain editable text area if merge view is not yet robust
- do not block phase 1 on perfect code-file conflict ergonomics

### Debug artifacts shown in UI

Per conflicting file, expose:

- `Base -> Yours`
- `Base -> Upstream`
- `Resolved result` editor
- metadata:
  - branch
  - last upstream blob SHA
  - original blob SHA
  - staging version

### Copy conflict bundle

Add a single action that copies a compact JSON or markdown block containing:

- repository full name
- branch
- file path
- base content
- staged content
- upstream content
- `base -> ours` patch
- `base -> upstream` patch

This is the fastest manual/agent fallback and should exist even if no other conflict UI ships.

## Backend Design

### A. Add first-class conflict preview contract

Extend commit preview or add a sibling action that returns:

- `baseContent`
- `stagedContent`
- `upstreamContent`
- `oursPatch`
- `upstreamPatch`
- `hasConflict`
- `conflictReason`

This should be separate from generic commit preview fields where necessary so the UI does not infer
conflict state from string parsing.

### B. Materialize conflict state instead of only throwing

Current behavior in `commitAllStaged` is to throw once `rebaseStagedFilesOnLatestHead(...)` reports
conflict paths.

Replace that with:

- attempt auto-rebase
- if conflict remains:
  - store enough metadata for conflict review
  - return a structured conflict result to the caller

Possible shape:

```ts
type CommitAttemptResult =
  | { kind: "success"; commitSha: string; url?: string }
  | {
      kind: "conflict";
      branch: string;
      files: Array<{
        path: string;
        baseContent: string;
        stagedContent: string;
        upstreamContent: string;
        originalBlobSha: string | null;
        upstreamBlobSha: string | null;
      }>;
    };
```

The manual commit UI should consume this.

### C. Clarify SHA semantics

Today `parentCommitSha` is functionally a blob SHA. That should be corrected.

Recommended change:

- rename `parentCommitSha` to `parentBlobSha`
- add optional `baseHeadCommitSha`

Why:

- blob SHA answers "what file bytes was this based on?"
- head commit SHA answers "what branch state was this based on?"
- GitHub compare/debug links become tractable only with the head commit SHA

Migration is optional for phase 1, but the spec should align naming now.

### D. Reuse pull/rebase logic

The backend already has a useful rebase-on-pull path:

- fetch latest blob
- rebase staged content
- write result back to staging

Phase 1 should reuse that logic instead of duplicating merge rules.

Concretely:

- add a user-facing `Rebase onto latest GitHub` action wired to the existing pull/rebase flow
- when commit conflict occurs, surface that as the first recommended action

## Frontend Design

### A. Conflict mode inside review

Introduce an explicit review sub-mode:

- `normal-review`
- `conflict-review`

Conflict review should:

- render the same file list
- visually badge conflicting files
- auto-open the first one

### B. Point merge editor at upstream

Current review uses:

- `value = inlinePreviewEditorContent`
- `baseValue = selectedPreviewStagedFile.initialContent`

Conflict review must instead use:

- `value = resolved draft / staged content`
- `baseValue = upstream content`

That is the minimum change that turns the merge editor into a rebase tool rather than a stale local
diff.

### C. Re-enable merge controls selectively

In normal review:

- keep merge controls hidden

In conflict review:

- enable merge controls if the CodeMirror UX is acceptable
- otherwise provide explicit Noter buttons:
  - `Accept upstream chunk`
  - `Keep my chunk`

This should be decided pragmatically after a small spike.

### D. Autosave behavior

Conflict edits should continue to autosave into staging using the existing collaborative update
path.

Important rule:

- autosaving a resolved conflict must not implicitly advance upstream/base SHA

Only a successful explicit rebase or successful commit should update the stored base metadata.

## Phased Implementation Plan

### Phase 0: Visibility

- Replace raw string commit failure handling with structured conflict payloads.
- Add `Copy conflict bundle`.
- Add `Rebase onto latest GitHub` action in the file view.
- Show conflicting files in review mode with a clear badge.

Acceptance:

- user can understand which files conflict and why
- user can export the conflict bundle without reading logs

### Phase 1: Manual Resolution in Existing Review UI

- Add `conflict-review` mode.
- Feed upstream content into the existing merge editor.
- Show `base -> ours` and `base -> upstream` patch toggles.
- Allow editing the resolved result and retrying commit.

Acceptance:

- user can manually resolve a markdown conflict without leaving Noter
- retrying commit after resolution succeeds when no new upstream changes arrive

### Phase 2: Stronger Auto-Rebase

- Harden `rebaseStagedContent(...)` for nearby insertion-only cases.
- Add tests for:
  - nearby insertions
  - repeated list-item additions
  - markdown heading-adjacent insertions
  - real overlapping edits that must still conflict

Acceptance:

- false-positive conflicts materially decrease

### Phase 3: Agent/Git-native Resolution

- In sandboxes/worktrees, optionally use git-native 3-way merge primitives rather than only string
  patch application.
- Evaluate `git merge-file --diff3` for richer conflict materialization.
- Evaluate `rerere` only after conflict resolution leaves Convex-only runtime.

Acceptance:

- repeated conflict classes become cheaper to resolve
- backend logic remains auditable and deterministic

## Acceptance Criteria

1. A commit conflict no longer appears only as an opaque error string.
2. The first conflicting file opens directly in review mode with enough context to understand the
   problem.
3. The user can copy a complete conflict bundle for agent assistance.
4. Markdown conflicts can be manually resolved in Noter’s existing review surface.
5. The backend distinguishes between "auto-rebased", "conflict requiring user action", and "hard
   failure".
6. Nearby insertion-only upstream edits do not false-conflict in common Markdown list cases.

## Open Questions

1. Should conflict metadata live in `vaultStagedFiles` rows, or in a separate `stagingConflicts`
   table keyed by staging id?
2. Should the first implementation persist diff3 markers in `content`, or keep them separate and
   only render them in UI?
3. For non-markdown files, should phase 1 use the same merge editor or a simpler source-only
   resolution surface?

## Recommended Source of Truth Files

- `apps/noter/convex/fileStagingActions.ts`
- `apps/noter/convex/fileStaging.ts`
- `apps/noter/convex/stagingRebase.ts`
- `apps/noter/convex/schema.ts`
- `apps/noter/src/components/FileView.tsx`
- `apps/noter/src/components/ProsemarkMergeEditor.tsx`

## References

- [CodeMirror merge docs](https://codemirror.net/docs/ref/#merge.unifiedMergeView)
- [GitHub conflict editor docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/addressing-merge-conflicts/resolving-a-merge-conflict-on-github)
- [git merge-file](https://git-scm.com/docs/git-merge-file)
- [git rerere](https://git-scm.com/docs/git-rerere)
