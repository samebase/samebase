# 075 Connected Machine Installer Local Walkthrough

## Status

- Current behavior walkthrough
- Scope: current merged installer, approval, and presence flow on `main`

## Goal

This walkthrough explains how to try the current connected-machine foundation
locally and what you should expect to see at each step.

Today this slice already gives you:

1. a machine-connect page in the app
2. a hosted `/noter.ts` installer artifact
3. a mirrored package entrypoint at `packages/sync/noter.ts`
4. browser-backed machine approval
5. one durable machine credential in `~/.noter/config.json`
6. a `noter-sync run` command that publishes online and offline heartbeats
7. a live machine list in Noter

Today this slice still does **not** give you:

1. remote thread browsing from the phone
2. remote prompt sending
3. Cloudflare-tunneled local control

That next step is tracked in `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`.

## Local Prerequisites

The direct hosted-file flow needs both `node` and the Codex CLI command `codex`
on `PATH` before you run any `noter.ts` command.

Quick check:

```bash
node --version
codex --version
```

Truthful install guidance for the current repo state:

1. this repo is currently pinned to Node `24` via root `package.json` engines
   and `.nvmrc`
2. if you want `nvm` on macOS, use the official `nvm` installer and then run
   `nvm install --lts`
3. do **not** recommend Homebrew-installed `nvm`; the `nvm` project marks that
   path unsupported
4. on Windows PowerShell, if `winget` is available, use
   `winget install --id OpenJS.NodeJS.LTS -e`
5. if someone prefers installers instead of shell package managers, send them to
   the current Node.js LTS download page on `nodejs.org`
6. the Codex desktop app alone does not guarantee that the `codex` shell command
   exists on the machine
7. if `codex` is missing, install the official Codex CLI with
   `npm install -g @openai/codex`
8. OpenAI's current Codex CLI docs describe native Windows support as
   experimental

## Fastest Path

If you want the smallest end-to-end verification, do these steps:

1. start the app in this worktree
2. open `/machines/connect`
3. run the direct local `connect` command
4. approve the machine in the browser
5. run the direct local `run` command
6. watch the machine appear online

## 1. Start The Local App

From this worktree:

```bash
make anon
```

Expected result:

1. the app runs on [http://127.0.0.1:5174/](http://127.0.0.1:5174/)
2. the hosted installer is available at
   [http://127.0.0.1:5174/noter.ts](http://127.0.0.1:5174/noter.ts)

If this worktree chose another frontend port, substitute that origin in the
commands below.

Native Windows outside WSL is compatible with the hosted-file flow, but this
spec's default startup path remains the worktree `make anon` flow above. For
dated primary-checkout troubleshooting notes and the manual Windows bootstrap
sequence validated during local testing, see
`research/windows-native-connected-machine-walkthrough-2026-04-01.md`.

For a native Windows primary checkout without GNU Make, the supported local
startup path is `pnpm dev` from the repo root. Use the exact Vite URL it prints
in the terminal, because Windows local runs can fall back from `5173` to a
different port such as `5174`.

## 2. Open The Machine-Connect Page

Open:

- [http://127.0.0.1:5174/machines/connect](http://127.0.0.1:5174/machines/connect)

What to look for:

1. a `Published package connect` block for the eventual public npm path
2. two `Direct hosted file connect` blocks: one for `Unix/macOS` and one for
   `Windows PowerShell`
3. a link to open `noter.ts`
4. a machine list section if any machines are already connected

## 3. Inspect The Hosted Installer File

Open:

- [http://127.0.0.1:5174/noter.ts](http://127.0.0.1:5174/noter.ts)

What to verify:

1. it is a single readable Node script
2. it has no runtime dependencies
3. it matches `packages/sync/noter.ts` exactly

To confirm the exact-copy contract locally:

```bash
git diff --no-index -- packages/sync/noter.ts apps/noter/public/noter.ts
```

Expected result:

1. no diff output
2. exit code `0`

## 4. Run The Direct Local Connect Command

Use the hosted local file directly:

```bash
set -o pipefail
curl -fsSL 'http://127.0.0.1:5174/noter.ts' | node --input-type=module - connect 'http://127.0.0.1:5174/noter.ts'
```

On Windows PowerShell use `curl.exe` so the command does not hit the
`Invoke-WebRequest` alias:

```powershell
curl.exe -fsSL 'http://127.0.0.1:5174/noter.ts' | node --input-type=module - connect 'http://127.0.0.1:5174/noter.ts'
```

What this does today:

1. validates that the source URL points to `/noter.ts`
2. runs `codex --version` to confirm the Codex CLI is on `PATH`
3. creates a machine registration request in Noter
4. writes or updates `~/.noter/config.json`
5. prints a markdown status block to stdout
6. prints the `next:` approval URL for
   `/machines/connect?openedByCli&requestId=...`
7. waits for you to open that printed `next:` URL manually in a signed-in
   browser

## 5. Approve The Machine In The Browser

After you open the printed `next:` URL, the machine-connect page should show the
CLI handoff state for the new `requestId`.

Expected result:

1. the page shows the machine summary
2. the page shows an `Approve machine` button while the request is pending
3. approving the request transitions the page to `Machine approved`
4. the page now shows `run` commands for both the future published package path
   and the direct hosted-file path

Open that same printed `next:` URL in the browser where you are signed in to
Noter and approve the machine there.

## 6. Inspect The Local Config File

After the connect flow, inspect:

```bash
sed -n '1,200p' ~/.noter/config.json
```

Expected fields:

1. `sourceUrl`
2. `codexVersion`
3. `installedAt`
4. `updatedAt`
5. `machineId`
6. `machineCredential`

Important behavior:

1. the config is machine-scoped, not repo-scoped
2. rerunning `connect` updates the same file instead of creating parallel local
   installs

## 7. Start The Heartbeat Publisher

Use the direct hosted-file run command:

```bash
set -o pipefail
curl -fsSL 'http://127.0.0.1:5174/noter.ts' | node --input-type=module - run
```

On Windows PowerShell:

```powershell
curl.exe -fsSL 'http://127.0.0.1:5174/noter.ts' | node --input-type=module - run
```

What this does today:

1. reads `~/.noter/config.json`
2. resolves the current Noter backend URL from `noter-connect.json`
3. reuses the stored machine credential
4. publishes `online` heartbeats until the process exits
5. publishes one final `offline` heartbeat when it shuts down cleanly

## 8. Verify Presence In The Browser

With the `run` command still active, refresh
[http://127.0.0.1:5174/machines/connect](http://127.0.0.1:5174/machines/connect).

Expected result:

1. the approved machine appears in the machine list
2. the machine status resolves to `online`
3. stopping the `run` process eventually flips the same machine back to
   `offline`

## 9. Optional Package-Style Local Execution

When debugging the script itself, you can run the checked-in source directly:

```bash
node packages/sync/noter.ts connect 'http://127.0.0.1:5174/noter.ts'
node packages/sync/noter.ts run
```

That bypasses `curl` while keeping the same runtime behavior.

## 10. Where The Main Pieces Live

Useful files:

1. machine-connect page: `apps/noter/src/components/MachineConnectPage.tsx`
2. machine approval and presence backend:
   `apps/noter/convex/connectedMachines.ts`
3. machine HTTP entrypoints: `apps/noter/convex/connectedMachineHttp.ts`
4. machine row and credential models:
   `apps/noter/convex/connectedMachineModel.ts`
5. canonical installer and runner: `packages/sync/noter.ts`
6. hosted mirrored copy: `apps/noter/public/noter.ts`

## 11. What To Conclude From This Slice

If all of the steps above work, the current merged foundation proves:

1. Noter can bootstrap and approve a machine from a thin browser handoff page
2. Noter can persist machine-scoped local state at `~/.noter/config.json`
3. Noter can keep a connected machine visible as online or offline
4. the machine-scoped `run` command is now the right place to grow future local
   control behavior

If you are asking "can I already browse and control Codex from my phone?", the
answer is still no. This slice ships machine approval and presence, not remote
Codex control.
