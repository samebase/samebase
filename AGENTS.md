# AGENTS.md

if worktree then necessary to run

```
make anon-once
```

## Spec Organization

<!-- maybe not now, but rethink this and maybe always start with just a pr/ let's start with just using a single  -->

- `specs/` is for accepted/current source-of-truth docs only. A doc belongs here
  only when it describes current behavior or an accepted implementation plan
  that the team intends to execute.
- `rfcs/` is for proposals, pilots, rollout plans, and requests for comments
  that are still under discussion or not yet committed roadmap work. When in
  doubt, put new exploratory docs here instead of `specs/`.
- `archive/` is for superseded, canceled, or historical docs that are worth
  keeping for context but should not guide new implementation.
- Move a doc from `rfcs/` to `specs/` only after the decision is accepted and
  intended implementation is active.
- Move a doc from `specs/` to `archive/` when it no longer describes current
  reality or has been replaced by a newer source of truth.
- During active branch churn, avoid bulk doc-folder migrations. Reclassify docs
  in small batches and update references/fixtures in the same change.

### Local Environment Notes

<!-- which exactly environment, probably osx/windows/daytona -->

- `rg` (ripgrep) is not available in this environment. Use `grep`/`find`
  instead.
  <!-- maybe just force to run `make anon-once` on startup -->
  <!-- apparently these are not notes, this is the backbone -->
- If Convex tooling complains about missing `CONVEX_DEPLOYMENT` (for lint or
  codegen), run `make anon` to set up an anonymous deployment.
- In a git worktree, always start with `make anon` before dev/lint/test/commit
  workflows.
- In a git worktree, do not run `npx convex dev` directly for normal startup;
  `make anon` is the required entrypoint.
- For one-off setup in a git worktree, use `make anon-once`.
- `make connect` is a local operator tool. It only reacts to PRs that carry both
  the configured label and a valid hidden `<!-- noter-origin:v1 {...} -->`
  marker in the PR body.
- `make connect` does not read Convex chat state. Noter's Convex chat tables and
  Codex threads are separate systems today.

<!-- maybe find official skill? -->

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
- **UI**: Tailwind CSS + Radix UI components + shadcn/ui patterns + a bit of
  inhouse corner-notch-1
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
- **Comment code inline with context** - new or materially changed code should
  include inline comments that explain why the code exists, what constraint or
  invariant it is preserving, and any non-obvious how/flow. Prefer comments that
  give future readers decision context over comments that only restate the
  syntax. If a file is generated or explicitly treated as read-only, do not
  hand-edit it just to satisfy this rule; put the context in the nearest
  repo-owned wrapper or calling code instead.
- **Use JSDoc for function comments** - when a function needs an explanatory
  comment, write it as a JSDoc block (`/** ... */`) immediately above the
  function instead of using `//` comments inside the function body.
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
- **No speculative code** - do not add helpers, abstractions, flags, env vars,
  allowlist entries, branches, or compatibility paths unless the current patch
  uses them end-to-end in real runtime code
- **No placeholder fallbacks** - prefer one explicit source of truth; if the
  expected env var/config/command is missing, fail with a clear error instead of
  probing backup names or future-facing alternatives
- **Fallbacks require an active migration** - only add alternate env vars,
  compatibility branches, or multi-path resolution when the repo is already in a
  real migration and the same patch documents and uses both paths
- **No test-only abstractions** - do not add or keep production helpers that are
  referenced only by tests; tests must cover the code path that production
  actually executes
- **Delete incomplete extractions** - if a refactor extracts a helper but the
  runtime path does not call it yet, remove the helper instead of leaving dead
  scaffolding behind
- **Avoid barrel files** - do not add directory-level `index.ts` barrel files
  for app code; prefer importing from the concrete module path directly
- **Keep config surfaces minimal** - allowlists and config maps should contain
  only entries that are currently used by this repo; do not add placeholders for
  possible future integrations
- **Do not construct CSS or Tailwind class names dynamically** - avoid patterns
  such as `corner-notch-${type}`, `bg-${tone}`, or string fragments passed
  through template literals. Map typed state to full literal class strings and
  pass those complete names to `cn(...)` so classes stay searchable and visible
  to Tailwind tooling

## UI/UX Guidelines

- **Avoid unnecessary loading states** - prefer `null`/empty arrays over
  "Loading..." text
- **No "No items found" placeholders** - let empty state speak for itself
- **Only show loading for operations >500ms** or when user expects feedback
- **Prefer silent, smooth UX** over chatty, jumpy interfaces
- **Prefer existing shadcn/ui components** over custom Tailwind-only solutions
  when available
- **Screenshot coverage for UI changes** - whenever a patch changes user-visible
  UI in `apps/noter`, add or update at least one screenshot test that covers the
  shipped surface. Prefer the smallest stable visual fixture or screenshot that
  exercises the changed state and avoids oversized captures.
- **Use rectangular app chrome** - app-owned UI surfaces default to zero border
  radius; keep the shared radius token/Tailwind radius scale at `0`, prefer
  `rounded-ui` when an explicit semantic radius utility is needed, and do not
  introduce `rounded-full` or arbitrary `rounded-[...]` classes for app chrome
- **Async destructive actions** - disable the trigger while pending and show a
  spinner/label (e.g. "Removing...") to prevent double-submit

## shadcn/ui Component Rules

- **Do not manually edit generated shadcn/ui files** in
  `apps/noter/src/components/ui/*` unless the user gives an explicit exceptional
  instruction for that exact change
- **Always use the shadcn CLI via `npx`** for component updates/additions (from
  `apps/noter`, e.g. `npx shadcn@latest add <component>`)
- **Prefer app-owned wrapper entrypoints for styled primitives** - when Noter
  needs a shared styling or behavior layer over a generated primitive, expose a
  repo-owned wrapper outside `components/ui/*` with the canonical app-facing
  name (for example `apps/noter/src/components/card.tsx`,
  `apps/noter/src/components/dialog.tsx`, or
  `apps/noter/src/components/input.tsx`). App code should import the wrapper
  path when it exists. Keep the generated primitive internal and alias it as
  `BaseButton` inside the wrapper instead of leaking names like `NButton` or
  editing the generated file by default. Current explicit exception:
  `apps/noter/src/components/ui/button.tsx` owns the shared button notch variant
  directly, so product code imports `@/components/ui/button` without an
  app-owned pass-through wrapper
- **Prefer wrapper-owned styling props over raw utility strings when available**
  - when a wrapper already exposes a typed styling control such as
    `cornerNotch`, prefer that prop in product code over repeating raw
    `corner-notch-*` classes at call sites
- **If manual edits are explicitly requested**, keep them minimal and call out
  that they diverge from generated output

### TODO

- **Better mobile keyboard handling** - improve window size handling when
  virtual keyboard appears on mobile devices
- **High: Daytona Codex shared home semantics** - treat the mounted Codex volume
  as a desirable shared state surface, not just an auth cache. Shared `~/.codex`
  memories/state across Daytona sandboxes and agents is intentional. fixes that
  preserve one writable shared Codex home via `DAYTONA_CODEX_HOME` over
  workarounds that copy only auth into an isolated per-sandbox home and strand
  memories/agent state.
- **Idea: Daytona terminal UI transparency** - do not over-hide tmux/session
  chrome if exposing it improves operator control. Prefer a VS Code-like web
  terminal surface with simple tabs, splits, and top-bar actions over a "hidden
  tmux magic" model, but keep it simple enough that the operator does not need
  to learn tmux just to use it.
- **High: Daytona deps image rollout drift** - a stale prod deps-image setting
  can lag the current `Dockerfile.daytona-deps` hash on `main`, which leaves
  fish tooling like `fisher`/`pure` missing even when the repo code is correct.
  Add an explicit rollout or validation step for Daytona deps image updates
  after merges that change the image inputs.
- **High: Daytona registry automation viability** - verify whether the
  Daytona-managed private-registry path is still needed at all. Current runtime
  still carries `DAYTONA_REGISTRY_*` / `DAYTONA_ORGANIZATION_ID` handling plus a
  "Set registry access" UI, but current deployments may not use any of those env
  vars. If GHCR pulls already work through existing auth flows, remove the
  registry-management feature instead of keeping speculative config surface.
- **High: local/worktree Daytona naming** - `make anon` currently seeds
  `DAYTONA_CONVEX_DEPLOY_KEY` from shared cloud dev env, so local Daytona
  snapshot/sandbox names can still inherit shared dev scope instead of a true
  local/worktree scope. Defer this follow-up; current sandbox behavior check is
  separate.

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

| Command        | Action                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `commit`       | Stage all changes, commit with concise message                                                            |
| `push`         | Commit if needed, push to remote                                                                          |
| `create pr`    | Push if needed, create or update a draft PR, ensure a non-empty body, keep it draft unless asked ready    |
| `ready`        | Mark draft PR as ready: `gh pr ready`                                                                     |
| `wait`         | Monitor CI with `gh pr checks` or `gh run watch`, report status                                           |
| `ship`         | Full flow: commit → push → create/update draft PR → ready → fix Greptile+CodeRabbit feedback loops → wait |
| `archive`      | Require an existing PR for the current branch, then remove the current worktree and local branch          |
| `clean vaults` | Remove temporary Noter-managed vaults/resources created for the current worktree                          |
| `clean`        | After PR is shipped/merged: run `clean vaults`, then remove the current worktree and delete its branch    |
| `status`       | Show branch, uncommitted changes, PR state                                                                |

### Rules

- Always use CLI tools (`gh`, `git`) - never tell user to click UI buttons
- Execute, don't instruct
- Adapt to context (if PR exists, update it; if already ready, skip)
- In the first user-facing message of a task, decide whether the current branch
  name should change. If it's still an auto-generated random
  `codex/<word>-<word>-<word>` name, default to renaming it immediately because
  the first prompt usually provides enough context; only defer renaming when the
  task intent is still genuinely unclear.
- Before `commit`, verify the branch name is meaningful. If it's still an
  auto-generated random `codex/<word>-<word>-<word>` name, rename it to a
  descriptive `codex/<intent>` branch before committing.
- Before `create pr` or `ship`, verify the branch name is meaningful. If it's
  still an auto-generated random `codex/<word>-<word>-<word>` name, rename it to
  a descriptive `codex/<intent>` branch before pushing/creating the PR.
- Before `commit`, `create pr`, or `ship`, inspect the diff shape with
  `git diff --stat` (and `git diff --cached --stat` when relevant). Treat an
  unusually large burst of added files, vendored third-party trees, or copied
  upstream assets as suspicious by default. Stop and simplify or explicitly
  justify the bulk addition before proceeding.
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
- For `archive`, require an existing GitHub PR whose head branch is the current
  branch; a draft PR is sufficient. Once confirmed, remove the current
  non-`main` worktree and delete only the local branch so the Codex thread can
  be archived while the GitHub branch and PR remain intact. If no matching PR
  exists, stop and report instead of guessing.
- For `clean`, run it only after the PR is shipped/merged. Execute from CLI: run
  `clean vaults` first, then remove the current non-main worktree, delete its
  local branch, and delete its remote branch if it still exists. If vault
  cleanup cannot be verified safely, stop and report instead of guessing.
- When the user asks to "open a PR" (or `create pr`), always write a normal PR
  description (`Why`, summary, key changes, validation). Never leave the PR body
  empty.
- When a PR represents a research or automation run initiated from Noter or
  Codex, include the originating first user message in the PR description and
  require both runtime fields `requestedModel` and `requestedReasoningEffort`.
  Prefer explicit sections such as `First Message` and `Requested Codex Runtime`
  instead of assuming local defaults, because the local runner skips PRs whose
  hidden contract omits either field.
- PR descriptions must explain why the change exists, not just what changed. If
  a PR is split out from a broader branch or effort, say that explicitly in the
  `Why` section so reviewers have the missing context.
- When the user asks to "open a PR" (or `create pr`), create or update a draft
  PR by default. Only mark it ready when the user explicitly asks for that or
  when the command is `ready`/`ship`.
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
- During `ship`, also review Codex PR feedback when Codex review is enabled for
  the repo. Treat actionable Codex findings the same way as CodeRabbit/Greptile
  findings, and request a fresh review with `@codex review` after pushes that
  materially change the PR.
- Do not merge while CodeRabbit is in progress; after each review request, wait
  for completion and re-check new comments before deciding merge readiness.
- Treat CodeRabbit actionable comments and nitpicks as required fixes during
  `ship`, same as Greptile findings.
- Treat Codex actionable review comments and nitpicks as required fixes during
  `ship`, same as CodeRabbit and Greptile findings.
- CodeRabbit UI/status rule: your `@coderabbitai review` comment is only a
  trigger. Read the first/top-level CodeRabbit summary comment for outcome;
  CodeRabbit updates that existing comment in place rather than reliably posting
  a new one. Also check the CodeRabbit status/check and validate findings
  against the latest commit SHA before fixing.
- Codex review rule: check inline PR review comments from
  `chatgpt-codex-connector[bot]`, not just the top-level summary review entry.
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
- After an auto-created random branch, make the rename decision in the first
  user-facing message. In most cases, rename it immediately to a meaningful
  `codex/<name>` branch because the initial prompt already provides enough
  context.
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
- If voice transcription or Wispr Flow turns `noter.md` into `NotRmd` or a
  similar variant, interpret it as `noter.md` in both requests and responses.
- The user often uses voice-to-text, so malformed filenames or phrases may be
  transcription errors rather than literal targets. Infer the most likely intent
  first and ask a brief clarifying question only if multiple plausible
  interpretations remain.
- For this operator, keep responses concise by default and always include a
  final `Summary` section.
- For this operator, do not let local changes sit too long; commit progress in
  reasonably small chunks from time to time instead of batching everything into
  one late commit.
- For this operator, push committed changes promptly so work is not stranded
  only in the local worktree.
- For this operator, default to additive minimalism in copy and visuals: start
  from an empty canvas, add only what is clearly needed for the current goal,
  and avoid filler copy or decorative chrome unless explicitly requested.
- For this operator, do not add decorative lines, frames, borders, shadows,
  extra buttons, nav, pricing blocks, or similar embellishments by default. If
  something is not clearly missing, leave it out.
- Assume Cloudflare is the default front door, proxy, routing layer, and
  observability layer for `noter.md` unless the user explicitly says otherwise.
- Prefer keeping application server logic in Convex by default; introduce a
  Cloudflare Worker runtime only when there is a clear, explicit reason.
- For new architecture work, prefer Cloudflare-first designs and avoid
  introducing new Netlify or Railway dependencies unless the user explicitly
  requests them.
- For this operator, do not use Python as the first option for scripting or
  automation in Codex. Prefer plain shell commands first; if scripting is
  needed, prefer ECMAScript/Node because Node is guaranteed to be available.
- For this operator, when constructing multi-line JavaScript/TypeScript source
  snippets, prefer template literals over arrays of one-line strings joined with
  `'\n'`. Use `stripIndent` when indentation cleanup is needed; do not default
  to `['line 1', 'line 2'].join('\n')` unless there is a concrete reason.
- Before starting implementation on an existing work branch or worktree, fetch
  `origin` and rebase onto the latest `origin/main` before doing new work.
- Format documents you write with Prettier by default so markdown/docs do not
  require manual cleanup.
- Prefer exhaustive, type-safe dispatch with `satisfies never` when a union
  should be fully handled at compile time; avoid catch-all fallbacks when this
  pattern fits, and use an explicit runtime fallback only when needed.
- Default to persisting user-visible UI state in Convex (per-user settings) so
  it syncs across devices; avoid localStorage unless explicitly requested for
  per-device behavior.
- When sharing URLs (including localhost dev URLs), format them as Markdown
  links (for example `[http://localhost:5174/](http://localhost:5174/)`) so they
  are clickable in Codex.
- When a preview URL exists for the work in progress, always include it as a
  clickable Markdown link in the user-facing response so the operator can open
  it directly.
- When a relevant local preview/server exists for the current worktree, always
  include at least one clickable localhost URL in the user-facing response. If
  no relevant local preview is running, say that explicitly instead of omitting
  the link expectation silently.
- When UI screenshot or visual regression work produces changed, added, or
  removed images, always show those images in the user-facing response after
  running the screenshot flow. Use rendered image attachments/Markdown image
  tags, not just text descriptions of the diff, and keep the screenshots compact
  enough to inspect without overwhelming the response.
- For this operator, screenshots should contain real representative in-UI text
  inside the rendered elements by default. Do not add explanatory overlay text
  on top of the screenshot itself unless the user explicitly asks for that.
- When explaining a screenshot diff or visual regression, always include the
  pixelmatch diff image and the before/after screenshots in the user-facing
  response when those images are available.
- When a response relates to an existing PR, always mention the PR number and
  format that PR number itself as a clickable Markdown link to the PR (for
  example `[#253](https://github.com/noter-md/noter/pull/253)`), even if the
  full PR URL is also included elsewhere.
- For boolean URL query params, prefer key-only flags (for example `?diff`)
  instead of assigning values (`?diff=1`); treat key presence as enabled.
- When changing app URLs that already have query params, update only the owned
  param and preserve unrelated params. Use `apps/noter/src/lib/queryParams.ts`
  helpers instead of hand-building `/?...` URLs or calling
  `URLSearchParams#set/delete/append` directly outside the helper modules.
- Runtime bootstrap rule: use `make anon` when operating from a git worktree,
  and use `make run` when operating from the primary local checkout.
- In a worktree, `make anon` is the full startup command (do not run `pnpm dev`
  separately afterward).
- If a worktree command fails with `Local backend isn't running`, run
  `make anon` and retry (do not switch to `npx convex dev` as the default fix).
- For UI automation, never kill all `Google Chrome` processes. Only terminate
  Playwright-owned sessions/profile paths (for example
  `.../ms-playwright/mcp-chrome`).
- For Playwright/browser automation, never bring the browser to the foreground
  or steal OS focus from the operator's current work. Use background/headless
  automation only; if a task truly cannot avoid a visible focused browser, stop
  and ask first.
- For concurrent Playwright work across multiple agents, default to isolated
  Playwright browser sessions or contexts per agent. Do not rely on separate
  tabs in a shared Chrome instance unless the user explicitly accepts the
  interference risk.
- For Playwright MCP/browser checks, open a fresh browser window or other
  isolated page context for each new validation pass instead of reusing an
  existing interactive page that another MCP call might still be touching.
- In this repo, prefer `node ./scripts/playwright-branch-browser.js` or
  `make playwright-open` over raw `@playwright/cli open`. Each git branch owns
  one deterministic Playwright session/profile so the agent can identify the
  correct Chrome window without guessing.
- When re-entering a branch-owned Playwright Chrome session, preserve the
  existing active tab if it may have unsaved changes. Open a fresh tab instead
  of navigating the current tab so Chrome does not surface `Leave site?` or
  similar native unload dialogs.
- For concurrent Playwright agents, assign each isolated browser profile a
  random distinguishing color/theme so parallel sessions are easier to tell
  apart at a glance.
- When asked to use Playwright for testing, start with an unconstrained browser
  layout by default (no explicit viewport/device override) unless the user asks
  for a specific viewport. Do not call Playwright/browser resize just to force a
  desktop-like size.
- Include a mobile viewport/device pass as a pre-ship validation step when it is
  relevant, rather than as the default starting mode.
- If the user says to "remove mobile constraints" (or equivalent) during
  Playwright/UI work, remove all explicit viewport/device constraints instead of
  switching to a forced desktop size; let the page render at its normal,
  unconstrained browser layout unless the user asks for a specific viewport.
- Worktree frontend should avoid port `5173` so OAuth flows on main checkout
  stay unaffected (default worktree dev port: `5174`).
- For temporary Playwright/manual-test repos, use the exact
  `tmp-<worktree-id>-<intent>` naming rule. Do not invent alternate temp
  prefixes.
- For this operator, treat shadcn-generated files in
  `apps/noter/src/components/ui/*` as read-only by default: do not modify them
  (including from Greptile/CodeRabbit feedback) unless the user explicitly asks
  to update shadcn output.
- When asked for OAuth redirect URLs or env vars, give a single exact
  recommendation. Do not present multiple options or alternate env var lookups.
- Avoid adding unusual options or flags unless there is a clear, stated reason
  for them.
- Do not introduce new environment variables as fallback mechanisms unless the
  user explicitly asks for that behavior.
- Treat speculative future-proofing as a bug, not a virtue. Do not add support
  for imagined future env vars, backup code paths, or placeholder config "just
  in case."
- When reading env/config, prefer one exact variable or one exact file. If it is
  missing, fail closed with an actionable error unless the user explicitly asked
  for migration/fallback behavior.
- Every new exported helper, env var, allowlist entry, or branch in control flow
  must have a present-tense consumer in the same patch. If nothing uses it
  today, do not add it.
- If a test passes after deleting the new helper/abstraction without changing
  runtime behavior, that helper/abstraction should not exist.
- Prefer breadth-first, simplest-viable fixes before deeper changes; stop once a
  minimal solution works.
- When removing legacy systems, prefer clean removal and rely on git history for
  recovery instead of keeping deprecated code or data structures around.
- Make checkpoint commits during active implementation instead of letting large
  local diffs accumulate. As a rule of thumb, commit at each meaningful
  milestone and before uncommitted changes grow much beyond roughly 100-200
  lines, unless the work is too intertwined to split safely.
- Always create a working branch (use `codex/` prefix when needed), and push
  after every commit so the remote stays up to date.
- For this operator, draft PR creation is part of task startup. In the first
  user-facing message for an implementation task, bootstrap the worktree with
  `make anon` and then open or update a draft PR immediately so preview links
  (including Cloudflare previews) exist from the beginning of the work.
- If GitHub requires a diff before opening that startup draft PR, create a
  minimal checkpoint commit right after bootstrap rather than waiting for a
  larger implementation commit.
- For this operator, parked draft PRs remain part of the kanban even when the
  local workspace is no longer needed. It is fine to remove the current worktree
  and local branch while leaving the remote branch and draft PR open for later
  revisit.
- For this operator, keep the running narrative primarily in GitHub: use the PR
  description as the canonical current summary/plan/links, use PR comments for
  incremental checkpoints and notable decisions, and update the PR title and
  description when the scope shifts materially. Do not default to keeping the
  primary work log in repo files unless the user explicitly asks for that.
- For this operator, draft PR creation is part of task startup. In the first
  user-facing message for an implementation task, bootstrap the worktree with
  `make anon` and then open or update a draft PR immediately so preview links
  (including Cloudflare previews) exist from the beginning of the work.
- If GitHub requires a diff before opening that startup draft PR, create a
  minimal checkpoint commit right after bootstrap rather than waiting for a
  larger implementation commit.
- For this operator, keep the running narrative primarily in GitHub: use the PR
  description as the canonical current summary/plan/links, use PR comments for
  incremental checkpoints and notable decisions, and update the PR title and
  description when the scope shifts materially. Do not default to keeping the
  primary work log in repo files unless the user explicitly asks for that.
- Do not mirror the full chat transcript or raw tool-by-tool logs into the PR by
  default. Summarize the important decisions, validation, and links in GitHub,
  and only link out to heavier artifacts if the user explicitly wants that level
  of trace detail.
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
- When the user asks to create a PR, keep it draft by default unless they
  explicitly ask to make it ready for review.
- Do not request CodeRabbit or Codex review automatically for startup draft PRs
  or early work-in-progress PRs. Request review when the PR is marked ready or
  when the user explicitly asks for review on the current draft state.
- When creating or editing PR descriptions with `gh`, use `--body-file` (or
  stdin/heredoc) so real newlines are preserved; never pass escaped `\n` in a
  single-line `--body` string.
- For new lint rules, default to repo-wide rollout. If legacy violations make an
  immediate error-level rollout impractical, use a repo-wide warning first
  instead of scoping the rule to a narrow set of files unless the user
  explicitly asks for that.
- After pushing fixes for PR review feedback on a PR that is actively under
  review, always request a fresh CodeRabbit review by commenting
  `@coderabbitai review`.
- After pushing fixes for PR review feedback on a PR that is actively under
  review, always request a fresh Codex review by commenting `@codex review`.
- After fixing CodeRabbit findings, always reply on each relevant CodeRabbit
  review thread with a short note describing exactly what was changed, then
  resolve the thread.

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
- When working in a worktree, never run `npx convex dev` with `--env-file`
  pointing at another checkout's `.env.local`. Convex reads credentials from
  that path but writes the resolved deployment URL to the current worktree
  `apps/noter/.env.local`, switching to cloud `dev:*` and breaking `make anon`.
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
