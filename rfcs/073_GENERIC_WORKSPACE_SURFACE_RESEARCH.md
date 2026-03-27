# 073 Generic Workspace Surface Research

## Document Control

- Status: Research
- Owner: connected machine control plane + product interface boundary
- Last updated: 2026-03-27
- Related docs:
  - `rfcs/071_CONNECTED_MACHINES_AND_REMOTE_THREAD_CONTROL_RESEARCH.md`
  - `specs/072_CONNECTED_MACHINE_PHONE_MVP_SPEC.md`
  - `specs/070_CONNECTED_MACHINE_CODEX_THREAD_STORAGE_SPEC.md`
  - `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`

## Summary

If Noter wants to interchange GitHub-backed operations with calls to something
running on the operator machine, the interface boundary cannot be raw GitHub
REST endpoints.

The right boundary is a Noter-owned workspace surface with product verbs and
capability buckets. The UI should ask for:

1. projects and workspaces
2. files and trees
3. git state such as branches, pull requests, and checks
4. thread runtime state such as list/read/send turn

Each backing transport then implements some subset of that surface:

1. GitHub cloud adapter
2. connected-machine adapter
3. future adapters if needed

This keeps the UI stable while the transport changes.

## Problem Statement

Today, much of the repo still treats GitHub as both:

1. the data source
2. the product interface

That makes current GitHub-backed flows fast to build, but it creates the wrong
boundary for connected machines.

The phone/browser use case is not:

1. "call GitHub from the phone"
2. "mirror Codex app-server JSON-RPC directly into the UI"

It is:

1. "browse the operator's project state"
2. "continue work from the phone"

Those are product-level verbs, not provider-level verbs.

## Evidence From The Current Codebase

### UI surfaces still call GitHub-specific actions directly

Examples:

1. `apps/noter/src/components/AddRepository.tsx`
   - `api.github.listRepositoriesPreview`
   - `api.github.listRepositories`
2. `apps/noter/src/components/FileView.tsx`
   - `api.github.refreshRepositoryTree`
   - `api.github.getRepositoryFileContent`
3. `apps/noter/src/components/RepositoryMediaViewer.tsx`
   - `api.github.getRepositoryMediaAsset`
4. `apps/noter/src/components/CommitStatus.tsx`
   - `api.githubChecks.getCommitStatus`

That means the UI already knows which provider it is talking to.

### Backend implementation is spread across GitHub-specific modules

GitHub transport logic is duplicated across:

1. `apps/noter/convex/github.ts`
2. `apps/noter/convex/fileStagingActions.ts`
3. `apps/noter/convex/vaultActions.ts`
4. `apps/noter/convex/githubChecks.ts`
5. `apps/noter/convex/toolRuntime/executors.ts`
6. `apps/noter/convex/agent/tools.ts`

Most of those modules instantiate `Octokit` directly, which means the provider
boundary is not centralized yet.

### The repo already has a multi-provider identity layer

The schema and provider connection layer already model multiple provider kinds:

1. `github`
2. `convex`
3. `cloudflare`
4. `codex`

See:

1. `apps/noter/convex/schema.ts`
2. `apps/noter/convex/providerConnections.ts`

That is useful, but it is only the auth/config layer today. It is not yet a
generic product interface.

### The agent/tool layer already hints at the right abstraction

`apps/noter/convex/agent/toolCatalog.ts` mostly uses product verbs such as:

1. `read_file`
2. `list_files`
3. `edit_file`
4. `create_file`
5. `delete_file`
6. `get_vault_remote_branches`

The exception is `github_api`, which is an explicit provider escape hatch.

That is a useful pattern:

1. product tools should be provider-neutral
2. raw provider access can exist as an escape hatch
3. the escape hatch should not become the main UI contract

## Why A Raw GitHub API Interface Is The Wrong Boundary

### GitHub endpoints do not map cleanly to local machine behavior

Examples:

1. `pulls.list` has no direct equivalent in local Codex runtime state
2. `repos.getContent` is not the same thing as reading a file from a worktree
3. `checks.listForRef` may come from GitHub remotely or from a local machine's
   last-known sync/cache

If the UI speaks in GitHub endpoint names, the machine connector has to pretend
to be GitHub. That is the wrong direction.

### The machine can do things GitHub cannot

Examples:

1. list local Codex threads
2. resume a local thread
3. send a turn into a running local thread
4. read a dirty worktree before anything is pushed upstream

So the transport-neutral interface has to be broader than GitHub.

### One giant "provider interface" is also the wrong shape

GitHub and connected machines will not support the exact same operations at the
same time.

If Noter creates one large required interface, every transport ends up
implementing stubs or fake fallbacks.

A capability-based shape is better.

## Recommendation

Use a Noter-owned workspace surface with capability buckets, not a raw provider
API abstraction and not a single giant mandatory interface.

### Capability buckets

1. `catalog`
   - list projects
   - list workspaces
   - list thread summaries
2. `files`
   - list tree
   - read file
   - read media/blob
3. `git`
   - list branches
   - list pull requests
   - create pull request
   - get check status
   - compare refs
4. `threads`
   - list threads
   - read thread
   - start thread
   - send turn
   - interrupt turn
   - archive or unarchive thread

### Product-owned operation names

The interface should use Noter verbs such as:

1. `project.list`
2. `workspace.list`
3. `tree.list`
4. `file.read`
5. `pullRequest.list`
6. `pullRequest.create`
7. `check.list`
8. `thread.list`
9. `thread.read`
10. `thread.turn.send`

Not:

1. `pulls.list`
2. `repos.getContent`
3. `checks.listForRef`

Those endpoint names can stay inside the GitHub adapter.

## Proposed Interface Shape

The exact runtime does not need to be locked yet, but the shape should be close
to this:

```ts
type WorkspaceSurfaceCapability = 'catalog' | 'files' | 'git' | 'threads'

type WorkspaceSurfaceTarget =
  | { kind: 'github_cloud'; vaultId: string }
  | { kind: 'connected_machine'; machineId: string; projectRoot: string }

type WorkspaceSurfaceOperation =
  | { type: 'project.list' }
  | { type: 'workspace.list'; projectId: string }
  | { type: 'tree.list'; workspaceId: string; path?: string }
  | { type: 'file.read'; workspaceId: string; path: string }
  | { type: 'pullRequest.list'; workspaceId: string }
  | { type: 'pullRequest.create'; workspaceId: string; payload: unknown }
  | { type: 'check.list'; workspaceId: string; ref: string }
  | { type: 'thread.list'; workspaceId: string }
  | { type: 'thread.read'; workspaceId: string; threadId: string }
  | {
      type: 'thread.turn.send'
      workspaceId: string
      threadId: string
      prompt: string
    }
```

Important constraints:

1. the target is transport-specific
2. the operation name is product-specific
3. the UI depends on operation/result shapes, not on GitHub endpoint names

## Result Shapes

The surface also needs stable product read models.

Examples:

1. `WorkspaceProjectSummary`
2. `WorkspaceEntrySummary`
3. `WorkspaceFileSnapshot`
4. `WorkspaceBranchSummary`
5. `WorkspacePullRequestSummary`
6. `WorkspaceCheckSummary`
7. `WorkspaceThreadSummary`
8. `WorkspaceThreadDetail`

Those result types should not expose raw Octokit payloads or raw Codex
app-server payloads as the primary contract.

Raw provider payloads can still exist as optional debug fields.

## What Phase 1 Actually Needs

The connected-machine phone MVP does not need the whole surface.

It only needs:

1. `project.list`
2. `workspace.list`
3. `thread.list`
4. `thread.read`
5. `thread.turn.send`

That is important because it means Noter can introduce the generic boundary now
without first rewriting every GitHub-backed flow.

## Migration Strategy

### Step 1: Use the generic surface for new connected-machine screens only

New phone/machine routes should depend on:

1. product-owned workspace queries
2. product-owned workspace commands

They should not import `api.github.*` directly.

### Step 2: Implement two adapters behind that surface

1. GitHub adapter
   - backed by current Convex GitHub actions
2. connected-machine adapter
   - backed by connector heartbeats, summary rows, and command rows

### Step 3: Migrate shared UI slices when touched

Do not rewrite the entire repo immediately.

Instead:

1. move new shared screens onto the generic surface
2. migrate old GitHub-bound screens only when they need machine support

### Step 4: Keep raw provider escape hatches separate

Examples:

1. agent `github_api`
2. Codex protocol research/debug views

Those are legitimate expert surfaces, but they should not define the main
product contract.

## Decision Proposal

The following should be treated as the recommended direction:

1. new connected-machine UI work must not bind directly to raw `api.github.*`
   calls
2. Noter should introduce a product-owned workspace surface with capability
   buckets
3. the phase-1 connected-machine MVP should implement only the `catalog` and
   `threads` capabilities
4. GitHub-specific and machine-specific transports should remain adapter
   implementations behind that surface

## Open Questions

1. Should the first interface live as Convex actions plus shared TypeScript
   types, or as a higher-level client module that chooses between multiple
   backends?
2. Should `workspaceId` be Noter-owned, or should the target stay as
   `{ machineId, projectRoot }` for phase 1?
3. For file reads on connected machines, should the first implementation read
   directly from the machine connector on demand, or should those snapshots also
   be cached in Convex?
4. Should PR/check status remain GitHub-only in phase 1 even when the thread is
   machine-backed?
