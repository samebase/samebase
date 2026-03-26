# 070 Connected Machine Codex Thread Storage Spec

## Document Control

- Status: Accepted
- Owner: connected machine control plane + Codex thread storage
- Last updated: 2026-03-26
- Related docs:
  - `rfcs/071_CONNECTED_MACHINES_AND_REMOTE_THREAD_CONTROL_RESEARCH.md`
  - `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`

## Summary

Noter will let a signed-in user view and drive Codex running on their own
machine from `https://noter.md`, including from a phone.

To do that without overloading Convex or shipping a slow web UI:

1. the local machine connector remains the source of truth for live provider
   execution
2. Noter stores a normalized cloud copy of machine-thread state in Convex
3. the web UI queries small summary tables and paginated turn tables, not raw
   provider session logs
4. raw provider JSONL and other bulky logs remain local for now and move to R2
   later

This spec accepts a Convex-first storage model for normalized thread data. It
does not require direct browser reads from the local connector just to render
thread history.

## Problem Statement

The current research browser proves that Noter can inspect local Codex threads
through `codex app-server`, but that is still a machine-local surface.

To make the product work from `noter.md` on another device:

1. the connector needs to sync enough thread state into the cloud for the UI to
   be useful when opened from a phone
2. the synced shape cannot simply mirror the raw provider session files, or the
   UI will pay for too much data and too much reactive churn
3. command and display paths must stay separate enough that the web UI can be
   fast without losing durable machine-thread correctness

## Design Inputs

Measured locally on 2026-03-26:

1. raw local Codex thread store:
   - `178` files
   - `681,048,707` bytes total, about `650 MiB`
2. current active thread `019d26dc-1419-7f20-807b-5d03ad9bac8e`:
   - raw JSONL file size: `39,353,566` bytes, about `37.5 MiB`
3. normalized hydrated version of that same thread through the research bridge:
   - `29` turns
   - all normalized turns together: about `476 KB`
   - largest normalized turn: about `44.6 KB`

Conclusion:

1. storing raw provider session files in Convex as-is is the wrong shape
2. storing normalized thread and turn records in Convex is viable
3. the main optimization target is query shape and reactive fanout, not whether
   Convex can hold text at all

## Product Decisions (Locked)

1. Noter stores normalized machine-thread data in Convex.
2. The web UI reads machine-thread data from Convex, not by directly asking the
   machine connector for every render.
3. The connector syncs normalized data in bounded batches.
4. The web UI subscribes to summary tables by default.
5. Full turn history is loaded lazily and paginated.
6. Raw provider JSONL remains local in phase 1 and is not copied into Convex as
   a primary storage shape.
7. The canonical cloud thread id remains Noter-owned and separate from the
   machine-local Codex thread id.
8. One normalized turn per Convex document is the default phase-1 storage unit.
9. If a future turn exceeds safe document limits, that turn may be split into
   contiguous chunks without changing the higher-level API.
10. Summary/read-model rows are updated in the same mutation as their
    corresponding normalized canonical rows for each sync batch.

## Data Tiers

### Tier 1: Local provider logs

Lives on the operator machine.

Examples:

1. raw Codex JSONL session files
2. high-volume internal provider events
3. protocol-level diagnostic noise not needed by the product UI

Why:

1. this is the highest-volume data
2. it is not the shape the UI should query
3. it remains available for debugging and future exports

### Tier 2: Convex normalized operational history

Lives in Noter's Convex deployment.

Examples:

1. connected machine presence
2. Noter-thread to Codex-thread bindings
3. thread summary rows for the sidebar and machine views
4. normalized turn history for on-demand display
5. command queue state
6. approval state

Why:

1. this is the data the web UI actually needs
2. it needs auth, queryability, and durable cross-device access
3. it is much smaller than the raw provider logs once normalized

### Tier 3: Future cold storage

Phase 2+.

Examples:

1. archived full normalized thread bundles
2. exported provider logs
3. screenshots and attachments

Destination:

1. Cloudflare R2

## Convex Tables

### `connectedMachines`

One row per paired machine.

Required fields:

1. `userId`
2. `machineId`
3. `displayName`
4. `os`
5. `hostname`
6. `connectorVersion`
7. `lastSeenAt`
8. `status`
9. `capabilities`
10. `allowedRoots`

Purpose:

1. phone and web machine list
2. heartbeat and online/offline state
3. connector capability gating

### `machineCommands`

One row per requested command from Noter to a machine.

Required fields:

1. `userId`
2. `machineId`
3. `commandType`
4. `payload`
5. `state`
6. `idempotencyKey`
7. `claimedAt`
8. `completedAt`
9. `error`

Purpose:

1. start thread
2. resume thread
3. send turn input
4. interrupt turn
5. future approval actions

### `machineThreads`

One row per Noter-owned cloud thread bound to a machine-local Codex thread.

This is both:

1. the binding record
2. the main summary row queried by the UI

Required fields:

1. `userId`
2. `noterThreadId`
3. `machineId`
4. `provider`
5. `providerThreadId`
6. `projectRoot`
7. `projectLabel`
8. `workspaceLabel`
9. `branch`
10. `title`
11. `preview`
12. `sourceKind`
13. `archived`
14. `pinned`
15. `loaded`
16. `latestTurnId`
17. `latestTurnStatus`
18. `latestAssistantSnippet`
19. `turnCount`
20. `updatedAt`
21. `lastSyncedAt`

Purpose:

1. sidebar and project grouping
2. pinned section
3. machine-thread bindings
4. fast list queries from phone

### `machineThreadTurns`

One row per normalized turn.

Required fields:

1. `userId`
2. `noterThreadId`
3. `machineId`
4. `providerThreadId`
5. `providerTurnId`
6. `turnIndex`
7. `status`
8. `startedAt`
9. `completedAt`
10. `firstUserMessage`
11. `finalAssistantMessage`
12. `items`
13. `itemCount`
14. `hasContextCompaction`
15. `syncBatchId`

Notes:

1. `items` stores normalized message-like entries only
2. provider-internal raw event noise does not belong here
3. this table is paginated when displayed in the UI

Purpose:

1. thread detail rendering
2. turn-level diffing and lazy loading
3. keeping turn docs comfortably smaller than raw provider logs

## Sync Model

### Connector responsibilities

The local connector must:

1. subscribe for commands from Convex
2. maintain local Codex runtime ownership
3. translate provider thread/turn state into normalized Noter records
4. sync those records in bounded batches

### Batch shape

A sync batch may include:

1. one `machineThreads` upsert
2. zero or more `machineThreadTurns` inserts or updates
3. optional command-state transitions
4. optional heartbeat updates

Each batch must have:

1. an idempotency key
2. a monotonically increasing connector-local sequence number or timestamp

### Consistency model

The system is intentionally eventual at the machine-to-cloud boundary.

That means:

1. the machine may still be working while the phone sees the previous synced
   batch
2. after a batch arrives, the relevant summary and turn rows are updated
   atomically inside one Convex mutation

This gives:

1. bounded lag between local execution and cloud visibility
2. no partial Convex state where the canonical turn rows changed but the summary
   row did not

## Query Model

### Default UI reads

The main web UI should query:

1. `connectedMachines` for machine presence
2. `machineThreads` for sidebar and machine-level thread lists
3. `machineThreadTurns` only when a thread is opened

### Sidebar query rules

The sidebar must:

1. read only `machineThreads`
2. filter and sort by indexed fields
3. group by `projectRoot` client-side from the returned summary rows
4. render pinned threads from summary rows where `pinned === true`

The sidebar must not:

1. load full turn history for every visible thread
2. subscribe to raw item arrays for the whole machine

### Thread detail rules

The thread detail page must:

1. load header and latest state from `machineThreads`
2. page through `machineThreadTurns`
3. render turns collapsed by default when appropriate
4. avoid realtime subscription to the entire history by default

Only the selected active thread may subscribe to a narrow live slice if needed.

## Realtime Rules

1. Machine presence is realtime.
2. Thread summary rows are realtime.
3. Full turn history is not globally realtime.
4. The connector batches active-thread updates instead of writing every provider
   event into Convex immediately.
5. Phase 1 does not stream token-level deltas through Convex.

## Indexing Requirements

At minimum, `machineThreads` needs indexes for:

1. `userId`, `updatedAt`
2. `userId`, `machineId`, `updatedAt`
3. `userId`, `archived`, `updatedAt`
4. `userId`, `projectRoot`, `updatedAt`
5. `userId`, `providerThreadId`
6. `userId`, `noterThreadId`

At minimum, `machineThreadTurns` needs indexes for:

1. `userId`, `noterThreadId`, `turnIndex`
2. `userId`, `providerThreadId`, `turnIndex`

## Why This Uses Denormalized Read State

This spec intentionally accepts denormalized summary rows.

In this design:

1. `machineThreadTurns` is the normalized detail layer
2. `machineThreads` is the denormalized read layer

That means the UI does not need to:

1. scan all turns just to build a sidebar
2. derive title, preview, last status, or pin/archive state on every query
3. pay reactive cost for data the sidebar does not show

This is the right tradeoff for Convex because the product needs:

1. small indexed queries
2. bounded realtime fanout
3. fast cold opens from a phone

## Communication Flow

### Start thread

1. browser writes a `machineCommands` row
2. connector claims it
3. connector starts a local Codex thread
4. connector writes or updates `machineThreads`
5. connector completes the command row

### Continue a thread

1. browser writes a turn command to `machineCommands`
2. connector claims it
3. connector sends the input to Codex
4. connector syncs normalized turn batches to Convex while the turn runs
5. browser sees updated `machineThreads` and later paged `machineThreadTurns`

## Non-Goals

This spec does not yet define:

1. collaborator sharing of machines
2. Claude Code or multi-provider abstractions beyond a provider field
3. Cloudflare Durable Object fanout
4. final R2 archival format
5. direct local HTTP browsing from the phone

## Acceptance

- [ ] A paired machine can sync normalized thread summaries into Convex.
- [ ] A signed-in user can open `noter.md` on another device and see their
      connected machines.
- [ ] A signed-in user can see machine thread lists from Convex without loading
      full history.
- [ ] Pinned, archived, loaded, branch, and project-root state are available
      from `machineThreads`.
- [ ] A signed-in user can open a thread detail view and paginate normalized
      turns from Convex.
- [ ] The sidebar uses only summary rows, not full turn rows.
- [ ] The connector updates summary rows and turn rows atomically per sync
      batch.
- [ ] Raw provider JSONL is not mirrored into Convex as a primary storage shape.
- [ ] The command path for start/resume/continue goes through `machineCommands`.

## Supporting Sources

- Convex best practices:
  - https://docs.convex.dev/understanding/best-practices
- Convex reading data:
  - https://docs.convex.dev/database/reading-data
- Convex document ids and table modeling:
  - https://docs.convex.dev/database/document-ids
- Convex database/state limits:
  - https://docs.convex.dev/production/state/limits
- Convex data types:
  - https://docs.convex.dev/database/types
- Convex trigger tradeoffs:
  - https://stack.convex.dev/triggers
