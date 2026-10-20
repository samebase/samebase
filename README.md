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
- Auth: Convex Auth 2 (GitHub and Google sign-in plus deployment-gated password sign-in) + provider
  OAuth/API key connections
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

### Deploy

samebase.com is served by its production Convex deployment through
[convex-hosting](https://github.com/samebase/convex-hosting). The `deploy` script of
`apps/samebase/package.json` builds the site, uploads `dist/client`, and pushes the functions; the
push switches the site. A file of `dist/client` answers its path: the assets, and the public pages
without data (`/`, `/pricing`, `/docs` and its pages, `/privacy`, `/terms`), which the build
prerenders to `<path>/index.html`. Every other request goes to the server build
`dist/server/server.js` (from `src/server.ts`), which `convex/http.ts` imports and which renders the
page with the visitor's session in a Convex HTTP action. Three workflows run the deploy:

- `.github/workflows/deploy.yml` deploys every push to `main` to production. It needs the
  `CONVEX_DEPLOY_KEY` repository secret, a production deploy key with `deployment:deploy`, the three
  `deployment:functions:runInternal*` actions, `deployment:functions:runTestQuery`, and
  `deployment:data:view`, and the `PROD_POSTHOG_PROJECT_TOKEN` repository variable, the PostHog
  project token of the production build.
- `.github/workflows/preview.yml` deploys every pull request to the Convex preview deployment named
  after its branch, then sets its `SITE_URL` and seeds its password account. It needs the
  `CONVEX_PREVIEW_DEPLOY_KEY` repository secret, the project's preview deploy key. Without it, the
  workflow deploys nothing.
- `.github/workflows/preview-cleanup.yml` deletes that preview when the pull request closes.

A local build never deploys production. `convex/http.ts` imports `.convex-hosting/version.js`, which
only a deploy writes, and `dist/server/server.js`, which only a build writes, so the first push of a
fresh checkout fails until one deploy to its development deployment has run. `pnpm run dev` runs
that deploy in a linked worktree; a primary checkout runs it once by hand:

```bash
pnpm --filter samebase run deploy --dev
```

### Testing

```bash
pnpm test
```

## Environment Setup

1. Configure Convex deployment env vars.
2. Configure sign-in. See [Sign-in](#sign-in).
3. Configure the GitHub App deployment settings and the Convex and Cloudflare connection OAuth/API
   keys.

Set `ACCOUNT_DELETION_GRACE_PERIOD_MS=0` on a Convex deployment to start account deletion
immediately. An unset value keeps the seven-day wait.

## Sign-in

Samebase signs in with Convex Auth 2. Its components serve their own HTTP routes on the deployment's
site: the key set under `/auth`, the GitHub callback under `/auth/github`, and the Google callback
under `/auth/google`. The GitHub App installation callback keeps `/oauth/github/callback` in
`convex/http.ts`.

The session lives in two httpOnly cookies, `__convexAuthJWT` and `__convexAuthRefreshToken`, through
[`@samebase/convex-auth-tanstack-start`](https://github.com/samebase/convex-hosting/tree/main/packages/convex-auth-tanstack-start).
`src/server.ts` answers `POST /auth/signin`, `/auth/refresh`, and `/auth/signout`, and
`convex/http.ts` routes these three exact paths to it. Every mutation that mints a session (the
`completeSignIn*` functions of GitHub and Google, the password sign-in and sign-up, and the agent
browser handoff) is in the `signIn` list of `src/server.ts`, and the browser calls it through
`/auth/signin`, so the refresh token lands in the cookie and the browser keeps only the access
token. The server renders a page with the session of the request; a private page under the `_authed`
layout answers a request without a session with a 307 to `/?next=<page>`.

Every deployment needs these Convex environment variables:

- `AUTH_PRIVATE_KEY` and `AUTH_JWKS`: the signing keys of the auth component. A linked worktree gets
  them from `pnpm run dev --once`, and CI from its bootstrap. For another deployment, run this from
  `apps/samebase` with the deployment selected (for example `--prod` or `--preview-name <name>`
  after `set`):

  ```bash
  node -e 'import("../../scripts/lib/convexAuthKeys.ts").then(({ generateConvexAuthKeys }) => { for (const [name, value] of Object.entries(generateConvexAuthKeys())) require("node:child_process").spawnSync("npx", ["convex", "env", "set", name], { input: value, stdio: ["pipe", "inherit", "inherit"] }); })'
  ```

- `AUTH_GITHUB_CLIENT_ID` and `AUTH_GITHUB_CLIENT_SECRET`: the GitHub OAuth App. Its callback URL is
  `<site>/auth/github/callback`, for example `https://samebase.com/auth/github/callback`.
- `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET`: the Google OAuth client. Its redirect URI
  is `<site>/auth/google/callback`.
- `SITE_URL`: the app origin. OAuth sign-ins may return only to `SITE_URL` and to the deployment's
  own `CONVEX_SITE_URL`.

Password sign-in is for accounts that only server functions create. Local worktrees use their seeded
password account. Preview deployments use `DEV_SEED_AUTH_EMAIL` and `DEV_SEED_AUTH_PASSWORD` (at
least 10 characters). Other deployments can use the
[manual password account runbook](docs/manual-password-auth.md).

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
push/codegen phase, so a fresh CI clone cannot generate `_generated` on the fly and must get those
files from git.

## License

Proprietary. All rights reserved.

This repository is not open source. Access to the source code does not grant permission to use,
modify, or redistribute it unless the copyright holder gives separate written permission.
Third-party dependencies remain subject to their own license terms. See [LICENSE.md](LICENSE.md) and
[LICENSING.md](LICENSING.md) for the authoritative terms and dependency licensing notes.
