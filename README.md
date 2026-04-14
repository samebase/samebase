# Noter

Noter is a collaborative, GitHub-connected code editor built as a PNPM workspace
with React + Vite on the frontend and Convex on the backend.

## Current Product Capabilities (2026-02-13)

- Real-time collaborative editing with CodeMirror + Convex synchronization
- GitHub repository connection (`connectRepository`) for existing repos
- New agent/repo creation (`createRepository`) for noter-managed vaults, seeded
  as a runnable starter in a single commit
- Automatic infrastructure provisioning for new noter-managed vaults:
  - Convex project/deployment
  - Cloudflare Pages project + environment wiring
  - Infrastructure status surfaced in Vault Dashboard
- Manual infra retry for failed/partial provisioning
- GitHub Codespaces integration for cloud execution
- Persistent in-app chat with approval cards for:
  - Commit proposals
  - Production infrastructure/data read requests

## Important Behavior

- Auto infra provisioning is triggered only for newly created noter-managed
  vaults.
- Connecting an existing GitHub repository does not auto-provision infra.
- Starter seed source of truth is maintained in `apps/noter-starter-template`
  and exported to `apps/noter/convex/starterSeedManifest.generated.ts`.

## Tech Stack

- Frontend: React 18, TypeScript, Vite, React Router
- Backend: Convex (queries, mutations, actions, scheduler)
- Editor: CodeMirror 6
- Auth: Convex Auth (Google in prod, Google + password in dev) + provider
  OAuth/API key connections
- UI: Tailwind CSS + Radix UI + shadcn/ui patterns
- Workspace tooling: PNPM + Vite+

## Project Structure

```text
.
├── AGENTS.md
├── apps/
│   ├── noter/
│   │   ├── src/
│   │   └── convex/
│   └── noter-starter-template/
├── scripts/
├── specs/
├── package.json
├── vite.config.ts
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- Node.js 24+ (`.nvmrc`)
- PNPM 9.15.0
- Git

### Windows (Outside WSL)

Native Windows setup works, but it is a little different from the repo's
macOS/Linux `make` flow.

1. Install Node.js 24 LTS. If you use `winget`, this works well in PowerShell:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

2. Install PNPM 9.15.0. If `corepack` is not available on your PATH after
   installing Node, install PNPM directly:

```powershell
npm install -g pnpm@9.15.0
```

3. Verify the toolchain from the repo root:

```powershell
node -v
pnpm -v
git --version
```

4. Bootstrap dependencies from the primary checkout:

```powershell
node .\scripts\bootstrap-worktree.ts
```

5. Start the app:

```powershell
pnpm dev
```

6. Open the URL Vite prints in the terminal. The usual default is
   [http://127.0.0.1:5173/](http://127.0.0.1:5173/), and if that port is busy
   Noter now picks the next free local port before startup so the frontend and
   `SITE_URL` stay aligned.

Notes:

- In Windows PowerShell, direct hosted-file `noter.ts` commands should use
  `curl.exe`, not the built-in `curl` alias. This matches the Windows-safe
  command work merged in PR `#395`.
- The `noter.ts connect` flow now prints a `next:` approval URL instead of
  trying to open a browser automatically. Open that printed link manually in a
  signed-in browser. This keeps the flow consistent across native Windows and
  Linux sandbox environments.
- Windows `noter.ts` resolution also supports Codex installed through Volta, as
  long as the `codex` and `volta` commands are available on `PATH`. Noter
  resolves that shim from the current workspace so project-scoped Volta setups
  launch the same Codex binary that the later runtime command would use.
- On a brand-new machine, the first `pnpm dev` run may pause for an interactive
  Convex CLI login/bootstrap prompt before `apps/noter/.env.local` exists.
- On native Windows primary checkouts, `pnpm dev` now retries local `SITE_URL`
  sync after the long-running backend starts, so local OAuth redirects continue
  to follow the URL Vite printed even when the temporary bootstrap backend exits
  first.
- `pnpm dev` now tries to stop stale local `convex-local-backend` listeners on
  `3210` before bootstrap. If it still reports that `3210` is occupied, stop the
  leftover backend process manually and retry.
- For local connected-machine testing with `/noter.ts` on a fresh Windows
  checkout that does not already have a cloud dev source env, use the dated
  troubleshooting notes in
  `research/windows-native-connected-machine-walkthrough-2026-04-01.md`. The
  current local-only anonymous bootstrap path needs a few manual Node commands
  today.
- The primary checkout path above works without GNU Make, but worktree and
  anonymous bootstrap flows still depend on `make` plus POSIX shell tools. For
  `make run`, `make anon`, or `make anon-once`, use Git Bash, MSYS2, or WSL
  today.

### Installation

```bash
node ./scripts/bootstrap-worktree.ts
```

### Development

From the primary local checkout on macOS/Linux, use:

```bash
make run
```

### Worktrees

For a git worktree, use the repo-standard anonymous bootstrap commands instead
of the primary-checkout flow:

```bash
make anon-once
make anon
```

### Build

```bash
pnpm build
```

For Cloudflare Pages, point the project at the repo root and use one build
command for every environment:

```bash
pnpm run build:cloudflare
```

That entrypoint treats `main` as the production branch and every other
`CF_PAGES_BRANCH` value as a preview deploy by dispatching to:

- `pnpm run build:cloudflare:production`
- `pnpm run build:cloudflare:preview`

The Pages UI still only needs the single root command.

### Testing

```bash
pnpm test
```

## Environment Setup

1. Configure Convex deployment env vars.
2. Configure app-login providers (Google, plus password in dev and preview when
   `PREVIEW_SEED_AUTH_EMAIL` and `PREVIEW_SEED_AUTH_PASSWORD` are set on preview
   deployments; the seeded preview email must still be allowlisted).
3. Configure provider connection OAuth/API keys (GitHub/Convex/Cloudflare).

## Contributing

This project uses:

- Vite+ for build, test, and workspace task orchestration
- Oxlint and oxfmt for linting and formatting
- Husky for pre-commit hooks
- TypeScript for type safety
- Vitest for testing

Convex-generated client files under `apps/noter/convex/_generated/` are
intentionally committed. Building against an already-existing dev deployment can
hide this requirement, because `convex codegen` has a deployment to talk to.
Creating a fresh preview deployment is different: `convex deploy --cmd ...` runs
the app build before Convex finishes the preview deploy's push/codegen phase, so
a fresh Cloudflare clone cannot generate `_generated` on the fly and must get
those files from git.

## License

Proprietary. All rights reserved.

This repository is not open source. Access to the source code does not grant
permission to use, modify, or redistribute it unless the copyright holder gives
separate written permission. Third-party dependencies remain subject to their
own license terms. See [LICENSE.md](LICENSE.md) and [LICENSING.md](LICENSING.md)
for the authoritative terms and dependency licensing notes.
