# Machines Deterministic Ordering Research

## Context

- The `/machines` sidebar currently jumps because the backend list query sorts
  connected machines by live status and `lastSeenAt`.
- Presence heartbeats update `lastSeenAt` continuously, so the list can reorder
  without any user intent.
- We expect a later follow-up where operators can manually move machines in the
  list, which means each machine needs a persisted order value instead of a
  purely derived sort.

## Findings

- `connectedMachines.listConnectedMachines` currently sorts by:
  1. online before offline
  2. most recent heartbeat first
  3. display name
- `MachineConnectPage` also re-sorts the query result on the client using live
  status, control readiness, and `lastSeenAt`.
- No persisted per-machine order field exists today, so the UI cannot keep a
  stable default order and has no storage seam for future drag-to-reorder.

## Options Considered

### 1. Keep sorting by status and heartbeat recency

- Pros:
  - surfaces the most recently active machine first
- Cons:
  - rows keep moving during normal heartbeats
  - does not create a durable place to store future manual order

### 2. Sort by row creation time only

- Pros:
  - stable newest-first default
  - no new field required
- Cons:
  - still leaves no persisted order value to patch later for manual moves

### 3. Add a persisted machine-owned sidebar order now

- Pros:
  - fixes the jumping list immediately
  - gives future drag-to-reorder a real backend field to update
  - lets older rows stay stable via `_creationTime` fallback until they are
    refreshed
- Cons:
  - small schema and API expansion

## Recommendation

- Choose option 3.
- Add `sidebarOrder` to connected machine rows and expose it in the machine
  view.
- Default new machines to `sidebarOrder = now`, which yields a stable
  newest-first list.
- For older rows that predate the field, fall back to the row's `_creationTime`,
  then persist that value the next time the machine publishes a heartbeat.
- Treat machine status as display state, not as the primary sort key.

## Follow-Up Shape

- A future manual reorder flow can patch `sidebarOrder` directly without
  redesigning the machine model.
- If manual ordering becomes a hot path, we can add a dedicated
  `by_user_sidebar_order` index after a one-time backfill. The current machine
  counts are small enough that an in-memory sort is sufficient.
