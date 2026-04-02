# Machines Machine-Root Sidebar Research

## Context

- PR `#398` improved native Windows support and made it more realistic for one
  operator to keep two connected machines active at the same time.
- The current `/machines` route already works with multiple approved machines,
  but the left rail only renders the selected machine's thread inventory.
- That means machine separation is technically real, but visually implicit.
- The desired follow-up is to make each machine a clear top-level visual root in
  the sidebar, using the same kind of accordion affordance as the current
  project groups, without forcing the UI into a literal file-tree model.

## Current Behavior

### Route and selection state

- `/machines` already treats machine selection as explicit route state through
  `machineId` and `threadId`.
- `MachinesWorkspacePage` stores one selected machine id, one selected thread
  id, one thread list, one pinned-thread list, and one selected-thread detail.
- Changing `selectedMachineId` clears the entire thread inventory and selected
  detail before reloading the newly selected machine.

### Sidebar information architecture

- Once a machine is selected, the sidebar mirrors the earlier local thread
  browser contract:
  - pinned threads first
  - project groups keyed by canonical project root
  - thread rows nested inside each project
- The grouping logic intentionally preserves Codex project/worktree semantics so
  sibling worktrees collapse under one project while still showing a worktree
  label on the row.

### Pinning scope

- Pins are already machine-local in practice.
- The sync layer reads `pinned-thread-ids` from the current machine's local
  Codex desktop state before returning `/threads`.
- No cloud-side pin model exists today, and no cross-machine merging happens.

## Recommendation

- Make each machine the top-level sidebar section on `/machines`.
- Keep the current thread organization inside that machine section:
  - pinned threads for that machine
  - project groups for that machine
  - thread rows for that machine
- Use a lightweight Tailwind plus shadcn accordion or collapsible pattern for
  the machine sections.
- Do not reuse the `FileTree` component and do not introduce file-style folder
  semantics such as fake path nodes or folder pinning.

This preserves the current mental model:

`machine -> pinned threads + project groups -> threads`

instead of forcing the route into:

`folder -> folder -> folder`

The result should make the machine boundary obvious without throwing away the
useful project and worktree grouping already present inside each machine.

## Query Param And Routing Impact

### Keep the existing query params

No new route params are required for the first slice.

Keep:

- `machineId`
- `threadId`

Reasons:

- `machineId` is already the canonical selected-machine state for the route.
- `threadId` is already the canonical selected-thread state.
- `buildMachinesWorkspacePath()` already builds the right URL shape for machine
  and thread deep links.

### Important behavior change

The route should stop thinking in terms of "one sidebar inventory owned by the
current machine" and instead think in terms of "many machine inventories, one
selected machine, one selected thread".

That introduces one concrete requirement:

- selecting a thread inside a different machine's accordion should update
  `machineId` and `threadId` together through one helper instead of relying on
  separate effects to converge later

Without that change, the current machine-reset logic can briefly clear thread
state or fetch the wrong detail before the second state update lands.

### No URL state needed for accordion open/closed state

For the first slice, machine accordion expansion does not need query params or
Convex persistence.

Local UI state is enough because:

- the canonical shareable state is still selected machine plus selected thread
- open and closed sidebar sections are view state, not content identity
- persisting accordion state would widen the change without improving the basic
  multi-machine clarity problem

## Frontend State Changes Needed

### 1. Page state must become machine-keyed

Today `MachinesWorkspacePage` stores:

- one `threads` array
- one `pinnedThreadIds` array
- one selected-thread detail
- one machine-control token cache

That shape only works because the page only loads one machine inventory at a
time.

For a machine-root sidebar, the page needs a machine-keyed structure such as:

- inventory by `machineId`
- pinned ids by `machineId`
- load status by `machineId`
- token cache by `machineId`

Selected-thread detail can remain selected-machine scoped for the first slice,
because only the selected thread needs the hydrated main-pane timeline.

### 2. Request helpers must accept a machine

The current request path is derived from the selected machine:

- issue token for the selected machine
- call `/threads` on the selected machine
- call `/threads/:threadId` on the selected machine

That is too narrow once the sidebar can show more than one machine at the same
time.

The list-loading helpers should be parameterized by machine, for example:

- `ensureMachineControlToken(machineId)`
- `requestMachineControlJson(machine, args)`
- `refreshThreads(machine)`

The selected-thread read and composer submit path can still stay anchored to the
selected machine.

### 3. Polling policy should stay asymmetric

The current route polls the selected machine's thread inventory every `1.5s`.
Doing that for every connected machine would scale poorly and create extra churn
in the rail.

Recommended first-slice policy:

- selected machine: keep the current fast polling behavior
- non-selected machine sections: lazy-load on first expand, then refresh only on
  re-expand or at a much slower interval

This keeps the currently selected machine feeling live without turning a
two-machine sidebar into a background polling fan-out.

### 4. Handle stale machine sections defensively

When a non-selected machine becomes unavailable between lazy refreshes, the
sidebar should fail closed:

- keep the last known inventory visible if it helps orientation
- show inline unavailable copy at the machine-section level
- disable thread selection for that machine while the section is unavailable
- avoid switching `machineId` and `threadId` based on stale clickable rows

If the machine becomes healthy again on a later refresh, the section can resume
normal selection behavior without inventing extra route state.

## Sidebar View-Model Changes Needed

The current `buildCodexThreadSidebarViewModel()` groups one thread array into:

- `pinnedThreads`
- `projects`
- `uniqueThreads`

That helper is still useful, but it should be wrapped by a machine-level view
model rather than replaced.

Recommended structure:

- keep `buildCodexThreadSidebarViewModel()` unchanged for per-machine grouping
- add a machine-level view model that combines:
  - machine metadata
  - that machine's pinned threads
  - that machine's project groups
  - machine-level load state and selection markers

This lets the route reuse the existing project and worktree logic instead of
forking it into a second implementation.

## UI Changes Needed

### 1. `MachinesWorkspaceView.tsx`

This component currently renders:

- one pinned section
- one list of project sections
- one main thread pane

It would need to render:

- many machine sections in the left rail
- one selected-thread pane on the right

Each machine section should show:

- display name
- hostname or other machine identity hint
- status and live-control truthfulness
- nested pinned threads
- nested project groups

The existing project accordion component can stay conceptually the same under
each machine.

### 2. Thread click handling

`onThreadSelect` currently only receives `threadId`.

That is no longer sufficient once a thread row can belong to a non-selected
machine.

The sidebar needs a machine-aware callback, for example:

- `onThreadSelect({ machineId, threadId })`

so the route can update both parts of selection atomically.

### 3. Main-pane header can stay mostly unchanged

The thread pane already surfaces the selected machine label in the header.

That remains correct after the sidebar change.

The important UX improvement is that the left rail will now agree with the
right-pane header instead of making the machine boundary visible only after a
thread is already selected.

## What Does Not Need To Change

- No Convex schema change is required for the first slice.
- `connectedMachines.listConnectedMachines` already returns the machine metadata
  the sidebar needs.
- `buildMachinesWorkspacePath()` can keep the same public contract.
- The connect page's "Open threads" button can keep linking with only
  `machineId`.
- Windows path support inside project grouping already exists and does not need
  new sidebar-specific work.
- There is no need to introduce file-tree persistence such as
  `folderExpansionState` for the machine accordion.

## Files Likely To Change During Implementation

- `apps/noter/src/components/MachinesWorkspacePage.tsx`
- `apps/noter/src/components/MachinesWorkspaceView.tsx`
- `apps/noter/src/lib/codexThreadSidebar.ts`
- `apps/noter/src/hooks/useCodexThreadSidebarViewModel.ts`
- `apps/noter/src/lib/noterSync.ts`
- `apps/noter/src/components/MachinesWorkspaceVisualFixture.tsx`
- `apps/noter/e2e/machines-workspace-visual.spec.ts`
- `apps/noter/src/lib/noterSync.test.ts`

## Validation Changes To Expect During Implementation

- Add fixture coverage for a sidebar with at least two machine sections.
- Add a route-level test that selecting a thread under another machine updates
  `machineId` and `threadId` together.
- Keep existing Windows path label coverage because machine-root UI should not
  regress the current cross-platform project labeling.

## Conclusion

The right next step is not a file tree.

The right next step is a machine-root sidebar that keeps the already-correct
project and worktree grouping inside each machine.

The largest implementation change is not visual polish. It is moving
`MachinesWorkspacePage` from one selected-machine inventory to machine-keyed
inventory state while keeping `machineId` and `threadId` as the canonical route
selection model.
