# Samebase development and deployment

This runbook describes the maintainer setup for the Samebase service. Read
[Contributing](../CONTRIBUTING.md) first for prerequisites and the limits of a fresh checkout. The
app starter has a separate setup in [templates/base](../templates/base/README.md).

Paths and commands below are relative to the repository root unless a step names another directory.

## Local development

For a primary checkout with the maintainer's Convex access and provider configuration, run:

```bash
pnpm run dev
```

The command installs dependencies, prepares the development deployment, and starts the frontend and
backend. Open the URL printed by Vite. If the default port is busy, startup picks another port and
keeps `SITE_URL` aligned.

For a linked worktree, run:

```bash
pnpm run dev --once
pnpm run dev
```

Worktree setup needs the primary checkout's development configuration. It copies allowlisted GitHub
App settings and seed facts into its own local Convex deployment. It also seeds Convex and
Cloudflare connections when development seed credentials exist. The word "anonymous" in the runner
refers to the local Convex deployment, not a setup that works without maintainer credentials.

On native Windows, use the same commands in PowerShell. Startup retries local `SITE_URL` sync after
the backend starts. If it cannot stop a stale local backend on port `3210`, stop that process and
retry.

## Checks and build

```bash
pnpm run check
pnpm run build
```

These commands need a configured development deployment for Convex code generation. Use the
[test policy](../.agents/skills/samebase-test-policy/SKILL.md) to choose focused tests for a change.
`pnpm test` runs the workspace's configured test projects.

## Deploy

samebase.com is served by its production Convex deployment through
[convex-hosting](https://github.com/samebase/convex-hosting). The `deploy` script of
`apps/samebase/package.json` builds the site, uploads `dist/client`, and pushes the functions; the
push switches the site. A file of `dist/client` answers its path: the assets, and the public pages
without data (`/`, `/pricing`, `/docs` and its pages, `/privacy`, `/terms`), which the build
prerenders to `<path>/index.html`. Every other request goes to the server build
`dist/server/server.js` (from `src/server.ts`), which `convex/http.ts` imports and which renders the
page with the visitor's session in a Convex HTTP action. `.github/workflows/alchemy.yml` runs the
deploy with the Alchemy stack in `apps/samebase/alchemy.run.ts`, then the sidebars example with the
stack in `apps/sidebars-example/alchemy.run.ts`:

- Every push to `main` deploys the stage `prod`: the production deployment, through the `deploy`
  script of `apps/samebase`, the account API token that production sends email with, the Workers
  next to the app, and the sidebars example Worker. Every run adopts the production deployment: the
  stack owns the variables it writes, also ones set by hand, and never deletes the deployment. When
  the sidebars example Worker is not in the state of its stack, the run stops until one run with
  adopt takes it over: `gh workflow run alchemy.yml --ref main -f adopt=true`.
- Every pull request from this repository deploys the stage `pr-<number>`, a Convex preview
  deployment with that name, through `apps/samebase/scripts/deploy-preview.ts`, which also sets its
  `SITE_URL` and seeds its password account. The run comments the preview's URLs on the pull
  request. Closing the pull request destroys the stage and deletes the preview.
- The state of every stage is in the `alchemy-state-store` project of the Convex team `nicu`, under
  the stack name `samebase/samebase/<folder>`, such as `samebase/samebase/apps/samebase`. Every run
  needs the `CONVEX_ACCESS_TOKEN` repository secret, a team access token; each push mints its own
  short-lived deploy key. The stage `prod` also needs the `CLOUDFLARE_API_TOKEN` secret, with the
  permissions that the top of `apps/samebase/alchemy.run.ts` names, the `CLOUDFLARE_ACCOUNT_ID`
  variable, and the `PROD_POSTHOG_PROJECT_TOKEN` variable, the PostHog project token of the
  production build.

A local build never deploys production. `convex/http.ts` imports `.convex-hosting/version.js`, which
only a deploy writes, and `dist/server/server.js`, which only a build writes, so the first push of a
fresh checkout fails until one deploy to its development deployment has run. `pnpm run dev` runs
that deploy in a linked worktree; a primary checkout runs it once by hand:

```bash
pnpm --filter samebase run deploy --dev
```

## Environment Setup

1. Configure Convex deployment env vars.
2. Configure sign-in. See [Sign-in](#sign-in).
3. Configure the GitHub App deployment settings and the Convex and Cloudflare connection OAuth/API
   keys.

Set `ACCOUNT_DELETION_GRACE_PERIOD_MS=0` on a Convex deployment to start account deletion
immediately. An unset value keeps the seven-day wait.

## Sign-in

Samebase signs in with Convex Auth 2. GitHub and Google sign-in run through the team's identity hub
at `https://auth.samebase.com`, an OpenID Provider (`@samebase/identity-broker`) that holds the
GitHub and Google clients. Each button is a method of `convex/auth.ts`, `hub-github` or
`hub-google`, whose authorize URL names its connector: `<HUB_ISSUER>/authorize?connector=github`.
Both methods share the `authHub` component, one hub client per deployment, which serves the hub's
callback at `<site>/auth/hub/callback`. The core component serves the key set under `/auth`. The
GitHub App installation callback keeps `/oauth/github/callback` in `convex/http.ts`.

The hub's `sub` is pairwise for each app and connector. `convex/identity/signIn.ts` finds a user by
the `authAccounts` row of the connector and the connector's own account id (`connector_account_id`:
GitHub's numeric user id, or Google's `sub`), then by the verified email, so an account from before
the hub keeps its user. A GitHub sign-in keeps the `github` row with the raw GitHub user id, which
the GitHub App authorization must match.

The session lives in two httpOnly cookies, `__convexAuthJWT` and `__convexAuthRefreshToken`, through
[`@samebase/convex-auth-tanstack-start`](https://github.com/samebase/convex-hosting/tree/main/packages/convex-auth-tanstack-start).
`src/server.ts` answers `POST /auth/signin`, `/auth/refresh`, and `/auth/signout`, and
`convex/http.ts` routes these three exact paths to it. Every mutation that mints a session (the
`completeSignIn*` functions of the two hub methods, the password sign-in and sign-up, and the agent
browser handoff) is in the `signIn` list of `src/server.ts`, and the browser calls it through
`/auth/signin`, so the refresh token lands in the cookie and the browser keeps only the access
token. The server renders a page with the session of the request; a private page under the `_authed`
layout answers a request without a session with a 307 to `/?next=<page>`.

Every deployment needs these Convex environment variables. The key-generation commands below are for
a fresh deployment with no existing keys. Do not replace an existing signing key pair or credential
key ring during routine setup. Replacing the credential key ring loses access to values sealed with
its old keys. For rotation, follow the
[credential encryption contract](../specs/130_PROVIDER_CREDENTIAL_ENCRYPTION_AT_REST_SPEC.md#rotation).

- `AUTH_PRIVATE_KEY` and `AUTH_JWKS`: the signing keys of the auth component. A linked worktree gets
  them from `pnpm run dev --once`, and CI from its bootstrap. For another deployment, run this from
  `apps/samebase` with the deployment selected (for example `--prod` or `--preview-name <name>`
  after `set`):

  ```bash
  node -e 'import("../../scripts/lib/convexAuthKeys.ts").then(({ generateConvexAuthKeys }) => { for (const [name, value] of Object.entries(generateConvexAuthKeys())) require("node:child_process").spawnSync("npx", ["convex", "env", "set", name], { input: value, stdio: ["pipe", "inherit", "inherit"] }); })'
  ```

- `CREDENTIAL_KEYS`: the key ring that seals the stored provider credentials
  (`specs/130_PROVIDER_CREDENTIAL_ENCRYPTION_AT_REST_SPEC.md`). A linked worktree gets it from
  `pnpm run dev --once`, CI from its bootstrap, and a preview from its push. For production and the
  development deployment, run this from `apps/samebase` with the deployment selected:

  ```bash
  node -e 'import("../../scripts/lib/convexAuthKeys.ts").then(({ generateCredentialKeys }) => { for (const [name, value] of Object.entries(generateCredentialKeys())) require("node:child_process").spawnSync("npx", ["convex", "env", "set", name], { input: value, stdio: ["pipe", "inherit", "inherit"] }); })'
  ```

- `HUB_ISSUER`, `HUB_CLIENT_ID`, and `HUB_CLIENT_SECRET`: the identity hub,
  `https://auth.samebase.com`, and this deployment's client at it. A deployment gets its client by
  registering its callback URL `<site>/auth/hub/callback` at the hub. A linked worktree and CI have
  no hub: their setup writes `HUB_ISSUER=http://127.0.0.1:1` and `no-hub` as the client id and
  secret, and their pages offer only the password form (`?prod-ui` shows the hub buttons of the
  production page).
- `SITE_URL`: the app origin. OAuth sign-ins may return only to `SITE_URL` and to the deployment's
  own `CONVEX_SITE_URL`.

`apps/samebase/alchemy.run.ts` registers production and each preview with `Convex.HubClient`, on
`https://samebase.com/auth/hub/callback` and `<preview site>/auth/hub/callback`, and writes the
three variables to the deployment before its push. The hub is in the `samebase` project of the
Convex team, and the Convex credential of the run reaches it, so sign-in needs no secret of its own.

The development deployment of the primary checkout gets its client from the package script
`hub:client`, which `pnpm run dev` runs before its first push with your Convex login. It registers
once and writes the three variables to the development deployment. A deployment with all three
variables keeps them, so it leaves the no-hub values of a linked worktree.

Password sign-in is for accounts that only server functions create. Local worktrees use their seeded
password account. Preview deployments use `DEV_SEED_AUTH_EMAIL` and `DEV_SEED_AUTH_PASSWORD` (at
least 10 characters). Other deployments can use the
[manual password account runbook](manual-password-auth.md).
