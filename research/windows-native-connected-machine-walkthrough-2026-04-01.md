# Windows Native Connected-Machine Walkthrough Research

Date: 2026-04-01

## Why This Document Exists

This memo captures the dated, machine-specific findings from validating the local hosted-file
`noter.ts` flow on a native Windows primary checkout outside WSL.

The accepted current walkthrough stays in
`specs/075_CONNECTED_MACHINE_INSTALLER_LOCAL_WALKTHROUGH_SPEC.md`. This file keeps the rough edges,
fallback commands, and observed Windows-only failures out of the stable spec while still preserving
the concrete research that informed the Windows support patch.

## Why This Lives In `research`

These notes describe one operator run on one native Windows machine. They are useful for debugging
and follow-up work, but they are not the repo's durable source of truth for the current supported
flow.

## Bottom Line

Native Windows outside WSL can run the local hosted-file connected-machine flow, but a fresh primary
checkout still needed more manual setup than the repo's default worktree `make anon` path.

The main verified gaps during this run were:

1. `make` was not installed.
2. There was no existing `apps/noter/.env.local` source env from another checkout.
3. `node .\scripts\convex-sync-dev-env.ts --check-prereqs` failed until an anonymous local
   `.env.local` existed.
4. `node .\scripts\convex-seed-dev-auth.ts` and `npx convex run devAuth:seedPasswordAccount ...`
   both returned the seed result and then hit a Windows-specific Convex CLI shutdown assertion:
   `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76`
5. `node .\apps\noter\scripts\convex-dev.ts --refresh-anon-auth ...` failed, but running
   `npx @convex-dev/auth --skip-git-check --allow-dirty-git-state` directly succeeded and set
   `JWT_PRIVATE_KEY` and `JWKS`.
6. The root `pnpm dev` path initially failed in `predev` because `scripts/sync-site-url.ts` tried to
   write `SITE_URL` against the temporary local Convex bootstrap backend after that backend had
   already exited.

The local Codex CLI on this machine was installed through Volta. That ended up being an important
part of the Windows support work because the top-level `codex.cmd` wrapper shape is different from
the npm-global shim and needs explicit resolution before Noter can launch one-off Codex commands
safely. Noter also has to resolve that Volta-managed shim from the caller workspace so
project-scoped Volta setups do not accidentally launch a different Codex binary than the later
runtime command would use.

That predev `SITE_URL` failure is now fixed in this branch by treating the temporary local-backend
shutdown as a skip condition instead of a fatal error. After that fix, the remaining startup rough
edge on this machine was only stale local `convex-local-backend.exe` listeners already bound to port
`3210`.

That stale-listener problem is now also handled in this branch for the primary checkout path:
`apps/noter/scripts/predev.ts` stops local Convex listeners on the stored backend port before
bootstrapping a fresh backend, including native Windows via `taskkill`.

## Working Local-Only Bootstrap Sequence

From the repo root:

```powershell
cd apps/noter
$env:CONVEX_AGENT_MODE='anonymous'
node .\scripts\convex-dev.ts --once --codegen=enable --tail-logs=disable --typecheck=disable
cd ..\..
node .\scripts\convex-sync-dev-env.ts --allow-missing-source-env
```

Then configure local auth in `apps/noter`:

```powershell
cd apps/noter
npx @convex-dev/auth --skip-git-check --allow-dirty-git-state
npx convex run devAuth:seedPasswordAccount --env-file .env.local --typecheck disable --codegen disable
```

The `convex run` command could still print the shutdown assertion above after it returned the JSON
result, but local password sign-in still worked after the seed step completed.

After the `SITE_URL` fix, the native Windows primary-checkout path also worked from the repo root:

```powershell
pnpm dev
```

Observed result on this machine:

1. `predev` completed without failing when the temporary local backend exited before `SITE_URL`
   sync.
2. The real long-running backend started afterward on `http://127.0.0.1:3210`.
3. Vite fell back from `5173` to `5174` because `5173` was already in use, so every later
   `/noter.ts` command had to reuse the URL Vite printed instead of assuming the default port.

For the local app itself, the older manual Windows setup also worked with two long-running
terminals:

```powershell
# terminal 1
cd apps/noter
$env:CONVEX_AGENT_MODE='anonymous'
node .\scripts\convex-dev.ts --tail-logs=disable --typecheck=disable --codegen=enable
```

```powershell
# terminal 2
cd apps/noter
pnpm run dev:frontend
```

## Hosted-File Connect Result

The direct PowerShell connect command succeeded once it reused the exact URL that Vite printed for
that run:

```powershell
$noterUrl = '<use the URL Vite printed>/noter.ts'
curl.exe -fsSL $noterUrl | node --input-type=module - connect $noterUrl
```

Observed result:

1. It wrote `C:\Users\<user>\.noter\config.json`.
2. It printed the `next:` approval URL.
3. Automatic browser opening was removed from the flow after Windows showed a native popup trying to
   open `\\` through `cmd start`.

Opening the printed `next:` URL manually in a signed-in browser completed machine approval
successfully, and the subsequent `run` command published heartbeats as expected. That manual-open
step is now the intended cross-platform contract for both Windows and Linux sandbox environments.
