# 049 Daytona Codex Auth Volume Spec

## Status

- Proposed
- Last updated: 2026-03-11

## Summary

Persist Codex CLI login for Daytona by mounting a **per-user Daytona volume** at
`CODEX_HOME` inside each sandbox. The user completes `codex login --device-auth`
from the Daytona terminal. Noter stores only connection metadata in Convex, not
the auth file itself.

This is a Daytona-specific provider flow, not a popup OAuth flow.

## Goal

Keep Codex login alive across Daytona sandbox recreation without storing
`auth.json` in Convex, git, env vars, snapshots, or repo files.

## MVP Path

This spec defines one MVP path only:

1. The user starts the Codex connect flow for a vault.
2. Noter ensures the user's dedicated Codex auth volume exists.
3. Noter launches a Daytona sandbox for the vault with that volume mounted at
   `/home/daytona/.codex`.
4. The sandbox sets `CODEX_HOME=/home/daytona/.codex`.
5. Noter opens a terminal in that sandbox and shows `codex login --device-auth`.
6. The user completes device auth in that sandbox.
7. Noter verifies with `codex login status` in that same sandbox.
8. Noter stores only metadata in `providerConnections`.

There is no second login path, popup OAuth path, or secret-copying fallback in
MVP.

## Non-Goals

1. No shared multi-user volume design.
2. No backend secret vault for Codex refresh tokens.
3. No Codex cloud-environment integration for this feature.
4. No snapshot-based auth persistence.
5. No package-cache volume work in MVP.

## Verified Facts

### OpenAI Codex

1. `codex login --device-auth` is supported by the installed CLI.
2. `codex login status` is available and is enough for a simple readiness check.
3. Codex stores auth under `CODEX_HOME`, typically in `auth.json`.
4. OpenAI documents device auth for headless/remote machines and documents
   file-based auth reuse via the Codex auth directory.

### Daytona

1. The installed `@daytonaio/sdk` already exposes
   `daytona.volume.create/get/list/delete`.
2. Sandbox create params already support mounted volumes.
3. The installed API types show each mount supports:
   - `volumeId`
   - `mountPath`
   - `subpath`
4. I do **not** see a read-only mount flag in the current installed SDK/API
   types.

### Noter

1. Provider connections already exist as first-class per-user records in
   `providerConnections`.
2. The Providers panel is the right UI home for Codex connection state.
3. Daytona launch is currently vault-scoped, so the Codex connect flow should
   attach to an existing Daytona workspace in MVP.

## Main Decision

Add Codex as a provider connection with metadata pointing to a per-user Daytona
volume.

Recommended shape:

```ts
type CodexProviderConnection = {
  kind: 'codex'
  userId: Id<'users'>
  auth: {
    method: 'device_auth'
    storage: 'daytona_volume'
    volumeId: string
    volumeName: string
    codexHome: string
    lastCheckAt?: number
    lastCheckStatus?: 'ready' | 'needs_reauth' | 'error'
  }
  createdAt: number
  updatedAt: number
}
```

## Volume Strategy

Use **one volume per user** for Codex auth.

Example name:

- `noter-codex-auth-<env>-<userId>`

Mount it at:

- `/home/daytona/.codex`

Set:

- `CODEX_HOME=/home/daytona/.codex`

Why this shape:

1. It matches the real Codex persistence primitive: the Codex home directory.
2. It survives sandbox delete/recreate.
3. It keeps auth outside the repo workspace.
4. It avoids the bad idea of mixing multiple users into one mutable auth volume.

## Security Model

Do not store Codex secrets in Convex. Store only volume metadata and status.

Do not place Codex secrets in:

1. Convex documents
2. repo files
3. Daytona env vars
4. snapshots
5. starter template files

Inside the sandbox:

1. create `CODEX_HOME` if missing as a normal bootstrap step
2. keep it outside `/home/daytona/workspace/<repo>`
3. set restrictive permissions on the directory
4. never print `auth.json`

## Deletion / Safety Concern

Your concern about an agent deleting its own persisted folder is valid.

Current conclusion:

1. Mounting outside the repo workspace is the first protection. The agent is
   less likely to touch `/home/daytona/.codex` than workspace files.
2. Use a dedicated Codex-auth volume, not a general-purpose user data volume.
3. The current installed Daytona types do not show a read-only mount option, so
   we should **not** assume Daytona can hard-protect this path from the sandbox
   process.
4. MVP should treat accidental deletion as recoverable: the user reconnects with
   `codex login --device-auth`.

## UI Contract

Add a `Codex` row to Providers.

Use the Codex app logo for this row.

Disconnected:

- Status: `Not connected in Daytona`
- Action: `Connect in Daytona`

Connected:

- Status: `Ready in Daytona`
- Actions:
  - `Open terminal`
  - `Check login`
  - `Disconnect`

Needs reauth:

- Status: `Login missing or expired`
- Actions:
  - `Reconnect in Daytona`
  - `Check login`

This row should **not** reuse the popup OAuth flow used by GitHub, Convex,
Netlify, or Cloudflare.

## User Flow

The volume is storage only. It does not execute anything. A Daytona sandbox is
required because `codex login --device-auth` and `codex login status` run inside
that sandbox with the mounted volume.

How mounting works:

1. Noter calls Daytona with sandbox create or recreate params that include
   `volumes: [{ volumeId, mountPath: "/home/daytona/.codex" }]`.
2. Daytona starts the sandbox with that path attached to the volume.
3. Inside the sandbox, `/home/daytona/.codex` behaves like a normal directory.
4. Reads and writes under that path go to the persistent Daytona volume, not
   just the sandbox's ephemeral disk.

5. User clicks `Connect in Daytona`.
6. Noter ensures the per-user Codex volume exists.
7. Noter launches the Daytona workspace with the Codex volume mounted.
8. Noter opens the terminal and shows:

```bash
codex login --device-auth
```

5. User completes device auth.
6. Noter runs `codex login status`.
7. On success, Noter writes or updates the Codex provider metadata row.

## Backend Changes

### Schema

Extend `providerConnections` with:

1. `kind: "codex"`
2. `auth.method: "device_auth"`

### New actions

Add a small module, for example:

- `apps/noter/convex/daytonaCodexAuth.ts`

Actions:

1. `ensureCodexAuthVolume`
2. `verifyCodexLoginInSandbox`
3. `disconnectCodex`
4. `getCodexConnectionStatus`

Authorization rule for all Codex auth actions:

1. Resolve the Codex provider connection from the authenticated user on the
   server.
2. Derive the Daytona `volumeId` from that server-owned record.
3. Do not trust raw client-supplied `volumeId` values or another user's
   connection identifiers.
4. If `verifyCodexLoginInSandbox` targets an existing sandbox, verify that the
   sandbox also belongs to the authenticated user before attaching or checking
   anything inside it.

### Daytona create path

When the authenticated user has a Codex provider connection, attach only that
user’s Codex auth volume during sandbox creation and recreate.

This should happen in the Daytona creation path, not by copying secrets into the
repo after boot.

## Frontend Changes

`VaultDashboard.tsx` currently assumes popup OAuth plus optional API key. Codex
adds a third mode:

- `daytona_terminal_device_auth`

Minimal frontend work:

1. allow provider rows to use a custom action model
2. add Codex actions
3. keep Codex out of API-key dialogs
4. disable the connect action when no Daytona workspace exists yet

## What Volumes Solve

Volumes solve:

1. Codex auth persistence across sandbox recreation
2. future package/tool cache persistence
3. user-specific mutable state that should not live in snapshots

## What Volumes Do Not Automatically Solve

Volumes do not automatically solve:

1. protecting files from processes running inside the sandbox
2. snapshot build speed by themselves
3. safe multi-user sharing without explicit isolation

Inference:

For snapshot speed, volumes are more relevant to **runtime cache reuse** than to
the snapshot artifact itself. I would keep snapshot optimization and volume
cache optimization as separate decisions.

## Delivery

Implement this in one phase.

Included in that phase:

1. Codex provider row with the Codex app logo
2. per-user Codex auth volume creation and metadata
3. volume attach through Daytona sandbox create and recreate params
4. terminal-based device auth in the launched sandbox
5. login verification and provider status updates
6. disconnect flow

Explicitly out of scope for this phase:

1. package-cache volumes
2. read-only volume mount research
3. recovery/export tooling
4. a separate provider-only sandbox provisioning flow

## Acceptance Criteria

1. User logs into Codex once in Daytona.
2. User deletes and recreates the sandbox.
3. `codex login status` still succeeds in the new sandbox.
4. No Codex secret is stored in Convex or repo files.
5. Codex provider UI is clearly different from popup OAuth providers.

## References

1. OpenAI Codex CLI authentication:
   https://developers.openai.com/codex/cli/authentication
2. OpenAI Codex local environments:
   https://developers.openai.com/codex/app/local-environments/
3. Daytona volumes: https://www.daytona.io/docs/en/volumes/
4. Local installed SDK volume mount types:
   `apps/noter/node_modules/@daytonaio/sdk/src/Daytona.d.ts` (`VolumeMount`,
   line 7)
5. Local installed API `subpath` type:
   `apps/noter/node_modules/@daytonaio/api-client/src/models/sandbox-volume.d.ts`
   (`subpath`, line 17)
