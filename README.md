# Samebase

Samebase sets up and manages web apps in your GitHub, Convex, and Cloudflare accounts. Coding agents
use its MCP server to create apps, connect repositories, inspect deployments, and repair provider
setup. The dashboard gives you one place to see those apps and their resources.

Your code and infrastructure stay in your provider accounts. Deleting your Samebase account does not
stop your apps.

## Use Samebase

- Open [samebase.com](https://samebase.com) for the dashboard.
- Install the [agent plugin](https://github.com/samebase/plugin) for Codex or Claude Code.
- Read the [MCP action catalog](https://samebase.com/llms.txt) for the available agent operations.
- Start without a Samebase account with the [base template](https://github.com/samebase/base) and
  the [manual setup guide](https://samebase.com/docs/do-it-yourself).

## What it does

- Creates a GitHub repository from a starter and sets up Convex and Cloudflare resources.
- Connects existing repositories. They can stay GitHub-only or attach provider resources later.
- Shows production URLs, builds, pull requests, checks, and attached Convex deployments.
- Groups a monorepo's Workers and Convex projects by their repository paths.
- Provides explicit actions to fix provider setup, configure builds, rotate deploy keys, and detach
  resources.

Agents edit source in the app's GitHub repository with their own coding tools. Samebase has no
built-in AI chat. The repository also contains a collaborative file editor, currently restricted to
staff in the hosted service.

## This repository

This is the source of the Samebase service, its workspace packages, and its app templates.

| Path                                                                                                              | Contents                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [apps/samebase](apps/samebase)                                                                                    | Dashboard, MCP server, provider integrations, and Convex backend                |
| [packages/plugin](packages/plugin)                                                                                | Agent plugin, exported to [samebase/plugin](https://github.com/samebase/plugin) |
| [packages/git-editor](packages/git-editor)                                                                        | Git file editing and collaboration components                                   |
| [packages/sidebars](packages/sidebars)                                                                            | Sidebar layout components                                                       |
| [packages/sure](packages/sure) and [packages/dependent](packages/dependent)                                       | Validation and shared TypeScript utilities                                      |
| [templates/base](templates/base)                                                                                  | App starter, exported to [samebase/base](https://github.com/samebase/base)      |
| [templates/base-actions](templates/base-actions)                                                                  | Starter with GitHub Actions deployment                                          |
| [apps/sidebars-example](apps/sidebars-example)                                                                    | Sidebar example app                                                             |
| [apps/remotion-studio](apps/remotion-studio)                                                                      | Video workbench and source recordings, separately licensed                      |
| [apps/identity-broker-explainer](apps/identity-broker-explainer)                                                  | Source of the animation in the identity-broker README                           |
| [packages/logo-model](packages/logo-model) and [packages/onboarding-video-tools](packages/onboarding-video-tools) | Logo geometry and video tooling                                                 |
| [apps/workspace-layout-v2-solid](apps/workspace-layout-v2-solid)                                                  | Sidebar layout prototype                                                        |
| [specs](specs), [docs](docs), [research](research), and [archive](archive)                                        | Current contracts, runbooks, investigations, and historical material            |

The service uses TypeScript, React, TanStack Start, Convex, Tailwind CSS, Base UI, and shadcn/ui.
Vite+ runs the build, lint, format, and test tasks in a pnpm workspace. The Samebase service is
served through [convex-hosting](https://github.com/samebase/convex-hosting). Apps created from the
base template use Cloudflare Workers with a Convex backend.

## Work on the source

Read [Contributing](CONTRIBUTING.md) for the toolchain, checks, and current setup limits. Running
the full Samebase service currently requires maintainer configuration. A fresh clone is not yet a
complete self-hosting setup.

The [development runbook](docs/samebase-development.md) covers the maintainer's local setup,
deployment, and sign-in configuration. See [repository exports](docs/repository-exports.md) for how
packages and templates reach their public repositories.

## Support and security

Use [GitHub Issues](https://github.com/samebase/samebase/issues) for bugs and feature requests.
Follow [SECURITY.md](SECURITY.md) for private vulnerability reports.

## License

The Samebase app is [AGPL-3.0-only](LICENSE). Packages and templates have their own licenses,
including Apache-2.0 and MIT. The video workbench and its recordings are all rights reserved. See
[LICENSING.md](LICENSING.md) for the folder-by-folder terms.
