# Samebase app

This repository is the starter app that Samebase copies into a new GitHub repository.

It is a small, complete app base. It includes working authentication, real-time data, sharing, and
deployment paths without adding product-specific services that a new app might not need.

This README covers work inside the repository and the deploy setup.

## Stack

- React 19 and TanStack Start in SPA mode
- Convex for the real-time backend, database, and guest authentication
- A Cloudflare Worker that serves the static assets, defined in `cloudflare.config.ts` and deployed
  by Cloudflare Workers Builds, with an Alchemy setup stack for the Worker shell, the Workers Builds
  link, and the Convex project
- shadcn/ui primitives for the user interface
- Vite+ for development, formatting, linting, tests, and builds
- Node.js 24 for application and automation code

The example app is a public todo list. Guests can sign in without an external identity provider,
create todos, see real-time updates, and scan a QR code to open the same list on another device.

## Local development

Install [Vite+](https://viteplus.dev/guide/) and use it to supply the Node.js version in
`.node-version`. Run `corepack enable` once to make the pinned pnpm version available.

```sh
corepack enable
pnpm install
pnpm run dev
```

The development command starts Convex and TanStack Start together. It also creates missing Convex
Auth JWT keys in the development deployment. In a linked Git worktree, the same command
automatically uses an isolated local backend. Convex writes `VITE_CONVEX_URL` to `.env.local`; do
not set it manually.

To force the isolated backend outside a linked worktree, use:

```sh
pnpm run dev:worktree
```

The core workflow runs on macOS, Linux, and Windows. See
[`docs/local-setup.md`](./docs/local-setup.md) for the local Convex setup and troubleshooting steps.

## Checks and builds

| Command          | Purpose                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------- |
| `pnpm run check` | Format, lint, type-check, test, and verify generated redirects                          |
| `pnpm run build` | The Cloudflare build: the Convex deploy in Workers Builds, then the check and app build |

Outside Workers Builds, `pnpm run build` does not deploy Convex. It runs the check, the app build,
and the Worker Build Output in `.cloudflare/`. The Worker build reads the Worker name from
`GITHUB_REPOSITORY` (`<owner>/<repository>`), which GitHub Actions sets. On a laptop, set it in the
environment or in `.env`.

## Deployment contract

The deploy has two owners. An Alchemy setup stack owns the setup around the Worker, and Cloudflare
Workers Builds deploys each commit. The split follows the Samebase research note "Alchemy setup
stacks next to Workers Builds" (`research/2026-10-05-alchemy-setup-stack-and-wrangler-split.md` in
the Samebase repository): the stack owns wiring, not settings, and each field has one owner.

| File                            | Owns                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alchemy.run.ts`                | The setup stack: the Worker shell, the Workers Builds link with its commands and build variables, the Convex project, and two Convex deploy keys. No Worker code. |
| `cloudflare.config.ts`          | The Worker version: the static assets with the SPA fallback, the compatibility date, and Preview URLs. Workers Builds uploads it with `cf`.                       |
| `package.json`                  | `build`, `deploy`, and `deploy:preview`, the commands that Workers Builds runs.                                                                                   |
| `scripts/deploy-names.ts`       | The names of the stack, the Worker, and the Convex project.                                                                                                       |
| `.github/workflows/alchemy.yml` | When the stack runs.                                                                                                                                              |

### Workers Builds

Workers Builds runs `pnpm run build` for every push to the repository. It then uses:

| Branch         | Deploy command            | Builds settings | `CONVEX_DEPLOY_KEY` value  |
| -------------- | ------------------------- | --------------- | -------------------------- |
| `main`         | `pnpm run deploy`         | Production      | Production deploy key      |
| Other branches | `pnpm run deploy:preview` | Previews Base   | Project Preview deploy key |

`scripts/build-cloudflare.ts` deploys Convex: the production deployment on `main`, and on other
branches a preview deployment named after the branch (`WORKERS_CI_BRANCH`). `convex deploy --cmd`
supplies `VITE_CONVEX_URL` of that deployment to the app build, so it is not a build variable.
`scripts/ensure-convex-auth.ts` then creates the Convex Auth keys of the deployment when they are
missing and keeps existing keys on rebuilds. `scripts/verify-current-branch-head.ts` prevents an
older concurrent build from deploying backend code after a newer commit reaches the same branch.

`scripts/build-worker.ts` writes the Worker Build Output, a Preview build on branches other than
`main`. `pnpm run deploy` runs `cf deploy --prebuilt`. `pnpm run deploy:preview` runs
`scripts/deploy-preview.ts`, which uploads the Worker Preview with `cf previews deploy --prebuilt`
and writes its URL to the Wrangler output file, which `cf` does not write yet. Workers Builds reads
the URL there and posts it in its comment on the pull request of the branch.

`main` is the production branch. Samebase makes it the default branch of the repository, the stack
links the default branch as the production branch, and the build scripts deploy production only
from `main`.

### The setup stack

`.github/workflows/alchemy.yml` runs `alchemy.run.ts` on its one stage, `prod`:

| Event                                 | Run                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Pull request that changes the stack   | `alchemy plan` and `alchemy drift`, read-only                                               |
| Push to `main` that changes the stack | `alchemy deploy --detect-drift`, which also repairs drift                                   |
| Run workflow on the default branch    | The same deploy. With `adopt`, it takes over resources that exist but are not in the state. |
| Run workflow, confirmed               | The destroy of the app: see [Destroy the app](#destroy-the-app)                             |

The stack changes with `alchemy.run.ts`, `cloudflare.config.ts`, `wrangler.config.ts`,
`scripts/deploy-names.ts`, `package.json`, `pnpm-lock.yaml`, and the workflow itself. Runs wait for
each other, in order.

Samebase pushes the starter to `main` before the first deploy of the stack creates the Workers
Builds link, so that push builds nothing. The deploy that creates the link therefore starts the
first production build of `main` (`FirstBuild` in `alchemy.run.ts`). Later pushes start their own
builds. The first build runs again only for a new Worker, another production branch, or
`alchemy deploy --force`.

The jobs run only when the repository variable `CONVEX_TEAM_ID` is set. A copy of the repository
without the deploy setup skips them. Each job installs the dependencies without lifecycle scripts
and runs `pnpm audit signatures` first. The plan and the deploy then run the two vulnerability
audits of `.github/workflows/ci.yml`. The destroy does not, so a new advisory cannot block a
cleanup. Each credential goes only to the steps that need it.

The deploy never takes over a Worker or a Convex project that it did not create. If the Cloudflare
account already has a Worker with the same name, or the Convex team already has a project with the
same name, that is not in this stack's state, the deploy stops with `OwnedBySomeoneElse`. Run the
workflow with `adopt` to take them over.

The Worker and the Convex project are kept when stage `prod` is destroyed, unless the destroy of the
app runs.

Alchemy keeps its state in a state store in the Cloudflare account, which every stack of the account
shares. With `--yes`, the first deploy in an account creates the store: a Worker named
`alchemy-state-store` with its keys in the account Secrets Store.

The names, for the repository `my-org/my-app` and the branch `feature/Foo_bar`:

| Resource                  | Name                                                 | Example           |
| ------------------------- | ---------------------------------------------------- | ----------------- |
| Alchemy stack             | `<owner>_<repository>`, lowercase                    | `my-org_my-app`   |
| Worker                    | The repository name made safe, at most 54 characters | `my-app`          |
| Convex project            | The repository name made safe, at most 40 characters | `my-app`          |
| Convex preview deployment | The branch                                           | `feature/Foo_bar` |

Made safe means lowercase, every run of characters other than `a-z` and `0-9` as one dash, and no
dash at either end. Workers Builds names the Worker Preview of a branch. Renaming the repository is
not supported by the deploy.

### Prerequisites

Install the Cloudflare Workers and Pages GitHub App on the owner of the repository, with access to
the repository: **Workers & Pages** in the Cloudflare dashboard. Workers Builds clones the
repository and comments on pull requests through it.

Set these in the GitHub repository under **Settings > Secrets and variables > Actions**:

| Name                    | Kind     | Value                                                |
| ----------------------- | -------- | ---------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Secret   | A Cloudflare user API token for the account          |
| `CLOUDFLARE_ACCOUNT_ID` | Secret   | The Cloudflare account id                            |
| `CONVEX_ACCESS_TOKEN`   | Secret   | A Convex team access token                           |
| `CONVEX_TEAM_ID`        | Variable | The numeric id of the Convex team of that same token |

The Cloudflare token needs Workers Scripts: Edit, Workers Builds Configuration: Edit, Secrets Store:
Edit, and Account Settings: Read. The Workers Builds API accepts only a user API token. When the
account has no Workers Builds build token yet, the stack registers this token as one, and Workers
Builds deploys with it.

GitHub Actions provides `GITHUB_TOKEN` and `GITHUB_REPOSITORY`. The stack reads the GitHub ids and
the default branch of the repository with `GITHUB_TOKEN`.

### Destroy the app

To delete the deployed app, open **Actions** in the GitHub repository, select the `alchemy`
workflow, and choose **Run workflow** on the default branch. Type the repository as
`<owner>/<repository>` in the `confirm` field and run it. The run deletes the Workers Builds link,
the Convex deploy keys, the Worker with its Previews, the Convex project with every deployment and
its data, and the stack's state in the Alchemy state store, so a later repository with the same name
starts clean. A different value, or a run on another branch, runs nothing. The run waits for a
running deploy, and the credentials never leave the repository's secrets.

A destroy reads the removal policy of each resource from the state of the last deploy. So
`scripts/destroy-app.ts` first deploys the Worker shell and the Convex project with
`DESTROY_APP=true`, which only marks both for deletion, then runs `alchemy destroy --stage prod`,
then deletes the stack's state. A second run finds no stack and changes nothing. If a destroy
without `DESTROY_APP` already removed the stack from the state, the Worker and the project stay in
the accounts: delete them in the Cloudflare and Convex dashboards. The repository itself stays:
delete it on GitHub when it is no longer needed. A later push that changes the stack, or a run of
the workflow, sets the app up again.

### Deploy from a laptop

Put the same four values and `GITHUB_REPOSITORY` (`<owner>/<repository>`) in `.env`, or in the
environment, which takes precedence. For a private repository, also set `GITHUB_TOKEN` to a GitHub
token that can read it. The Convex CLI login (`npx convex login`) can replace
`CONVEX_ACCESS_TOKEN`. Then deploy the stack:

```sh
pnpm exec alchemy deploy --stage prod
```

The laptop deploy uses the same state as the workflow and starts the first build in the same way.
Workers Builds deploys the app. To deploy the app again without a commit, retry the latest build of
`main` in the Cloudflare dashboard.

## Important files

- `package.json` defines the supported development, check, build, and deploy commands.
- `prerender.config.ts` defines the public pages shared by TanStack Start and Cloudflare.
- `vite.config.ts` defines the TanStack Start SPA and prerender behavior.
- `cloudflare.config.ts` defines the Worker: static asset routing and SPA fallback.
  `wrangler.config.ts` holds the build settings of the Wrangler bundler.
- `alchemy.run.ts` defines the setup stack: the Worker shell, the Workers Builds link, and the
  Convex project and deploy keys.
- `.github/workflows/alchemy.yml` plans, deploys, and destroys the setup stack.
- `scripts/build-cloudflare.ts` owns the Cloudflare build and Convex deployment selection.
- `convex/` contains the backend, schema, authentication, and generated Convex bindings.
- `src/` contains the React application and routes.

## Generated and managed files

- `src/routeTree.gen.ts` is generated by TanStack Router.
- `convex/_generated/api.*`, `dataModel.d.ts`, and `server.*` are generated by Convex.
- `convex/_generated/ai/`, `.agents/skills/`, `skills-lock.json`, and the marked Convex sections in
  `AGENTS.md` and `CLAUDE.md` are managed by `npx convex ai-files install`.
- The marked Vite+ section in `AGENTS.md` is generated by `vp config`. The package `prepare`
  command uses `--no-agent`, so installs do not rewrite it.
- `scripts/generate-cloudflare-redirects.ts` owns only the marked generated block in
  `public/_redirects`. Custom redirect rules can stay outside that block.

Do not hand-edit generated files when their source tool can update them.
When a Convex AI-file update changes the installed source snapshot, confirm its distribution license
and update `THIRD_PARTY_NOTICES.md` when its third-party material changes.

## License

Licensed under the [Apache License 2.0](./LICENSE). See
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) for included third-party material.
