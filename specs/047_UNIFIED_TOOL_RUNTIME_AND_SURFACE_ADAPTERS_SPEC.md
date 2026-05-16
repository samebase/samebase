# 047 Unified Tool Runtime And Surface Adapters Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-03-09
- Related specs:
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
  - `specs/020_CONVEX_AGENT_ADOPTION_SPEC.md`
  - `specs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md`

## Summary

Define one canonical tool runtime in Convex that is shared by:

1. Noter chat agent
2. MCP server clients (including ChatGPT)
3. Noter UI actions/buttons

This replaces per-surface tool reimplementation with a single source of truth
for tool metadata, input contracts, execution logic, access policy, and audit.

## Why This Spec Exists

Current state duplicates tool behavior across surfaces:

1. Agent tools are defined in `apps/noter/convex/agent/tools.ts`.
2. MCP tools are separately hardcoded in `apps/noter/convex/mcp/http.ts`.
3. UI approval/button flows use chat metadata paths that are not MCP-native.

This causes drift in behavior, naming, and approval semantics. We need one
runtime so adding a tool once makes it available everywhere by policy.

## Product Decisions (Locked)

1. A tool is defined exactly once in Convex runtime code.
2. Agent, MCP, and UI are adapters over the same runtime.
3. Tool names are canonical and shared across surfaces; no per-surface renaming.
4. MCP write/destructive confirmation uses MCP client-native confirmation UX,
   not Noter-specific redirect/card UX.
5. Existing approval-first provider reads remain approval-first in backend
   policy and are represented as proposal/status results in MCP (not UI cards).
6. `commit_and_push` stays out of MCP for now, but remains in the same shared
   runtime for Agent/UI so there is still one implementation.
7. Branch context is first-class for repository tools; file/edit/list tools must
   be explicitly branch-aware to match the latest remote-branch model.

## Goals

1. Eliminate duplicate tool executor logic.
2. Make tool rollout policy-driven (`agent`/`mcp`/`ui`) instead of copy/paste.
3. Keep existing Noter behavior for ChatFab while enabling MCP-safe reuse.
4. Preserve strict server-side authorization and audit regardless of client UX.
5. Make future tool additions faster: define once, enable per-surface.

## Non-Goals

1. Replacing all chat metadata UX immediately.
2. Shipping MCP commit execution in this phase.
3. Removing existing approval-first semantics for sensitive infra/data reads.
4. Designing a generic plugin marketplace in this spec.

## Current State Research

1. `apps/noter/convex/agent/toolCatalog.ts` holds Agent UI metadata, but not a
   shared executable registry.
2. `apps/noter/convex/agent/tools.ts` includes concrete executors and policy,
   tightly coupled to Agent runtime wiring.
3. `apps/noter/convex/mcp/http.ts` currently exposes only `vaults.list` and does
   not reuse Agent executors.
4. `apps/noter/src/components/ChatFab.tsx` commit/prod-read approval cards are
   Noter-web specific and not reusable by MCP clients.
5. `main` now includes branch-native repository state through
   `vaultRemoteBranches` and `vaultBranchTrees`, with ahead/behind and PR-link
   metadata surfaced in vault/dashboard flows. Shared tools must consume this
   model instead of assuming a single implicit branch.

## Architecture

### 1) Canonical runtime module

Create a shared runtime package under `apps/noter/convex/toolRuntime/*`.

Recommended files:

1. `toolRuntime/types.ts`
2. `toolRuntime/catalog.ts`
3. `toolRuntime/context.ts`
4. `toolRuntime/policy.ts`
5. `toolRuntime/runTool.ts`
6. `toolRuntime/executors/*.ts`

Responsibilities:

1. `catalog.ts`: canonical tool metadata (name, description, input schema, scope
   requirements, surface availability, safety hints).
2. `executors/*.ts`: actual tool logic (read/write/list/proposal/etc).
3. `policy.ts`: centralized checks (auth, scope, vault ownership, branch/path
   constraints, proposal-only gating).
4. `runTool.ts`: single execution entrypoint that validates input, enforces
   policy, runs executor, and records audit.

### 2) Surface adapters

Adapters must contain no business logic beyond mapping protocol payloads.

1. Agent adapter:
   - builds `createTool(...)` wrappers by reading catalog entries.
   - delegates execution to `runTool`.
2. MCP adapter:
   - `tools/list` from catalog filtered by MCP + granted scopes.
   - `tools/call` delegates to `runTool`.
3. UI adapter:
   - UI buttons/actions invoke a Convex action that calls `runTool`.

### 3) Tool policy model

Each tool definition includes:

1. `surfaces`: subset of `agent | mcp | ui`
2. `requiredScopes` for MCP
3. `requiresVaultContext` boolean
4. `requiresBranchContext` boolean
5. `safety`: `read_only | write | destructive | proposal_only`
6. optional `resultMode`: `direct | proposal`

Policy is server-enforced. Client hints do not bypass server checks.

### 4) Approval model by surface

1. Agent/UI (existing):
   - keep current card-based UX where already implemented.
2. MCP:
   - no redirect/card requirement.
   - rely on MCP client-native confirmation for write/destructive calls.
   - for proposal tools, return proposal/status payloads.

## Canonical Tool Set (Phase 1 Standardization)

Phase 1 standardizes shared tooling for these existing names:

1. `vaults.list`
2. `vaults.get`
3. `read_file`
4. `list_files`
5. `edit_file`
6. `replace_in_file`
7. `create_file`
8. `delete_file`
9. `request_convex_status_read`
10. `request_convex_logs_read`
11. `request_cloudflare_status_read`
12. `request_cloudflare_logs_read`
13. `request_cloudflare_accounts_read`
14. `request_cloudflare_workers_inventory_read`
15. `request_convex_data_read`
16. `commit_and_push` (shared runtime, surfaces: `agent`, `ui`; `mcp` disabled)
17. `get_vault_remote_branches`

Notes:

1. Names stay unchanged to avoid transition churn in prompts and UI metadata.
2. `commit_and_push` remains canonical but not exposed to MCP in this phase.
3. `read_file`, `list_files`, `edit_file`, `replace_in_file`, `create_file`, and
   `delete_file` must take explicit branch context in shared runtime adapters
   (no implicit `main` fallback in runtime policy).

## MCP Contract Updates

### Tool discovery

1. `tools/list` is generated from the canonical catalog.
2. Return only tools with `surfaces` containing `mcp` and matching token scope.

### Tool execution

1. `tools/call` validates tool name against catalog.
2. Input is validated against canonical schema.
3. Policy checks run before executor.
4. Return normalized structured payload plus human-readable text fallback.

### Scope mapping

Initial scope mapping:

1. `vaults.read` => `vaults.list`, `vaults.get`, `get_vault_remote_branches`
2. `files.read` => `read_file`, `list_files`
3. `files.write` => `edit_file`, `replace_in_file`, `create_file`, `delete_file`
4. `prod.read.propose` => all `request_*_read` tools
5. `commits.propose` => reserved for now (`commit_and_push` not exposed in MCP
   in this phase)

## Data And Audit

Add unified tool execution audit table:

- `toolExecutions`
  - `toolName`
  - `surface` (`agent | mcp | ui`)
  - `userId`
  - `vaultId?`
  - `requestId?` (for MCP JSON-RPC id correlation)
  - `status` (`ok | error | blocked`)
  - `inputHash`
  - `resultSummary`
  - `createdAt`

Purpose:

1. one place to inspect behavior across all surfaces
2. easier drift detection and security review

## Migration Plan

### Phase 1: runtime scaffold + first tools

1. Add `toolRuntime/*` skeleton.
2. Migrate `vaults.list`, `read_file`, `list_files` executors first.
3. Wire Agent and MCP adapters to these migrated tools.
4. Keep legacy paths for unmigrated tools temporarily.
5. Include `get_vault_remote_branches` in Phase 1 so branch context is available
   to all surfaces from the start.

### Phase 2: all file write tools

1. Migrate `edit_file`, `replace_in_file`, `create_file`, `delete_file`.
2. Remove duplicate logic from `agent/tools.ts` for migrated tools.
3. Expose migrated write tools in MCP with scope checks.

### Phase 3: prod-read proposal tools

1. Migrate all `request_*_read` tools.
2. Unify proposal payload format across surfaces.
3. Keep UI cards only as a rendering layer over shared payloads.

### Phase 4: cleanup + hardening

1. Eliminate remaining duplicate executor logic.
2. Switch MCP tool list/call fully to catalog-driven dispatch.
3. Add audit dashboards/queries for cross-surface tool usage.

## Acceptance Criteria

1. A migrated tool has one executor implementation used by Agent, MCP, and UI.
2. MCP `tools/list` is generated from shared catalog (not hardcoded switch).
3. Same tool name and behavior across surfaces for migrated tools.
4. Server policy blocks unauthorized writes even if client attempts raw calls.
5. Audit records include surface and tool name for every execution.
6. Branch-aware tools behave consistently for non-default branches (including
   repos where default branch is not `main`).

## Test Strategy

1. Unit tests:
   - catalog schema validation
   - policy enforcement by surface + scope
   - executor deterministic behavior
2. Integration tests:
   - Agent call and MCP call for same tool return equivalent structured result
   - write tool blocked without `files.write`
3. Manual smoke:
   - ChatFab tool call works
   - MCP tool call works
   - UI-triggered action works
   - all hit the same runtime logs/audit rows

## Open Questions

1. Should we expose `commit_and_push` to MCP later as proposal-only or direct
   write tool?
2. Do we want per-tool concurrency controls in `policy.ts` for write tools?
3. Should MCP return standardized machine-readable error codes for policy blocks
   (`scope_missing`, `vault_context_missing`, `path_rejected`)?

## Execution Tracker

- Last updated: 2026-03-09
- Overall status: `3/4 phases complete`
- Current next step: `Phase 4 cleanup + hardening`

Phase status:

- [x] Phase 1: runtime scaffold + first tools
- [x] Phase 2: all file write tools
- [x] Phase 3: prod-read proposal tools
- [ ] Phase 4: cleanup + hardening
