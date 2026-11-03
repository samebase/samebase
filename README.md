# Samebase

Samebase starts web apps and shows what they deployed. A new app is a GitHub repository whose GitHub
Actions deploy it with [Alchemy](https://alchemy.run) to a Convex project in your team. Samebase
reads the Alchemy state and shows each app's URL, deployed commit, checks, and pull request
previews. Coding agents use its MCP server to create, connect, and read apps.

Your code and infrastructure stay in your own accounts. Deleting your Samebase account does not stop
your apps.

## Use Samebase

- Open [samebase.com](https://samebase.com) for the dashboard.
- Install the [agent plugin](https://github.com/samebase/plugin) for Codex or Claude Code.
- Read the [MCP action catalog](https://samebase.com/llms.txt) for the available agent operations.
- Start without a Samebase account with the [base template](https://github.com/samebase/base) and
  the [manual setup guide](https://samebase.com/docs/do-it-yourself).

## What it does

- Creates a GitHub repository from the starter. Its first push deploys it, with Google sign-in
  through the identity hub.
- Connects existing repositories. A repository whose Alchemy stack keeps its state in the team's
  Convex store shows that stack.
- Shows production URLs, deployed commits, checks, and the preview of each pull request.
- Groups a monorepo's stacks by their repository paths.

Repair lives in the repository: the GitHub Actions log, Alchemy, and your agent.

Agents edit source in the app's GitHub repository with their own coding tools. Samebase has no
built-in AI chat. The repository also contains a collaborative file editor, currently restricted to
staff in the hosted service.

## This repository

This is the source of the Samebase service, its workspace packages, and its app starter.

| Path                                                                                                              | Contents                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [apps/samebase](apps/samebase)                                                                                    | Dashboard, MCP server, provider integrations, and Convex backend                             |
| [packages/plugin](packages/plugin)                                                                                | Agent plugin, exported to [samebase/plugin](https://github.com/samebase/plugin)              |
| [packages/git-editor](packages/git-editor)                                                                        | Git file editing and collaboration components                                                |
| [packages/sidebars](packages/sidebars)                                                                            | Sidebar layout components                                                                    |
| [packages/sure](packages/sure) and [packages/dependent](packages/dependent)                                       | Validation and shared TypeScript utilities                                                   |
| [templates/base](templates/base)                                                                                  | Convex-hosted Alchemy starter, exported to [samebase/base](https://github.com/samebase/base) |
| [apps/sidebars-example](apps/sidebars-example)                                                                    | Sidebar example app                                                                          |
| [apps/remotion-studio](apps/remotion-studio)                                                                      | Video workbench and source recordings, separately licensed                                   |
| [apps/identity-broker-explainer](apps/identity-broker-explainer)                                                  | Source of the animation in the identity-broker README                                        |
| [packages/logo-model](packages/logo-model) and [packages/onboarding-video-tools](packages/onboarding-video-tools) | Logo geometry and video tooling                                                              |
| [apps/workspace-layout-v2-solid](apps/workspace-layout-v2-solid)                                                  | Sidebar layout prototype                                                                     |
| [specs](specs), [docs](docs), [research](research), and [archive](archive)                                        | Current contracts, runbooks, investigations, and historical material                         |

The service uses TypeScript, React, TanStack Start, Convex, Tailwind CSS, Base UI, and shadcn/ui.
Vite+ runs the build, lint, format, and test tasks in a pnpm workspace. The Samebase service is
served through [convex-hosting](https://github.com/samebase/convex-hosting), and so are apps created
from the base template.

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
