# Samebase

Web apps on Convex, deployed by Alchemy, in your own accounts. This repository is the dashboard at
[samebase.com](https://samebase.com) and the packages under it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/samebase/.github/main/profile/map-dark.svg">
  <img src="https://raw.githubusercontent.com/samebase/.github/main/profile/map-light.svg" alt="A push to your GitHub repository runs Alchemy in GitHub Actions. Alchemy deploys to your Convex team: production and one preview per pull request, each serving the backend and the site. The identity hub gives each deployment its own sign-in client. samebase.com reads the Alchemy state and shows what is deployed." width="100%">
</picture>

A Samebase app is a GitHub repository whose Actions deploy it with [Alchemy](https://alchemy.run) to
a Convex project in your team. Samebase reads the Alchemy state and shows each app's URL, deployed
commit, checks, and pull request previews. Your code and infrastructure stay in your accounts.
Deleting your Samebase account does not stop your apps.

- **[samebase.com](https://samebase.com)**: the dashboard. Create an app or connect a repository.
- **[samebase/base](https://github.com/samebase/base)**: the starter. One secret, one push, Google
  sign-in included, no Samebase account needed.
- **[Agent plugin](https://github.com/samebase/plugin)** for Codex and Claude Code, and the
  [MCP action catalog](https://samebase.com/llms.txt). Agents create, connect, and read apps; they
  edit code with their own tools.

## Open source from this repository

| Package                                                                                                                                                                                                                                                                                                                               | What it is                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@samebase/identity-broker`](packages/identity-broker) [![Convex Component](https://www.convex.dev/components/badge/samebase/identity-broker)](https://www.convex.dev/components/samebase/identity-broker) [![npm](https://img.shields.io/npm/v/@samebase/identity-broker)](https://www.npmjs.com/package/@samebase/identity-broker) | An OpenID Provider on Convex. One Google and GitHub registration signs users in to every app, preview, and dev checkout. Run one from the [identity-hub template](https://github.com/samebase/identity-hub). |
| [`@samebase/alchemy-convex`](packages/alchemy-convex) [![npm](https://img.shields.io/npm/v/@samebase/alchemy-convex)](https://www.npmjs.com/package/@samebase/alchemy-convex)                                                                                                                                                         | Convex for Alchemy v2: projects, deployments, environment variables, the push, state in your own Convex team, and the `IdentityHub.Client` resource.                                                         |
| [`samebase/plugin`](packages/plugin)                                                                                                                                                                                                                                                                                                  | The agent plugin, exported to [samebase/plugin](https://github.com/samebase/plugin).                                                                                                                         |
| [`apps/identity-hub`](apps/identity-hub)                                                                                                                                                                                                                                                                                              | samebase.com's own hub at `auth.samebase.com`. The public hub, `id.samebase.com`, runs the [template](https://github.com/samebase/identity-hub) unchanged.                                                   |

Related repositories: [convex-hosting](https://github.com/samebase/convex-hosting) serves an app's
files from its Convex deployment; samebase.com and every app from the starter use it.

## The service

[`apps/samebase`](apps/samebase) is the dashboard, the MCP server, the provider integrations, and
the Convex backend. TypeScript, React, TanStack Start, Convex, Tailwind CSS, Base UI, and shadcn/ui.
Vite+ runs the build, lint, format, and test tasks in a pnpm workspace.

What it does:

- Creates a GitHub repository from the starter. Its first push deploys it, with Google sign-in
  through the identity hub.
- Connects existing repositories. A repository whose Alchemy stack keeps its state in the team's
  Convex store shows that stack, including a monorepo's stacks grouped by path.
- Shows production URLs, deployed commits, checks, and the preview of each pull request.

Repair lives in the repository: the GitHub Actions log, Alchemy, and your agent. Samebase has no
built-in AI chat.

Also here: [`packages/git-editor`](packages/git-editor) and [`packages/sidebars`](packages/sidebars)
(editor and layout components), [`packages/sure`](packages/sure) and
[`packages/dependent`](packages/dependent) (validation and TypeScript utilities),
[`apps/remotion-studio`](apps/remotion-studio) and
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
