# AGENTS.md

This file provides guidance to AI agents (Claude Code, Cursor, etc.) when working with this repository.

## Project Structure

noter is a Turborepo monorepo (PNPM + Node 24) with a single app:

- **`apps/noter`**: React + Vite + Convex collaborative code editor with GitHub integration
- Uses `@prosemark/core` from npm for markdown editing

## Development Commands

```bash
# From root
pnpm install          # Install dependencies
pnpm dev              # Start development

# From apps/noter
npm run dev           # Runs both frontend (Vite) and backend (Convex) in parallel
npm run dev:frontend  # Vite dev server only
npm run dev:backend   # Convex dev server only
npm run build         # TypeScript compile + Vite build
npm run lint          # TypeScript + ESLint check
```

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
- `fileStaging`: Real-time collaborative file editing state
- `collaborativeUpdates`: Operational transformation for conflict resolution
- `folderExpansionState`: UI state for file tree per user/vault

**Core Components**:

- `VaultDashboard`: Main dashboard showing connected repositories
- `AddRepository`: GitHub repository connection flow
- `RepositoryReadme`: File browser + collaborative editor view
- `CodeEditor`: CodeMirror-based editor with real-time collaboration
- `FileTree`: Repository file browser with expansion state

## Code Style

- **Strict type safety** - never use `any` or type assertions (`as`)
- **When typing is too hard** - prefer `@ts-expect-error` over `as` or `any`
- **Let TypeScript infer** - don't over-annotate when inference works
- **Infer from schemas** - when a Zod/validator schema exists, derive the TypeScript type from it (`z.infer`/`Infer`) instead of duplicating manual types
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

### Local Operator Preferences

- For this repository, when running CLI commands in Codex, prefer requesting the user's shell/escalated execution rather than sandboxed execution.

### MVP Infra Credentials (Current)

- For MVP testing, the same `NETLIFY_ACCESS_TOKEN` is used for both Convex dev and prod deployments.
- For MVP testing, the same `CONVEX_MANAGEMENT_TOKEN` and `CONVEX_TEAM_ID` are used for both Convex dev and prod deployments.
- This is intentional for speed during MVP and can be split by environment later.
