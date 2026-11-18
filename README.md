# Samebase

A dashboard for [Alchemy](https://alchemy.run). [samebase.com](https://samebase.com) reads the state
that Alchemy keeps and shows every app you deploy: its URL, the deployed commit, its checks, and the
preview of each pull request. This repository is the dashboard and the packages built along the way.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/samebase/.github/main/profile/map-dark.svg">
  <img src="https://raw.githubusercontent.com/samebase/.github/main/profile/map-light.svg" alt="A push to your GitHub repository runs Alchemy in GitHub Actions. Alchemy deploys to your Convex team: production and one preview per pull request, each serving the backend and the site. The identity hub gives each deployment its own sign-in client. samebase.com reads the Alchemy state and shows what is deployed." width="100%">
</picture>

I'm Nicu. I like building stuff, from static pages to distributed systems. With coding agents,
building got fast. Keeping track did not: where each app is deployed, how, and whether it is up to
date. Samebase is how I keep track of mine.

## Start an app

[samebase/base](https://github.com/samebase/base) is the starter. Add one secret and push: Alchemy
deploys a Convex app with Google sign-in and a preview for each pull request. It needs no Samebase
account. At [samebase.com](https://samebase.com), New App does the same steps for you.

## The parts

| Package                                                                                                                                                                                                                                                                                                                               | What it is                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`samebase/base`](https://github.com/samebase/base)                                                                                                                                                                                                                                                                                   | The starter: a Convex app that deploys with Alchemy, with Google sign-in and a preview for each pull request.                                                                                                |
| [`@samebase/identity-broker`](packages/identity-broker) [![Convex Component](https://www.convex.dev/components/badge/samebase/identity-broker)](https://www.convex.dev/components/samebase/identity-broker) [![npm](https://img.shields.io/npm/v/@samebase/identity-broker)](https://www.npmjs.com/package/@samebase/identity-broker) | An OpenID Provider on Convex. One Google and GitHub registration signs users in to every app, preview, and dev checkout. Run one from the [identity-hub template](https://github.com/samebase/identity-hub). |
| [`@samebase/alchemy-convex`](packages/alchemy-convex) [![npm](https://img.shields.io/npm/v/@samebase/alchemy-convex)](https://www.npmjs.com/package/@samebase/alchemy-convex)                                                                                                                                                         | Convex for Alchemy v2: projects, deployments, environment variables, the push, state in your own Convex team, and the `IdentityHub.Client` resource.                                                         |
| [`@samebase/alchemy-kit`](packages/alchemy-kit) [![npm](https://img.shields.io/npm/v/@samebase/alchemy-kit)](https://www.npmjs.com/package/@samebase/alchemy-kit)                                                                                                                                                                     | Parts for Alchemy v2. The first is `github-state`: state on a branch of your GitHub repository, with sealed secrets.                                                                                         |
| [`@samebase/sidebars`](packages/sidebars) [![npm](https://img.shields.io/npm/v/@samebase/sidebars)](https://www.npmjs.com/package/@samebase/sidebars)                                                                                                                                                                                 | The unstyled React sidebar layout of samebase.com: left and right panes, resizing, and mobile scroll snapping.                                                                                               |
| [`samebase/plugin`](packages/plugin)                                                                                                                                                                                                                                                                                                  | The agent plugin, exported to [samebase/plugin](https://github.com/samebase/plugin). Its actions are the [MCP action catalog](https://samebase.com/llms.txt).                                                |
| [`samebase/identity-hub`](https://github.com/samebase/identity-hub)                                                                                                                                                                                                                                                                   | Your own sign-in hub on Convex: identity-broker plus settings. The public hub is id.samebase.com.                                                                                                            |
| [`apps/identity-hub`](apps/identity-hub)                                                                                                                                                                                                                                                                                              | samebase.com's own hub at `auth.samebase.com`. The public hub, `id.samebase.com`, runs the [template](https://github.com/samebase/identity-hub) unchanged.                                                   |
| [`@samebase/convex-hosting`](https://github.com/samebase/convex-hosting) [![npm](https://img.shields.io/npm/v/@samebase/convex-hosting)](https://www.npmjs.com/package/@samebase/convex-hosting)                                                                                                                                      | Hosts a web app on Convex: static files and server-rendered TanStack Start pages, from the deployment that runs the backend.                                                                                 |

## The dashboard

[`apps/samebase`](apps/samebase) is the dashboard, the MCP server, the provider integrations, and
the Convex backend. TypeScript, React, TanStack Start, Convex, Tailwind CSS, Base UI, and shadcn/ui.
Vite+ runs the build, lint, format, and test tasks in a pnpm workspace.

What it does:

- Connects GitHub repositories and shows each one's Alchemy stacks, from state kept in a Convex
  project, in Cloudflare, or on a branch of the repository. A monorepo's stacks are grouped by path.
- Shows production URLs, deployed commits, checks, and the preview of each pull request.
- Creates a GitHub repository from the starter. Its first push deploys it, with Google sign-in
  through the identity hub.

Your apps run in your own GitHub, Convex, and Cloudflare accounts, and deleting your Samebase
account does not stop them. Repair lives in the repository: the GitHub Actions log, Alchemy, and
your agent. Samebase has no built-in AI chat.

Also here: [`packages/git-editor`](packages/git-editor) (the file editor),
[`packages/sure`](packages/sure) and [`packages/dependent`](packages/dependent) (validation and
TypeScript utilities), [`apps/remotion-studio`](apps/remotion-studio) and
[`apps/identity-broker-explainer`](apps/identity-broker-explainer) (video and animation sources),
and [specs](specs), [docs](docs), [research](research), and [archive](archive).

## Work on the source

Read [Contributing](CONTRIBUTING.md) for the toolchain and checks. Running the full service needs
maintainer configuration; a fresh clone is not yet a self-hosting setup. The
[development runbook](docs/samebase-development.md) covers local setup, deployment, and sign-in, and
[repository exports](docs/repository-exports.md) how packages and templates reach their public
repositories.

Bugs and feature requests: [GitHub Issues](https://github.com/samebase/samebase/issues). Private
vulnerability reports: [SECURITY.md](SECURITY.md).

## License

The Samebase app is [FSL-1.1-ALv2](LICENSE): any use except a competing commercial service, and each
version becomes Apache-2.0 two years after its release. The packages and templates above are
Apache-2.0 or MIT. The video workbench and its recordings are all rights reserved. See
[LICENSING.md](LICENSING.md) for the folder-by-folder terms.
