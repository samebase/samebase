# UI-006: Daytona Codex end-to-end login and workspace launch

## Purpose

Validate the full Daytona Codex flow from provider login through repo sandbox
launch, snapshot readiness, and immediate interactive `codex` usage inside the
workspace sandbox.

This test intentionally covers two workspace variants:

1. a newly created noter-managed repo
2. the existing `noter-md/noter` repo connected through the app

## Current Validated Scope

- Validated locally from the worktree app at
  [http://127.0.0.1:5174/](http://127.0.0.1:5174/).
- Validated for Variant B only.
- Variant B was validated specifically against `noter-md/noter` after connecting
  that repo through `/add` in the local app.
- Production coverage and Variant A should be run separately and recorded when
  completed.

## Preconditions

- The target app under test is reachable.
- For local/worktree validation, use
  [http://127.0.0.1:5174/](http://127.0.0.1:5174/).
- For deployed validation, use [https://noter.md](https://noter.md).
- Tester is signed in.
- Required provider connections for repo creation already exist.
- Run in an unconstrained browser layout. Do not force mobile viewport or
  resize-based desktop emulation.
- Be ready to stop during the device-auth step and complete the browser flow
  manually.

## Test Data

- Temporary repo name for Variant A: `tmp-<worktree-id>-codex-e2e`
- Existing repo for Variant B: `noter-md/noter`

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
11. Run `status fish-path` and confirm it prints `/usr/bin/fish`.
12. Run `fisher list` and confirm it includes `pure-fish/pure`.
13. Run `pwd` and confirm it points at the repo workspace directory.
14. Type `codex` and submit it.

### Expected Results

1. Codex provider login from the shared setup is reused automatically in the new
   repo sandbox.
2. Snapshot creation eventually reaches a ready/active state without requiring a
   second repo login flow.
3. Sandbox creation succeeds for the new repo.
4. The in-app shell opens as `daytona`, not `root`, uses `fish`, has `fisher`
   installed with `pure-fish/pure`, and starts in the repo workspace directory.
5. Typing `codex` enters the Codex CLI immediately in the workspace sandbox.
6. There should be no model-migration chooser such as `Try new model` /
   `Use existing model`.
7. The repo should already be trusted; there should be no interactive
   `Yes, continue` / `No, quit` trust prompt for that repo path.

## Variant B: Existing `noter-md/noter` repo

### Steps

1. If `noter-md/noter` is not already connected in the current app, open `/add`,
   connect `noter-md/noter`, then return to the dashboard.
2. Choose the `noter-md/noter` vault card. Do not substitute any other existing
   repo for this variant.
3. Expand `Developer tools`.
4. Check the latest snapshot shown in the UI.
5. Verify the snapshot name in the UI matches `noter-md/noter` on `main`. Do not
   assume a stale similarly named snapshot is the correct one.
6. If no usable snapshot exists, build one and wait for it to become ready.
7. If an existing sandbox was created before the latest ready snapshot or does
   not expose `fish` + `fisher` + `pure`, remove it and create a fresh sandbox
   from the latest ready snapshot.
8. Click `Create sandbox` if no sandbox exists yet. If a sandbox already exists
   and matches the latest ready snapshot, open its shell.
9. Wait for the in-app shell terminal to be ready.
10. In the sandbox terminal, run `whoami` and confirm it prints `daytona`.
11. Run `status fish-path` and confirm it prints `/usr/bin/fish`.
12. Run `fisher list` and confirm it includes `pure-fish/pure`.
13. Run `pwd` and confirm it is `/home/daytona/workspace/noter`.
14. Type `codex` and submit it.

### Expected Results

1. The `noter-md/noter` Daytona flow reuses the already connected Codex state.
2. Connecting `noter-md/noter` through `/add` works and produces a usable vault
   card on the dashboard.
3. Sandbox creation or reuse succeeds without requiring a second device-auth
   flow.
4. The in-app shell opens as `daytona`, not `root`, uses `fish`, has `fisher`
   installed with `pure-fish/pure`, and starts in
   `/home/daytona/workspace/noter`.
5. Typing `codex` enters the Codex CLI immediately in the `noter` workspace
   sandbox.
6. There should be no model-migration chooser such as `Try new model` /
   `Use existing model`.
7. The repo should already be trusted; there should be no interactive trust
   prompt for that repo path.

## Optional Evidence

- Screenshot of the Codex provider row after `Check login`.
- Screenshot of the snapshot name shown before sandbox creation.
- Screenshot of the `noter` workspace shell after typing `codex` for Variant B.
- Short note if a snapshot-name mismatch or stale snapshot display is observed.

## Cleanup

1. Remove the temporary repo created for Variant A if it is no longer needed.
2. Remove temporary sandboxes created during the run if they are no longer
   needed.

## Future Optimization

- Later, this flow may be optimized by seeding a predefined Codex volume so the
  operator does not have to participate in the device-auth step for every
  end-to-end rerun.
