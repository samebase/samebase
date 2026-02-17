# AGENTS.md

This file provides guidance to AI agents (Claude Code, Cursor, etc.) when working with this repository.

## Project Structure

noter is a Turborepo monorepo (PNPM + Node 24) with two apps:

- **`apps/noter`**: React + Vite + Convex collaborative code editor with GitHub integration
- **`apps/noter-starter-template`**: canonical seeded starter snapshots used by `vaultActions.createRepository`
- Uses `@prosemark/core` from npm for markdown editing

## Session Bootstrap (Read Order)

When starting a fresh chat for implementation/debugging, read in this order:

1. `AGENTS.md` (this file)
2. `README.md` (product/dev overview)
3. `apps/noter-starter-template/AGENTS.md` + `apps/noter-starter-template/scripts/export-template-manifest.mjs` (starter regeneration contract + manifest export)
4. `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md` (vault infra lifecycle)
5. `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md` (approval-first prod reads)
6. `specs/001_CODESPACE_CONNECTION_SPEC.md` (codespace architecture)
7. `apps/noter/convex/schema.ts` (source of truth for data model)
8. `apps/noter/convex/vaultActions.ts` + `apps/noter/convex/infraProvisioning.ts` (vault creation + infra provisioning)
9. `apps/noter/convex/chat.ts` + `apps/noter/convex/chatActions.ts` (chat + approval flows)
10. `apps/noter/src/components/VaultDashboard.tsx` + `apps/noter/src/components/ChatFab.tsx` (user-visible controls)

Low-signal/historical docs (do not treat as source of truth):
- `LUMINA_PROJECT_ANALYSIS.md`
- `apps/noter/src/components/Untitled-1.md`

## Development Commands

```bash
# From root
pnpm install          # Install dependencies
pnpm dev              # Start noter app development
pnpm dev:starter      # Run starter template app explicitly
pnpm build:starter    # Build starter template app explicitly
pnpm lint:starter     # Lint starter template app explicitly

# From apps/noter
npm run dev           # Runs both frontend (Vite) and backend (Convex) in parallel
npm run dev:frontend  # Vite dev server only
npm run dev:backend   # Convex dev server only
npm run build         # TypeScript compile + Vite build
npm run lint          # TypeScript + ESLint check
```

### Local Environment Notes

- `rg` (ripgrep) is not available in this environment. Use `grep`/`find` instead.

### Convex CLI

Access Convex database, logs, and admin operations using the CLI (from `apps/noter` directory):

```bash
# View real-time logs from production deployment
npx convex logs --prod --history 50

# View development deployment logs
npx convex logs

# View a bounded log snapshot (Convex logs stream forever, so auto-stop after 3s)
{ npx convex logs --history 200 & pid=$!; sleep 3; kill -INT "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; } | sed -n '1,200p'

# Open Convex dashboard in browser
npx convex dashboard

# Inspect deployment env/config quickly
npx convex env list
```

Use these commands to debug issues in Convex functions, check production logs, or inspect database state. This is the primary way to diagnose runtime errors and function failures.

## Architecture

- **Frontend**: React 18 + React Router + Vite
- **Backend**: Convex (real-time database + serverless functions)
- **Auth**: Convex Auth with GitHub OAuth integration
- **Editor**: CodeMirror 6 with collaborative editing via Convex
- **UI**: Tailwind CSS + Radix UI components + shadcn/ui patterns
- **State**: Convex real-time queries + TanStack Query

**Key Data Models** (Convex schema):

- `users`: GitHub-authenticated users with access tokens
- `vaults`: Connected GitHub repositories per user
- `vaultInfrastructure`: per-vault Convex/Netlify provisioning metadata
- `vaultDomains`: branch/domain mappings per vault
- `fileStaging`: Real-time collaborative file editing state
- `collaborativeUpdates`: Operational transformation for conflict resolution
- `folderExpansionState`: UI state for file tree per user/vault
- `aiProdAccessRequests`: approval-first production read requests
- `aiProdAccessAudit`: immutable audit trail for prod-read request lifecycle

**Core Components**:

- `VaultDashboard`: Main dashboard showing connected repositories
- `AddRepository`: GitHub repository connection flow
- `RepositoryReadme`: File browser + collaborative editor view
- `CodeEditor`: CodeMirror-based editor with real-time collaboration
- `FileTree`: Repository file browser with expansion state
- `ChatFab`: persisted chat UI with commit/prod-read approval cards

## Current Capability Snapshot (2026-02-13)

- New vaults created via `vaultActions.createRepository` are `isNoterManaged: true`, seed a runnable starter repo in one commit, and auto-schedule infra provisioning (`infraProvisioning.provisionVaultInfrastructure`).
- Existing repos connected via `vaultActions.connectRepository` remain `isNoterManaged: false` and do **not** auto-provision infra.
- Infrastructure retry is available from `vaultActions.retryInfrastructureProvisioning` and dashboard UI.
- AI production reads are approval-first (proposal card -> explicit approve/reject -> audited execution).
- Seed source of truth lives in `apps/noter-starter-template` root template files and exports to `apps/noter/convex/starterSeedManifest.generated.ts`.

## Code Style

- **Strict type safety** - never use `any` or type assertions (`as`)
- **When typing is too hard** - prefer `@ts-expect-error` over `as` or `any`
- **Never use `@ts-nocheck`** - if a type suppression is unavoidable, use the narrowest possible `@ts-expect-error`
- **Let TypeScript infer** - don't over-annotate when inference works
- **Infer from schemas** - when a Zod/validator schema exists, derive the TypeScript type from it (`z.infer`/`Infer`) instead of duplicating manual types
- **Convex validator style** - in Convex modules, define result validators before handlers, derive TS types via `Infer<typeof ...>`, and avoid `v.<fn>()` call sites by destructuring validator builders once (e.g. `const { object, string, union } = v`)
- **Runtime directives** - avoid `"use node"` unless it is truly necessary; prefer runtime-agnostic modules that can run in both node and non-node environments

## UI/UX Guidelines

- **Avoid unnecessary loading states** - prefer `null`/empty arrays over "Loading..." text
- **No "No items found" placeholders** - let empty state speak for itself
- **Only show loading for operations >500ms** or when user expects feedback
- **Prefer silent, smooth UX** over chatty, jumpy interfaces
- **Prefer existing shadcn/ui components** over custom Tailwind-only solutions when available
- **Async destructive actions** - disable the trigger while pending and show a spinner/label (e.g. "Removing...") to prevent double-submit

## shadcn/ui Component Rules

- **Do not manually edit generated shadcn/ui files** in `apps/noter/src/components/ui/*` unless the user gives an explicit exceptional instruction for that exact change
- **Always use the shadcn CLI via `npx`** for component updates/additions (from `apps/noter`, e.g. `npx shadcn@latest add <component>`)
- **If manual edits are explicitly requested**, keep them minimal and call out that they diverge from generated output

### TODO
- **Better mobile keyboard handling** - improve window size handling when virtual keyboard appears on mobile devices

## Technology Stack

- **Runtime**: Node 24, PNPM 9, Turborepo
- **Frontend**: React 18, TypeScript, Vite, React Router 7
- **Backend**: Convex (real-time database + serverless functions)
- **Editor**: CodeMirror 6 + `@prosemark/core` (npm)
- **Auth**: Convex Auth + GitHub OAuth
- **UI**: Tailwind CSS + Radix UI + shadcn/ui
- **State**: Convex real-time subscriptions + TanStack Query

---

## Workflow Shortcuts

Shorthand commands for git/GitHub workflows. When the user says these, execute them directly using CLI tools.

| Command     | Action                                                          |
| ----------- | --------------------------------------------------------------- |
| `commit`    | Stage all changes, commit with concise message                  |
| `push`      | Commit if needed, push to remote                                |
| `create pr` | Push if needed, `gh pr create --draft --fill`                   |
| `ready`     | Mark draft PR as ready: `gh pr ready`                           |
| `wait`      | Monitor CI with `gh pr checks` or `gh run watch`, report status |
| `ship`      | Full flow: commit → push → create PR → ready → wait             |
| `status`    | Show branch, uncommitted changes, PR state                      |

### Rules

- Always use CLI tools (`gh`, `git`) - never tell user to click UI buttons
- Execute, don't instruct
- Adapt to context (if PR exists, update it; if already ready, skip)
- Update PR description with `gh pr edit --body` when commits change scope
- On CI failure, report the error and offer to fix
- **NEVER merge a PR until CI is green** - always wait for checks to pass, then squash-merge with `gh pr merge --squash`
- **NEVER merge a PR until CI is green** - always wait for checks to pass.
- Preferred merge style for this repo: rebase the branch onto `main`, then merge with a merge commit (`gh pr merge --merge`) so PR boundaries remain visible while preserving internal commits.

## Worktree Branching

- If HEAD is detached, create a branch with the `codex/` prefix (example: `git switch -c codex/auto-20260217-103000`).
- To rename the current branch: `git branch -m codex/new-name`.
- If the branch was pushed already, push the new name and delete the old remote: `git push -u origin codex/new-name` then `git push origin --delete codex/old-name`.
- If you are detached and want a specific name, use `git switch -c codex/<name>`.

## Daytona Refresh (Local CLI)

When you need to refresh a Daytona sandbox repo to the latest branch tip using local GitHub auth, use the repo script:

```bash
pnpm daytona:refresh <sandbox-id-or-name> [branch] [repo-dir]
```

Defaults:
- `branch`: `main`
- `repo-dir`: `/home/daytona/workspace/noter`

Auth:
- Uses `GITHUB_TOKEN` if set, otherwise falls back to `gh auth token`.

### Local Operator Preferences

- For this repository, when running CLI commands in Codex, prefer requesting the user's shell/escalated execution rather than sandboxed execution.
- When the user says "remember this" (or equivalent), persist that preference in durable project memory (for example `AGENTS.md`) instead of keeping it only in chat context.
- Avoid adding unusual options or flags unless there is a clear, stated reason for them.
- Prefer breadth-first, simplest-viable fixes before deeper changes; stop once a minimal solution works.
- When using the local worktree helper, prefer `wt <branch>` to print a worktree path and `cd (wt <branch>)` to change directories in fish.
- For rebase/fast-forward without switching directories, use `git -C (wt <branch>) rebase main` then `git -C (wt main) merge --ff-only <branch>`.
- Deferred workflow experiment: optionally try a temporary `next_main` branch, cherry-pick changes, and merge PRs with merge commits. Treat this as opt-in per request (not default).
- When the simpleView fixture test fails due to new `.md` files, update the fixture to include those `.md` files.
- Do not bypass pre-commit hooks by default when lint/tests are failing; only do so on explicit user request.

### Worktree Protocol (Local)

- Create worktrees via Codex (running `git worktree add`) on explicit user request; do not add Makefile or script helpers for worktree creation.
- Treat the current worktree root from `git rev-parse --show-toplevel` as the workspace boundary; do not read/write outside it without an explicit request.
- Before running dev/test/commit, confirm the worktree + branch with `git worktree list --porcelain` and `git rev-parse --abbrev-ref HEAD`.
- Use `pnpm dev` from the current worktree root unless the user explicitly asks for a different entrypoint.
- Keep changes isolated per worktree (one idea per worktree) and avoid mixing branches in a single worktree.
- Use `noter.md` frontmatter `worktrees` settings as the canonical, user-visible worktree config.
- If a task requires touching multiple worktrees, ask before proceeding.
- Worktree location convention: keep main at `<repo>` (e.g., `~/dev/noter`) and use `<repo>-<suffix>` for worktrees (e.g., `~/dev/noter-idea-1`). Treat the first `-` as the delimiter.

### MVP Infra Credentials (Current)

- For MVP testing, the same `NETLIFY_ACCESS_TOKEN` is used for both Convex dev and prod deployments.
- For MVP testing, the same `CONVEX_MANAGEMENT_TOKEN` and `CONVEX_TEAM_ID` are used for both Convex dev and prod deployments.
- This is intentional for speed during MVP and can be split by environment later.

## Operational Note (Codex Auth)

- Enable device code authorization for Codex when running in headless or remote environments where the normal browser flow isn’t available.
- Exercise caution in enabling device code auth, as device codes can be phished.
- Never share a device code.

## Reference Links

### TypeScript in JupyterLab
- [Jupyter kernels overview](https://docs.jupyter.org/en/stable/projects/kernels.html)
- [tslab (TypeScript kernel)](https://github.com/yunabe/tslab)
- [tslab examples: getting started notebook](https://github.com/yunabe/tslab-examples/blob/master/notebooks/getting_started.ipynb)
- [tslab examples: TensorFlow.js notebook](https://github.com/yunabe/tslab-examples/blob/master/notebooks/tensorflow.ipynb)
- [Deno Jupyter kernel docs](https://docs.deno.com/runtime/reference/cli/jupyter/)
- [Deno Jupyter output API](https://docs.deno.com/api/deno/~/Deno.jupyter.md)
- [Community list of Jupyter kernels](https://github.com/jupyter/jupyter/wiki/Jupyter-kernels)
