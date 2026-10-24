# UI-004: Live Alchemy resources

## Purpose

Check live resource updates, completed-deploy attribution, and subscription access.

## Preconditions

Use a disposable repository and its own Convex team. Run Samebase with `pnpm run dev`. Connect the
repository through the app. Use `@samebase/alchemy-convex` 0.9.0 or later in the repository, then
run Alchemy once to install store version 3. Use a temporary repository name that follows AGENTS.md.

## Steps

1. Open the repository overview and Alchemy page in separate tabs.
2. Start an Alchemy deploy that creates a Worker. Before it finishes, confirm the Alchemy tree shows
   the new stage, current commit, and resource status. Confirm both tabs update without reload.
3. Finish the deploy. Confirm the overview resource link and the Alchemy output update. Repeat for a
   `pr-<number>` stage and confirm that pull request's resource links update.
4. Keep a tab open for more than five minutes. Deploy again and confirm the subscription continues.
5. Disconnect the browser network, then reconnect. Confirm the latest state arrives.
6. Change repository or Convex team, then sign out. Confirm the old store connection closes and its
   data is removed from the page. Remove a test user's membership in a separate session. Confirm
   that user's next token renewal fails and clears the state. The token lasts five minutes; Convex
   also allows five seconds of clock tolerance.
7. Confirm nested Alchemy `Redacted` values show only the secret marker. Do not use real secrets in
   this test, or capture tokens in screenshots or logs.

## Expected Results

State changes appear without reload. No resource is shown as deployed at a new commit before its
deploy completes. A closed or unauthorized subscription does not restore old data.

## Optional Evidence

Record the tested URLs, package versions, and results. Capture the resource status before and after
a write. This flow requires a store upgrade; unit tests do not prove cloud rollout.

## Cleanup

Remove the disposable repository through Samebase after the check.
