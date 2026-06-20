# Chat Agent Feature Specification

## Status

Implemented for MVP with persisted threads, commit proposals, and approval-first production read
requests.

Last updated: 2026-02-13

## Scope

Noter's chat is a floating assistant (`ChatFab`) that is scoped to the current vault when available
and stored in Convex.

## Current Implementation

### Frontend

- Component: `apps/samebase/src/components/ChatFab.tsx`
- Rendered for authenticated users
- One thread per user+vault when a vault context exists
- Supports metadata-driven cards:
  - `commit_proposal`
  - `prod_read_proposal`
  - `prod_read_result`

### Backend

- Thread/message lifecycle: `apps/samebase/convex/chat/index.ts`
- Response generation and proposal/result messages: `apps/samebase/convex/chat/actions.ts`
- Tool catalog/system behavior: `apps/samebase/convex/agent/*`

## Data Model

- `agentThreadContext`
- `chatMessageMetadata`
- `aiProdAccessRequests`
- `aiProdAccessAudit`

## Approval Flows

### Commit proposal

1. Assistant proposes commit.
2. UI renders commit proposal card.
3. User confirms via `chat.confirmCommit`.

### Production read proposal

1. Assistant proposes prod read.
2. UI renders approval card with approve/reject actions.
3. `chat.confirmProdRead` schedules execution.
4. `chat.actions.executeApprovedProdRead` runs allowlisted read + redaction.
5. Result is persisted and displayed as `prod_read_result`.

## Policy Notes

- Admin-only checks are enforced server-side for prod reads.
- Requests expire (TTL) if not approved in time.
- Redaction mode is currently owner-mode-first (see `infraReadPolicy.ts`).

## Related Docs

- `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
- `AGENTS.md`
