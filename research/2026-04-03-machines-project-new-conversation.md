# Machines Project-Level New Conversation Research

## Context

- `/machines` already renders machine-local Codex threads grouped as:
  `machine -> pinned threads + project groups -> threads`.
- The requested follow-up is to add a project-row affordance that starts a new
  machine-local conversation from Noter, so the user can stay on `/machines`
  instead of switching back to Codex desktop.
- The screenshot and shared URL show why this needs to hang off the project rows
  rather than the current selected thread: the operator is already using project
  groups as the entry point for navigation.

## What I Verified

### Thread creation already exists in the local machine-control bridge

- `packages/sync/noter.js` already exposes `POST /thread/start`.
- That route calls the provider `thread/start` RPC directly.
- It accepts `cwd`, `model`, `approvalPolicy`, `sandbox`, and `personality`.
- Unlike `POST /turn/start`, it does not require an existing `threadId`.

This is the right primitive for a project-level plus button because it creates
an explicit empty thread instead of depending on implicit runtime state.

### `POST /turn/start` is the wrong primitive for the project plus button

- `POST /turn/start` falls back to `runtime.currentThreadId` when the caller
  omits `threadId`.
- If there is no current thread, the bridge throws `threadId is required`.
- That means a plus button cannot safely rely on `/turn/start` to create a new
  thread from scratch.

### Project grouping is derived from canonical repo roots, not labels

- `packages/sync/noter.js` computes thread project metadata from git:
  - `project.id = normalizedProjectRoot`
  - `project.rootCwd = normalizedProjectRoot`
  - sibling worktrees stay in the same project bucket
- `apps/noter/src/lib/codexThreadSidebar.ts` groups threads by
  `thread.project.id` and uses `thread.project.rootCwd` as the stable project
  detail.

Because the grouping contract may still evolve, the button handler should not
infer launch behavior from the visible label alone. The safer contract is:

- keep the project id for grouping identity
- carry the canonical `rootCwd` separately for thread creation

## Implementation Direction

### Sidebar contract

- Expose `rootCwd` on each derived `CodexThreadSidebarProject`.
- Render a plus button on the right side of every project row in
  `MachinesWorkspaceView.tsx`.
- Wire the callback with:
  - `machineId`
  - `projectId`
  - `projectLabel`
  - `projectRootCwd`

### Route behavior

- On click, call the existing machine-control bridge: `POST /thread/start` with
  `{ cwd: projectRootCwd }`.
- After the machine returns `runtime.currentThreadId`, switch selection to that
  machine and thread.
- Refresh the machine inventory through the existing `GET /threads` path.

### Empty-thread edge case

- A newly created thread can exist before the thread list or hydrated detail
  view catches up.
- `/machines` therefore needs a temporary pending-selection state so the UI does
  not snap back to the first existing thread while inventory polling settles.
- While that pending thread is still empty, the main pane should show a calm
  “new conversation” empty state instead of a noisy error.

## Prod Validation Notes

- I attempted to inspect the production machine list through `npx convex run`,
  but the CLI path here executes with the deployment key and no end-user auth.
- `connectedMachines:listConnectedMachines` returned an empty list in that
  context, and `connectedMachineControl:issueMachineControlToken` failed with
  `User not authenticated`.
- That means the implementation had to rely on the shipped machine-control
  contract and the existing `/machines` route behavior, not direct prod user
  data reads from this shell session.

## Recommendation

## Follow-Up: Local Vs New Worktree Parity

The first implementation above was still incomplete relative to Codex desktop:
it always created a project-rooted local thread immediately, which meant
`/machines` had no explicit equivalent to Codex's first-message `local` vs
`worktree` choice.

After comparing this flow against T3code, the more faithful model is:

- the project-row plus button opens a choice between `Local` and `New worktree`
- `/machines` keeps that choice as a draft conversation state until the first
  prompt
- on the first prompt:
  - `Local` starts the thread at `project.rootCwd`
  - `New worktree` creates a git worktree first, then starts the thread in that
    new cwd

That follow-up requires one extra bridge primitive in `packages/sync/noter.js`:

- `POST /worktree/create` with `{ cwd }`

The bridge creates a new git worktree under `CODEX_HOME/worktrees/<id>/<repo>`
with a temporary branch, which keeps the resulting cwd compatible with the
existing `/machines` worktree-grouping and worktree-label logic.
