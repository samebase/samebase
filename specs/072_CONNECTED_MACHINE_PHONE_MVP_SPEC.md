# 072 Connected Machine Phone MVP Spec

## Document Control

- Status: Accepted
- Owner: connected machine control plane MVP
- Last updated: 2026-03-27
- Related docs:
  - `rfcs/071_CONNECTED_MACHINES_AND_REMOTE_THREAD_CONTROL_RESEARCH.md`
  - `rfcs/073_GENERIC_WORKSPACE_SURFACE_RESEARCH.md`
  - `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`
  - `specs/070_CONNECTED_MACHINE_CODEX_THREAD_STORAGE_SPEC.md`

## Summary

The smallest useful connected-machine rollout is:

1. run a local Noter connector on the operator's Mac or Windows machine
2. open `https://noter.md` from a phone
3. see connected machines
4. browse Codex thread summaries for a machine
5. open one thread, send a prompt, and read the result

This MVP is intentionally narrower than full cloud thread storage.

It does not require:

1. all thread history to be copied into Convex
2. token-level streaming through Convex
3. multi-provider support
4. PR-triggered automation as the primary flow

## Problem Statement

The real operator need is simple:

1. there is one Mac and one Windows machine
2. both machines already run Codex locally
3. the operator wants to continue working from a phone in the browser

The product should satisfy that need before building the heavier long-term
storage model.

If phase 1 tries to solve:

1. full cloud transcript continuity
2. large transcript archival
3. collaborator sharing
4. provider abstraction beyond Codex

then the first release will be slower to ship and harder to validate.

## Product Decisions (Locked)

1. Phase 1 is for one signed-in operator controlling their own machines.
2. Codex is the only required provider for this MVP.
3. Each machine runs a repo-owned local connector process.
4. The connector is cross-platform Node code and may be started manually.
5. The connector opens outbound connections only; MVP does not require inbound
   tunnels or public machine HTTP endpoints.
6. Convex stores machine presence, command rows, and thread summary rows.
7. The connector remains the source of truth for live execution and detailed
   thread reads.
8. Full normalized cloud turn storage from
   `070_CONNECTED_MACHINE_CODEX_THREAD_STORAGE_SPEC.md` is explicitly phase 2.
9. The browser UI may show coarse progress and final responses, but token-level
   delta streaming is not required.
10. If a command requires local approval semantics the MVP may surface a
    pending-state message instead of implementing full remote approval UX.
11. New connected-machine UI work should depend on Noter-owned workspace verbs,
    not raw `api.github.*` calls or raw GitHub REST endpoint names.
12. The phase-1 generic surface only needs the `catalog` and `threads`
    capability buckets from `rfcs/073_GENERIC_WORKSPACE_SURFACE_RESEARCH.md`.

## User Stories

### Connected machines

1. Open `noter.md` on a phone and see whether the Mac and Windows machine are
   online.
2. Distinguish machines by human-readable name, hostname, and OS.

### Thread browsing

1. Pick one machine and browse its available Codex threads.
2. See the same basic grouping and summary information that matters in Codex:
   project, worktree, title/first prompt, updated time, pinned, archived, and
   loaded state.

### Continue work

1. Open a thread from the phone.
2. Read enough thread detail to understand context.
3. Send a prompt to continue the work.
4. See the command run, complete, and return a result.

### Optional nice-to-have within MVP

1. Start a new thread from the phone if there is no existing thread to resume.

## System Shape

### Local connector

Each machine runs one local connector process that:

1. owns the local Codex runtime/app-server
2. syncs machine heartbeats
3. syncs thread summary rows
4. watches for commands from Convex
5. executes those commands against local Codex
6. writes command results back to Convex

This connector reuses the local Codex app-server contract already proven by
`specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`.

### Convex role

Convex is the MVP control plane.

It stores:

1. which machines are online
2. which thread summaries exist for each machine
3. which commands are pending/running/completed
4. the latest result payloads needed by the phone UI

Convex is not yet the primary long-term store for full normalized thread history
in this MVP.

### Browser role

The phone/web UI:

1. queries connected machines
2. queries thread summary rows
3. sends commands through Convex
4. reads command state and results back from Convex

The browser does not need a direct socket or direct HTTP route to the local
machine in phase 1.

## MVP Convex Tables

### `connectedMachines`

Required fields:

1. `userId`
2. `machineId`
3. `displayName`
4. `hostname`
5. `os`
6. `status`
7. `lastSeenAt`
8. `connectorVersion`
9. `capabilities`
10. `allowedRoots`

Purpose:

1. machine list from the phone
2. online/offline heartbeat state
3. basic capability gating

### `machineThreads`

Phase-1 summary rows only.

Required fields:

1. `userId`
2. `machineId`
3. `provider`
4. `providerThreadId`
5. `projectRoot`
6. `projectLabel`
7. `workspaceLabel`
8. `branch`
9. `title`
10. `preview`
11. `updatedAt`
12. `loaded`
13. `pinned`
14. `archived`
15. `sourceKind`
16. `lastSyncedAt`

Purpose:

1. fast machine/thread sidebar queries
2. grouping by project root and worktree
3. enough context to decide which thread to open from a phone

This table is intentionally a summary cache, not full thread storage.

### `machineCommands`

Required fields:

1. `userId`
2. `machineId`
3. `commandType`
4. `payload`
5. `state`
6. `idempotencyKey`
7. `createdAt`
8. `claimedAt`
9. `completedAt`
10. `result`
11. `error`

Required command types:

1. `readThread`
2. `sendTurn`

Optional MVP command types:

1. `startThread`
2. `refreshThreads`

Purpose:

1. browser-to-machine command delivery
2. machine-to-browser result reporting
3. coarse progress visibility without a separate event store

## UI Scope

### Must ship

1. machine list
2. machine detail route with thread browser
3. selected-thread detail panel
4. prompt box for continuing a thread
5. command status/result surface

### Can wait

1. remote archive/unarchive controls
2. remote interrupt
3. remote approvals
4. collaborator-visible machine sharing
5. cloud transcript timeline outside the selected-thread read flow

## Sync And Command Model

### Connector startup

1. authenticate the connector as the signed-in operator
2. register/update the `connectedMachines` row
3. ensure the local Codex runtime is available
4. sync current thread summaries into `machineThreads`

### Thread selection

1. browser selects a thread from `machineThreads`
2. browser writes a `readThread` command
3. connector reads the full thread detail from local Codex
4. connector writes the result payload into the command row
5. browser renders that result

### Continue thread

1. browser writes a `sendTurn` command with machine id, provider thread id, and
   prompt
2. connector claims the command
3. connector ensures the thread is locally resumable
4. connector sends the turn to Codex
5. connector updates command state while running
6. connector writes final response/result into the command row
7. connector refreshes the relevant `machineThreads` summary row

## Realtime Rules

1. machine presence is realtime
2. thread summary rows are realtime enough for browsing
3. command state is realtime
4. full thread detail is on-demand through `readThread`
5. phase 1 does not require token-level streaming or a globally realtime
   transcript store

## Explicit Non-Goals

This MVP does not require:

1. PR-triggered automation as the primary flow
2. full normalized `machineThreadTurns` storage in Convex
3. Cloudflare R2 archival
4. Claude or multi-provider support
5. inbound network access to the local machine
6. packaging the connector as a system service/installer
7. cross-user machine sharing

## Acceptance

- [ ] A signed-in operator can connect one Mac and one Windows machine.
- [ ] `noter.md` can show both machines from another device such as a phone.
- [ ] The UI can query machine thread summaries without loading full
      transcripts.
- [ ] The UI can request thread detail on demand for a selected thread.
- [ ] The UI can send a prompt to an existing thread from the phone.
- [ ] The UI can show command state and final result for that prompt.
- [ ] If a machine is offline, the UI shows that state and does not pretend the
      command can run.
- [ ] Phase 1 does not require `machineThreadTurns` or full transcript storage
      in Convex.
