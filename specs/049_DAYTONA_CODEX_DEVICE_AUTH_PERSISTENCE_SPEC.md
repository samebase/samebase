# 049 Daytona Codex Auth Volume Spec

## Status

- Proposed
- Last updated: 2026-03-11

## Summary

Persist Codex CLI login for Daytona by mounting a **per-user Daytona volume** at
`CODEX_HOME` inside each sandbox. The user completes `codex login --device-auth`
from the existing Daytona terminal iframe. Noter stores only connection metadata
in Convex, not the auth file itself.

This is a Daytona-specific provider flow, not a popup OAuth flow.

## Goal

Keep Codex login alive across Daytona sandbox recreation without storing
`auth.json` in Convex, git, env vars, snapshots, or repo files.

This spec only solves persistent Codex identity reuse in Daytona. It does not
yet make Noter drive Codex directly.

## MVP Path

This spec defines one MVP path only:

1. The user opens Providers and clicks `Connect in Daytona` on the `Codex` row.
2. Noter ensures the user's dedicated Codex auth volume exists and is ready.
3. Noter creates or reuses a lightweight per-user Daytona auth sandbox with that
   volume mounted at `/root/.codex`.
4. The auth sandbox sets `CODEX_HOME=/root/.codex`.
5. Noter verifies that `codex` is installed in that sandbox before prompting for
   login.
6. Noter opens the existing Daytona terminal iframe for that auth sandbox and
   shows `codex login --device-auth`.
7. The user completes device auth in that sandbox.
8. Noter verifies with `codex login status` in that same sandbox.
9. Noter stores only metadata in `providerConnections`.
10. Later, vault sandboxes mount that same per-user volume at `/root/.codex` so
    the login is reused across vaults.

There is no second login path, popup OAuth path, or secret-copying fallback in
MVP.

## Non-Goals

1. No shared multi-user volume design.
2. No backend secret vault for Codex refresh tokens.
3. No Codex cloud-environment integration for this feature.
4. No snapshot-based auth persistence.
5. No package-cache volume work in MVP.
6. No custom xterm terminal in this spec.
7. No `codex app-server` runtime in this spec.
8. No ChatFab or Codex-observer integration in this spec.
9. No Noter-driven Codex task execution in this spec.

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
3. The Providers panel is the right place to start Codex login because Codex
   auth is per-user, not per-vault.
4. Noter already has a Daytona terminal iframe surface that is good enough for
   this first auth flow.
5. The existing repo already treats Codex as a machine-level CLI in dev
   environments rather than as a normal workspace dependency.
6. The current Daytona terminal flow in Noter runs as `root` in practice, so the
   tested Codex auth path is `/root/.codex`.
7. The existing Daytona deps image already installs Codex globally, which makes
   it a good base for a lightweight auth sandbox.

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

- `/root/.codex`

Set:

- `CODEX_HOME=/root/.codex`

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

1. keep `CODEX_HOME` outside `/home/daytona/workspace/<repo>`
2. let the Daytona volume mount provide that path
3. set `CODEX_HOME` ownership to the runtime user and group for the sandbox
   session
4. set `CODEX_HOME` directory mode to `0700`
5. set `auth.json` mode to `0600`
6. never print `auth.json`

For the current Daytona terminal path, the runtime user is `root`, so MVP should
assume `root:root` ownership for `/root/.codex` and `auth.json`.

## Deletion / Safety Concern

Your concern about an agent deleting its own persisted folder is valid.

Current conclusion:

1. Mounting outside the repo workspace is the first protection. The agent is
   less likely to touch `/root/.codex` than workspace files.
2. Use a dedicated Codex-auth volume, not a general-purpose user data volume.
3. The current installed Daytona types do not show a read-only mount option, so
   we should **not** assume Daytona can hard-protect this path from the sandbox
   process.
4. MVP should treat accidental deletion as recoverable: the user reconnects with
   `codex login --device-auth`.

Optional hardening to revisit only if MVP proves too weak:

1. tighter UID separation if Daytona starts exposing a better non-root terminal
   path for this flow
2. a recovery or export path for the auth directory
3. immutable or append-only filesystem flags if they are supported in the target
   Daytona runtime
4. platform-level protections such as dedicated labels or mount policies if
   Daytona later exposes them cleanly

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

For MVP, `Open terminal` uses the existing Daytona terminal iframe, not a custom
terminal implementation.

The Codex row should not require the user to create or choose a vault first.

## User Flow

The volume is storage only. It does not execute anything. A Daytona sandbox is
required because `codex login --device-auth` and `codex login status` run inside
that sandbox with the mounted volume.

How mounting works:

1. Noter calls Daytona with sandbox create or recreate params that include
   `volumes: [{ volumeId, mountPath: "/root/.codex" }]`.
2. Daytona starts the sandbox with that path attached to the volume.
3. Inside the sandbox, `/root/.codex` behaves like a normal directory.
4. Reads and writes under that path go to the persistent Daytona volume, not
   just the sandbox's ephemeral disk.

5. User opens Providers.
6. User clicks `Connect in Daytona` on the `Codex` row.
7. Noter ensures the per-user Codex volume exists and waits for it to reach a
   ready state before sandbox creation.
8. Noter creates or reuses a dedicated per-user auth sandbox such as
   `noter-codex-auth-<env>-<userId>`.
9. That auth sandbox is not tied to any vault repo checkout. It is just a light
   terminal environment for Codex login and status checks.
10. Noter bases that auth sandbox on the existing Daytona deps image so `codex`
    is already available without waiting for a vault snapshot.
11. Noter runs a preflight check like `command -v codex`.
12. If `codex` is missing, stop here and show an explicit failure state. Do not
    start a fallback auth flow.
13. If `codex` is present, Noter opens the existing Daytona terminal iframe and
    tells the user to run `codex login --device-auth` there.
14. User runs the command and completes device auth.
15. Noter runs `codex login status`.
16. If `codex login status` exits `0`, Noter writes or updates the Codex
    provider metadata row with `lastCheckStatus = "ready"`.
17. If `codex login status` exits non-zero or times out, Noter still updates the
    provider metadata row, but only with `lastCheckStatus = "needs_reauth"` or
    `"error"` plus the failure message. Noter must not mark the provider
    connected in that case.
18. The UI shows that failure state with a retry path (`Reconnect in Daytona`
    and `Check login`) instead of pretending login succeeded.
19. When a vault sandbox is later launched, Noter mounts the same per-user Codex
    volume into that vault sandbox so the login is reused there too, but only
    while the Codex provider connection exists for that user.

This flow intentionally stops at "Codex is authenticated and reusable in
Daytona." It does not yet cover how Noter talks to a running Codex runtime.

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
2. `prepareCodexAuthSandbox`
3. `verifyCodexLoginInSandbox`
4. `disconnectCodex`
5. `getCodexConnectionStatus`

Authorization rule for all Codex auth actions:

1. Resolve the Codex provider connection from the authenticated user on the
   server.
2. Derive the Daytona `volumeId` from that server-owned record.
3. Do not trust raw client-supplied `volumeId` values or another user's
   connection identifiers.
4. If `verifyCodexLoginInSandbox` targets an existing sandbox, verify that the
   sandbox also belongs to the authenticated user before attaching or checking
   anything inside it.
5. `prepareCodexAuthSandbox` must only create, reuse, or inspect the
   authenticated user's dedicated Codex auth sandbox.

### Daytona create paths

Auth sandbox path:

1. The Providers flow creates or reuses only the authenticated user's dedicated
   Codex auth sandbox.
2. That auth sandbox mounts only the authenticated user's Codex auth volume.
3. This should happen in the Daytona creation path, not by copying secrets into
   the repo after boot.

Vault sandbox path:

1. When a vault sandbox is created or recreated, and the user has a Codex
   provider connection, attach only that user's Codex auth volume there too.
2. If an older vault sandbox is missing the expected Codex mount, recreate it so
   it becomes compatible.
3. If the user disconnects Codex, new vault sandboxes must stop mounting the
   Codex auth volume.
4. Disconnect should clear the shared Codex auth directory before removing
   metadata, even if Daytona cannot immediately delete the volume because
   another sandbox still has it mounted.

## Frontend Changes

`VaultDashboard.tsx` currently assumes popup OAuth plus optional API key. Codex
adds a third mode:

- `daytona_terminal_device_auth`

Minimal frontend work:

1. allow provider rows to use a custom action model
2. add a `Codex` provider row with the Codex app logo
3. keep Codex out of popup OAuth and API-key dialogs
4. route `Connect in Daytona` through the new per-user auth-sandbox flow
5. show the existing Daytona terminal iframe directly from that provider flow
6. later, let vault Daytona launches reuse the stored provider connection

For Noter-managed Daytona snapshots, install the Codex CLI globally in the
snapshot baseline so the terminal can run bare `codex` commands. Keep the
runtime preflight check anyway to catch old snapshots or other unexpected drift.

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
3. dedicated per-user Daytona auth sandbox from Providers
4. existing-Daytona-terminal-iframe device auth in that auth sandbox
5. `codex` preflight presence check before login
6. login verification and provider status updates
7. volume attach through vault Daytona sandbox create and recreate params
8. disconnect flow

Explicitly out of scope for this phase:

1. package-cache volumes
2. read-only volume mount research
3. recovery/export tooling
4. xterm or custom terminal work
5. `codex app-server` integration
6. ChatFab/Codex observer integration
7. Noter-driven Codex execution beyond manual terminal use

## Acceptance Criteria

1. User logs into Codex once in Daytona.
2. The login is initiated from Providers without requiring an existing vault.
3. User deletes and recreates a vault sandbox.
4. `codex login status` still succeeds in the new vault sandbox.
5. If `codex` is missing in the sandbox, the UI fails fast with a clear error.
6. No Codex secret is stored in Convex or repo files.
7. Codex provider UI is clearly different from popup OAuth providers.
8. MVP uses the existing Daytona terminal iframe, not a new terminal stack.
9. The Codex row shows explicit loading, ready, reconnect, and error states.
10. A failed `Check login` attempt leaves the provider in `needs_reauth` or
    `error`, with a retry action and no false "connected" state.
11. Disconnect removes the provider row state for that user and clears the
    shared auth directory even if Daytona delays final volume deletion because
    another sandbox still has it mounted.
12. Error flows do not leak `auth.json` or other Codex secrets into Convex, repo
    files, or user-facing logs.

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
