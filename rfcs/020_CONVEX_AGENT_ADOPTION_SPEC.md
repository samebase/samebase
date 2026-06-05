# 020 Convex Agent Adoption Spec (AI Fab + Streaming)

## Document Control

- Status: Proposed
- Owner: Noter AI experience
- Last updated: 2026-02-21
- Related specs:
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
  - `rfcs/008_CHAT_ONLY_CODESPACE_MODE_SPEC.md`

## Summary

Adopt the Convex Agent component end-to-end so Noter chat (“AI Fab”) uses agent threads/messages
directly. Replace custom conversation/message tables with the Agent component’s data model while
preserving Noter-specific approval UX (commit proposals and prod-read approvals). Capture the “agent
builder” discussion by aligning Noter’s future agent definition format with LangSmith Agent Builder
exports (AGENTS.md, config.json, tools.json), without requiring LangSmith runtime adoption.

## Problem Statement

Noter currently uses the Agent component for LLM execution but bypasses its thread and message
storage. Chat history lives in `chatMessages`, and the UI reads from those tables directly. This
prevents streaming, duplicates context management, and limits compatibility with Convex Agent
workflows.

We want AI Fab to be a first-class agent experience with real-time streaming and durable threads,
while keeping Noter’s existing approval-first flows.

## Goals

- Use Convex Agent threads/messages as the single source of truth for AI Fab.
- Enable streaming in the chat UI using the Agent component stream model.
- Preserve commit proposal and prod-read approval cards.
- Keep tool activity visibility in chat.
- Maintain compatibility with future “agent-as-files” workflows (AGENTS.md, config.json, tools.json)
  discussed in the Agent Builder conversation.

## Non-Goals

- No LangGraph runtime migration in MVP.
- No LangSmith runtime dependency in MVP.
- No new external agent marketplace.
- No breaking change to existing approval policies.

## Product Decisions (Locked for MVP)

1. Agent component threads are the only conversation primitive.
2. Noter `chatConversations` and `chatMessages` are deprecated and removed after migration.
3. Streaming is enabled via `agent.streamText` with persisted stream deltas.
4. Noter-specific message metadata (commit/prod-read proposals, tool activity) is stored in a
   separate Noter table keyed by the agent message ID.
5. Noter-specific thread context (vault, repo, branch, file path) is stored in a lightweight
   `agentThreadContext` table keyed by `threadId`.
6. Approval flows continue to use `aiProdAccessRequests` and `aiProdAccessAudit`, but are updated to
   reference `threadId` instead of `conversationId`.
7. System prompts remain generated via `buildSystemPrompt`, but history/context is sourced from the
   agent thread.

## User Flow (MVP)

1. User opens AI Fab.
2. Noter loads or creates an agent thread for the current vault context.
3. User sends a message.
4. The user message is saved to the agent thread.
5. Agent streams its response, updating the UI in real time.
6. If a commit/prod-read proposal is produced, AI Fab shows the approval card.
7. On approval, the resulting action posts a follow-up assistant message to the same thread.

## Technical Design

### Data Model

- Add `agentThreadContext` table:
  - `threadId: v.string()` (agent component thread ID)
  - `userId: v.id("users")`
  - `vaultId: v.optional(v.id("vaults"))`
  - `repositoryFullName: v.optional(v.string())`
  - `branch: v.optional(v.string())`
  - `filePath: v.optional(v.string())`
  - `createdAt: v.number()`
  - Indexes on `threadId`, `userId`, and `vaultId`.
- Add `chatMessageMetadata` table:
  - `messageId: v.string()` (agent component message ID)
  - `threadId: v.string()`
  - `type: v.union(v.literal("tool_activity"), v.literal("commit_proposal"), v.literal("prod_read_proposal"), v.literal("prod_read_result"))`
  - `payloadJson: v.string()` (typed JSON payload; keeps schema strict and avoids `any`)
  - Index on `messageId` and `threadId`.
- Update `aiProdAccessRequests`:
  - Replace `conversationId` with `threadId: v.string()`.
  - Add index by `threadId` for lookup.
- Remove `chatConversations` and `chatMessages` tables after migration.

### Backend Changes

- Replace `chat.createConversation` with `chat.createThread`:
  - Create an agent thread via `components.agent.threads.createThread`.
  - Create/update `agentThreadContext` for vault/repo context.
  - Return `threadId` to the client.
- Replace `chat.sendMessage`:
  - Use `agent.saveMessage` with `{ threadId, prompt: content, userId }`.
  - Return the `messageId` from the agent component.
  - Schedule `generateResponse` with `threadId` and `promptMessageId`.
- `chat.actions.generateResponse`
  - Use `agent.streamText` so streaming deltas are stored.
  - Pass `threadId` and `promptMessageId`.
  - Set `saveMessages: "promptAndOutput"` and `saveStreamDeltas: true`.
  - Parse `result.savedMessages` to locate the assistant message IDs.
  - For commit/prod-read proposals, insert a `chatMessageMetadata` row keyed to the assistant
    message ID.
- `chat.actions.executeApprovedProdRead`
  - Write prod-read results as assistant messages to the agent thread via `agent.saveMessage` and
    attach metadata rows for status.
- `buildSystemPrompt`
  - Keep current prompt generation; rely on agent thread context rather than manually injecting
    historical messages.

### Frontend Changes

- Track `threadId` as the primary identifier for AI Fab sessions.
- Add a new query `listThreadMessages` that:
  - Uses `listUIMessages(ctx, components.agent, args)`.
  - Uses `syncStreams(ctx, components.agent, args)` for streaming.
  - Joins `chatMessageMetadata` by `messageId` and attaches it to `UIMessage.metadata`.
- Update `ChatFab.tsx`:
  - Use `useUIMessages` with `stream: true` for streaming.
  - Render metadata-driven cards for commit/prod-read proposals.
  - Preserve tool activity badge based on metadata.

### Workflows

- Adopt Convex Workflows for long-running agent tasks (optional follow-up).
- Examples: repo audits, infra diagnostics, multi-step refactors.
- Workflow steps can write progress updates as assistant messages to the same thread for UI
  continuity.

### Observability

- Use Convex Agent debugging and stored message history for runtime inspection.
- Optional future integration: export/import agent definitions in the Agent Builder format
  (AGENTS.md, config.json, tools.json) for compatibility with LangSmith Agent Builder.

## Migration Plan

1. Add `agentThreadContext` and `chatMessageMetadata` schema.
2. Update approval tables to reference `threadId` instead of `conversationId`.
3. Replace chat endpoints and UI to be thread-based only.
4. Optional backfill: migrate existing `chatMessages` into agent threads.
5. Remove `chatConversations` and `chatMessages` tables and legacy code paths.

## Testing

- Manual
  - Send a message and verify streaming output.
  - Confirm tool badge + commit/prod-read proposal cards show as expected.
  - Approve a prod-read and verify the response is posted as an assistant message.
- Optional automated
  - Unit test `listThreadMessages` for metadata join correctness.
  - Unit test `generateResponse` metadata creation paths.

## Open Questions

1. Do we want to backfill legacy `chatMessages` into agent threads or start fresh?
2. What minimal fields should be persisted in `agentThreadContext`?
3. Should we add a dedicated UI for agent file definitions (AGENTS.md, config.json, tools.json) in
   this same milestone or defer?
