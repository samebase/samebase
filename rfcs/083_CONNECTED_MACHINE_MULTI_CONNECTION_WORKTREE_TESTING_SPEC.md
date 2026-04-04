# 083 Connected Machine Multi-Connection Worktree Testing Spec

## Document Control

- Status: Proposed
- Owner: connected machine worktree phone E2E
- Last updated: 2026-04-04
- Related docs:
  - `rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md`
  - `specs/075_CONNECTED_MACHINE_INSTALLER_LOCAL_WALKTHROUGH_SPEC.md`
  - `specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`
  - `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`
  - `rfcs/072_CLOUDFLARE_TUNNEL_LOCAL_ANON_PREVIEW_RESEARCH.md`

## Summary

The current connected-machine flow is machine-scoped, but it is also
single-connection:

1. one `~/.noter/config.json`
2. one stored `sourceUrl`
3. one stored machine credential
4. one allowed browser origin for local control
5. one backend used for machine-control token introspection
6. one published `controlUrl` per connected backend row

That shape works for daily production phone control, and it also works for a
single preview or worktree experiment in isolation.

It does **not** work well for the operator's actual phone-only testing flow:

1. keep production connected so `https://noter.md/machines` works from the phone
2. open a Cloudflare tunnel for a worktree
3. verify the worktree's shipped `/machines` route end to end from the phone
4. avoid disconnecting production just to test the worktree

Recommendation:

1. keep the install machine-scoped
2. keep one physical local control service per machine
3. extend the local config from one connection to many named connections
4. let `noter-sync run` publish the same machine into production and one or more
   opted-in worktree or preview backends at the same time

This preserves the current connected-machine model while making worktree phone
E2E realistic.

## Why This Spec Exists

The current repo already has two useful pieces:

1. `make anon-share` can expose a worktree frontend over a Cloudflare quick
   tunnel
2. `noter-sync` can register a machine and publish live control into one Noter
   backend

The missing piece is that the second system is still modeled as "one machine
install equals one backend connection."

That means a worktree tunnel can exist and still fail the operator's real test:
opening the worktree's `/machines` route from the phone and using live control
there without sacrificing the production-connected machine route.

## Operator Problem Statement

Today the operator typically keeps `noter-sync` connected to production so the
phone can reach the real machine route on `noter.md`.

When Codex opens a worktree and shares it over Cloudflare, the operator can
inspect the worktree app from the phone, but cannot fully test worktree behavior
that depends on the connected-machine route.

The reason is not only tunnel transport.

The deeper problem is that the worktree backend is not also a live connected
machine authority for that same machine unless the operator runs another
`noter-sync connect` against the worktree origin and effectively repoints the
local install.

That is too much friction for normal iteration and it breaks the daily
production phone setup.

## Current Constraints In Code

The current single-connection assumption is visible in the shipped code:

1. `packages/sync/noter.js` stores one `sourceUrl` and one machine credential in
   `~/.noter/config.json`
2. `runConnectorCommand()` derives one `convexSiteUrl` from that stored
   `sourceUrl`
3. the local control server allows only
   `[new URL(storedConfig.sourceUrl).origin]`
4. the local control server introspects tokens against one backend only
5. the heartbeat body advertises one `controlUrl`
6. `apps/noter/convex/connectedMachineModel.ts` persists one `controlStatus`,
   one `controlUrl`, and one `controlUrlUpdatedAt` per backend row
7. `apps/noter/src/components/MachinesWorkspacePage.tsx` issues machine-control
   tokens from the current backend and expects that backend's row to already be
   live-control ready

Those assumptions are correct for the shipped MVP in
`specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`.

They are also the precise reason worktree `/machines` phone E2E is still hard.

## Why The Existing Workarounds Are Not Enough

### 1. Overwrite the local config with a worktree connection

This proves the worktree path, but it breaks the production-connected machine
route until the operator reconnects back to production.

That is not an acceptable default for day-to-day phone use.

### 2. Share the worktree frontend only

This is good for layout and non-machine UI verification.

It is not enough for `/machines` route validation because the worktree backend
still does not own a connected-machine row for the operator's machine.

### 3. Treat each backend as a totally separate install

This would solve the protocol problem, but it makes the operator mentally manage
multiple local installs for one physical machine.

That fights the accepted machine-scoped installer model from
`rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md`.

## Goals

1. Production `noter.md` should remain connected for daily phone use.
2. A worktree or preview frontend should be able to exercise its own `/machines`
   route end to end from the phone.
3. The operator should not need a second ad hoc `noter.js` install for the same
   physical machine.
4. Worktree enablement should be explicit and opt-in, not automatic for every
   local branch.
5. The current machine-scoped install model should remain intact.

## Non-Goals

1. Replacing the machine-scoped installer with a repo-scoped installer
2. Syncing thread history between production and worktree backends
3. Replacing Cloudflare quick tunnels in the current operator workflow
4. Automatically publishing every local worktree into every backend
5. Solving stable DNS or Cloudflare Access policy for this slice

## Recommendation

Adopt a multi-connection model inside one machine-scoped install.

### Core idea

One physical machine install should be able to hold multiple named backend
connections at once:

1. production
2. one active worktree preview
3. optionally another local or preview backend later

The install remains machine-scoped because it still owns:

1. one `machineId`
2. one local state directory
3. one local control service
4. one operator-facing `noter-sync` install surface

What changes is the shape of the stored backend connections and the runtime
publication behavior.

## Proposed Local Config Model

Keep `~/.noter/config.json`, but widen it from one connection to many.

Illustrative shape:

```json
{
  "machineId": "machine_abc",
  "codexVersion": "0.33.0",
  "defaultConnectionId": "prod",
  "connections": {
    "prod": {
      "label": "Production",
      "sourceUrl": "https://noter.md/noter.js",
      "machineCredential": "mmc_prod",
      "kind": "primary",
      "enabled": true
    },
    "ceff": {
      "label": "Worktree ceff",
      "sourceUrl": "https://ceff.trycloudflare.com/noter.js",
      "machineCredential": "mmc_ceff",
      "kind": "ephemeral",
      "enabled": true
    }
  }
}
```

Important constraint:

1. this is still one installation record
2. it is **not** parallel repo-scoped installs
3. it preserves the accepted machine-scoped installer model

## Proposed CLI Behavior

### `noter-sync connect <sourceUrl>`

Change `connect` from "replace the global install target" to "upsert a
connection entry for this source URL."

Recommended behavior:

1. reuse the existing `machineId`
2. create a registration request against the provided source
3. store the issued machine credential under a connection entry keyed by source
   origin or an explicit label
4. leave existing connections untouched unless the operator explicitly removes
   one

### `noter-sync run`

Change `run` from "publish one connection" to "publish all enabled connections."

Recommended runtime shape:

1. start one local control service
2. start one quick tunnel for that local control service
3. publish the same live-control URL and readiness state to every enabled
   connection
4. send separate heartbeat requests with separate machine credentials to each
   configured backend

This keeps the hot path machine-local while letting production and the active
worktree both see the same physical machine as live.

## Proposed Local Control Auth Model

The local control service must become multi-origin and multi-backend aware.

### Allowed browser origins

Instead of allowing only one origin, the local service should allow the origins
from all enabled connections.

That lets both:

1. `https://noter.md`
2. `https://<worktree-tunnel>`

call the same local control service from the phone.

### Token introspection

The local service currently introspects against one backend.

For multiple connections, the service should accept tokens issued by any enabled
connection backend.

Two valid implementation shapes:

1. try each enabled introspection URL until one reports an active token
2. add a small issuer hint and route directly to the matching backend

Recommendation:

1. start with linear probing across enabled connections
2. revisit issuer hints only if the number of active connections grows enough to
   matter

The operator workflow should normally have production plus one worktree, so the
probe count stays small.

## Proposed Backend Model

Each backend can keep its own `connectedMachines` row.

That means production and a worktree backend each see:

1. the same `machineId`
2. their own machine credential
3. their own control tokens
4. the same current public `controlUrl`

This is simpler than trying to make a worktree backend borrow production's
machine row at request time.

It also keeps the current `/machines` route contract mostly intact inside each
backend.

## Why This Is Better Than A Production-Only Control Plane

An alternate approach would keep production as the single machine authority and
teach a worktree `/machines` route to proxy or borrow production machine state.

That is possible later, but it is not the best first fix.

Reasons:

1. the worktree route would need cross-backend auth and machine lookup
2. the worktree browser would still need production token issuance somewhere in
   the request path
3. the current code already assumes that the active backend is the machine
   authority for its own route
4. multi-connection reuse is a smaller conceptual jump than cross-backend
   control-plane borrowing

## Integration With Share Workflows

The operator should not have to remember a long manual sequence every time a
worktree is shared.

Recommended follow-up:

1. keep `make anon-share` as the transport entrypoint
2. add a small companion step that can register the current share as a temporary
   secondary `noter-sync` connection
3. make it easy to remove or disable that temporary connection when the share
   ends

This should stay explicit.

Do **not** automatically connect every worktree backend just because it exists.

## Security Constraints

1. only validated `noter.js` source URLs may be stored as connections
2. local control must fail closed when no enabled backend validates a token
3. stopping a worktree share should stop publishing live control for that
   worktree backend
4. production credentials and worktree credentials must remain backend-scoped
5. the machine credential must never be reused as a browser token

## Rollout Plan

### Slice 1: Config and CLI widening

1. migrate `~/.noter/config.json` from a single connection shape to a
   multi-connection shape
2. make `connect` upsert connection entries instead of overwriting global state
3. keep backwards compatibility for older single-connection configs

### Slice 2: Multi-backend runtime publication

1. let `run` read all enabled connections
2. publish heartbeats to all enabled backends
3. keep one shared local control service and one shared quick tunnel

### Slice 3: Multi-origin local control auth

1. allow all enabled browser origins
2. introspect tokens against all enabled backends
3. keep readiness checks fail-closed before publishing the tunnel

### Slice 4: Share workflow polish

1. wire temporary worktree connections into `make anon-share`
2. surface clear operator messaging for which connections are active
3. make temporary cleanup obvious

## Acceptance Criteria

1. The operator can keep production connected and usable from the phone.
2. The operator can connect one worktree backend without disconnecting
   production.
3. Opening the worktree's `/machines` route from the phone can issue a valid
   machine-control token and use live control end to end.
4. Stopping or disabling the worktree connection leaves production usable.
5. The install still presents itself as one machine-scoped `noter-sync`
   installation, not multiple ad hoc installs.

## Open Questions

1. Should temporary worktree connections auto-expire when the quick tunnel
   stops, or should they remain disabled until reused?
2. Should connection ids default to source origin, worktree id, or an explicit
   operator label?
3. Should one shared quick tunnel URL be published into all enabled backends, or
   should each connection get its own tunnel later?
4. Should the browser UI label a machine row as `Production` versus
   `Worktree ceff` when the same physical machine is connected in multiple
   backends?

## Decision

The right next step is **not** another tunnel experiment in isolation.

The right next step is to widen the connected-machine model from
single-connection to multi-connection while keeping the install itself
machine-scoped.

That is the smallest change that directly solves the operator's current
phone-only worktree `/machines` testing problem without breaking the existing
production-connected machine workflow.
