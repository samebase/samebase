# UI-006: Daytona Codex end-to-end login and workspace launch

## Purpose

Validate the full Daytona Codex flow from provider login through repo sandbox
launch, snapshot readiness, and immediate interactive `codex` usage inside the
workspace sandbox.

This test intentionally covers two workspace variants:

1. a newly created noter-managed repo
2. an existing repo with a pre-existing Daytona snapshot path

## Preconditions

- Production app is reachable at [https://noter.md](https://noter.md).
- Tester is signed in.
- Required provider connections for repo creation already exist.
- Run in an unconstrained browser layout. Do not force mobile viewport or
  resize-based desktop emulation.
- Be ready to stop during the device-auth step and complete the browser flow
  manually.

## Test Data

- Temporary repo name for variant A: `tmp-<worktree-id>-codex-e2e`
- Existing repo for variant B: any reachable repo that already has Daytona
  developer tools enabled

If running this from a Codex worktree, use the exact temporary repo prefix
`tmp-<worktree-id>-` required by repo policy.

## Shared Setup: Codex login in Daytona

1. Open the app and expand `Providers`.
2. In the `Codex` row, click `Reconnect in Daytona` if shown, otherwise click
   `Connect in Daytona`.
3. Wait for the Codex terminal panel to appear and auto-run
   `codex login --device-auth`.
4. Stop here and have the operator open the device-auth link and complete the
   browser login.
5. After the browser step completes, click `Check login`.
6. Confirm the Codex provider status changes to `Ready in Daytona`.

## Variant A: Newly created repo

### Steps

1. Create a new noter-managed repo from the dashboard using the temporary name
   `tmp-<worktree-id>-codex-e2e`.
2. Wait for the vault card to appear.
3. Expand `Developer tools` for that repo.
4. Trigger Daytona snapshot creation if it is not already active.
5. Wait until the latest snapshot shown in the UI is ready to use.
6. Be careful about snapshot naming: confirm the active snapshot name shown in
   the UI matches the current repo and branch rather than assuming an older
   similarly named snapshot is the right one.
7. Click `Create sandbox`.
8. Wait for the sandbox state to become ready and for `Open Shell` or
   `Show Shell` to be available.
9. Open the shell terminal for that sandbox.
10. In the sandbox terminal, run `whoami` and confirm it prints `daytona`.
11. Run `pwd` and confirm it points at the repo workspace directory.
12. Type `codex` and submit it.

### Expected Results

1. Codex provider login from the shared setup is reused automatically in the new
   repo sandbox.
2. Snapshot creation eventually reaches a ready/active state without requiring a
   second repo login flow.
3. Sandbox creation succeeds for the new repo.
4. The in-app shell opens as `daytona`, not `root`, and starts in the repo
   workspace directory.
5. Typing `codex` enters the Codex CLI immediately in the workspace sandbox.
6. There should be no model-migration chooser such as `Try new model` /
   `Use existing model`.
7. The repo should already be trusted; there should be no interactive
   `Yes, continue` / `No, quit` trust prompt for that repo path.

## Variant B: Existing repo

### Steps

1. Choose an existing repo card with Daytona developer tools.
2. Expand `Developer tools`.
3. Check the latest snapshot shown in the UI.
4. Again, verify the snapshot name in the UI matches the expected repo and
   branch. Do not assume a stale similarly named snapshot is the correct one.
5. If no usable snapshot exists, build one and wait for it to become ready.
6. Click `Create sandbox` if no sandbox exists yet. If a sandbox already exists,
   open its shell.
7. Wait for the shell terminal to be ready.
8. In the sandbox terminal, run `whoami` and confirm it prints `daytona`.
9. Run `pwd` and confirm it points at the repo workspace directory.
10. Type `codex` and submit it.

### Expected Results

1. Existing-repo Daytona flow reuses the already connected Codex state.
2. Sandbox creation or reuse succeeds without requiring a second device-auth
   flow.
3. The in-app shell opens as `daytona`, not `root`, and starts in the repo
   workspace directory.
4. Typing `codex` enters the Codex CLI immediately in the workspace sandbox.
5. There should be no model-migration chooser such as `Try new model` /
   `Use existing model`.
6. The repo should already be trusted; there should be no interactive trust
   prompt for that repo path.

## Optional Evidence

- Screenshot of the Codex provider row after `Check login`.
- Screenshot of the snapshot name shown before sandbox creation.
- Screenshot of the workspace shell after typing `codex`.
- Short note if a snapshot-name mismatch or stale snapshot display is observed.

## Cleanup

1. Remove the temporary repo created for variant A if it is no longer needed.
2. Remove temporary sandboxes created during the run if they are no longer
   needed.

## Future Optimization

- Later, this flow may be optimized by seeding a predefined Codex volume so the
  operator does not have to participate in the device-auth step for every
  end-to-end rerun.
