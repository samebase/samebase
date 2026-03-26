# 069 Local Provider Thread Inventory Research Surface Spec

## Document Control

- Status: Accepted
- Owner: local machine connector + Codex research surface
- Last updated: 2026-03-26
- Related docs:
  - `rfcs/071_CONNECTED_MACHINES_AND_REMOTE_THREAD_CONTROL_RESEARCH.md`
  - `rfcs/070_NOTER_UI_PR_TRIGGERED_CODEX_LOCAL_AUTOMATION_RESEARCH.md`

## Summary

The local `codex app-server` research surface must move from a single-active-
thread demo to a machine-scoped thread inventory surface.

Phase 1 therefore adds:

1. provider thread inventory from the local runtime
2. provider thread detail reads for a selected thread
3. UI state that treats "selected thread" as explicit local research state
4. thread-start, thread-resume, and turn-start flows that operate on the
   selected thread instead of an implicit singleton
5. a second Codex-style browser route that makes project and thread browsing
   primary while preserving the protocol lab as a separate surface

This phase does not bind local provider threads to Convex/Noter threads yet. Its
purpose is to prove the machine-local contract first so the later Convex mapping
is based on real runtime behavior rather than guesses.

## Problem Statement

The original research page at `/research/codex-app-server` only exposes one
`currentThreadId` plus start/resume controls.

That is too narrow for the direction already agreed in RFC 071:

1. one local machine process should be able to service multiple threads
2. Noter must eventually map its own cloud thread ids onto machine-local
   provider thread ids
3. the web UI needs a way to inspect existing local provider threads before it
   can become a real machine control plane

If the research surface remains single-threaded, it pushes the wrong abstraction
down into the future Convex schema and connector contract.

## Product Decisions (Locked)

1. The local research runtime is machine-scoped, not single-thread-scoped.
2. Provider thread ids remain separate from Noter/Convex thread ids.
3. `currentThreadId` may remain as a convenience selection, but it must not be
   the only thread model.
4. The bridge must expose provider thread inventory before any Convex thread
   mapping is added.
5. The research UI must show all discovered local provider threads, not only the
   active thread.
6. Thread actions (`turn/start`, `turn/interrupt`, future approvals) act on an
   explicitly selected thread or an explicit thread id supplied by the caller.
7. This phase stays local-only and dev-only. It does not add machine presence,
   pairing, or remote control through Convex yet.
8. The browser-facing research contract should stay small and provider-neutral
   where practical, even though the underlying runtime is Codex-specific today.

## Current State

Today:

1. `CodexAppServerRuntimeSnapshot` stores a single `currentThreadId`.
2. The bridge exposes:
   - `/status`
   - `/runtime/ensure`
   - `/runtime/stop`
   - `/events`
   - `/requests`
   - `/thread/start`
   - `/thread/resume`
   - `/turn/start`
   - `/turn/interrupt`
3. The page shows the current thread id in the runtime card and does not render
   a thread inventory.
4. Codex protocol export already proves that `thread/list` and `thread/read`
   exist, including paging and optional turn hydration.

## Source of Truth Files

- `apps/noter/dev/codexAppServerResearchBridge.ts`
- `apps/noter/src/lib/codexAppServerResearch.ts`
- `apps/noter/src/components/CodexAppServerResearchPage.tsx`
- `apps/noter/src/components/CodexAppServerThreadBrowserResearchPage.tsx`
- `apps/noter/src/components/CodexThreadBrowserView.tsx`

## Runtime Contract

### Thread inventory

Add a bridge endpoint:

- `GET /threads`

Behavior:

1. Ensure the local runtime is available before issuing the provider request.
2. Call provider `thread/list`.
3. Return a browser-facing response that includes:
   - `threads`
   - `nextCursor`
   - the current runtime snapshot
4. Support the following query params when provided:
   - `cwd`
   - `limit`
   - `cursor`
   - `searchTerm`
   - `sortKey`
   - `archived`
5. Default this research surface to non-archived local interactive threads,
   including `appServer` sessions created by the research page itself.

The inventory response must preserve enough metadata to review the local thread
population usefully, including:

1. provider thread id
2. preview / first-message summary
3. name
4. status
5. cwd
6. created/update timestamps
7. source
8. git metadata when available

### Thread detail

Add a bridge endpoint:

- `GET /threads/:threadId`

Behavior:

1. Ensure the local runtime is available before issuing the provider request.
2. Call provider `thread/read`.
3. Request turn hydration so the page can inspect real historical items.
4. Return:
   - `thread`
   - the current runtime snapshot

The detail surface must expose the provider thread record directly enough for
protocol research, including turns and turn items when available.

Important behavior:

1. A brand-new provider thread may not be materialized for `thread/read` with
   hydrated turns until the first user message exists.
2. The UI should surface that provider error directly instead of silently
   pretending the thread has an empty history.

### Loaded and archived thread controls

Add bridge endpoints:

- `GET /threads/loaded`
- `POST /thread/archive`
- `POST /thread/unarchive`

Behavior:

1. `thread/loaded/list` powers loaded-state badges for the browser route.
2. `thread/archive` moves a visible active thread into archived inventory.
3. `thread/unarchive` moves an archived thread back into active inventory.
4. Archived threads remain selectable in the browser route, but their detail
   panel should explain that full history and resume are unavailable until the
   thread is unarchived.

### Selected thread semantics

The research UI must track an explicit selected thread id.

Rules:

1. If the inventory is non-empty and no thread is selected, auto-select the
   first thread in the current list.
2. If a selected thread disappears from the current list, keep the id until a
   fresh detail request proves it invalid or the user chooses another thread.
3. Starting a new thread selects that new thread immediately.
4. Resuming a thread selects the resumed thread immediately.
5. Starting a turn without an explicit thread id uses the selected thread.

### UI shape

Keep two dev-only research surfaces:

1. `/research/codex-app-server` remains the protocol/control lab
2. `/research/codex-app-server/browser` is the primary browser-style inventory
   surface

The browser route should add a machine-style thread inspection layout:

1. a project list panel keyed by cwd
2. a thread list panel scoped by project and search
3. a selected-thread detail panel
4. archive/unarchive actions for the selected thread
5. a link back to the protocol lab

The thread list should show at least:

1. preview
2. provider thread id
3. status
4. cwd
5. updated time
6. loaded-state cues when the provider runtime reports them

The detail panel should show at least:

1. provider thread metadata
2. raw thread JSON
3. turn history / item history from the hydrated thread read
4. an archived-state explanation when the selected thread is in provider cold
   storage

### Status surface

`/status` may continue to include `currentThreadId` for convenience, but the UI
must treat it as an implementation detail rather than the canonical thread data
source.

### Boundary to future Convex work

This phase intentionally does not add:

1. `connectedMachines`
2. `machineThreads`
3. `machineCommands`
4. a Noter-thread to provider-thread binding record

But it must preserve the boundary required for that future work:

1. local provider thread id is opaque
2. Noter thread identity will be modeled separately later
3. the bridge contract should be reusable by a future local connector process

## Non-Goals

- remote machine pairing
- Convex-backed machine presence
- manual start/resume from the phone UI
- cloud transcript storage
- multi-provider runtime support in this phase
- replacing the PR-triggered `make connect` flow
- final product UX polish for the research page

## Acceptance

- [ ] `/research/codex-app-server/browser` shows a list of local provider
      threads rather than only one current thread id.
- [ ] A user can select an existing local provider thread and inspect hydrated
      thread detail, including turns.
- [ ] Starting a new thread adds or refreshes it in the inventory and selects it
      automatically.
- [ ] Resuming a thread selects it and refreshes its detail view.
- [ ] Archive and unarchive actions move threads between active and archived
      inventories.
- [ ] Starting a turn without manually entering a thread id uses the selected
      thread.
- [ ] The runtime card may still show `currentThreadId`, but the page remains
      functional even when multiple threads exist.
- [ ] The new bridge and page behavior are validated with both CLI requests and
      Playwright.
