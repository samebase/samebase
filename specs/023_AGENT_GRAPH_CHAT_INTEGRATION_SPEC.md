# 023 Agent Graph Chat Integration Spec

## Document Control

- Status: Draft
- Owner: Noter frontend + Convex
- Date: 2026-02-22
- Related specs:
  - `specs/020_CONVEX_AGENT_ADOPTION_SPEC.md`
  - `specs/022_AGENT_GRAPH_VIEW_SPEC.md`
- Related files:
  - `apps/noter/src/components/AgentGraphView.tsx`
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/ChatFab.tsx`
  - `apps/noter/convex/agentGraphActions.ts`
  - `apps/noter/convex/chat/index.ts`
  - `apps/noter/convex/chat/actions.ts`

## Summary

Define how the Graph View chat input connects to Noter's primary chat system using a single
per-vault thread for the MVP, and formalize persistence of the Editor/Graph view mode per vault.

## Goals

- Make Graph View chat messages persist across reloads and sessions.
- Ensure Graph View chats are part of the main vault conversation.
- Avoid new chat primitives for the MVP.
- Persist the Editor/Graph mode per vault and restore it on reload.

## Non-Goals

- Building a multi-agent orchestration engine.
- Editing or generating graph structure based on chat output.
- Cross-user sharing of graph chat threads.
- Multi-vault graph conversations.
- Per-agent or per-node chat threads (deferred).

## Current State (Observed)

- Graph View chat reuses the per-vault chat thread and streams messages from
  `chat.index.listThreadMessages`.
- Messages are sent via `chat.index.sendMessage`, matching ChatFab behavior.
- The main Chat UI (`ChatFab`) continues to show one thread per vault (shared with Graph View).
- Editor/Graph view mode is stored in localStorage but is not specified as a formal contract and
  does not cover failures or restore timing.

## Proposed Behavior

### 1) Graph Chat Uses the Vault Thread (MVP)

- Graph View sends messages into the existing per-vault chat thread used by ChatFab.
- Graph View displays recent messages from the same thread (last N messages), so the node chat is a
  mini view into the vault conversation.
- No new per-node thread creation in the MVP.

### 2) System Prompt Behavior (MVP)

- Graph View does not introduce a new system prompt pipeline.
- Messages use the existing vault chat system prompt behavior.
- Agent-file-specific prompt overrides are deferred to a later iteration.

### 3) View Mode Persistence Per Vault

- Editor/Graph mode is persisted per vault in `localStorage`.
- Key format: `noter:graph-view:${vaultId}`.
- On load, the initial `viewMode` is derived from storage before first render to avoid a flash of
  the default view.
- If storage is unavailable or corrupt, default to `editor`.

## Data Model

Add `agentGraphNodeLayout` to persist node sizes per user and vault.

- `agentThreadContext` remains the single thread context per vault.
- `agentGraphNodeLayout` stores `{ nodeId, width, height, updatedAt }`.

## API Changes

No new Convex API is required for the MVP.

- Graph View uses existing `chat.index.createThread` and `chat.index.sendMessage` against the vault
  thread.

## UI/UX Requirements

- Agent nodes show chat history sourced from the vault thread (Convex).
- The node chat input is labeled as part of the vault chat, not a separate session.
- ChatFab continues to show the same messages (shared thread).
- The message list in graph nodes is scrollable with a fixed max height.
- If the agent file is missing or unreadable, the node chat input is disabled with a concise error
  message.

## Persistence Requirements

- Graph chat uses the existing per-vault thread stored in Convex.
- Graph node sizes are stored per user/vault in Convex.
- View mode is stored per vault in localStorage.
- No cross-device sync is required for view mode (local only).

## Acceptance Criteria

1. Opening Graph View and sending a message appends to the vault chat thread.
2. Reloading the page restores graph chat history from the vault thread.
3. ChatFab shows the same messages sent from Graph View.
4. Editor/Graph mode restores correctly on reload, per vault.
5. Switching vaults preserves the last mode per vault.

## Test Scenarios

- Send a graph chat message, reload, and confirm history remains.
- Open ChatFab and confirm the graph message appears in the vault chat.
- Toggle Graph view, reload, confirm the view restores for the same vault.
- Switch vaults, verify each vault restores its own last view mode.

## Open Questions

- Should we add optional message metadata to indicate graph-origin messages?
- Do we want to persist view mode to Convex for cross-device sync later?

## Future Iterations

- Resizable/collapsible graph node chat area (VSCode sidebar-like behavior).
