# AGENTS.md

This file provides guidance to AI agents (Claude Code, Cursor, etc.) when
working with this repository.

## Project Structure

noter is a Turborepo monorepo (PNPM + Node 24) with two apps:

- **`apps/noter`**: React + Vite + Convex collaborative code editor with GitHub
  integration
- **`apps/noter-starter-template`**: canonical seeded starter snapshots used by
  `vaultActions.createRepository`
- Uses `@prosemark/core` from npm for markdown editing

## Session Bootstrap (Read Order)

When starting a fresh chat for implementation/debugging, read in this order:

1. `AGENTS.md` (this file)
2. `README.md` (product/dev overview)
3. `apps/noter-starter-template/AGENTS.md` +
   `apps/noter-starter-template/scripts/export-template-manifest.mjs` (starter
   regeneration contract + manifest export)
4. `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md` (vault infra lifecycle)
5. `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md` (approval-first prod reads)
6. `specs/001_CODESPACE_CONNECTION_SPEC.md` (codespace architecture)
7. `apps/noter/convex/schema.ts` (source of truth for data model)
8. `apps/noter/convex/vaultActions.ts` +
   `apps/noter/convex/infraProvisioning.ts` (vault creation + infra
   provisioning)
9. `apps/noter/convex/chat/index.ts` + `apps/noter/convex/chat/actions.ts`
   (chat + approval flows)
10. `apps/noter/src/components/VaultDashboard.tsx` +
    `apps/noter/src/components/ChatFab.tsx` (user-visible controls)

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

# Worktree bootstrap (required in git worktrees)
make anon             # Full startup in worktrees (Convex + frontend with anon wiring)
make anon-once        # One-shot bootstrap for lint/codegen/hook commands in worktrees
```

### Local Environment Notes

- `rg` (ripgrep) is not available in this environment. Use `grep`/`find`
  instead.
- If Convex tooling complains about missing `CONVEX_DEPLOYMENT` (for lint or
  codegen), run `make anon` to set up an anonymous deployment.
- In a git worktree, always start with `make anon` before dev/lint/test/commit
  workflows.
- In a git worktree, do not run `npx convex dev` directly for normal startup;
  `make anon` is the required entrypoint.
- For one-off setup in a git worktree, use `make anon-once`.

### Convex CLI

Access Convex database, logs, and admin operations using the CLI (from
`apps/noter` directory):

```bash
# View real-time logs from production deployment
npx convex logs --prod --history 50

# Worktree-safe prod logs (reuse env from main checkout when this worktree lacks .env.local)
npx convex logs --prod --env-file /Users/nicu/dev/my/noter/apps/noter/.env.local --history 50

# View development deployment logs
npx convex logs

# View a bounded log snapshot (Convex logs stream forever, so auto-stop after 3s)
{ npx convex logs --history 200 & pid=$!; sleep 3; kill -INT "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; } | sed -n '1,200p'

# Open Convex dashboard in browser
npx convex dashboard

# Inspect deployment env/config quickly
npx convex env list
```

Use these commands to debug issues in Convex functions, check production logs,
or inspect database state. This is the primary way to diagnose runtime errors
and function failures. `npx convex logs` does not support a `--project` flag;
use `--env-file` or an explicit deployment selector instead.

## Architecture

- **Frontend**: React 18 + React Router + Vite
- **Backend**: Convex (real-time database + serverless functions)
- **Auth**: Convex Auth app login (Google in prod, Google + password in dev)
  plus provider connection OAuth/API key flows
- **Editor**: CodeMirror 6 with collaborative editing via Convex
- **UI**: Tailwind CSS + Radix UI components + shadcn/ui patterns
- **State**: Convex real-time queries + TanStack Query

**Key Data Models** (Convex schema):

- `users`: app user profiles and allowlist/approval state
- `providerConnections`: provider credentials (`github`/`convex`/`netlify`) with
  `oauth` or `api_key` auth method
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

- New vaults created via `vaultActions.createRepository` are
  `isNoterManaged: true`, seed a runnable starter repo in one commit, and
  auto-schedule infra provisioning
  (`infraProvisioning.provisionVaultInfrastructure`).
- Existing repos connected via `vaultActions.connectRepository` remain
  `isNoterManaged: false` and do **not** auto-provision infra.
- Infrastructure retry is available from
  `vaultActions.retryInfrastructureProvisioning` and dashboard UI.
- AI production reads are approval-first (proposal card -> explicit
  approve/reject -> audited execution).
- Seed source of truth lives in `apps/noter-starter-template` root template
  files and exports to `apps/noter/convex/starterSeedManifest.generated.ts`.

## Code Style

- **Strict type safety** - never use `any` or type assertions (`as SomeType`)
- **`as const` is always allowed** - treat `as const` as fully acceptable and
  use it freely when it improves literal typing/inference
- **When typing is too hard** - prefer `@ts-expect-error` over `as SomeType` or
  `any`
- **Never use `@ts-nocheck`** - if a type suppression is unavoidable, use the
  narrowest possible `@ts-expect-error`
- **Let TypeScript infer** - don't over-annotate when inference works
- **Infer from schemas** - when a Zod/validator schema exists, derive the
  TypeScript type from it (`z.infer`/`Infer`) instead of duplicating manual
  types
- **Convex validator style** - in Convex modules, define result validators
  before handlers, derive TS types via `Infer<typeof ...>`, and avoid `v.<fn>()`
  call sites by destructuring validator builders once (e.g.
  `const { object, string, union } = v`)
- **Runtime directives** - avoid `"use node"` unless it is truly necessary;
  prefer runtime-agnostic modules that can run in both node and non-node
  environments

## UI/UX Guidelines

- **Avoid unnecessary loading states** - prefer `null`/empty arrays over
  "Loading..." text
- **No "No items found" placeholders** - let empty state speak for itself
- **Only show loading for operations >500ms** or when user expects feedback
- **Prefer silent, smooth UX** over chatty, jumpy interfaces
- **Prefer existing shadcn/ui components** over custom Tailwind-only solutions
  when available
- **Async destructive actions** - disable the trigger while pending and show a
  spinner/label (e.g. "Removing...") to prevent double-submit

## shadcn/ui Component Rules

- **Do not manually edit generated shadcn/ui files** in
  `apps/noter/src/components/ui/*` unless the user gives an explicit exceptional
  instruction for that exact change
- **Always use the shadcn CLI via `npx`** for component updates/additions (from
  `apps/noter`, e.g. `npx shadcn@latest add <component>`)
- **If manual edits are explicitly requested**, keep them minimal and call out
  that they diverge from generated output

### TODO

- **Better mobile keyboard handling** - improve window size handling when
  virtual keyboard appears on mobile devices

## Technology Stack

- **Runtime**: Node 24, PNPM 9, Turborepo
- **Frontend**: React 18, TypeScript, Vite, React Router 7
- **Backend**: Convex (real-time database + serverless functions)
- **Editor**: CodeMirror 6 + `@prosemark/core` (npm)
- **Auth**: Convex Auth (Google in prod, Google + password in dev) + provider
  OAuth/API key connection flows
- **UI**: Tailwind CSS + Radix UI + shadcn/ui
- **State**: Convex real-time subscriptions + TanStack Query

---

## Workflow Shortcuts

Shorthand commands for git/GitHub workflows. When the user says these, execute
them directly using CLI tools.

| Command        | Action                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `commit`       | Stage all changes, commit with concise message                                                         |
| `push`         | Commit if needed, push to remote                                                                       |
| `create pr`    | Push if needed, create PR, ensure a non-empty body, then mark ready                                    |
| `ready`        | Mark draft PR as ready: `gh pr ready`                                                                  |
| `wait`         | Monitor CI with `gh pr checks` or `gh run watch`, report status                                        |
| `ship`         | Full flow: commit → push → create PR → ready → fix Greptile+CodeRabbit feedback loops → wait           |
| `clean vaults` | Remove temporary Noter-managed vaults/resources created for the current worktree                       |
| `clean`        | After PR is shipped/merged: run `clean vaults`, then remove the current worktree and delete its branch |
| `status`       | Show branch, uncommitted changes, PR state                                                             |

### Rules

- Always use CLI tools (`gh`, `git`) - never tell user to click UI buttons
- Execute, don't instruct
- Adapt to context (if PR exists, update it; if already ready, skip)
- Before `commit`, verify the branch name is meaningful. If it's still an
  auto-generated random `codex/<word>-<word>-<word>` name, rename it to a
  descriptive `codex/<intent>` branch before committing.
- Before `create pr` or `ship`, verify the branch name is meaningful. If it's
  still an auto-generated random `codex/<word>-<word>-<word>` name, rename it to
  a descriptive `codex/<intent>` branch before pushing/creating the PR.
- Temporary Noter-managed repos created for Playwright/manual testing from a
  worktree must use the prefix `tmp-<worktree-id>-<intent>`. For Codex worktrees
  under `~/.codex/worktrees/<id>/...`, use that folder id as the worktree id.
  Example: `tmp-c507-chat-fab`.
- `clean vaults` must use the exact current worktree prefix `tmp-<worktree-id>-`
  to find candidate vaults. Only remove Noter-managed vaults matching that exact
  prefix.
- `clean vaults` must remove matching vaults through the existing Vault
  Dashboard delete flow so GitHub repos, Convex projects/deployments, hosting
  projects, Daytona resources, and Codespaces are torn down together. Leave the
  destructive cleanup checkboxes enabled by default for matching temporary
  vaults.
- `clean vaults` must fail closed: never guess based on recency, plain `tmp-`,
  or partial name matches, and never remove non-matching vaults.
- For `clean`, run it only after the PR is shipped/merged. Execute from CLI: run
  `clean vaults` first, then remove the current non-main worktree, delete its
  local branch, and delete its remote branch if it still exists. If vault
  cleanup cannot be verified safely, stop and report instead of guessing.
- When the user asks to "open a PR" (or `create pr`), always write a normal PR
  description (summary, key changes, validation). Never leave the PR body empty.
- When the user asks to "open a PR" (or `create pr`), mark it ready for review
  by default. Only keep it as draft if the user explicitly asks for draft.
- Update PR description with `gh pr edit --body` when commits change scope
- During `ship`, if Greptile reports actionable findings, fix them, push
  updates, and continue until Greptile and required CI checks are green.
- During `ship`, if Greptile is only pending (no actionable findings yet),
  continue waiting.
- Greptile can mark checks as pass while still leaving comments; always read
  Greptile review comments/threads and treat nitpicks as required fixes before
  merging.
- When the user asks to check Greptile, review both the check status and any
  comments/nitpicks (treat them as required fixes).
- During `ship`, always run CodeRabbit in a loop: after each push, request a
  fresh review with `@coderabbitai review`, wait for it to finish, fix all
  actionable findings, push, and repeat until the latest CodeRabbit pass reports
  no actionable findings.
- Do not merge while CodeRabbit is in progress; after each review request, wait
  for completion and re-check new comments before deciding merge readiness.
- Treat CodeRabbit actionable comments and nitpicks as required fixes during
  `ship`, same as Greptile findings.
- CodeRabbit UI/status rule: your `@coderabbitai review` comment is only a
  trigger. Read the first/top-level CodeRabbit summary comment for outcome;
  CodeRabbit updates that existing comment in place rather than reliably posting
  a new one. Also check the CodeRabbit status/check and validate findings
  against the latest commit SHA before fixing.
- On CI failure, report the error and offer to fix
- **NEVER merge a PR until CI is green** - always wait for checks to pass.
- Preferred merge style for this repo: rebase the branch onto `origin/main`
  (after a fresh `git fetch origin`) immediately before merge, then squash merge
  (`gh pr merge --squash`) by default.
- Use merge commits (`gh pr merge --merge`) only in specific cases where keeping
  the full intermediate commit history is explicitly desired.
- Highest-priority guardrail: always verify the branch is rebased on the latest
  `origin/main` before merging. If `origin/main` changes while a PR is open,
  rebase and push again before merge.

## Worktree Branching

- If HEAD is detached, use `./scripts/bootstrap-worktree.js` to auto-create a
  branch in the format `codex/<word>-<word>-<word>`.
- After an auto-created random branch, rename it to a meaningful `codex/<name>`
  branch as soon as intent is clear.
- To rename the current branch: `git branch -m codex/new-name`.
- If the branch was pushed already, push the new name and delete the old remote:
  `git push -u origin codex/new-name` then
  `git push origin --delete codex/old-name`.
- If you are detached and want a specific name, use
  `git switch -c codex/<name>`.

## Daytona Refresh (Local CLI)

When you need to refresh a Daytona sandbox repo to the latest branch tip using
local GitHub auth, use the repo script:

```bash
pnpm daytona:refresh <sandbox-id-or-name> [branch] [repo-dir]
```

Defaults:

- `branch`: `main`
- `repo-dir`: `/home/daytona/workspace/noter`

Auth:

- Uses `GITHUB_TOKEN` if set, otherwise falls back to `gh auth token`.

### Local Operator Preferences

- For this repository, when running CLI commands in Codex, prefer requesting the
  user's shell/escalated execution rather than sandboxed execution.
- When the user says "remember this" (or equivalent), persist that preference in
  durable project memory (for example `AGENTS.md`) instead of keeping it only in
  chat context.
- For this operator, keep responses concise by default and always include a
  final `Summary` section.
- For this operator, do not use Python as the first option for scripting or
  automation in Codex. Prefer plain shell commands first; if scripting is
  needed, prefer ECMAScript/Node because Node is guaranteed to be available.
- Format documents you write with Prettier by default so markdown/docs do not
  require manual cleanup.
- Default to persisting user-visible UI state in Convex (per-user settings) so
  it syncs across devices; avoid localStorage unless explicitly requested for
  per-device behavior.
- When sharing URLs (including localhost dev URLs), format them as Markdown
  links (for example `[http://localhost:5174/](http://localhost:5174/)`) so they
  are clickable in Codex.
- For boolean URL query params, prefer key-only flags (for example `?diff`)
  instead of assigning values (`?diff=1`); treat key presence as enabled.
- Runtime bootstrap rule: use `make anon` when operating from a git worktree,
  and use `make run` when operating from the primary local checkout.
- In a worktree, `make anon` is the full startup command (do not run `pnpm dev`
  separately afterward).
- If a worktree command fails with `Local backend isn't running`, run
  `make anon` and retry (do not switch to `npx convex dev` as the default fix).
- For UI automation, never kill all `Google Chrome` processes. Only terminate
  Playwright-owned sessions/profile paths (for example
  `.../ms-playwright/mcp-chrome`).
- Worktree frontend should avoid port `5173` so OAuth flows on main checkout
  stay unaffected (default worktree dev port: `5174`).
- For temporary Playwright/manual-test repos, use the exact
  `tmp-<worktree-id>-<intent>` naming rule. Do not invent alternate temp
  prefixes.
- When asked for OAuth redirect URLs or env vars, give a single exact
  recommendation. Do not present multiple options or alternate env var lookups.
- Avoid adding unusual options or flags unless there is a clear, stated reason
  for them.
- Do not introduce new environment variables as fallback mechanisms unless the
  user explicitly asks for that behavior.
- Prefer breadth-first, simplest-viable fixes before deeper changes; stop once a
  minimal solution works.
- When removing legacy systems, prefer clean removal and rely on git history for
  recovery instead of keeping deprecated code or data structures around.
- Always create a working branch (use `codex/` prefix when needed), and push
  after every commit so the remote stays up to date.
- Do not introduce new `.mjs` files; keep `type: "module"` and prefer `.js`
  files as ESM.
- Always rebase work branches on `origin/main` (not only local `main`) before
  shipping.
- Treat rebase freshness as mandatory: check and rebase against the latest
  `origin/main` right before merge, not only once earlier in the PR lifecycle.
- When using the local worktree helper, prefer `wt <branch>` to print a worktree
  path and `cd (wt <branch>)` to change directories in fish.
- For rebase/fast-forward without switching directories, use
  `git -C (wt <branch>) rebase main` then
  `git -C (wt main) merge --ff-only <branch>`.
- Deferred workflow experiment: optionally try a temporary `next_main` branch,
  cherry-pick changes, and merge PRs with merge commits. Treat this as opt-in
  per request (not default).
- When the simpleView fixture test fails due to new `.md` files, update the
  fixture to include those `.md` files and include the fixture update in the
  same commit by default.
- Do not bypass pre-commit hooks by default when lint/tests are failing; only do
  so on explicit user request.
- Never recommend bypassing commit or pre-commit hooks as an option; only
  proceed if the user explicitly asks to bypass them.
- When the user asks to create a PR, automatically mark it ready for review
  unless they explicitly ask for a draft PR.
- When creating or editing PR descriptions with `gh`, use `--body-file` (or
  stdin/heredoc) so real newlines are preserved; never pass escaped `\n` in a
  single-line `--body` string.
- After pushing fixes for PR review feedback, always request a fresh CodeRabbit
  review by commenting `@coderabbitai review`.

### Worktree Protocol (Local)

- Create worktrees via Codex (running `git worktree add`) on explicit user
  request; do not add Makefile or script helpers for worktree creation.
- Treat the current worktree root from `git rev-parse --show-toplevel` as the
  workspace boundary; do not read/write outside it without an explicit request.
- Before running dev/test/commit, confirm the worktree + branch with
  `git worktree list --porcelain` and `git rev-parse --abbrev-ref HEAD`.
- Use `make anon` as the default dev/bootstrap entrypoint in a worktree.
- Never use `npx convex dev` as the normal worktree startup path; only use it
  for explicit low-level debugging requests.
- Never run `npx convex dev` with `--env-file` pointing at another checkout's
  `.env.local` from a worktree. It can rewrite the worktree
  `apps/noter/.env.local` to a cloud `dev:*` deployment and break `make anon`.
- Use `make run` in the primary local checkout (non-worktree).
- Keep changes isolated per worktree (one idea per worktree) and avoid mixing
  branches in a single worktree.
- Use `noter.md` frontmatter `worktrees` settings as the canonical, user-visible
  worktree config.
- If a task requires touching multiple worktrees, ask before proceeding.
- Worktree location convention: keep main at `<repo>` (e.g., `~/dev/noter`) and
  use `<repo>-<suffix>` for worktrees (e.g., `~/dev/noter-idea-1`). Treat the
  first `-` as the delimiter.

### Legacy Infra Env Vars (Unused)

- `NETLIFY_ACCESS_TOKEN` is no longer used by runtime code.
- `NETLIFY_TEAM_ID` is no longer used by runtime code.
- `CONVEX_MANAGEMENT_TOKEN` is no longer used by runtime code.
- `CONVEX_TEAM_ID` is no longer used by runtime code.
- Provider connections now use `PROVIDER_*_OAUTH_*` env vars (and `DEV_SEED_*`
  for dev seeding).

## Operational Note (Codex Auth)

- Enable device code authorization for Codex when running in headless or remote
  environments where the normal browser flow isn’t available.
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
