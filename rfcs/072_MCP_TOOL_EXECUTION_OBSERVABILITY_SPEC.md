# 072 MCP Tool Execution Observability Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-03-27
- Related specs:
  - `specs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md`
  - `specs/047_UNIFIED_TOOL_RUNTIME_AND_SURFACE_ADAPTERS_SPEC.md`
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`

## Summary

Add a durable, queryable audit trail for MCP tool execution so operators can
answer:

1. whether an MCP client connected successfully
2. which MCP tools it actually called
3. whether each call succeeded, was blocked by policy, or failed at runtime
4. which vault/branch/thread context was involved

The current production system records MCP OAuth lifecycle events, but it does
not record completed `tools/call` executions in a way that supports product
monitoring or operational debugging.

## Why This RFC Exists

On 2026-03-27 we investigated whether a remote Codex client had used the Noter
MCP server from another machine.

What we could prove:

1. production `mcpOauthClients`, `mcpAuthRequests`, and `mcpAccessAudit` rows
   showed recent `"Codex"` clients with localhost callback URLs
2. the OAuth/token flow definitely completed on production

What we could not prove:

1. whether the client actually called `tools/call`
2. which tool names were invoked
3. whether calls were blocked, errored, or succeeded
4. whether any MCP action produced user-visible repository changes

That gap makes MCP support and monitoring weaker than the rest of the product.

## Current State Research

### MCP OAuth lifecycle is already durable

`apps/noter/convex/schema.ts` defines:

1. `mcpOauthClients`
2. `mcpAuthRequests`
3. `mcpAuthorizationCodes`
4. `mcpGrants`
5. `mcpAccessTokens`
6. `mcpRefreshTokens`
7. `mcpAccessAudit`

`mcpAccessAudit` is currently used by `apps/noter/convex/mcp/oauth.ts` for
OAuth/token lifecycle events such as:

1. `authorization_code_issued`
2. `authorization_denied`
3. `access_token_issued`

This is useful for connection debugging, but it is not an execution audit for
the actual MCP tool surface.

### MCP tool calls are forwarded, but not durably audited

`apps/noter/convex/mcp/http.ts` handles `tools/call` by:

1. validating the RPC method
2. resolving the tool from the catalog
3. normalizing input and context
4. calling `internal.toolRuntime.runtime.runTool`

`apps/noter/convex/toolRuntime/runtime.ts` then:

1. validates input JSON
2. enforces policy
3. resolves runtime context
4. runs the executor
5. returns `ok | blocked | error`

However, the runtime path does not currently persist a durable execution record.

### Existing stdout logs are not sufficient

Convex logs are helpful only when code explicitly emits lines. Today:

1. MCP OAuth/token flows have some log coverage in adjacent modules
2. successful MCP tool execution does not emit a canonical log line
3. log history is harder to query than Convex tables and is not a good source of
   truth for product analytics

### Spec 047 already anticipated unified execution audit

`specs/047_UNIFIED_TOOL_RUNTIME_AND_SURFACE_ADAPTERS_SPEC.md` already proposes a
shared `toolExecutions` table for `agent | mcp | ui`.

That table has not been implemented yet, but the direction is correct. The main
missing detail for MCP monitoring is richer surface metadata such as MCP
`clientId`.

## Problem Statement

Noter can currently tell that an MCP client authenticated, but not what it did
after authentication.

That means we cannot reliably answer basic operational questions such as:

1. Did Codex call `read_file` or only complete OAuth?
2. Was `edit_file` blocked by policy or did it succeed?
3. Which vault and branch did the client target?
4. Did the failure happen in MCP protocol handling, policy, or executor logic?
5. Which MCP clients are actually using the server in production?

## Goals

1. Record every MCP `tools/call` attempt in a durable queryable store.
2. Preserve enough metadata to debug and monitor usage.
3. Avoid logging raw secrets, full file contents, or full tool outputs.
4. Keep the solution compatible with the shared tool runtime direction from
   spec 047.
5. Make it easy to add internal dashboards or queries later.

## Non-Goals

1. Full session replay of MCP conversations.
2. Persisting raw file contents, prompts, tokens, or full tool outputs.
3. Building a complete operator UI in the first phase.
4. Logging every low-level protocol message in phase 1.
5. Replacing `mcpAccessAudit` as the source of truth for OAuth lifecycle events.

## Options Considered

### Option 1: Add more stdout logs only

Description:

1. emit structured `console.log` lines from `mcp/http.ts` and/or
   `toolRuntime/runtime.ts`
2. rely on Convex log history for debugging

Pros:

1. smallest patch
2. no schema change
3. helps immediate debugging

Cons:

1. not durable enough for product monitoring
2. harder to query by client, user, tool, or vault
3. log retention and search ergonomics are worse than table-backed reads
4. still leaves no canonical audit surface for future dashboards

Conclusion:

Useful as supplemental error logging, but not sufficient as the primary fix.

### Option 2: Extend `mcpAccessAudit` to include tool execution events

Description:

1. keep one MCP-specific audit table
2. add actions such as:
   - `tools_list`
   - `tool_call_started`
   - `tool_call_ok`
   - `tool_call_blocked`
   - `tool_call_error`

Pros:

1. reuses an existing table
2. keeps all MCP-related events together
3. enough to answer the immediate monitoring question

Cons:

1. mixes OAuth lifecycle events with tool runtime events
2. duplicates the cross-surface audit direction in spec 047
3. pushes more structure into `detailsJson` instead of typed columns
4. less reusable for `agent` and `ui`

Conclusion:

Better than logs only, but it reinforces an MCP-only special case when the code
is already moving toward a unified runtime.

### Option 3: Implement the shared `toolExecutions` audit table from spec 047

Description:

1. add a canonical `toolExecutions` table owned by the shared tool runtime
2. write one row for every tool execution attempt across `agent | mcp | ui`
3. extend the runtime args to carry optional MCP metadata

Pros:

1. matches the existing architecture direction
2. gives one canonical audit surface for all tools
3. supports both product analytics and operator debugging
4. avoids keeping MCP observability as a special side path forever

Cons:

1. slightly larger change than MCP-only logging
2. needs careful schema design for redaction and metadata size
3. still may want a few targeted stdout logs for protocol-level failures

Conclusion:

This is the recommended foundation.

### Option 4: Hybrid

Description:

1. implement `toolExecutions` as the durable source of truth
2. keep `mcpAccessAudit` focused on OAuth/token lifecycle
3. add a small number of structured console logs for MCP protocol errors only

Pros:

1. durable monitoring plus fast operational debugging
2. preserves clean ownership boundaries
3. aligns with spec 047 while improving day-one supportability

Cons:

1. more work than a console-only patch

Conclusion:

This is the recommended approach for implementation.

## Recommendation

Implement Option 4.

Specifically:

1. add a shared `toolExecutions` table in Convex runtime code
2. record all MCP `tools/call` executions there
3. pass through MCP-specific metadata like `clientId`
4. keep `mcpAccessAudit` unchanged for OAuth/token lifecycle
5. add only minimal structured console logs for unexpected MCP protocol-level
   failures

## Proposed Audit Contract

### Table ownership

The audit table should belong to the shared tool runtime, not the MCP adapter.

That keeps:

1. execution semantics centralized
2. surface-specific adapters thin
3. future `agent` and `ui` monitoring aligned with the same schema

### Proposed table shape

Add a new `toolExecutions` table with typed fields:

```ts
toolExecutions: defineTable({
  toolName: string(),
  surface: union(literal('agent'), literal('mcp'), literal('ui')),
  status: union(literal('ok'), literal('blocked'), literal('error')),
  userId: id('users'),
  vaultId: optional(id('vaults')),
  branch: optional(string()),
  threadId: optional(string()),
  requestId: optional(string()),
  createdAt: number(),
  durationMs: number(),
  clientId: optional(string()),
  clientName: optional(string()),
  resultSummary: optional(string()),
  blockReason: optional(string()),
  errorMessage: optional(string()),
  inputSummaryJson: optional(string()),
})
```

Recommended indexes:

1. `by_surface`
2. `by_user_id`
3. `by_tool_name`
4. `by_surface_and_created_at`
5. `by_client_id`
6. `by_vault_id`
7. `by_request_id`

### Input summary rules

`inputSummaryJson` must be deliberately sanitized.

Allowed examples:

1. booleans and enum-like flags
2. target identifiers such as `vaultId`, `branch`, `threadId`
3. path counts or short path lists when safe
4. payload sizes or object keys

Disallowed examples:

1. raw file contents
2. full prompt text
3. OAuth tokens or credentials
4. full output bodies

### Result summary rules

`resultSummary` should be short and operator-oriented, for example:

1. `returned 4 files`
2. `proposal created`
3. `blocked: missing vault context`
4. `error: GitHub provider connection is not configured`

If the natural result text is too long, store a truncated sanitized summary.

## Runtime Wiring Changes

### 1) Thread MCP metadata from adapter to runtime

`apps/noter/convex/mcp/http.ts` currently knows:

1. the authenticated MCP user
2. the granted scopes
3. the JSON-RPC request id
4. the access token validation result

To support monitoring, the adapter should also pass:

1. `clientId`
2. optional `grantId`
3. optional `clientName` if it can be resolved cheaply

This should be added to the runtime action args as explicit optional fields
rather than hidden inside `inputJson`.

### 2) Audit at the runtime boundary

`apps/noter/convex/toolRuntime/runtime.ts` should:

1. record one row for each execution attempt
2. capture status after policy/executor resolution
3. include `durationMs`
4. write only sanitized summaries

The runtime layer is the correct place because it sees:

1. the canonical tool name
2. the surface
3. the final status
4. the normalized context

### 3) Keep protocol error logging separate

MCP adapter code should still log a small set of protocol-level failures that do
not reach `runTool`, for example:

1. malformed JSON-RPC payload
2. missing tool name
3. unknown tool name
4. invalid/expired bearer token

Those should stay as logs or a future protocol-audit follow-up, not overload the
execution table.

## Privacy and Safety Constraints

1. Never store MCP access tokens, refresh tokens, or authorization codes in the
   execution audit.
2. Never store full file contents or large tool outputs.
3. Treat `errorMessage` and `resultSummary` as user-visible operator data and
   sanitize accordingly.
4. Do not add speculative fields that are not used by the first implementation.

## Rollout Plan

### Phase 1: Durable MCP execution audit

1. add `toolExecutions` schema
2. extend runtime args with optional MCP metadata
3. write execution rows from `toolRuntime/runtime.ts`
4. include MCP metadata for `tools/call`

### Phase 2: Internal read path

1. add an internal/admin query for recent tool executions
2. support filtering by:
   - `surface`
   - `toolName`
   - `userId`
   - `clientId`
   - `vaultId`

### Phase 3: Operator visibility

1. add a lightweight internal dashboard or debug query surface
2. optionally add rollups for:
   - top MCP tools
   - blocked tool rate
   - error rate by client

### Phase 4: Broader runtime observability

1. backfill `agent` and `ui` to the same table
2. remove any remaining per-surface execution audit drift

## Acceptance Criteria

1. A completed MCP `tools/call` creates exactly one durable execution record.
2. Operators can distinguish `ok`, `blocked`, and `error` outcomes.
3. Operators can filter recent MCP executions by `clientId` and `toolName`.
4. No raw credentials or file contents are persisted in the execution audit.
5. OAuth/token lifecycle remains in `mcpAccessAudit` and is not replaced by the
   new table.
6. After rollout, the question "did Codex authenticate only, or did it call
   `read_file` on a specific vault?" is answerable from Convex data alone.

## Open Questions

1. Should `tools/list` get its own lightweight protocol audit in phase 1, or is
   `tools/call` enough for the first operator need?
2. Should `clientName` be denormalized into `toolExecutions`, or resolved on
   read via `clientId` lookup?
3. How long should execution audit rows be retained before archival or cleanup
   becomes necessary?
