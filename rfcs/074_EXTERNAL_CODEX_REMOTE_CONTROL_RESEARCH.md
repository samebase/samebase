# 074 External Codex Remote Control Research

## Document Control

- Status: Research
- Owner: connected machine control plane + external product scan
- Last updated: 2026-03-27
- Related docs:
  - `rfcs/071_CONNECTED_MACHINES_AND_REMOTE_THREAD_CONTROL_RESEARCH.md`
  - `rfcs/073_GENERIC_WORKSPACE_SURFACE_RESEARCH.md`
  - `specs/072_CONNECTED_MACHINE_PHONE_MVP_SPEC.md`
  - `specs/070_CONNECTED_MACHINE_CODEX_THREAD_STORAGE_SPEC.md`

## Summary

Two public projects launched on 2026-03-26 that are directly relevant to Noter's
connected-machine work:

1. Remodex
2. CodexRemote

Both projects validate the same broad direction:

1. controlling a local Codex runtime from a phone is a real operator need
2. QR pairing is the expected first-run bootstrap
3. `~/.codex/sessions` rollout files are a practical source of truth for
   persisted history and timeline recovery
4. the native Codex desktop GUI is not a true live mirror of external
   `app-server` activity, so desktop sync is still workaround territory

The main difference is architecture:

1. Remodex is relay-first, local-first, and transport-heavy
2. CodexRemote is private-network-first and companion-API-heavy

Noter should learn from both, but should not replace the current Convex-centered
connected-machine direction with a custom relay stack in MVP.

## Source Material

### Launch posts

1. Emanuele Di Pietro on X:
   `https://x.com/emanueledpt/status/2037167701940900339`
2. Thomas Forschbach on X:
   `https://x.com/tforschbach/status/2037305162692514126`

### Source repositories

1. Remodex: `https://github.com/Emanuele-web04/remodex`
2. CodexRemote: `https://github.com/tforschbach/CodexRemote`

## Project A: Remodex

### What it is

Remodex is an iPhone app plus a Mac bridge for controlling Codex remotely. The
repo is open source and explicitly local-first, but it can also run against a
self-hosted or developer-operated relay.

Top-level product claims from the repo:

1. phone-driven Codex threads
2. QR bootstrap
3. trusted reconnect
4. end-to-end encrypted transport
5. git actions
6. optional push notifications
7. background macOS daemon support

### Relevant source code

High-signal files:

1. `README.md`
2. `relay/README.md`
3. `phodex-bridge/src/secure-transport.js`
4. `relay/relay.js`
5. `phodex-bridge/src/bridge.js`
6. `phodex-bridge/src/codex-desktop-refresher.js`
7. `phodex-bridge/src/rollout-live-mirror.js`
8. `phodex-bridge/src/thread-context-handler.js`
9. `phodex-bridge/src/macos-launch-agent.js`

### Architecture takeaways

#### Strong ideas

1. The machine-local bridge remains the execution host.
2. The relay is a transport hop, not the place where Codex runs.
3. QR pairing carries machine identity and bootstrap session details.
4. Trusted reconnect becomes a first-class concept after the initial scan.
5. The bridge treats rollout files as a real runtime integration surface, not
   just an archival format.
6. Desktop refresh is opt-in and explicitly described as a workaround rather
   than pretending the Codex app is reactive.

#### Useful technical details

1. `secure-transport.js` implements a signed handshake and encrypted envelopes
   on top of a simpler relay transport.
2. `relay.js` keeps a lightweight in-memory session registry and trusted-session
   resolve path.
3. `rollout-live-mirror.js` watches desktop-authored rollout files and replays
   them back into the phone session as synthetic live events.
4. `codex-desktop-refresher.js` debounces desktop refreshes and uses rollout
   growth as a signal for when a refresh is worth attempting.
5. `macos-launch-agent.js` makes background reconnect a product feature, not an
   instruction for the user to keep a terminal open.

### What looks useful for Noter

1. Pairing should be machine-centric, not just user-token-centric.
2. Trusted reconnect should exist after the first scan.
3. A connector should own local runtime and local session persistence.
4. Rollout files are valuable for recovery and timeline enrichment.
5. Desktop sync should be treated as best-effort helper behavior.

### What Noter should not copy directly

1. MVP does not need a custom relay plus custom E2EE stack before basic
   connected-machine control works.
2. Noter already has Convex as a control plane, so replacing that with a custom
   session relay would be an architectural reset.
3. Remodex is iOS-product-complete in a way that includes concerns Noter does
   not need yet, such as push, subscriptions, and a self-host packaging story.

## Project B: CodexRemote

### What it is

CodexRemote is an iPhone app plus a Mac companion service for a private setup.
Its default assumption is a Tailscale tailnet instead of a public relay.

Top-level product claims from the repo:

1. browse projects and chats from iPhone
2. pair over QR on a private network
3. read rollout-backed history
4. send messages and steer active turns
5. inspect git status and diffs
6. handle approvals
7. update some top-level runtime settings

### Relevant source code

High-signal files:

1. `README.md`
2. `docs/architecture.md`
3. `docs/api.md`
4. `apps/mac-companion/src/http/server.ts`
5. `apps/mac-companion/src/history/rollout-history.ts`
6. `apps/mac-companion/src/desktop/live-sync.ts`
7. `apps/mac-companion/src/pairing/pairing-store.ts`
8. `apps/mac-companion/src/config.ts`
9. `apps/mac-companion/src/context/project-context.ts`

### Architecture takeaways

#### Strong ideas

1. The companion exposes a mobile-safe API instead of mirroring raw app-server
   method names everywhere.
2. Pairing is intentionally simple: request QR, confirm on Mac, issue device
   token.
3. The API explicitly distinguishes `turn/start` from `turn/steer`.
4. Rollout files power both persisted messages and richer timeline cards.
5. Desktop sync is framed as best-effort and separately diagnosable.

#### Useful technical details

1. `server.ts` creates a narrow REST and stream API for pairing, project/chat
   browsing, message sending, steering, stop, approvals, git, and runtime
   config.
2. `rollout-history.ts` normalizes rollout lines into messages plus timeline
   activities such as patch edits, context compaction, and background terminal
   completion.
3. `live-sync.ts` tries Codex deep links first and then falls back to desktop UI
   automation.
4. `pairing-store.ts` is intentionally small: pairing id, nonce, expiry.
5. `config.ts` makes private-network routing explicit by deriving bind and
   pairing host from Tailscale when available.

### What looks useful for Noter

1. A Noter-owned companion surface should use product verbs, not raw `thread/*`
   and `turn/*` everywhere in the UI.
2. Rollout-backed timeline enrichment is a practical next step after summary
   sync.
3. `turn/steer` fallback behavior is worth copying for mobile follow-ups.
4. Pairing can start simple and still feel real.
5. Private-network-first setups are a valid operator mode even if Noter later
   supports broader remote routing.

### What Noter should not copy directly

1. Tailscale-only assumptions are too narrow for Noter's longer-term
   connected-machine scope.
2. Direct bearer-token companion auth is simpler, but it leaves more
   machine-identity and user-control-plane logic outside Convex.
3. Runtime config mutation on the machine is powerful but should stay out of
   Noter's first connected-machine MVP unless there is a clear product need.

## Cross-Project Findings

### 1. QR pairing is not optional

Both projects use QR pairing as the obvious bootstrap.

That supports Noter's current direction toward explicit machine registration
instead of implicit browser-only auth.

### 2. The local machine connector is the real product boundary

Both systems keep execution on the machine and use the phone as a remote
control.

That matches `specs/072_CONNECTED_MACHINE_PHONE_MVP_SPEC.md`.

### 3. Rollout files matter more than app-server alone

Both systems rely on rollout files for at least one of:

1. persisted history
2. live recovery
3. timeline enrichment
4. desktop sync

That suggests Noter should treat rollout parsing as a first-class integration
surface, not a research-only fallback.

### 4. Native Codex desktop sync is still unsolved

Both systems explicitly document that the desktop GUI is not a true live mirror
of external runtime activity.

That supports Noter's current stance that desktop sync helpers should remain
secondary to the actual phone/browser control plane.

### 5. Product verbs matter

CodexRemote especially shows the value of a mobile-safe companion API with
project/chat/timeline verbs. Remodex reaches a similar place through its bridge
handlers and iOS service layer.

That reinforces `rfcs/073_GENERIC_WORKSPACE_SURFACE_RESEARCH.md`.

## Recommendation For Noter

### Keep

1. Convex as the MVP control plane
2. `connectedMachines` and `machineThreads` as the first persistence slice
3. a Noter-owned workspace surface instead of raw provider endpoint names

### Add next

1. one-time QR bootstrap for a machine connector
2. trusted reconnect semantics after the first pairing
3. `machineCommands` plus connector-side command claiming and result writes
4. rollout-backed thread read and timeline normalization for richer phone views

### Defer

1. custom relay infrastructure
2. custom E2EE transport
3. push notifications
4. broad machine-side runtime configuration editing

## Effect On The Current PR

This research does not suggest a branch reset.

It mainly strengthens the case for the current direction already present in this
PR:

1. machine-local connector
2. Convex-backed machine presence
3. Convex-backed thread summary sync
4. Noter-owned browser/control surfaces

It also sharpens the next implementation slice:

1. pairing bootstrap
2. trusted reconnect semantics
3. `machineCommands`
4. rollout-backed thread read and timeline enrichment
