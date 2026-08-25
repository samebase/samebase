# Local setup

Use this when you want to run the app from your own computer instead of only
through Cloudflare.

## Install Vite+

On macOS or Linux:

```sh
curl -fsSL https://vite.plus | bash
```

On Windows PowerShell:

```powershell
irm https://vite.plus/ps1 | iex
```

Open a new terminal after installing Vite+, then install dependencies:

```sh
vp install
```

## Run the app

From the repository root:

```sh
vp run dev
```

`vp run dev` starts Convex and TanStack Start together. On the first run,
Convex may ask you to sign in and choose or create a development deployment.
The dev script also creates Convex Auth JWT keys in that development deployment
if they are missing. In a linked Git worktree, it automatically uses an isolated
local backend.

Open the local URL printed by Vite.

## Force worktree mode

Use the normal `vp run dev` command in a linked Git worktree. Use the explicit
worktree command to force an isolated local backend in another checkout.

```sh
vp run dev:worktree
```

This repo's `dev:worktree` script is a TypeScript launcher run by Node instead
of `CONVEX_AGENT_MODE=anonymous ...` shell syntax, so the same command works on
PowerShell, macOS, and Linux.
