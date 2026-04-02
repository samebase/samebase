# 077 Machines Workspace Thread Composer Controls Spec

## Document Control

- Status: Accepted
- Owner: connected machine workspace + local Codex control
- Last updated: 2026-04-02
- Related docs:
  - `research/2026-04-02-machines-main-chat-surface.md`
  - `specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`
  - `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`
  - `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`

## Summary

The shipped `/machines` workspace composer must expose the active Codex runtime
selection inline so a user can see and change:

1. the model used for the next send
2. the reasoning effort used for the next turn

This surface stays compact and chat-first. It does not introduce a secondary
settings panel or a full research-form clone inside the workspace.

## Locked Product Decisions

1. The controls live inline with the bottom composer, not in a modal, drawer, or
   sidebar.
2. The visible labels stay compact and human-readable, such as `GPT-5.4` and
   `Extra High`.
3. The controls apply to the next send from `/machines`, whether that send
   continues an existing local provider thread or starts a fresh one.
4. Starting a new thread from `/machines` must materialize a fresh provider
   thread before the first turn starts.
5. Query-param state may preserve the current model and effort selection so the
   route stays reload-safe without dropping unrelated params.

## Current Behavior

### Control row

1. The composer shows one inline model picker.
2. The composer shows one inline reasoning picker.
3. Both pickers stay visible above the prompt input.
4. Both pickers disable while a send is pending or machine control is
   unavailable.

### Runtime options

The shipped picker values are:

1. `GPT-5.4`
2. `GPT-5.4 Mini`
3. `GPT-5.3 Codex`
4. `GPT-5.3 Codex Spark`

The shipped reasoning values are:

1. `Low`
2. `Medium`
3. `High`
4. `Extra High`

Defaults:

1. model: `gpt-5.4`
2. reasoning effort: `xhigh`

### Send behavior

1. When a local provider thread is already selected, `/machines` calls
   `turn/start` with:
   - `threadId`
   - `text`
   - `model`
   - `effort`
2. When no thread is selected, `/machines` first calls `thread/start` with the
   selected `model`, then calls `turn/start` on the new provider thread with:
   - `threadId`
   - `text`
   - `model`
   - `effort`
3. A successful fresh-thread send selects the new provider thread immediately
   and refreshes thread inventory/detail state the same way as an existing
   thread send.

## Source Of Truth Files

- `apps/noter/src/components/MachinesWorkspacePage.tsx`
- `apps/noter/src/components/MachinesWorkspaceView.tsx`
- `apps/noter/src/components/MachinesWorkspaceThreadPane.tsx`
- `apps/noter/src/components/MachinesThreadComposerControls.tsx`
- `apps/noter/src/lib/machinesThreadComposer.ts`
- `apps/noter/src/components/MachinesWorkspaceVisualFixture.tsx`

## Verification Expectations

- [x] Inline control labels remain visible in the shipped workspace fixture.
- [x] Existing-thread sends keep model and effort on `turn/start`.
- [x] Fresh-thread sends split into `thread/start` then `turn/start`.
- [x] The route preserves unrelated query params while syncing model and effort
      selections.
