# Codespace Port Visibility Specification

## Document Control
- Status: Proposal
- Owner: Noter backend
- Last Updated: 2026-02-14
- Related specs:
  - `specs/001_CODESPACE_CONNECTION_SPEC.md`
  - `specs/008_CHAT_ONLY_CODESPACE_MODE_SPEC.md`
- Related code:
  - `apps/noter/convex/codespaces.ts`
  - `apps/noter/convex/vaultCodespaceIntegration.ts`
  - `apps/noter/convex/codespacesExecutor.ts`
  - `apps/noter/convex/schema.ts`
  - `.devcontainer/devcontainer.json`
  - `apps/noter-starter-template/.devcontainer/devcontainer.json`
  - `.codespace-agent/server.js`
  - `apps/noter-starter-template/.codespace-agent/server.js`

## Summary
Noter relies on a Codespaces-resident HTTP agent on port `3000` (`https://{codespace}-3000.app.github.dev`) for programmatic execution and filesystem operations from Convex.

In practice, Codespaces port visibility can remain `private` even when `devcontainer.json` declares `portsAttributes["3000"].visibility = "public"`, which breaks backend-to-codespace agent calls (the tunnel requires interactive user auth).

This spec proposes a Noter backend reconciler that ensures the agent port is `public` (and optionally ensures sensitive callback ports remain `private`) using the existing GitHub OAuth access token obtained during Noter login.

## Problem
### Symptoms
1. Codespace is created and running, but `apps/noter/convex/codespacesExecutor.ts` calls to `${agentUrl}/health` or `${agentUrl}/exec` fail.
2. The forwarded port `3000` shows as `private` in Codespaces.
3. Requests to `https://{codespace}-3000.app.github.dev` return tunnel auth responses (`401` / gateway auth) instead of reaching the agent.

### Root Cause
`portsAttributes.visibility` in `devcontainer.json` is best-effort metadata. It is not a reliable control-plane guarantee across Codespaces lifecycle events (create, rebuild, restart, re-forward).

Noter needs a deterministic, server-side way to set Codespaces port visibility.

## Goals
1. Ensure agent port `3000` is `public` for noter-managed Codespaces so Convex can reach the agent.
2. Avoid manual port-visibility steps in the GitHub UI.
3. Avoid requiring a separate PAT stored in repo or devcontainer.
4. Be idempotent and safe to retry.
5. Respect org/runtime constraints: do not attempt `public` if not allowed.

## Non-Goals
1. Making all forwarded ports public.
2. Making Codespaces iframe embedding reliable (see `specs/008_CHAT_ONLY_CODESPACE_MODE_SPEC.md`).
3. Solving agent authentication and hardening by itself.
   - Note: enabling a public agent port is only acceptable if the agent requires token auth for all non-health endpoints.

## Proposed Approach
### Overview
Add a Convex action that ensures specific port visibilities for a given codespace:
- `3000`: `public` (required for Noter backend agent calls)
- `1455`: `private` (Codex OAuth callback; should never be public)

This action is invoked:
1. After Codespace creation once the codespace is `Available`/`running`.
2. After Codespace start (resume) transitions to `running`.
3. As part of `ensureCodespaceReady` when agent reachability matters (chat-only mode), with bounded retries.

### Why This Must Live In The Noter Backend
The devcontainer environment does not reliably have credentials/permissions to mutate Codespaces control-plane settings.

Noter backend already has:
1. The authenticated user’s GitHub OAuth access token (`users.githubAccessToken`).
2. Codespace identity (`codespaces.ghCodespaceName`) and ownership (`codespaces.userId`).
3. A single place to reconcile desired state across lifecycle events.

## API Flow (What `gh codespace ports visibility` Actually Does)
There is no stable public GitHub REST endpoint today for “set forwarded port visibility”.

The `gh` CLI implements visibility changes via:
1. GitHub API: fetch codespace connection metadata with an `internal=true&refresh=true` query to obtain a short-lived `managePortsAccessToken` and tunnel metadata.
2. Dev Tunnels API (Visual Studio tunnels service): use `managePortsAccessToken` to upsert port ACL entries for the tunnel.

Noter should implement the same flow server-side.

### Step 1: Get Tunnels Management Token From GitHub API
Request:
- `GET https://api.github.com/user/codespaces/{codespace_name}?internal=true&refresh=true`
- Auth: `Authorization: Bearer {githubAccessToken}`

Response (minimal shape needed):
- `connection.tunnelProperties.tunnelId`
- `connection.tunnelProperties.clusterId`
- `connection.tunnelProperties.managePortsAccessToken`
- `connection.tunnelProperties.serviceUri` (optional; used as fallback base URL)
- `runtime_constraints.allowed_port_privacy_settings`

Notes:
- `managePortsAccessToken` is short-lived; do not store it.
- If `allowed_port_privacy_settings` does not include `public`, do not attempt to set `public`.

### Step 2: Set Port Visibility Via Dev Tunnels API
Base URL selection:
- Prefer cluster-scoped host: `https://{clusterId}.rel.tunnels.api.visualstudio.com`
- Fallback to `serviceUri` when clusterId mapping is unavailable.

Request (public):
- `PUT /tunnels/{tunnelId}/ports/3000?includePorts=true&api-version=2023-09-27-preview`
- Auth: `Authorization: Tunnel {managePortsAccessToken}`
- Body (public):
```json
{
  "portNumber": 3000,
  "labels": ["UserForwardedPort"],
  "protocol": "http",
  "accessControl": {
    "entries": [
      { "type": "Anonymous", "subjects": [], "scopes": ["connect"] }
    ]
  },
  "portForwardingUris": null,
  "inspectionUri": ""
}
```

Request (private):
- Same endpoint, but omit the Anonymous entry.
- Practical implementation: `PUT` a body with an accessControl entry set that results in “no anonymous connect”.

Important: treat “private ACL body semantics” as implementation detail and validate by reading back current visibility (see “Verification”).

### Verification
After applying the change, read back the port definition and verify:
- `public`: `accessControl.entries` contains `type = "Anonymous"` and scope `connect`.
- `private`: no such entry exists.

If read-back fails due to eventual consistency, retry with backoff.

## Backend Design
### New Convex Action
Add action in `apps/noter/convex/codespaces.ts` (or a new module `codespacesPorts.ts`):
- `ensureCodespacePortsVisibility({ codespaceId }) -> { ensured: boolean, results: { port: number, desired: "public" | "private", applied: boolean, reason?: string }[] }`

Inputs:
- `codespaceId` (primary)
  - Fetch codespace record -> `ghCodespaceName`, `userId`, and current state.

Behavior:
1. Validate codespace exists and belongs to the caller (same `getUserId` semantics as other actions).
2. Fetch the stored GitHub OAuth access token for `codespaces.userId`.
3. Call GitHub API (Step 1) and validate response shape.
4. Respect `runtime_constraints.allowed_port_privacy_settings`.
5. Apply desired visibilities via tunnels API (Step 2).
6. Optionally re-run `checkAgentHealth` to confirm the agent is reachable.

Retry policy:
- Bounded retries with exponential backoff (ex: 5 attempts, up to ~60s total).
- Retry on: 404/409 during early tunnel provisioning, transient 5xx, timeouts.
- Do not retry on: `public` not allowed; auth failures (`401/403`) unless a token refresh is expected.

### Invocation Points
1. `apps/noter/convex/codespaces.ts:createCodespace`
   - After `pollCodespaceState` / `getCodespaceWithRetry`, call `ensureCodespacePortsVisibility`.
2. `apps/noter/convex/codespaces.ts:startCodespace`
   - After state becomes `running`, call `ensureCodespacePortsVisibility`.
3. `apps/noter/convex/vaultCodespaceIntegration.ts:ensureCodespaceReady`
   - For chat-only mode, treat “agent reachable” as part of readiness:
     - ensure port visibility
     - check agent health

## Data Model Changes
Extend `codespaces` table (`apps/noter/convex/schema.ts`) with optional operational fields:
- `agentPortDesiredVisibility`: `"public" | "private"` (default `"public"` for noter-managed vault codespaces)
- `agentPortCurrentVisibility`: `"public" | "private"` (best-effort observed)
- `agentPortVisibilityEnsuredAt`: number
- `agentPortVisibilityLastError`: string

These fields are not required for correctness, but they improve:
- UI/ops debugging
- Backoff decisions (avoid thrashing)
- Auditing “why agent is unreachable”

## Security Considerations
1. **No secrets in repo configuration**:
   - Do not place PATs/tokens in `noter.md`, devcontainer files, or template snapshots.
2. **Do not persist `managePortsAccessToken`**:
   - Treat as ephemeral; acquire per operation.
3. **Public port requires hardened agent auth**:
   - All non-health endpoints must require `Authorization: Bearer {agentToken}`.
   - Do not allow “first request sets token” bootstrap once port can be public.
4. **Least privilege**:
   - GitHub OAuth scope needed is `codespace` (already requested in `apps/noter/convex/auth.ts`).
5. **Logging redaction**:
   - Never log OAuth access tokens, refresh tokens, or tunnels tokens.

## Octokit vs Direct REST Calls
### What Octokit Helps With
- Official GitHub REST endpoints (create/start/stop/delete codespace) already use `@octokit/rest`.
- OAuth auth handling, headers, API versioning consistency, and pagination utilities.

### What Octokit Does Not Cover
- The Dev Tunnels API (`*.rel.tunnels.api.visualstudio.com`) is not a GitHub REST API; Octokit does not model it.
- The GitHub “internal=true&refresh=true” codespace response shape used by `gh` includes fields not present in public REST typings.

### Recommendation
- Keep using Octokit for standard Codespaces lifecycle endpoints (as today).
- For port visibility:
  1. Use direct `fetch` for the GitHub “internal/refresh” call with explicit runtime validation of the minimal response shape.
  2. Use direct `fetch` for the Dev Tunnels API calls.

Rationale:
- Avoid leaking `any` through Octokit’s untyped response for undocumented fields.
- Keep the implementation explicit, narrowly parsed, and easy to harden.

If GitHub introduces a supported REST endpoint for port visibility in the future, migrate the GitHub-side portion to Octokit and delete the internal/tunnels flow.

## Risks
1. **Undocumented dependency**: `internal=true&refresh=true` response fields may change.
   - Mitigation: isolate parsing/validation in one module; fail gracefully with actionable error state.
2. **Org policy restrictions**: some orgs disallow public ports.
   - Mitigation: check `allowed_port_privacy_settings`; surface clear UX error and fallback options.
3. **False sense of security**: public port increases attack surface.
   - Mitigation: require robust agent auth before enabling public visibility.

## Acceptance Criteria
1. Creating a new noter-managed vault codespace results in port `3000` being `public` without manual intervention.
2. `apps/noter/convex/codespacesExecutor.ts:checkAgentHealth` succeeds from backend for a running codespace (assuming agent is running).
3. If public ports are disallowed, Noter records a clear error and does not loop indefinitely.
4. No new long-lived secrets are introduced into repo files or starter template snapshots.

