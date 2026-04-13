# 076 Connected Machine Registration And Presence Rollout Spec

## Document Control

- Status: Accepted
- Owner: connected machine onboarding + presence
- Last updated: 2026-04-02
- Related docs:
  - `rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md`
  - `specs/075_CONNECTED_MACHINE_INSTALLER_LOCAL_WALKTHROUGH_SPEC.md`
  - `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`
  - `research/2026-04-02-machines-deterministic-ordering.md`
  - `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`
  - `archive/077_CONNECTED_MACHINE_PRESENCE_MERGE_CHECKLIST_SPEC.md`

## Summary

`#386` shipped the connected-machine registration and presence foundation on
`main`.

Noter now has:

1. a hosted `/noter.ts` installer artifact mirrored from
   `packages/sync/noter.ts`
2. a machine-scoped config file at `~/.noter/config.json`
3. a `/machines/connect` browser handoff and approval page
4. one live machine credential per approved machine
5. a long-running `noter-sync run` command that publishes machine heartbeats
6. a `connectedMachines` table and auth-bound machine list in Noter

## Locked Product Decisions

1. The installer and machine auth remain separate from hosted plugin auth.
2. Plugin auth and machine auth stay separate concerns.
3. The browser handoff page at `/machines/connect` remains the approval
   checkpoint between local bootstrap and durable machine registration.
4. The connector must authenticate with a machine-scoped credential, not with a
   copied browser session and not with a manually pasted admin deploy key.
5. The local config stays machine-scoped at `~/.noter/config.json`; reruns
   update one installation record instead of creating parallel installs.
6. The current connected-machine capability set is `presence` only.
7. The current connected-machine rows do not yet carry thread summaries, command
   queues, or tunnel metadata.
8. The next phone-control slice should extend this shipped foundation instead of
   replacing it.

## Current Behavior

### Installer and approval flow

1. `noter-sync connect` validates its source URL and checks `codex --version` so
   the Codex CLI is available on `PATH`.
2. The CLI creates a machine registration request and writes
   `~/.noter/config.json`.
3. The browser handoff page lets the signed-in user approve the pending machine.
4. Approval activates exactly one live credential for that machine.

### Presence flow

1. `noter-sync run` reads the stored machine credential.
2. The connector publishes `online` heartbeats while it runs.
3. On clean shutdown, the connector publishes one final `offline` heartbeat.
4. Stale heartbeats resolve to `offline` in browser-visible machine state.

### Current machine model

The current `connectedMachines` row and view include:

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
11. `sidebarOrder` on the `connectedMachines` row is optional, while the
    `connectedMachines` view returns a required effective `sidebarOrder` using a
    deterministic machine-owned fallback when the stored row value is missing

The connected machine list must use a deterministic machine-owned sidebar order
instead of heartbeat recency so normal presence updates do not reshuffle the
browser-visible machine list.

## Source Of Truth Files

- `packages/sync/noter.ts`
- `packages/sync/package.json`
- `apps/noter/convex/connectedMachineHttp.ts`
- `apps/noter/convex/connectedMachines.ts`
- `apps/noter/convex/connectedMachineModel.ts`
- `apps/noter/convex/schema.ts`
- `apps/noter/src/components/MachineConnectPage.tsx`

## What This Spec Does Not Define

This spec is intentionally limited to registration, approval, durable
credentials, and presence.

It does **not** define:

1. thread summary sync
2. remote thread detail reads
3. remote prompt sending
4. Cloudflare tunnel lifecycle
5. machine-control token brokerage

Those follow-on phone-control decisions now live in
`rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`.

## Current Guarantees

### Slice 1

- [x] `packages/sync/noter.ts` is the canonical installer and runner source.
- [x] The hosted `/noter.ts` artifact mirrors the checked-in source.
- [x] The browser handoff page supports explicit machine approval.
- [x] The local connector authenticates with a machine-scoped credential.
- [x] Noter can list approved machines with truthful online and offline state.
- [x] Noter lists approved machines in a deterministic newest-first default
      order until a later manual reorder flow exists.
