# UI-005: Daytona Codex auth permissions and sandbox user

## Purpose

Verify Codex reconnect in Daytona uses the `daytona` user and keeps
`/home/daytona/.codex` writable so `codex login --device-auth` and
`codex login status` run without permission errors.

## Preconditions

- Production app is reachable at [https://noter.md](https://noter.md).
- Tester is signed in and can access the Providers panel.
- Codex provider row is visible with `Reconnect in Daytona` and `Check login`.

## Steps

1. Open the app in an unconstrained browser layout (no forced mobile viewport).
2. In Providers, click `Reconnect in Daytona`.
3. Wait for the Codex terminal panel to appear.
4. Observe terminal output produced by automatic `codex login --device-auth`
   startup.
5. Run `id -un` in the terminal.
6. Run `echo $CODEX_HOME` in the terminal.
7. Click `Check login`.
8. Repeat steps 2-7 once more to validate reconnect/reuse behavior.

## Expected Results

1. No `Operation not permitted` errors appear for Codex PATH or log writes.
2. `id -un` returns `daytona`.
3. `echo $CODEX_HOME` returns `/home/daytona/.codex`.
4. `Check login` reports ready (or asks for reauth without permission errors).
5. Second reconnect behaves the same as first reconnect.

## Optional Evidence

- Screenshot of Codex terminal after reconnect.
- Snapshot/log note with `id -un` and `echo $CODEX_HOME` output.

## Cleanup

- Hide terminal panel if still open.
