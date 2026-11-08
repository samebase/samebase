# Samebase development and deployment

This runbook describes the maintainer setup for the Samebase service. Read
[Contributing](../CONTRIBUTING.md) first for prerequisites and the limits of a fresh checkout. The
app starter has its own setup in [samebase/base](https://github.com/samebase/base).

Paths and commands below are relative to the repository root unless a step names another directory.

## Local development

The main checkout and every linked worktree start the same way. It needs the maintainer's Convex CLI
login (`npx convex login`) and no file of another checkout:

```bash
pnpm run dev --once   # optional: set up and exit
pnpm run dev
```

1. Each folder gets its own logged-in Convex local deployment of the project `samebase-com`, made by
   `npx convex deployment create nicu:samebase-com:local --select` in `apps/samebase`. It is listed
   in the Convex dashboard under the project. It imports the project's default variables for
   development: the GitHub App, the GitHub owner of the seeded organization, and the off values of
   the six identity hub variables. A folder that still has an anonymous local deployment loses it
   and its data.
2. The first start seeds it: the Convex Auth keys, the credential key ring, one local site deploy,
   and the password account.
3. `convex dev` runs the backend on two ports that a hash of the folder picks, so they stay the same
   at each start.
4. Once the backend answers, `pnpm exec alchemy deploy --stage dev-<name>` runs in `apps/samebase`:
   `<name>` is your user name in the main checkout and the folder name in a linked worktree. The
   stage registers or renews two development clients of the identity hub on the backend's site port,
   and writes their six variables to the local deployment. A failure prints one line, and the dev
   server keeps running.

Open the URL printed by Vite. If the frontend port is busy, startup picks another port and keeps
`SITE_URL` aligned. On native Windows, use the same commands in PowerShell.

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
- Every pull request from this repository deploys the stage `pr-<number>` of both stacks: a Convex
  preview deployment with that name, through `apps/samebase/scripts/deploy-preview.ts`, which also
  sets its `SITE_URL` and seeds its password account, and a sidebars example Worker with the stage
  in its name. `alchemy-convex stack-comment` then keeps one comment with the stacks of the
  repository. Closing the pull request destroys both stages.
- The state of every stage is in the `alchemy-state-store` project of the Convex team `nicu`, under
  the stack name `samebase/samebase/<folder>`, such as `samebase/samebase/apps/samebase`. Every run
  needs the `CONVEX_ACCESS_TOKEN` repository secret, a team access token; each push mints its own
  short-lived deploy key. A stack that deploys a Worker also needs the `CLOUDFLARE_API_TOKEN`
  secret, with the permissions that the top of `apps/samebase/alchemy.run.ts` names, and the
  `CLOUDFLARE_ACCOUNT_ID` variable. The stage `prod` of the app also needs the
  `PROD_POSTHOG_PROJECT_TOKEN` variable, the PostHog project token of the production build.

A local build never deploys production. `convex/http.ts` imports `.convex-hosting/version.js`, which
only a deploy writes, and `dist/server/server.js`, which only a build writes, so the first push of a
fresh checkout fails until one deploy to its local deployment has run. The first `pnpm run dev` of a
folder runs that deploy.

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
`hub-google`, whose authorize URL names its connector:
`<IDENTITY_HUB_ISSUER>/authorize?connector=github`. Both methods share the `authHub` component, one
hub client per deployment, which serves the hub's callback at `<site>/auth/hub/callback`. The core
component serves the key set under `/auth`. The GitHub App installation callback keeps
`/oauth/github/callback` in `convex/http.ts`.

The hub's `sub` is the provider and its own account id, such as `github:4076804` (RFC 134).
`convex/identity/signIn.ts` finds a user by the `authAccounts` row of the connector and the
connector's own account id (the part of `sub` after the provider: GitHub's numeric user id, or
Google's `sub`), then by the verified email, so an account from before the hub keeps its user. A
GitHub sign-in keeps the `github` row with the raw GitHub user id, which the GitHub App
authorization must match.

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

- `AUTH_PRIVATE_KEY` and `AUTH_JWKS`: the signing keys of the auth component. A development checkout
  gets them from its first `pnpm run dev`, and CI from its bootstrap. For another deployment, run
  this from `apps/samebase` with the deployment selected (for example `--prod` or
  `--preview-name <name>` after `set`):

  ```bash
  node -e 'import("../../scripts/lib/convexAuthKeys.ts").then(({ generateConvexAuthKeys }) => { for (const [name, value] of Object.entries(generateConvexAuthKeys())) require("node:child_process").spawnSync("npx", ["convex", "env", "set", name], { input: value, stdio: ["pipe", "inherit", "inherit"] }); })'
  ```

- `CREDENTIAL_KEYS`: the key ring that seals the stored provider credentials
  (`specs/130_PROVIDER_CREDENTIAL_ENCRYPTION_AT_REST_SPEC.md`). A development checkout gets it from
  its first `pnpm run dev`, CI from its bootstrap, and a preview from its push. For production, run
  this from `apps/samebase` with the deployment selected:

  ```bash
  node -e 'import("../../scripts/lib/convexAuthKeys.ts").then(({ generateCredentialKeys }) => { for (const [name, value] of Object.entries(generateCredentialKeys())) require("node:child_process").spawnSync("npx", ["convex", "env", "set", name], { input: value, stdio: ["pipe", "inherit", "inherit"] }); })'
  ```

- `IDENTITY_HUB_ISSUER`, `IDENTITY_HUB_CLIENT_ID`, and `IDENTITY_HUB_CLIENT_SECRET`: the identity
  hub, `https://auth.samebase.com`, and this deployment's client at it. A deployment gets its client
  by registering its callback URL `<site>/auth/hub/callback` at the hub. CI has no hub: its
  bootstrap writes `IDENTITY_HUB_ISSUER=http://127.0.0.1:1` and `no-hub` as the client id and
  secret.
- `SITE_URL`: the app origin. OAuth sign-ins may return only to `SITE_URL` and to the deployment's
  own `CONVEX_SITE_URL`.

`apps/samebase/alchemy.run.ts` gets the clients of production and each preview from the hub's
`POST /hub-clients` with `Convex.SharedHubClient`, on `https://samebase.com/auth/hub/callback` and
`<preview site>/auth/hub/callback`, with the run's GitHub OIDC token, so sign-in needs no secret of
its own. The hub reads `/samebase-verification.json` on the site before it registers a client.

The local deployment of each development checkout gets its two clients from the stage `dev-<name>`,
which `pnpm run dev` runs at each start. They are development clients on
`http://127.0.0.1:<site port>/auth/hub/callback` and `/oauth/hub/callback`, registered with the
initial access tokens of the apps `samebase` and `samebase-connections`, which the state of `prod`
keeps. Each start renews them, so a development client expires 14 days after the last start or use.

Password sign-in is for accounts that only server functions create. Local deployments use their
seeded password account. Preview deployments use `DEV_SEED_AUTH_EMAIL` and `DEV_SEED_AUTH_PASSWORD`
(at least 10 characters). Other deployments can use the
[manual password account runbook](manual-password-auth.md).
