# 071 Connected Machines and Remote Thread Control Research

## Status

- Research
- Last updated: 2026-03-26

## Question

How should Noter let an operator connect local machines to the web UI, see those
machines from another device such as a phone, manually start or resume Codex
work on them, and persist thread state without making PR creation the primary
trigger?

This research also covers where thread history should live if Noter eventually
wants cloud-backed thread continuity across devices and machines.

## Executive Summary

The PR-triggered local runner from `make connect` is still a useful narrow tool,
but it is not the right primary architecture for "continue working from my
phone."

The stronger product direction is:

1. treat each local Mac or Windows machine as a first-class Noter execution
   target
2. run a small local connector process on that machine
3. have the connector establish an outbound authenticated connection to Noter
4. let the web UI list online machines and manually start or resume Codex work
5. keep Noter-owned cloud thread records separate from local Codex thread ids
6. store hot operational state in Convex and archive large thread/event blobs in
   Cloudflare R2

Recommendation:

- MVP control plane: Convex-backed connected-machine agent
- Long-term low-latency fanout option: Cloudflare Durable Objects
- Large transcript and artifact storage: Cloudflare R2
- Use Cloudflare Tunnel only as an optional transport for direct HTTP access,
  not as the primary orchestration model

## Why The PR Trigger Is Not The Main Product

PR-triggered automation solves a narrower workflow:

1. Noter creates a draft PR
2. a local machine notices it
3. Codex continues the work on that branch

That helps for repo-centric automation, but it does not solve the broader
operator problem:

1. seeing which machines are online from the web UI
2. starting work on demand from a phone
3. resuming an existing local thread
4. knowing which machine owns the current execution
5. continuing work even when there is no new PR yet

Conclusion:

- PR-triggered automation should become one command source into a larger machine
  control plane, not the product's primary coordination primitive

## Verified Current State In This Repo

### 1. Noter already knows how to manage remote execution targets

The repo already has two concrete execution-environment patterns:

1. GitHub Codespaces with an HTTP bridge:
   - `.codespace-agent/server.js`
   - `apps/noter/convex/codespacesExecutor.ts`
2. Daytona sandboxes with persistent Codex home and terminal attachment flows:
   - `apps/noter/convex/daytona/actions.ts`
   - `apps/noter/convex/daytona/terminal.ts`
   - `specs/055_DAYTONA_CODEX_SHARED_HOME_SPEC.md`
   - `specs/057_DAYTONA_MOBILE_WEB_TERMINAL_EXPERIENCE_SPEC.md`

This matters because a local connected machine is conceptually another Noter
execution target, not a completely foreign product area.

### 2. Noter already persists its own thread context, but that is not a Codex thread

The current Noter chat stack persists thread metadata in:

- `apps/noter/convex/schema.ts`
- `apps/noter/convex/chat/index.ts`
- `apps/noter/convex/chat/threads.ts`

Important boundary:

- these are Noter-owned thread/context records
- they are not the same thing as a local Codex Desktop or Codex CLI thread id

That separation is useful here.

For connected machines, Noter should own the cross-device thread shell while the
connector maps that shell onto a machine-local Codex thread.

### 3. The repo already proves the Codex app-server RPC shape

`.codespace-agent/server.js` currently exposes:

1. `/codex/thread/start`
2. `/codex/thread/resume`
3. `/codex/turn/start`
4. `/codex/turn/interrupt`
5. `/codex/events`

The local `t3code` reference also shows the same direction more explicitly:

- `~/dev/forks/t3code/apps/server/src/codexAppServerManager.ts`
- `~/dev/forks/t3code/apps/server/src/wsServer.ts`

Conclusion:

- a local connected-machine agent does not need to invent a new Codex protocol
- it can normalize around the app-server concepts the repo already understands

### 4. `make connect` is already the narrow PR-local tool

This branch already ships:

- `scripts/noter-pr-connect.js`
- `make connect`
- `make connect-once`

That tool is still valid, but it should be framed as:

- a PR watcher that can launch local work
- not the final machine-connect architecture

## Product Requirements For Connected Machines

The broader machine-connect design should:

1. let the web UI show online/offline local machines
2. work from a phone without requiring the phone to be on the same LAN
3. support multiple operator-owned machines, including Windows
4. start or resume work manually, not only from PR creation
5. map Noter threads to machine-local Codex threads explicitly
6. survive connector restarts and transient network loss
7. avoid exposing the machine to inbound public traffic for MVP
8. keep repo/worktree ownership explicit and fail closed outside allowed roots
9. store large thread history outside the git repo itself

## Options Evaluated

### Option A: Cloudflare Tunnel to a local machine HTTP bridge

Mechanics:

1. each machine runs `cloudflared`
2. the machine exposes a local HTTP bridge for Noter to call
3. Noter reaches the machine through a Cloudflare-protected hostname
4. the bridge proxies requests into local Codex app-server management

Pros:

- outbound-only network initiation from the machine
- can expose plain HTTP endpoints that are easy to reason about
- can protect the bridge with Cloudflare Access
- useful if Noter also wants direct preview, SSH, or debug access later

Cons:

- transport only; it does not solve queueing, presence, thread mapping, or event
  persistence
- requires tunnel lifecycle management per machine
- introduces a second public-facing routing surface per operator machine
- reconnect/offline semantics still need an app-level command queue
- mobile "see connected machines" still needs a separate registry anyway

Assessment:

- good optional transport
- wrong primary abstraction

Why it should not be the main architecture:

- the real product is a machine control plane, not "an HTTP server hidden behind
  a tunnel"

### Option B: Connected-machine agent using Convex as the control plane

Mechanics:

1. a local connector process authenticates as the signed-in user
2. it uses `ConvexClient` subscriptions for realtime command delivery
3. it writes heartbeats, status updates, and normalized thread events back via
   mutations
4. the web UI shows machines and drives commands through Convex documents and
   functions
5. the connector manages local Codex app-server or `codex exec` processes

Pros:

- no inbound networking required
- fits the app's existing backend and auth model
- realtime subscriptions already work in long-running Node processes
- easiest way to make the web UI and phone see online machines
- shared control plane for PR-triggered runs, manual runs, and future
  automations
- cross-platform local agent can stay plain Node + Codex CLI

Cons:

- raw token-level streaming may need batching to avoid noisy mutation volume
- Noter must add an explicit machine registry and command queue
- auth for a headless connector needs a pairing flow or dedicated machine token

Assessment:

- best MVP
- best fit with current repo architecture

### Option C: Dedicated Cloudflare Worker + Durable Objects broker

Mechanics:

1. each machine opens an outbound WebSocket to a Worker/Durable Object
2. the browser UI also attaches to the same machine or thread Durable Object
3. the Durable Object brokers commands, presence, and event fanout
4. metadata is stored in Durable Object storage; large blobs go to R2

Pros:

- natural fit for long-lived bidirectional sessions
- single coordination point per machine or per thread
- hibernating WebSockets reduce idle cost
- alarms give a clean primitive for liveness expiry, retries, and timeouts
- good long-term fit for live streaming and multi-client fanout

Cons:

- duplicates control-plane concepts away from Convex
- adds a second backend architecture before the first machine MVP exists
- increases implementation and operational complexity now

Assessment:

- strong phase 2 or phase 3 if live stream fanout becomes the bottleneck
- too much surface for the first connected-machine rollout

### Option D: GitHub as the main thread store

Mechanics:

1. encode thread state in repo files, commits, PR comments, or issues
2. use GitHub as the durable source of truth for continuation

Pros:

- already present in the operator workflow
- human-visible history
- useful for PR-linked summaries and durable anchors

Cons:

- source repos are the wrong place for large execution transcripts
- repo history grows forever and slows down normal source-control workflows
- poor fit for structured live state, event replay, presence, and permissions
- thread storage becomes coupled to repo write access rather than user/session
  access

Assessment:

- use GitHub only for pointers and summaries
- do not use GitHub as the canonical machine-thread store

## Recommended Architecture

### Main Decision

Use a Noter-connected local machine agent with Convex as the MVP control plane.

Then:

1. keep PR-triggered `make connect` as one narrow source of commands
2. add a first-class machine list in the web UI
3. map Noter cloud threads onto local Codex threads
4. archive bulky completed transcript data to R2

### Why Convex First

This repo already treats Convex as the app's durable coordination layer.

That makes Convex the best place to start for:

1. machine presence
2. command queue state
3. thread metadata
4. recent event snapshots needed by the UI

It also aligns with the linked Automerge + Convex article's useful principle:

- keep the server in the loop where correctness, coordination, and durable
  workflow matter

That is exactly the case here.

The machine connector is not just syncing local data. It is coordinating:

1. auth
2. repo ownership
3. command intent
4. resumable thread state
5. multi-device visibility

### Architecture Sketch

#### Local connector process

Recommended responsibilities:

1. authenticate and pair the machine with one Noter user
2. heartbeat machine presence and capability metadata
3. expose local repo/worktree inventory from an explicit allowlist
4. spawn or reuse a local Codex app-server manager
5. translate Noter commands into:
   - `thread/start`
   - `thread/resume`
   - `turn/start`
   - `turn/interrupt`
6. normalize Codex events and write them back to Noter
7. persist a small local mapping file that binds:
   - Noter thread id
   - machine id
   - local Codex thread id
   - repo root / worktree path

#### Noter cloud control plane

Recommended new entities:

1. `connectedMachines`
   - user ownership
   - display name
   - OS / hostname / connector version
   - capability flags
   - `lastSeenAt`
   - current status
2. `machineCommands`
   - target machine id
   - command type
   - payload
   - state: pending / claimed / running / completed / failed / canceled
   - idempotency key
3. `machineThreads`
   - Noter-owned thread id
   - bound machine id
   - local Codex thread id
   - repo / branch / worktree metadata
   - latest status
4. `machineThreadEvents`
   - compact structured event log for the UI
   - recent stream deltas
   - approval requests
   - command/file-change summaries
5. `machineArtifacts`
   - pointers to R2 objects for large logs, screenshots, exports, and compacted
     transcript bundles

#### UI shape

The web UI should expose:

1. a machine list with online/offline state
2. a machine detail view showing allowed repos/worktrees and active threads
3. a "Start thread on this machine" action
4. a thread view that shows:
   - live status
   - latest streamed assistant output
   - approval/interrupt controls
   - machine ownership and last heartbeat

### Why Noter Should Own The Cloud Thread Record

The Noter cloud thread should not be identical to the local Codex thread id.

Instead:

1. Noter owns the cross-device thread identity and UI history
2. the connector owns execution against a local Codex runtime
3. the two are linked through an explicit binding record

This gives cleaner future behavior:

1. a thread can be shown from a phone even if the machine is briefly offline
2. Noter can retain summaries and artifacts after the machine session ends
3. the system can later support re-binding or exporting a thread without
   pretending local Codex ids are globally portable

## Storage Recommendation

### Hot State: Convex

Keep the following in Convex:

1. machine registry and last-seen state
2. command queue state
3. thread bindings
4. recent event snapshots and the latest visible transcript slice
5. UI-critical approval state

Why:

- this state needs queryability, auth checks, and realtime subscriptions

### Cold / Large State: Cloudflare R2

Store the following in R2:

1. compacted full thread event logs
2. screenshots
3. large command outputs
4. exported thread bundles
5. attachments or blobs too large or too noisy for Convex hot state

Why:

- R2 is strongly consistent for object writes, reads, deletes, and listings
- it is a better fit for large append/replace blobs than a source repo

### What GitHub Should Store

GitHub should store only:

1. PR summaries
2. links back to Noter thread pages
3. human-facing milestone comments

GitHub should not store:

1. canonical thread event history
2. large transcript logs
3. machine presence state

## Security Model

### Pairing

The connector should use an explicit pairing flow, not a copied browser session.

Recommended approach:

1. user opens Noter on desktop or phone
2. user requests "Connect this machine"
3. Noter issues a short-lived pairing token
4. local connector redeems it for a renewable machine credential bound to:
   - one user
   - one machine id
   - explicit capabilities

### Allowed repo roots

The connector should expose only explicit repo roots or worktree roots.

Do not make the whole machine filesystem remotely browsable by default.

### Approval boundaries

The connector should preserve Codex approval semantics and never silently widen
them just because the trigger came from a phone.

## Phased Rollout

### Phase 0: keep the current PR runner

Keep:

- `make connect`
- PR metadata contract
- local PR-triggered worktree flow

But reframe it as:

- one local automation entrypoint, not the strategic architecture

### Phase 1: connected-machine MVP

Build:

1. machine pairing
2. `connectedMachines` registry
3. heartbeat + presence
4. manual "Start thread" from web UI
5. local connector using Convex subscriptions
6. local Codex app-server manager
7. Noter-thread to Codex-thread binding

This phase already solves the phone-to-machine continuation problem in a useful
way.

### Phase 2: richer live thread control

Add:

1. `turn/interrupt`
2. explicit approval surfaces
3. batched live event streaming
4. thread resume after connector restart

### Phase 3: R2 archival

Move bulky or completed thread logs into R2 while keeping indexes and current UI
state in Convex.

### Phase 4: optional Cloudflare Durable Object broker

Only if needed:

1. move machine or thread fanout into Durable Objects
2. let the connector and browser share a lower-latency bidirectional relay
3. use alarms for stale-session cleanup and deferred work

### Phase 5: optional Tunnel-based direct access

Use Cloudflare Tunnel only if Noter later wants:

1. direct local preview forwarding
2. SSH / desktop / HTTP tooling against the machine
3. operator-debug endpoints that are simpler over standard HTTP

## Practical Recommendation For This PR

This PR should now communicate two levels clearly:

1. shipped narrow tool:
   - PR-triggered local runner via `make connect`
2. broader north star:
   - connected machines visible from the Noter web UI
   - manual thread start/resume from phone
   - Noter-owned cloud thread record plus local Codex execution

That framing keeps the shipped work useful without overselling it as the final
architecture.

## Open Questions For The Operator

These are the most important product decisions still open:

1. Should connected machines be visible only to the owning user, or shareable
   with collaborators in the same workspace?
2. For MVP, do you need live approval and interrupt controls from the phone, or
   is start + status + final result enough?
3. Should the connector expose only an allowlist of repo/worktree roots, or do
   you want broader remote file browsing?
4. Is an always-on lightweight background agent acceptable on the Windows
   machine?

## Sources

- Cloudflare Tunnel docs:
  - https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/
- Cloudflare Access service tokens:
  - https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
- Cloudflare Durable Objects WebSockets:
  - https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Cloudflare Durable Objects storage:
  - https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/
- Cloudflare Durable Objects alarms:
  - https://developers.cloudflare.com/durable-objects/api/alarms/
- Cloudflare R2 consistency:
  - https://developers.cloudflare.com/r2/reference/consistency/
- Convex JavaScript client:
  - https://docs.convex.dev/client/javascript/
- Convex authentication debugging (`ConvexClient` / `setAuth` details):
  - https://docs.convex.dev/auth/debug
- Convex HTTP actions:
  - https://docs.convex.dev/functions/http-actions
- Convex article referenced in discussion:
  - https://stack.convex.dev/automerge-and-convex
