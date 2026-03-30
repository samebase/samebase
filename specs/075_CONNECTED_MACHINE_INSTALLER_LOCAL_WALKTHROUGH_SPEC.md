# 075 Connected Machine Installer Local Walkthrough

## Status

- Current behavior walkthrough
- Scope: current merged installer and browser-handoff slice on `main`

## Goal

This walkthrough explains how to try the current connected-machine installer
slice locally and what you should expect to see at each step.

The current slice does **not** complete full machine registration yet. It gives
you:

1. a dashboard entry point
2. a machine-connect page
3. a hosted `noter.js` installer artifact
4. a local bootstrap flow that writes one machine-local config file and opens
   the browser handoff

The current slice does **not** yet give you:

1. durable machine auth credentials
2. a long-running connector service
3. heartbeats or thread sync started from the installer
4. a finished "machine connected" end-to-end flow

## Fastest Path

If you just want to understand what was added, do these four things:

1. start the app in this worktree
2. open `/machines/connect`
3. open `/noter.js`
4. run the direct local installer command once and inspect
   `~/.noter/config.json`

## 1. Start The Local App

From this worktree:

```bash
make anon
```

In this repo's worktree flow, that is the correct startup command.

Expected result:

1. the local app runs on [http://127.0.0.1:5174/](http://127.0.0.1:5174/)
2. the local hosted installer file is available at
   [http://127.0.0.1:5174/noter.js](http://127.0.0.1:5174/noter.js)

If your worktree is using another port, substitute that local origin in the
commands below.

## 2. Open The New UI Entry Points

Open the dashboard:

- [http://127.0.0.1:5174/](http://127.0.0.1:5174/)

What to look for:

1. a `Connect machine` button in the dashboard header
2. clicking it should take you to
   [http://127.0.0.1:5174/machines/connect](http://127.0.0.1:5174/machines/connect)

On the machine-connect page, verify that you see:

1. one block for the future published package flow
2. one block for the direct hosted-file flow
3. a link to open `noter.js`

## 3. Inspect The Hosted Installer File

Open:

- [http://127.0.0.1:5174/noter.js](http://127.0.0.1:5174/noter.js)

What to verify:

1. it is a single readable Node script
2. it is heavily commented
3. it has no runtime dependencies
4. it matches `packages/sync/noter.js` exactly

If you want to confirm the exact-copy contract locally:

```bash
git diff --no-index -- packages/sync/noter.js apps/noter/public/noter.js
```

Expected result:

1. no output
2. exit code `0`

For production, the direct hosted-file command is:

```bash
SCRIPT_URL='https://noter.md/noter.js'; SCRIPT_CONTENT="$(curl -fsSL "$SCRIPT_URL")" && printf '%s\n' "$SCRIPT_CONTENT" | node --input-type=module - connect
```

The explicit source-URL form below is still the right one for local and preview
testing.

## 4. Run The Direct Local Bootstrap

Use the local hosted file directly:

```bash
SCRIPT_URL='http://127.0.0.1:5174/noter.js'; SCRIPT_CONTENT="$(curl -fsSL "$SCRIPT_URL")" && printf '%s\n' "$SCRIPT_CONTENT" | node --input-type=module - connect "$SCRIPT_URL"
```

What this currently does:

1. validates that the installer source URL points to `/noter.js`
2. runs `codex --version`
3. writes or updates `~/.noter/config.json`
4. prints a markdown summary to stdout
5. opens the browser to `/machines/connect?openedByCli`

What it does **not** currently do:

1. create a machine in Convex
2. issue durable machine credentials
3. start a background sync process

## 5. Inspect The Local Config File

After running the bootstrap, inspect the generated state:

```bash
sed -n '1,200p' ~/.noter/config.json
```

Expected contents:

1. `sourceUrl`
2. `codexVersion`
3. `installedAt`
4. `updatedAt`

This is the main concrete artifact the current installer creates.

If you rerun the bootstrap against another deploy, the same file should be
updated to that new `sourceUrl` instead of creating parallel installation
records.

## 6. Verify The Browser Handoff

After the CLI opens the browser, the machine-connect page should show the CLI
handoff banner because the URL now contains `openedByCli`.

Expected result:

1. the same `/machines/connect` page
2. a message saying the bootstrap already ran on this machine and opened the
   browser here
3. the same two command blocks and `noter.js` link

If the installer opened a different browser from the one where you are already
signed in, opening the same URL in your signed-in browser should still show the
banner. That only proves the bootstrap ran and opened the handoff page. It does
**not** mean the machine is fully registered yet.

## 7. Optional Direct File Execution

If you want to inspect the script first and run it without `curl`, you can use
the checked-in source file directly:

```bash
node packages/sync/noter.js connect 'http://127.0.0.1:5174/noter.js'
```

This is useful when debugging the installer itself because it bypasses the
hosted-file fetch step while keeping the same bootstrap behavior.

## 8. Where The Main Pieces Live

Useful files:

1. route registration: `apps/noter/src/App.tsx`
2. machine-connect page: `apps/noter/src/components/MachineConnectPage.tsx`
3. dashboard entry point: `apps/noter/src/components/VaultDashboard.tsx`
4. shared installer URL and command helpers: `apps/noter/src/lib/noterSync.ts`
5. canonical installer source: `packages/sync/noter.js`
6. hosted mirrored copy: `apps/noter/public/noter.js`

## 9. What To Conclude From This Slice

If all of the steps above work, then the current merged slice successfully
proves:

1. Noter can expose a machine-connect entry point in the main app
2. Noter can serve a single hosted installer artifact at `/noter.js`
3. the installer artifact can be audited directly
4. the installer can persist machine-local bootstrap state in
   `~/.noter/config.json`
5. the installer can hand off into the browser on the correct route

If you are asking "can I already connect a machine fully and see it online in
Noter?", the answer for this slice is still no. This is the installer and
handoff slice, not the full registration and sync slice.
