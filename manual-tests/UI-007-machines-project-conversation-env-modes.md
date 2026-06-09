# UI-007: Machines Project Conversation Env Modes

## Purpose

Verify `/machines` can start a new project conversation in both `Local` and `New worktree` modes,
and that the first sent message lands in the expected runtime context.

## Preconditions

- Worktree app is running with `pnpm dev:worktree`.
- A connected machine is available through the local `noter.ts` approval flow.
- The selected machine has at least one git-backed project group in `/machines`.

## Steps

1. Open `/machines` for the connected machine.
2. In a project row, click the right-side plus button and choose `Local`.
3. Confirm the main pane switches to a new-conversation draft state for that project.
4. Send a prompt that asks for an exact short reply, for example:
   `Reply with exactly LOCAL READY and nothing else.`
5. Confirm the new thread materializes, stays selected, and returns `LOCAL READY`.
6. Start another new conversation from the same project row, but choose `New worktree`.
7. Confirm the main pane switches to a new-conversation draft state for that project.
8. Send a prompt that asks for an exact short reply, for example:
   `Reply with exactly WORKTREE READY and nothing else.`
9. Confirm the new thread materializes, stays selected, and returns `WORKTREE READY`.

## Expected Results

1. `Local` mode creates a new conversation whose first response is visible in the same thread
   without a manual reload and whose thread metadata stays project-rooted.
2. `New worktree` mode creates a new conversation whose first response is visible in the same thread
   without a manual reload and whose thread metadata shows a non-root worktree context.
3. Both new conversations remain selected after the first send instead of snapping back to an older
   thread.

## Optional Evidence

- Screenshot of the local draft state before first send.
- Screenshot of the worktree thread showing its non-root workspace label.
- Short note with the two reply strings observed in the UI.

## Cleanup

- Restore `~/.noter/config.json` if local manual testing temporarily pointed it at a localhost
  `noter.ts`.
- Stop any temporary local connector/browser sessions used only for the test.
