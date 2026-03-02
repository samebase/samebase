# 031 Git-Backed Chat History Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-03-02
- Related specs:
  - `specs/008_CHAT_ONLY_CODESPACE_MODE_SPEC.md`
  - `specs/022_AGENT_GRAPH_VIEW_SPEC.md`
  - `specs/023_AGENT_GRAPH_CHAT_INTEGRATION_SPEC.md`
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
- Related files (current):
  - `apps/noter/convex/chat/index.ts`
  - `apps/noter/convex/chat/actions.ts`
  - `apps/noter/src/components/ChatFab.tsx`

## Summary

Represent chat threads as a Git-like, content-addressed DAG stored in Convex.

- Every change (send, edit, delete, system message injection) becomes a commit.
- The current thread view is a ref (for example `refs/threads/<threadId>/main`)
  pointing at the latest commit.
- The UI can “scrub” through history with a draggable time cursor to render the
  thread state at any prior commit and show diffs between commits.

This makes editing prior messages first-class without losing provenance.

## Why This Spec Exists

Plain transcripts (append-only message lists, single `.md` files, etc.) do not
support “edit a past message” cleanly:

1. If edits are allowed, the provenance of what changed is lost unless the app
   re-implements versioning.
2. If edits are disallowed, chats are hard to curate and correct.

Git already solves this for code via immutable history + diffs. We want the same
properties for chat threads, but natively in Convex and accessible from both the
frontend and Convex runtime.

## Goals

1. Allow editing or removing prior messages while preserving an audit trail.
2. Provide a stable, deterministic way to render “thread as-of commit X”.
3. Support branch-and-merge as an escape hatch for parallel thought paths.
4. Enable a “timeline scrubber” UI (draggable vertical line) to browse changes.
5. Keep the core implementation runtime-agnostic (browser + Convex).

## Non-Goals

1. Full byte-for-byte compatibility with the `git` CLI (packfiles, refs layout,
   filters, hooks, etc.).
2. Running the real `git` binary inside Convex.
3. A perfect CRDT merge of arbitrary concurrent edits (start with simplest
   conflict handling that is correct and debuggable).

## Key Concepts

### Object Model (Git-Like, Not Git-Identical)

We model a minimal subset of Git semantics:

- `blob`: message body (string) or small structured JSON (for example tool
  output payload).
- `tree`: a snapshot of a thread state expressed as a mapping of logical paths
  to blobs.
- `commit`: points to a `tree` plus one or more parents and metadata.

“Paths” are a logical convention so we can reuse familiar diff/checkout
primitives:

- `thread.json` (ordered list of message ids, plus per-message metadata)
- `messages/<messageId>.md` (message content)
- `messages/<messageId>.json` (optional structured metadata)

### Refs

A ref names “the latest state” for a thread:

- `refs/threads/<threadId>/main` (default)
- `refs/threads/<threadId>/scratch/<userId>` (optional user scratch branches)

By default, the UI renders the thread at the current ref tip.

### Linear Default View

Many users expect a mostly-linear history. We default the UI to a first-parent
log (a “rebased-looking” view) even if the underlying DAG contains merges.

Branch visualization remains available but is not required for the MVP.

## Proposed Convex Data Model

New tables (names illustrative):

1. `chatGitObjects`

   - `_id`
   - `oid` (string; content hash)
   - `type` (`"blob" | "tree" | "commit"`)
   - `data` (bytes or JSON-serializable structure; see storage notes)
   - `size`
   - `createdAt`

2. `chatGitRefs`

   - `_id`
   - `threadId`
   - `name` (string; `refs/...`)
   - `oid` (string; points to a commit)
   - `updatedAt`

3. `chatGitPathIndex` (optional for performance)
   - `_id`
   - `threadId`
   - `path` (string)
   - `commitOid` (string)
   - `touchedAt`

Notes:

- `oid` is content-addressed. The hashing and object encoding must be identical
  in browser and Convex (pure TS).
- Objects should be deduplicated across threads/users when possible.

## Storage and Size Strategy

Most chat payloads are small. Start with storing `data` directly in Convex docs.

If/when objects exceed safe doc size thresholds:

1. Store large blobs in Convex file storage.
2. Keep `chatGitObjects.data` as a small pointer `{ storageId, encoding }`.

This keeps the object model stable while allowing a storage upgrade.

## API Surface (Convex Functions)

### Writes

1. `chatGit.createThreadRef(threadId)` -> initializes `refs/.../main` to an
   empty commit (or a known “root” commit).
2. `chatGit.commitChange({ threadId, refName, expectedOid, change })`
   - Reads the current ref tip.
   - Applies `change` to build a new tree snapshot.
   - Writes any new blobs/trees/commit objects.
   - Updates the ref with compare-and-swap semantics using `expectedOid`.

### Reads

1. `chatGit.getThreadAt({ threadId, commitOid })` -> materialized thread view.
2. `chatGit.listCommits({ threadId, refName, limit, cursor })` -> first-parent
   log by default, with an option to return the full DAG adjacency.
3. `chatGit.diff({ threadId, fromCommitOid, toCommitOid })`
   - path-level summary (added/modified/deleted)
   - message-level summary (edited/deleted/inserted/reordered)

### Command Parity Targets (MVP)

We target a “porcelain-like” subset that maps naturally to UI:

- `log` (commit list)
- `show` (commit metadata + diff)
- `checkout` (render state at commit)
- `blame` (deferred; message-level provenance is sufficient for MVP)
- `rebase` (deferred; start with “linear default view”)

## Concurrency and Conflict Handling

Ref updates must be atomic and safe:

- Use `expectedOid` (CAS) to prevent silent lost updates.
- On conflict:
  - Prefer a deterministic merge for non-overlapping changes (for example two
    new messages appended).
  - Otherwise surface a conflict resolution UI: “your edit was based on an old
    version, retry with latest”.

This matches how Git behaves (fast-forward vs conflict) without requiring
general-purpose CRDT merges on day one.

## UI/UX: Timeline Scrubber

Primary browsing interaction:

1. A vertical timeline view shows commits as points/events.
2. A draggable vertical line (time cursor) selects a commit.
3. The main thread pane renders the thread state at the selected commit.
4. A side panel shows the diff summary for the selected commit vs its parent:
   - message added
   - message edited (with inline diff)
   - message removed
   - system/tool output inserted

Interaction details:

- Dragging should be fast: prefetch commit metadata and minimal diffs.
- Clicking a commit point pins selection.
- Search can jump to commits by author, keyword, or message id.

## Security and Privacy

Git-like history is intentionally durable. That changes deletion expectations.

Policy:

1. Normal “delete message” becomes a new commit that removes the message from
   the current view but does not erase history.
2. A separate “redaction” operation (history rewrite) is deferred and must be
   gated behind explicit admin approval, with an audit trail (align with
   approval-first patterns in `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`).

Implication: UI must communicate that “deleted” does not mean “gone”.

## Migration Strategy

1. New threads can be created as Git-backed from day one.
2. Existing threads can be imported:
   - Generate a root commit, then replay each message as a commit, or
   - Create a single snapshot commit representing current state (faster), then
     start versioning from that point.

Choose based on desired fidelity vs cost.

## Acceptance Criteria

1. Editing an earlier message creates a new commit and updates the thread ref.
2. The timeline scrubber can render thread state at any commit in the log.
3. The diff panel shows “added/edited/removed” at message granularity.
4. Concurrent writers do not lose updates; conflicts are detectable.
5. The default view remains linear and readable even if the DAG branches.

## Open Questions

1. Should the underlying snapshot format be `thread.json` + per-message blobs,
   or a single `thread.json` blob per commit for simplicity?
2. How do we want to represent “message reorder” events (rare but possible)?
3. Do we need per-user scratch branches, or is one shared `main` enough for MVP?
4. What is the maximum acceptable object size before switching blobs to storage?
