# samebase.com

Samebase is a collaborative, GitHub-connected code editor built as a PNPM workspace with React +
TanStack Start/Vite on the frontend and Convex on the backend.

## Current Product Capabilities (2026-07-26)

- Real-time collaborative editing with CodeMirror + Convex synchronization
- GitHub repository connection (`connectRepository`) for existing repositories
- New Samebase-managed repository creation (`createRepository`), with a runnable starter seeded into
  the new GitHub repository in one commit
- Automatic infrastructure provisioning for new Samebase-managed repositories:
  - Convex project/deployment
  - Cloudflare Workers project + environment wiring
  - Infrastructure status shown in the repository dashboard
- Manual infrastructure retry for failed or partial provisioning

## Important Behavior

- Automatic infrastructure provisioning starts only for newly created Samebase-managed repositories.
- Connecting an existing GitHub repository does not auto-provision infra.
- Starter source of truth is `templates/base`, an independent pnpm workspace with its own lockfile.
  `pnpm run template:export` stores its runtime seed in
  `apps/samebase/convex/starterSeedManifest.generated.ts`, and successful main builds publish the
  same template tree to `samebase/base`.

## Tech Stack

- Frontend: React, TypeScript, Vite, TanStack Start, TanStack Router
- Backend: Convex (queries, mutations, actions, scheduler)
- Editor: CodeMirror 6
- Auth: Convex Auth (Google plus deployment-gated password sign-in) + provider OAuth/API key
  connections
- UI: Tailwind CSS + Radix UI + shadcn/ui patterns
- Workspace tooling: PNPM + Vite+

## Project Structure

```text
.
├── AGENTS.md
├── apps/
│   ├── domain-router/
│   ├── posthog-proxy/
│   ├── remotion-studio/
│   ├── samebase/
│   │   ├── src/
│   │   └── convex/
│   ├── sidebars-example/
│   └── workspace-layout-v2-solid/
├── packages/
│   ├── dependent/
│   ├── logo-model/
│   ├── onboarding-video-tools/
│   ├── plugin/
│   ├── sidebars/
│   └── sure/
├── scripts/
├── specs/
├── templates/
│   └── base/
├── package.json
├── vite.config.ts
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- [Vite+](https://viteplus.dev/guide/), which supplies the Node.js version in `.node-version`
- Git

### Windows (Outside WSL)

Native Windows setup uses Vite+ for Node.js and Corepack for the pinned pnpm version. Install Vite+
in PowerShell:

```powershell
irm https://vite.plus/ps1 | iex
```

Open a new PowerShell window. Enable the package-manager shims:

```powershell
corepack enable
```

Verify the toolchain from the repository root:

```powershell
node -v
pnpm -v
git --version
```

Start the app. This command also installs missing dependencies:

```powershell
pnpm run dev
```

Open the URL Vite prints in the terminal. The usual default is
[http://127.0.0.1:5173/](http://127.0.0.1:5173/), and if that port is busy Samebase now picks the
next free local port before startup so the frontend and `SITE_URL` stay aligned.

Notes:

- On a brand-new machine, the first `pnpm run dev` run may pause for an interactive Convex CLI
  login/bootstrap prompt before `apps/samebase/.env.local` exists.
- On native Windows primary checkouts, `pnpm run dev` now retries local `SITE_URL` sync after the
  long-running backend starts, so local OAuth redirects continue to follow the URL Vite printed even
  when the temporary bootstrap backend exits first.
- `pnpm run dev` now tries to stop stale local `convex-local-backend` listeners on `3210` before
  bootstrap. If it still reports that `3210` is occupied, stop the leftover backend process manually
  and retry.
- The primary checkout path above works without GNU Make. Use `pnpm run dev` in both primary and
  linked worktree checkouts. In a new linked worktree, use `pnpm run dev --once` to complete setup
  and exit.

### Installation

```bash
node ./scripts/bootstrap-worktree.ts
```

### Development

From the primary local checkout on macOS/Linux, use:

```bash
pnpm run dev
```

### Worktrees

For a git worktree, complete setup once and then use the normal development command:

```bash
pnpm run dev --once
pnpm run dev
```

The setup copies the allowlisted development GitHub App settings and non-secret owner and
installation seed facts. It seeds organization-owned Convex and Cloudflare connections when their
development seed credentials exist. Each worktree keeps its own local Convex data.

### Build

```bash
pnpm build
```

For Cloudflare Workers Builds, point the project root directory at `apps/samebase` and use:

- Build command: `pnpm run build`
- Production deploy command: `pnpm run deploy`
- Non-production deploy command: `pnpm run deploy:preview`

`wrangler.jsonc` owns the static asset directory and SPA fallback. The build script deploys Convex
first. Each Workers Builds trigger uses `CONVEX_DEPLOY_KEY`. The production trigger stores the
Convex production key. The preview trigger stores the project Preview key.

These three package scripts are the stable Samebase deployment interface. A repository can change
their implementation without changing the Workers Builds settings. Outside Workers Builds,
`pnpm run build` runs only the app build.

The production key must be a Convex production deploy key with exactly `deployment:deploy`,
`deployment:env:view`, `deployment:env:write`, and `deployment:data:view`; the preview key is
Convex's separate project-level Preview deploy key. Local dry-runs build the app assets without
deploying Convex and can validate the Worker package with:

```bash
pnpm --filter samebase deploy:dry-run
```

`pnpm --filter samebase deploy:preview` runs `wrangler preview` to create or update a named Worker
Preview. Worker Previews is a public open beta and the default for new Workers Builds projects.
Wrangler `4.135.0` or later reads the connected Worker name from the build environment. For local
use, pass `--worker-name <actual-worker-name>`. The required `previews: {}` block is in
`wrangler.jsonc`.

Put the preview key under **Builds > Previews Base**, not under **Runtime variables and secrets**.
Existing Workers need the one-time switch in **Settings > Builds > Set up Worker Previews**. Follow
the
[migration runbook](./docs/existing-app-cloudflare-workers-migration.md#migrate-to-worker-previews)
to update each repository, provider settings, and deployment checks.

### Testing

```bash
pnpm test
```

## Environment Setup

1. Configure Convex deployment env vars.
2. Configure app-login providers. Google is the default. Local worktrees use their seeded password
   account. Preview deployments use `DEV_SEED_AUTH_EMAIL` and `DEV_SEED_AUTH_PASSWORD`. Other
   deployments can use the [manual password account runbook](docs/manual-password-auth.md).
3. Configure the GitHub App deployment settings and the Convex and Cloudflare connection OAuth/API
   keys.

Set `ACCOUNT_DELETION_GRACE_PERIOD_MS=0` on a Convex deployment to start account deletion
immediately. An unset value keeps the seven-day wait.

## Contributing

This project uses:

- Vite+ for build, test, and workspace task orchestration
- Oxlint and oxfmt for linting and formatting
- Vite+ for pre-commit hooks in `.vite-hooks/`
- TypeScript for type safety
- Vitest for testing

Convex-generated client files under `apps/samebase/convex/_generated/` are intentionally committed.
Building against an already-existing dev deployment can hide this requirement, because
`convex codegen` has a deployment to talk to. Creating a fresh preview deployment is different:
`convex deploy --cmd ...` runs the app build before Convex finishes the preview deploy's
push/codegen phase, so a fresh Cloudflare clone cannot generate `_generated` on the fly and must get
those files from git.

## License

Proprietary. All rights reserved.

This repository is not open source. Access to the source code does not grant permission to use,
modify, or redistribute it unless the copyright holder gives separate written permission.
Third-party dependencies remain subject to their own license terms. See [LICENSE.md](LICENSE.md) and
[LICENSING.md](LICENSING.md) for the authoritative terms and dependency licensing notes.
