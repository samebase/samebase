# Contributing to Samebase

Use [GitHub Issues](https://github.com/samebase/samebase/issues) to report a bug or discuss a
change. Include what you tried, what happened, and how to reproduce it. Send vulnerabilities
privately through [SECURITY.md](SECURITY.md).

## Install the toolchain

Use Node.js 24.20.0 or later in the Node 24 release line, Git, and pnpm 12.14.0. The root
`package.json` records the minimum runtime and pins pnpm. `.nvmrc` selects Node 24.

Clone the repository and install the pinned dependencies:

```bash
git clone https://github.com/samebase/samebase.git
cd samebase
pnpm install --frozen-lockfile
```

Vite+ is a workspace dependency. Use `pnpm exec vp` for its commands after installation. Git LFS is
needed only to work with the source recordings. The repository's `.lfsconfig` excludes those
recordings from a normal clone.

## Choose what to work on

Package and documentation changes do not require a Samebase production account. For example, the
shared utilities have their own check:

```bash
pnpm --filter @samebase/dependent check
```

Read a package's own README and `package.json` for its checks. The app starters in `templates/` are
independent workspaces with their own lockfiles and setup instructions.

The full service does not yet have an independent contributor setup:

- Primary-checkout startup registers sign-in with the maintainer's Convex team and identity hub.
- Linked-worktree startup expects a configured primary checkout and development GitHub App
  credentials.
- The commit hook runs the app typecheck, so it also expects the app's generated build modules from
  a configured development setup.

Do not copy production credentials to make a fork work. Discuss a full-service change with a
maintainer first. The [development runbook](docs/samebase-development.md) documents the existing
setup. For a standalone app, use [templates/base](templates/base/README.md).

## Prepare a pull request

Read [AGENTS.md](AGENTS.md) and the [test policy](.agents/skills/samebase-test-policy/SKILL.md).
Keep a change focused and explain the resulting behavior in the pull request. Include the checks you
ran and any setup that you could not complete.

Format changed files with Vite+, for example:

```bash
pnpm exec vp fmt README.md
```

Run the affected package or app checks. Do not run the full browser suite for a documentation
change. Convex-generated client files are committed because fresh preview builds need them before
the deployment's code-generation step completes.

Some files are generated. Change their source, then run the owning command:

- MCP action pages, `apps/samebase/public/llms.txt`, and `chatgpt-app-submission.json`:
  `pnpm --filter samebase run generate:action-docs`.
- Starter seed manifests: `pnpm run template:export`.
- Exported repositories: edit the source folder here. See
  [repository exports](docs/repository-exports.md).

Pull requests from forks do not receive a hosted preview from this repository's deployment workflow.
Maintainer deployment credentials must remain unavailable to fork code.
