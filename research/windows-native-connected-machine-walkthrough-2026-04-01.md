# Windows Native Connected-Machine Walkthrough Research

Date: 2026-04-01

## Why This Document Exists

This memo captures the dated, machine-specific findings from validating the
local hosted-file `noter.js` flow on a native Windows primary checkout outside
WSL.

The accepted current walkthrough stays in
`specs/075_CONNECTED_MACHINE_INSTALLER_LOCAL_WALKTHROUGH_SPEC.md`. This file
keeps the rough edges, fallback commands, and observed Windows-only failures out
of the stable spec while still preserving the concrete research that informed
the Windows support patch.

## Why This Lives In `research`

These notes describe one operator run on one native Windows machine. They are
useful for debugging and follow-up work, but they are not the repo's durable
source of truth for the current supported flow.

## Bottom Line

Native Windows outside WSL can run the local hosted-file connected-machine flow,
but a fresh primary checkout still needed more manual setup than the repo's
default worktree `make anon` path.

The main verified gaps during this run were:

1. `make` was not installed.
2. There was no existing `apps/noter/.env.local` source env from another
   checkout.
3. `node .\scripts\convex-sync-dev-env.js --check-prereqs` failed until an
   anonymous local `.env.local` existed.
4. `node .\scripts\convex-seed-dev-auth.js` and
   `npx convex run devAuth:seedPasswordAccount ...` both returned the seed
   result and then hit a Windows-specific Convex CLI shutdown assertion:
   `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76`
5. `node .\apps\noter\convex-dev.js --refresh-anon-auth ...` failed, but running
   `npx @convex-dev/auth --skip-git-check --allow-dirty-git-state` directly
   succeeded and set `JWT_PRIVATE_KEY` and `JWKS`.

## Working Local-Only Bootstrap Sequence

From the repo root:

```powershell
cd apps/noter
$env:CONVEX_AGENT_MODE='anonymous'
node .\convex-dev.js --once --codegen=enable --tail-logs=disable --typecheck=disable
cd ..\..
node .\scripts\convex-sync-dev-env.js --allow-missing-source-env
```

Then configure local auth in `apps/noter`:

```powershell
cd apps/noter
npx @convex-dev/auth --skip-git-check --allow-dirty-git-state
npx convex run devAuth:seedPasswordAccount --env-file .env.local --typecheck disable --codegen disable
```

The `convex run` command could still print the shutdown assertion above after it
returned the JSON result, but local password sign-in still worked after the seed
step completed.

For the local app itself, the working Windows setup used two long-running
terminals:

```powershell
# terminal 1
cd apps/noter
$env:CONVEX_AGENT_MODE='anonymous'
node .\convex-dev.js --tail-logs=disable --typecheck=disable --codegen=enable
```

```powershell
# terminal 2
cd apps/noter
pnpm run dev:frontend
```

## Hosted-File Connect Result

The direct PowerShell connect command succeeded:

```powershell
curl.exe -fsSL 'http://127.0.0.1:5173/noter.js' | node --input-type=module - connect 'http://127.0.0.1:5173/noter.js'
```

Observed result:

1. It wrote `C:\Users\<user>\.noter\config.json`.
2. It printed the `next:` approval URL.
3. Automatic browser opening still failed on this machine with:
   `Could not open a browser automatically with cmd: exited with code 1.`

Opening the printed `next:` URL manually in a signed-in browser still completed
machine approval successfully, and the subsequent `run` command published
heartbeats as expected.
