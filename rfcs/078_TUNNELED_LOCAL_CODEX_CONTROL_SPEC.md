# 078 Tunneled Local Codex Control Spec

## Document Control

- Status: Proposed
- Owner: connected machine local control
- Last updated: 2026-03-31
- Related docs:
  - `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`
  - `specs/075_CONNECTED_MACHINE_INSTALLER_LOCAL_WALKTHROUGH_SPEC.md`
  - `specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`
  - `rfcs/072_CLOUDFLARE_TUNNEL_LOCAL_ANON_PREVIEW_RESEARCH.md`
  - `rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md`
  - `rfcs/070_NOTER_UI_PR_TRIGGERED_CODEX_LOCAL_AUTOMATION_RESEARCH.md`

## Summary

`main` now has the connected-machine foundation:

1. a machine-scoped `noter.js` / `@noter-md/sync` installer
2. browser-backed machine approval
3. durable machine credentials
4. online and offline machine presence in Noter
5. a local-only Codex thread browser research surface

The shortest path from that foundation to "use Codex from mobile" is **not**
syncing thread summaries into Convex first.

The proposed next MVP is:

1. keep Noter and Convex for machine ownership, presence, tunnel discovery, and
   token brokerage
2. extract the local Codex research bridge into a standalone machine-local HTTP
   control service
3. have `noter-sync run` supervise that service plus a Cloudflare Tunnel
4. let the Noter mobile UI call the tunneled local service directly with
   short-lived Noter-issued machine-control tokens

This keeps the hot control path machine-local while still letting the phone use
normal Noter auth and machine ownership rules.

## Why This RFC Exists

The current local research browser already proves that the machine can:

1. list local provider threads
2. read a thread
3. start or resume a thread
4. send turns

The connected-machine foundation already proves that Noter can:

1. bootstrap a machine-scoped connector
2. approve one machine in the browser
3. keep a machine visible as online or offline

The missing piece is remote reachability from the phone.

If we make Convex the primary thread data path before shipping phone control,
the first release gets slower and more indirect than the operator needs.

## What This RFC Supersedes

This RFC intentionally replaces the older follow-on idea that the next slices
after registration and presence should be:

1. thread summary sync into Convex first
2. `machineCommands` plus `readThread` / `sendTurn` as the first remote-control
   path

`specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md` remains
the source of truth for the shipped registration and presence foundation. It is
no longer the source of truth for the next phone-control slice.

## Product Goal

The operator should be able to:

1. connect a machine to Noter
2. leave `noter-sync run` active on that machine
3. open Noter on a phone
4. select the connected machine
5. browse the current local Codex threads on that machine
6. open one thread
7. send a prompt and read the result

This MVP does **not** require cloud transcript storage or Convex-backed thread
summary sync first.

## Complete Walkthrough

This is the intended happy path after this RFC ships.

### 1. Connect the machine from `noter.md`

1. The operator logs in to `noter.md` on a desktop browser.
2. The operator opens `/machines/connect`.
3. The page shows a `Connect machine` flow and the install command. Run it in a
   shell with `pipefail` enabled so a failed download does not look successful:

```bash
set -o pipefail
curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'
```

In Windows PowerShell the direct-download form should use:

```powershell
curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'
```

### 2. Bootstrap the local machine

1. The operator runs the install command on the machine they want to control.
2. The CLI validates the `sourceUrl`, checks `codex --version`, creates a
   pending machine registration request, and writes `~/.noter/config.json`.
3. The CLI opens the browser to:

`https://noter.md/machines/connect?openedByCli&requestId=...`

### 3. Approve the machine in the browser

1. The machine-connect page shows the pending machine summary.
2. The operator clicks `Approve machine`.
3. Noter activates the machine and issues a machine-scoped credential.
4. For live control, the machine also needs `cloudflared` available on `PATH`.
5. The page then shows the long-running command, again with `pipefail` enabled:

```bash
set -o pipefail
curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run
```

In Windows PowerShell:

```powershell
curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - run
```

### 4. Start live control on the machine

1. The operator runs the `run` command on the connected machine.
2. `noter-sync run` reads `~/.noter/config.json`, verifies that `cloudflared` is
   available, and starts:
   - the heartbeat loop
   - the local control service
   - the Cloudflare quick tunnel process
3. The local control service binds loopback only, and the tunnel becomes the
   only remote ingress path.
4. The connector only publishes live-control metadata after the local service is
   enforcing machine-control auth correctly and reporting that state through
   `/status`.
5. If `cloudflared` is missing or unhealthy, `noter-sync run` may keep
   publishing plain presence while marking live control unavailable.
6. Until that happens, the machine may still appear as plain online presence
   without advertising live control.

### 5. Open the machine from a phone

1. The operator logs in to `noter.md` on their phone.
2. The operator opens the Machines page and selects the connected machine.
3. Noter opens a Noter-owned route such as:

`/machines/:machineId/live`

4. That page reads the current machine view, including `controlUrl` and
   live-control readiness.
5. The page requests a short-lived machine-control token for the selected
   machine.
6. Noter only issues the token if the signed-in user owns the machine and the
   machine is currently live-control ready.

### 6. Browse threads and send prompts

1. The phone page calls the tunneled local service directly with:

`Authorization: Bearer <machine-control-token>`

2. The local service introspects the token with Noter.
3. If validation succeeds, the phone can:
   - list the current local Codex threads
   - open a thread
   - send a prompt
   - interrupt a running turn
4. Responses stream between the phone, the tunnel, the local control service,
   and the local Codex runtime on the machine.

### 7. Failure behavior

1. If `noter-sync run` stops, the machine falls back to offline or
   non-live-control state.
2. If the tunnel dies or auth introspection is unhealthy, Noter must stop
   advertising the machine as live-control ready.
3. On connection or stream failure, the phone refetches the machine view before
   retrying so stale quick-tunnel URLs are not reused blindly.
4. The phone must not keep working through stale tunnel metadata or stale auth.

## Locked Decisions

1. The machine registration and presence flow from
   `specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`
   remains the prerequisite foundation.
2. The current dev-only Vite bridge is not the shipping remote-control surface.
3. The shipping local control path uses a standalone machine-local HTTP service.
4. `noter-sync run` is the long-running owner of:
   - presence heartbeats
   - local control service lifecycle
   - tunnel lifecycle
5. The first remote transport is a Cloudflare quick tunnel with an ephemeral
   URL.
6. The phone stays on a Noter-owned page on `noter.md`; it does not navigate to
   a raw tunneled app as the product UI.
7. The tunneled local service accepts only short-lived Noter-issued
   machine-control tokens, not raw browser cookies and not the machine
   credential.
8. Token validation uses opaque-token introspection for v1, not local JWT
   verification.
9. The local service must deny unauthenticated requests before Noter publishes
   or advertises any live tunnel URL.
10. Convex thread summary sync is not required for the first usable phone
    control release.
11. QR pairing is not required for the MVP.

## Current Repo Inputs

The proposed direction builds on work already present in this repo:

1. `packages/sync/noter.js`
   - machine bootstrap
   - durable machine credential storage
   - long-running heartbeat publishing via `noter-sync run`
2. `apps/noter/convex/connectedMachines.ts` and
   `apps/noter/convex/connectedMachineHttp.ts`
   - machine approval
   - credential validation
   - `connectedMachines` presence rows
3. `apps/noter/dev/codexAppServerResearchBridge.ts` plus
   `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`
   - thread inventory
   - thread detail reads
   - turn start and interrupt
4. `apps/noter/convex/codespacesExecutor.ts`
   - precedent for a small authenticated HTTP surface that forwards Codex
     app-server operations
5. `rfcs/072_CLOUDFLARE_TUNNEL_LOCAL_ANON_PREVIEW_RESEARCH.md`
   - transport guidance for Cloudflare quick tunnels

## Proposed Architecture

### 1. Extend `noter-sync run` into a real local control supervisor

The current `run` command already owns the machine-scoped long-running process.
The next slice should extend it rather than invent a separate launcher.

`noter-sync run` should supervise:

1. the existing heartbeat loop
2. the standalone local control service
3. the Cloudflare quick tunnel process
4. publishing live-control metadata back to Noter

If the control service or tunnel is unavailable, `run` may continue publishing
plain presence while withholding the live-control capability.

Before publishing `controlUrl`, `run` should probe local `/status` and confirm
that the control service is both loopback-bound and running with auth
enforcement enabled.

### 2. Extract the local control service out of the Vite plugin

The current research bridge is the right logic source, but not the right final
hosting shape.

Recommendation:

1. move the reusable runtime and HTTP handlers into `packages/sync`
2. keep plain Node HTTP primitives for the first slice
3. bind the extracted service to loopback only instead of `0.0.0.0`
4. keep the existing research page working by talking to the extracted service
   through a thin adapter during development

The extraction target is the contract already proven in
`specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`.

### 3. Extend the connected-machine record, not the thread model

For this MVP, Noter needs richer machine metadata, not a full cloud thread
cache.

The existing `connectedMachines` row/view should grow optional live-control
fields such as:

1. a `liveControl` capability flag
2. `controlUrl`
3. `controlUrlUpdatedAt`
4. `controlStatus`

Do **not** add `machineThreads` or `machineCommands` as the first step for this
MVP.

### 4. Use Noter-issued opaque machine-control tokens

The phone already has a Noter session. That should stay the source of truth for
user identity and machine ownership.

Recommended token model:

1. the Noter browser client requests a short-lived machine-control token for a
   specific `machineId`
2. Noter only issues that token if the signed-in user owns the machine and the
   machine is currently live-control capable
3. the token is opaque and only its hash is stored server-side
4. the token carries, at minimum:
   - `userId`
   - `machineId`
   - `audience = machine-control`
   - `expiresAt`
5. the maximum token lifetime is `15 minutes`
6. Noter may revoke a token before expiry, and introspection must then return it
   as inactive
7. the local service reads its own `machineId` from `~/.noter/config.json` at
   startup and rejects introspection results for any other machine

The local service validates the token with a Noter introspection endpoint over
outbound HTTPS.

### 5. Keep the mobile UI on `noter.md`

The phone UI should be a Noter-owned route such as:

`/machines/:machineId/live`

That page should:

1. read the current machine view from Noter
2. request a short-lived machine-control token from Noter
3. call the tunneled local JSON API directly with that bearer token and the
   current `controlUrl`
4. refetch the machine view and refresh the token on recoverable connection
   failures
5. render thread inventory, thread detail, and turn sending using Noter-owned
   components

This keeps product UX, session handling, and future review and debug surfaces on
one origin.

## Local Service API Surface

The first remote-control API should stay intentionally small:

1. `GET /status`
2. `GET /threads`
3. `GET /threads/:threadId`
4. `POST /threads/:threadId/turns`
5. `POST /threads/:threadId/interrupt`
6. `GET /events`

The service may reuse current research internals, but it should avoid exposing
the entire exploratory dev bridge as a permanent public contract.

The local service must also:

1. answer CORS preflight requests
2. allow only explicit Noter origins, not `*`
   - `https://noter.md`
   - approved preview or staging Noter origins
   - localhost dev origins during local development
3. reject requests without `Authorization: Bearer <machine-control-token>`
4. expose `/status` fields that let `noter-sync run` confirm:
   - auth is enforced
   - the service is loopback-bound
   - tunnel prerequisites are healthy

## Auth Failure Semantics

Token validation must fail closed.

Required behavior:

1. local introspection request timeout: `2s` max
2. retries: at most `2` retries with bounded backoff around `200ms` then
   `500ms`, with small jitter
3. retry only on:
   - network timeouts
   - connection failures
   - `502`
   - `503`
   - `504`
4. do not retry on:
   - `400`
   - `401`
   - `403`
   - `404`
   - malformed introspection payloads
5. positive validation may be cached for at most `30 seconds` and never past
   token expiry
6. negative validation should not be cached across requests

Required response semantics from the local service:

1. missing, expired, inactive, audience-mismatched, machine-mismatched, or
   malformed bearer tokens return `401`
2. introspection infrastructure failures after retries return `503`
3. no auth error may fall back to anonymous access

This rule exists to prevent a security window where the tunnel is reachable but
auth brokerage is not active or not trustworthy.

## Why Not Convex Thread Sync First

Convex thread summary sync and later cloud history storage can still be useful.
They are just not the shortest path to the first phone-control release.

Reasons:

1. the local service already has the canonical live thread data
2. the phone only needs live browse, read, and send behavior for the first MVP
3. adding summary tables and command queues first would duplicate the control
   path we actually want to ship
4. direct local control keeps latency and state drift lower for the first
   release

## Rollout Order

### Slice 1: Extract the standalone local control service

Scope:

1. move the reusable runtime out of the Vite-only bridge
2. keep the local research page working against the extracted service
3. bind the extracted service to loopback only
4. let `noter-sync run` start the service locally without any tunnel yet

Exit criteria:

1. the local service can run without Vite
2. the research page becomes a thin dev adapter over that service
3. the service is reachable only from the local machine
4. Slice 1 launches no tunnel and publishes no remote URL

### Slice 2: Machine-control auth and service hardening

Scope:

1. add Noter-issued opaque machine-control tokens
2. add Noter introspection for the local service
3. enforce CORS and fail-closed auth behavior
4. enforce local `machineId` matching against `~/.noter/config.json`
5. extend machine capabilities to represent live control readiness

Exit criteria:

1. the local service rejects every unauthenticated request
2. Noter can mint a short-lived token only for the owning user
3. the service can validate that token safely
4. `/status` exposes whether auth enforcement is active

### Slice 3: Cloudflare tunnel lifecycle and machine metadata

Scope:

1. start and supervise a Cloudflare quick tunnel from `noter-sync run`
2. preflight `cloudflared` before attempting live control
3. publish the live tunnel URL on the connected machine record
4. surface live-control availability in Noter

Exit criteria:

1. a live-control-capable machine advertises one current tunnel URL
2. the URL is withdrawn or ignored when the machine is offline or control is
   unhealthy
3. Noter does not advertise a URL unless `/status` confirms Slice 2 auth
   enforcement is active
4. missing `cloudflared` leaves the machine in presence-only mode with a clear
   live-control-unavailable state

### Slice 4: Phone control UI on `noter.md`

Scope:

1. add the machine live-control route
2. browse threads through the tunneled local service
3. read thread detail
4. send a prompt

Exit criteria:

1. the operator can continue Codex work from a phone
2. the phone stays on a Noter-owned page while talking directly to the
   machine-local service

## Out Of Scope For This MVP

1. Convex-backed thread summary sync as a prerequisite
2. full cloud transcript storage
3. token-level streaming through Convex
4. multi-user machine sharing
5. remote approval UX beyond coarse pending or error states
6. QR pairing
7. named tunnels or Cloudflare Access as the first shipped requirement

## Rejected Alternatives

### 1. Unlock the current research route on deployed builds

Rejected because the current bridge only exists in Vite `serve` mode, so the
route is not a real shipping runtime.

### 2. Treat the tunnel URL as the secret

Rejected because possession of the URL alone is not an acceptable auth boundary
for machine control.

### 3. Route the first phone-control MVP entirely through Convex

Rejected because it duplicates live local state and slows down the first usable
remote-control slice.

## Acceptance

This RFC is ready to turn into an accepted spec when:

1. the repo agrees that direct tunneled local control is the next phone MVP
2. `specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`
   remains the accepted foundation for registration and presence only
3. follow-up implementation work starts against the revised rollout order above
