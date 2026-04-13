# Chat-only Codespace Mode Specification

## Document Control

- Status: Revised proposal with MVP hardening updates
- Owner: Noter frontend/backend
- Last Updated: 2026-02-14
- Previous revision date: 2026-02-14 (iframe-first draft)
- Related specs:
  - `specs/001_CODESPACE_CONNECTION_SPEC.md`
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
- Related code:
  - `apps/noter/src/components/CodespaceIframe.tsx`
  - `apps/noter/src/components/CodespaceChatOnlyView.tsx`
  - `apps/noter/src/components/CodespaceStatus.tsx`
  - `apps/noter/src/components/VaultDashboard.tsx`
  - `apps/noter/src/App.tsx`
  - `apps/noter/convex/codespaces.ts`
  - `apps/noter/convex/codespacesMutations.ts`
  - `apps/noter/convex/vaultCodespaceIntegration.ts`
  - `apps/noter/convex/codespacesExecutor.ts`
  - `apps/noter/convex/schema.ts`
  - `.devcontainer/devcontainer.json`
  - `.codespace-agent/server.js`
  - `apps/noter-starter-template/.devcontainer/devcontainer.json`
  - `apps/noter-starter-template/.codespace-agent/server.js`
  - `apps/noter-starter-template/scripts/sync-codespace-assets.ts`

## Summary

Noter should provide a chat-only Codespace experience where the primary UX is a
native Noter chat surface, while Codex runtime execution happens inside the
vault dev-container.

This revision keeps iframe embedding as a fallback/debug path, not the primary
path, because browser and GitHub framing policies prevent reliable in-iframe
auth flows.

## Why This Revision

During implementation and manual testing, we confirmed that iframe-first UX is
not reliable as a primary integration path.

### Confirmed Issues Encountered (2026-02-14)

1. GitHub login/consent redirects can be loaded during Codespace web auth and
   are blocked in iframes.
2. Browser console error observed in product testing:
   - `Framing 'https://github.com/' violates the following Content Security Policy directive: "frame-ancestors 'none'".`
3. Header-level confirmation from live endpoint checks:
   - `x-frame-options: deny`
   - CSP includes `frame-ancestors 'none'`
4. Existing "Open in New Tab" fallback works, but that does not satisfy a
   reliable embedded primary flow.
5. Codespace agent port forwarding can return gateway auth responses (`401` with
   `www-authenticate: tunnel` / `Bearer`) when port-level exposure is not
   compatible with backend-to-codespace calls.
6. Agent startup is unreliable when it depends on `CODESPACE_AGENT_TOKEN` being
   pre-populated in runtime env at process start.
7. Repositories created from starter seed failed to include `.devcontainer` +
   `.codespace-agent`, causing agent server not to start at all in new vault
   Codespaces.

## Goals

1. Keep full Codespace lifecycle behavior intact
   (create/start/stop/delete/retry).
2. Deliver a reliable chat-first UX inside Noter web app without depending on
   in-iframe GitHub auth.
3. Keep Codex runtime inside each vault dev-container/Codespace.
4. Remove manual localhost callback URL editing from user workflows.
5. Maintain a deterministic fallback path to full `github.dev` when needed.

## Non-Goals

1. Bypassing GitHub `X-Frame-Options` / CSP `frame-ancestors` protections.
2. Building a full custom VS Code replacement.
3. Requiring browser extensions or local machine setup.

## Decision

Primary path changes from "kiosk iframe of VS Code web" to "Noter-native chat UI
backed by Codex app-server in dev-container".

Iframe embedding remains:

1. Best-effort secondary surface.
2. Debug/admin fallback.
3. Explicit external-tab escape hatch.

## Feasibility Assessment

### A. Iframe-first primary UX

Result: Not viable as primary.

Reasoning:

1. GitHub auth pages are frame-blocked by policy.
2. Third-party cookie/cross-site restrictions vary by browser and break
   auth/session continuity.
3. A degraded fallback is possible, but this cannot be the core product
   contract.

### B. App-server-first (native chat UI + server-side Codex runtime)

Result: Viable and aligned with Codex harness model.

Reasoning:

1. Browser UI interacts with Noter backend/agent stream endpoints, not embedded
   GitHub auth pages.
2. Runtime remains inside workspace container where tools/filesystem access
   already exists.
3. Approval, audit, and state transitions can be integrated with existing Convex
   model.

## Proposed Architecture

### Control Plane (Noter + Convex)

1. Own create/start/stop/delete Codespace.
2. Own session lifecycle metadata, auth state, and runtime health.
3. Orchestrate bridge startup and retries.

### Runtime Plane (Codespace)

1. `.codespace-agent` runs HTTP/SSE bridge on port `3000`.
2. Bridge launches and supervises `codex app-server` process in the container.
3. Bridge communicates with `codex app-server` over JSON-RPC via stdio.

### Presentation Plane (Noter UI)

1. `/vault/:owner/:repoName/:branch/chat` renders native chat interface.
2. UI streams events/tokens/tool status via SSE from bridge (proxied through
   Convex actions where needed).
3. Optional controls: open full Codespace tab, retry runtime, reconnect session.

```mermaid
sequenceDiagram
  participant U as User
  participant N as Noter UI
  participant C as Convex
  participant GH as GitHub Codespaces
  participant A as Codespace Agent
  participant S as Codex App Server

  U->>N: Open Chat-only Mode
  N->>C: ensureCodespaceReady(vaultId)
  C->>GH: create/start codespace if needed
  GH-->>C: running + webUrl
  C->>A: ensure Codex bridge/runtime ready
  A->>S: start app-server (stdio)
  S-->>A: session ready
  C-->>N: ready + runtime state
  U->>N: send prompt
  N->>A: start turn
  A<->>S: JSON-RPC events
  A-->>N: SSE stream (tokens/tool/approval)
```

## Current Implementation Snapshot (Already Done)

1. Chat route exists: `/vault/:owner/:repoName/:branch/chat`.
2. Dashboard has Chat entrypoint.
3. `ChatFab` hidden on chat route.
4. Iframe component has improved failure detection and retry/open-tab fallback.
5. `ensureCodespaceReady` bug fixed when codespace is already up to date
   (returns existing `codespaceId`).
6. Agent startup hardening:
   - `postStartCommand` is idempotent and starts agent with `nohup` when
     missing.
   - runtime token bootstrap in `.codespace-agent/server.js` allows first
     authenticated request to initialize token when env token is missing.
7. Codespace agent runtime state file `.codespace-agent/.agent-token` is
   persisted and gitignored.
8. Starter template now carries `.devcontainer` and `.codespace-agent` assets
   and syncs them from monorepo root before manifest export.

These are transitional and remain useful as fallback even after app-server-first
delivery.

## Data Model Changes (Convex)

### `codespaces` table extensions

1. `uiMode`: `"full" | "chat_only"` (optional, default `"full"`).
2. `codexRuntimeState`:
   `"not_started" | "starting" | "ready" | "busy" | "failed"` (optional).
3. `codexRuntimeTransport`: `"app_server_stdio"` (optional).
4. `codexRuntimeSessionId`: string (optional).
5. `codexRuntimeThreadId`: string (optional).
6. `codexRuntimeLastError`: string (optional).
7. `codexRuntimeReadyAt`: number (optional).

### Auth metadata (keep from prior spec)

1. `codexAuthState`: `"not_started" | "pending" | "ready" | "failed"`.
2. `codexAuthMethod`: `"api_key" | "device_code" | "chatgpt_oauth"`.
3. `codexVerificationUrl`: optional string.
4. `codexUserCode`: optional string.
5. `codexAuthLastError`: optional string.

Indexes:

1. Keep existing indexes.
2. Add index by runtime/auth state only if operations require it.

## Backend Changes

### `apps/noter/convex/vaultCodespaceIntegration.ts`

1. Extend `ensureCodespaceReady` to optionally ensure Codex runtime readiness
   for `chat_only` mode.
2. Return richer readiness payload (`codespaceId`, `ready`, `runtimeState`,
   `authState`).

### `apps/noter/convex/codespacesExecutor.ts` or new module `codespacesCodexRuntime.ts`

1. Add actions to:
   - ensure bridge runtime is started
   - create/reuse Codex session/thread
   - start turn, interrupt turn
   - approve/reject gated actions
   - poll/check runtime status
2. Keep strict error mapping and redaction for logs/responses.

### `apps/noter/convex/codespacesMutations.ts`

1. Add internal mutations for runtime/auth status updates.
2. Expose runtime/auth fields in `getActiveCodespace`.

### `.codespace-agent/server.js`

Add Codex bridge endpoints (token-authenticated):

1. `POST /codex/session/start`
2. `POST /codex/turn/start`
3. `POST /codex/turn/interrupt`
4. `POST /codex/approval/respond`
5. `GET /codex/events` (SSE)
6. `GET /codex/status`

Bridge behavior:

1. Spawn and supervise `codex app-server` child process.
2. Maintain per-session in-memory mapping in agent process.
3. Restart policy on crash with bounded retries.

## Frontend Changes

### `apps/noter/src/components/CodespaceChatOnlyView.tsx`

1. Evolve from iframe shell to native chat-first surface.
2. Subscribe to SSE stream for tokens/tool events.
3. Render approval cards and action results.
4. Keep `Open Tab` as fallback control.

### `apps/noter/src/components/CodespaceIframe.tsx`

1. Keep best-effort embed only.
2. Maintain CSP/login-block detection and deterministic fallback actions.
3. Not part of primary success path.

### `apps/noter/src/components/VaultDashboard.tsx` / `CodespaceStatus.tsx`

1. Keep "Chat" launch action.
2. Surface runtime/auth status for operator visibility.

## Authentication Strategy

### Primary (MVP): API key bootstrap

1. Securely provide key to runtime bootstrap.
2. Run `codex login --with-api-key` in container context.
3. Confirm with status checks and persist `codexAuthState = ready`.

### Secondary: Device code

1. Run `codex login --device-auth`.
2. Show verification URL/code in Noter native card.
3. Poll until authenticated.

### Deferred

1. Any flow that depends on in-iframe GitHub/ChatGPT auth pages.
2. Forcing localhost callback edits.

## UX Contract (Revised)

1. User enters Chat-only Mode.
2. Noter ensures codespace + runtime readiness.
3. User chats in native Noter surface.
4. Tool progress and approvals stream in-line.
5. If runtime/auth fails, show deterministic recovery actions:
   - Retry runtime
   - Reopen Codespace
   - Open full Codespace in new tab

## Operational Requirements (MVP)

1. Agent API port `3000` must be externally reachable for Convex actions (not
   only editor-local).
2. Agent process must be auto-started on Codespace boot and restart-safe (no
   duplicate process storms).
3. Agent auth token must be stable across process restarts even when shell env
   is missing token.
4. New noter-managed repositories must include both `.devcontainer` and
   `.codespace-agent` at seed time.

## Mobile and Cross-device Requirements

1. No local CLI requirement.
2. No browser extension requirement.
3. If embedded web editor degrades, native chat remains primary and usable.
4. Preserve session and codespace state across device transitions.

## Risks and Mitigations

### Risk 1: Runtime process management complexity in agent

Mitigation:

1. Add bounded restart policy and health endpoint.
2. Keep process model simple (one app-server per active session initially).

### Risk 2: Event stream disconnects / flaky mobile networks

Mitigation:

1. SSE reconnect with last-event-id semantics.
2. Resume turn status from Convex state on reconnect.

### Risk 3: Secret handling for API key bootstrap

Mitigation:

1. Redact logs.
2. Never expose raw keys to client state.
3. Use existing secure env/secrets patterns.

### Risk 4: Drift between root devcontainer and generated config

Mitigation:

1. Root `.devcontainer` + `.codespace-agent` treated as canonical runtime
   sources.
2. `apps/noter-starter-template/scripts/sync-codespace-assets.ts` syncs those
   assets into starter template.
3. `template:export` runs sync automatically before manifest generation.

### Risk 5: Scope creep (trying to fully replicate VS Code UI)

Mitigation:

1. Keep MVP focused on chat/tool/approval workflows.
2. Keep `github.dev` full-tab as explicit fallback for advanced editor tasks.

## Implementation Plan

### Phase 0 (done): Transitional chat route + embed hardening

1. Route and launch entrypoints implemented.
2. Iframe fallback behavior improved.
3. Existing codespace-ready bug fixed.

### Phase 1: Agent bridge runtime

1. Add `codex app-server` process management in `.codespace-agent/server.js`.
2. Add session + turn + status endpoints.
3. Add SSE stream endpoint.

### Phase 2: Convex orchestration

1. Add runtime lifecycle actions/mutations.
2. Persist runtime/auth state in `codespaces` table.
3. Add retry/recovery action surfaces.

### Phase 3: Native chat UI integration

1. Replace iframe-first content in chat route with streamed native chat.
2. Wire approvals and audit trails.
3. Keep fallback "Open Tab" control.

### Phase 4: Validation

1. Browser matrix: desktop Chrome/Safari/Firefox, mobile Safari/Chrome.
2. Lifecycle matrix: create/start/resume/retry/delete.
3. Failure matrix: auth pending/fail, SSE reconnect, runtime restart.

## Acceptance Criteria (Revised)

1. User can open Chat-only Mode and complete a Codex turn without relying on
   iframe-rendered GitHub auth pages.
2. Primary chat flow works in desktop and mobile web.
3. API-key bootstrap is automatic when configured.
4. Device-code fallback works with clear in-app guidance.
5. Full Codespace tab remains available as deterministic fallback.
6. No manual localhost URL editing is required.

## Open Questions

1. Session persistence scope: reuse per vault vs per conversation?
2. Should transcript source of truth be agent threads/messages or dedicated
   runtime transcript records?
3. Where should approval gating be enforced first: agent bridge, Convex action
   layer, or both?

## References

1. OpenAI Codex harness architecture:
   https://openai.com/index/unlocking-the-codex-harness/
2. Codex app-server README (transport/auth/runtime):
   https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
3. GitHub login framing behavior (`x-frame-options`, CSP `frame-ancestors`):
   https://github.com/login
4. GitHub community thread on immutable frame policy behavior:
   https://github.com/orgs/community/discussions/24495
5. Builder Chrome extension (header rewrite approach):
   https://www.builder.io/c/docs/chrome-extension
6. Builder proxy previews (non-direct embedding path):
   https://www.builder.io/c/docs/advanced-settings
7. VS Code custom layout reference (still relevant for fallback kiosk tuning):
   https://code.visualstudio.com/docs/editor/custom-layout
