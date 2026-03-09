# 047 Branch Agent Avatar Presence Spec

## Document Control

- Status: Proposed
- Owner: Noter dashboard/chat
- Last updated: 2026-03-09
- Related specs:
  - `specs/045_UNIFIED_TOOL_RUNTIME_AND_SURFACE_ADAPTERS_SPEC.md`
  - `specs/045_VAULT_MULTI_BRANCH_DASHBOARD_AND_EDITOR_SPEC.md`
  - `specs/046_VAULT_MULTI_BRANCH_ROLLOUT_PLAN.md`
  - `CHAT_SPEC.md`

## Summary

Add branch-level avatar groups to `VaultDashboard` branch rows so users can see
which work actors are active on each branch in the vault/bolt dashboard. Avatars
must be generated locally from a stable seed, with no third-party avatar service
dependency.

Full-color avatars mean the actor currently has working presence on that branch.
Grayed out avatars mean the actor previously worked on that branch but is not
currently active there.

Important rule: a branch facepile means branch presence/activity, not generic
capability. We should not show one vault-level agent avatar on every branch row
just because that agent could theoretically access those branches.

Actors include:

1. Noter-managed agent conversations
2. MCP clients that execute branch-scoped tools through the shared runtime (for
   example ChatGPT)

## Goals

1. Show branch-scoped work presence directly in the dashboard branch list.
2. Give each actor a stable generated avatar across reloads and devices.
3. Support multiple actors per branch.
4. Preserve historical branch presence when an actor stops working on a branch.
5. Keep actor behavior transparent: create conversations, attach them to
   branches, archive them explicitly, and reflect MCP activity without hiding
   its source.

## Non-Goals

1. Human collaborator presence in this UI.
2. Perfect ownership inference from all read activity.
3. Branch permissions, scheduling, or orchestration logic.
4. Any external avatar API or hosted image service.

## UX

1. Each branch row in `apps/noter/src/components/VaultDashboard.tsx` gets a
   compact avatar group near the branch label/metadata.
2. Use shadcn `Avatar` plus `AvatarGroup`/`AvatarGroupCount` styling for the
   facepile.
3. Avatar art is deterministic SVG generated locally from a stable actor seed
   (robot-like by default, but implementation can swap styles later without
   changing the data model).
4. Show up to 3 avatars inline, then `+N` overflow.
5. Active avatars render normally. Historical avatars render grayed out with
   reduced opacity.
6. Hover/tap shows actor name, source (`Noter` agent or MCP client), current
   branch, and last activity time.
7. Clicking a Noter-managed actor opens that conversation in the selected branch
   context.
8. Clicking an MCP actor can open a detail surface later, but MVP may keep MCP
   avatars non-clickable.
9. Actors with no active branch presence should not appear as fake branch
   badges. Show them in a separate vault-level "unattached" surface if we need
   to expose them.

## Data Model

Branch presence should not be derived only from ChatFab thread state. The shared
tool runtime from PR `#180` means MCP clients and internal chat can both create
branch-scoped work signals. The data model should therefore track actors and
branch work presence explicitly.

Add table `workActors`:

1. `vaultId?`
2. `userId`
3. `kind: "noter_agent" | "mcp_client"`
4. `displayName`
5. `avatarSeed`
6. `threadId?`
7. `mcpClientId?`
8. `mcpGrantId?`
9. `focusedBranch?`
10. `lastActivityAt`
11. `archivedAt?`

Add table `branchActorPresence`:

1. `vaultId`
2. `branch`
3. `actorId`
4. `lastWorkedAt`
5. `lastSignalKind: "tool_write" | "tool_read" | "commit" | "chat"`
6. `state: "active" | "historical"`

Add table `toolExecutions` or equivalent execution ledger if shared runtime
events are not already persisted:

1. `actorId?`
2. `userId`
3. `vaultId?`
4. `branch?`
5. `toolName`
6. `surface: "agent" | "mcp" | "ui"`
7. `threadId?`
8. `requestId?`
9. `executedAt`

Presence source rules:

1. Branch facepiles should primarily use branch-scoped write signals:
   `edit_file`, `replace_in_file`, `create_file`, `delete_file`, commit/staging
   mutations, and future branch-targeted write tools.
2. Raw reads like `read_file` should be treated as weak signals and should not
   create noisy permanent presence by themselves.
3. MCP actors are identified from token validation/runtime context using stable
   MCP identifiers such as `clientId` and `grantId`.
4. Noter-managed actors are identified by `threadId`.
5. `focusedBranch` means latest explicit branch context for the actor. It is not
   an access restriction and not the sole source of branch presence.

Behavior:

1. Any branch-scoped tool execution through the shared runtime may update actor
   activity timestamps.
2. Branch-scoped write signals upsert
   `branchActorPresence(vaultId, branch, actorId)` as `active`.
3. When an actor stops producing signals for a branch and later works elsewhere,
   prior branch rows may become `historical`.
4. An actor may have presence on multiple branches over time.
5. Archiving a Noter conversation archives the actor, but does not rewrite
   branch history.

Actor-specific notes:

1. Noter-created agents are a subtype of actor, not the entire model.
2. MCP clients such as ChatGPT should appear in branch presence when they do
   real branch-scoped work through shared tools.
3. A single external MCP client may map to one stable actor even if its external
   conversation identity is not available.

## Query/API

Add `vault.listBranchActorPresence({ vaultId })` returning branch-keyed avatar
data for dashboard rows.

Return shape per branch:

1. active actors first, ordered by `lastWorkedAt desc`
2. historical actors next, ordered by `lastWorkedAt desc`
3. stable avatar metadata (`displayName`, `avatarSeed`, `kind`, `threadId?`,
   `mcpClientId?`, `focusedBranch`, `lastWorkedAt`, `state`, `lastSignalKind`)

Add `vault.listUnattachedActors({ vaultId })` for actors with no active branch
presence, if we decide to surface them in the dashboard.

Migration note:

1. Reuse `agentThreadContext.branch` as temporary branch input for Noter-managed
   actors where helpful.
2. Reuse shared runtime context (`surface`, `vaultId`, `branch`, `threadId`,
   `requestId`) as the basis for actor presence derivation.
3. Do not keep the one-thread-per-vault restriction for new Noter-managed
   agents.

## Rollout Phases

### Phase 1: Branch Presence Foundation

1. Add `workActors` and `branchActorPresence`.
2. Persist shared runtime execution events if they are not already stored.
3. Make the current floating chat and MCP runtime both write actor presence when
   branch-scoped work happens.
4. Render branch avatar groups from real data in `VaultDashboard`.
5. Support active and historical avatars.

### Phase 2: Multiple Noter Agent Conversations

1. Allow creating additional Noter-managed agent conversations per vault.
2. Each conversation gets its own stable avatar and branch presence history.
3. Add archive conversation support instead of deletion semantics.
4. Optionally add an unattached-actors surface for actors not active on any
   branch.

### Phase 3: Tool-Driven Agent Creation

1. Let a user or another actor create a new Noter-managed agent conversation via
   a tool.
2. New conversations appear immediately in dashboard branch presence.
3. Archiving remains explicit and user-visible.

Out of scope for this spec:

1. A heavy orchestrator/autonomy system.
2. Restricting an actor so it can only read one branch.
3. Inferring complex ownership from broad multi-branch read access alone.

## Acceptance Criteria

1. A branch with attached work shows an avatar group in the dashboard.
2. A branch facepile reflects branch activity/attachment, not mere theoretical
   access.
3. Noter-managed actors and MCP actors can both appear in branch presence.
4. An actor may appear on more than one branch if it has real presence on more
   than one branch.
5. Actors with no active branch presence are not rendered as fake branch
   avatars.
6. Avatar appearance is stable for the same actor across reloads and devices.
7. The implementation does not depend on any third-party avatar image service.
8. Users can archive Noter conversations without deleting branch presence
   history.
