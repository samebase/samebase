# AGENTS.md

## Startup

- In a git worktree, run `make anon-once` once after checkout.
- In a git worktree, use `make anon` as the full startup command before
  dev/lint/test/commit workflows. Do not replace it with `pnpm dev` or
  `npx convex dev`.
- In the primary local checkout, use `make run`.
- If Convex tooling complains about missing `CONVEX_DEPLOYMENT`, or a worktree
  command fails with `Local backend isn't running`, run `make anon` and retry.
- `rg` is not available in this environment. Use `grep` and `find` instead.

## Repo Knowledge Map

- `specs/` contains accepted, current source-of-truth behavior and accepted
  implementation plans.
- `rfcs/` contains proposals, rollout plans, and work that is still under
  discussion.
- `research/` contains exploratory investigations, audits, benchmarks, incident
  notes, and external research. It informs decisions but is not itself the
  source of truth.
- `docs/` contains durable reference material such as workflow runbooks,
  compliance artifacts, and operator-facing documentation that does not define
  product behavior.
- `skills/` contains reusable, task-specific playbooks. Keep the `SKILL.md`
  focused and load heavier references/scripts only when needed.
- `archive/` contains superseded or historical material that should not guide
  new implementation.
- When sources conflict, use this priority order: code and tests, then `specs/`,
  then accepted rollout docs, then `rfcs/`, then `research/`, then `archive/`.
- Keep `AGENTS.md` for broad, stable repo rules only. Move long or conditional
  workflows into `docs/` or `skills/`.
- When the user says to "remember this", persist durable repo/operator guidance
  in the appropriate repo artifact instead of leaving it only in chat.
- Avoid bulk doc-folder migrations during active branch churn. Reclassify docs
  in small batches and update references in the same change.

## Convex CLI

Use these from `apps/noter` when debugging runtime issues:

```bash
npx convex logs --prod --history 50
npx convex logs
npx convex dashboard
npx convex env list
```

For worktree-safe prod logs when the worktree lacks its own `.env.local`, point
`--env-file` at the primary checkout's `apps/noter/.env.local` and replace
`<primary-checkout>` with the actual path:

```bash
npx convex logs --prod --env-file <primary-checkout>/apps/noter/.env.local --history 50
```

## Architecture

- Frontend: React 18, Vite, React Router 7
- Backend: Convex
- Auth: Convex Auth app login plus provider OAuth/API-key connection flows
- Editor: Monaco plus CodeMirror 6 / `@prosemark/core`
- UI: Tailwind CSS, Radix UI, shadcn/ui
- State: Convex subscriptions plus TanStack Query

Key domain entities:

- `users`
- `providerConnections`
- `vaults`
- `vaultInfrastructure`
- `vaultDomains`
- `fileStaging`
- `collaborativeUpdates`
- `folderExpansionState`
- `aiProdAccessRequests`
- `aiProdAccessAudit`

## Code Guardrails

- Never use `any` or broad type assertions. `as const` is always acceptable.
- When suppression is unavoidable, use the narrowest possible
  `@ts-expect-error`. Never use `@ts-nocheck`.
- Prefer inference when it keeps the code clear.
- When a schema exists, derive the TypeScript type from it instead of
  duplicating a manual type.
- In Convex modules, define result validators before handlers, derive types via
  `Infer<typeof ...>`, and prefer destructuring validator builders once instead
  of repeated `v.<fn>()` call sites.
- When returning collections from queries or building user-visible lists, always
  choose an explicit deterministic sort order with stable tie-breakers. Do not
  rely on incidental storage order or live-update fields unless the product
  intentionally wants rows to reshuffle.
- New or materially changed code should include concise comments that explain
  the constraint or invariant being preserved. Prefer JSDoc above functions when
  a function-level explanation is needed.
- Avoid `"use node"` unless the module truly requires it.
- Do not add speculative helpers, flags, env vars, allowlist entries,
  compatibility paths, or config surface that the current patch does not use end
  to end.
- Fail closed rather than inventing placeholder fallbacks unless the patch is
  implementing a real migration.
- Do not keep test-only production abstractions, incomplete extractions, or dead
  scaffolding.
- Do not add barrel files for app code.
- Keep config surfaces minimal and current.
- Do not construct Tailwind or CSS class names dynamically. Map state to full
  literal class strings.

## Non-Functional Guardrails

- Never leak tokens, provider credentials, or sensitive user data into logs,
  screenshots, docs, fixtures, or PR text.
- Preserve approval, auth, and audit boundaries. Do not silently widen access to
  production reads or external writes.
- Avoid obvious performance regressions on large files, long lists, and shared
  editor surfaces.
- Preserve keyboard, focus, selection, and touch behavior when changing shared
  shells or editor integrations.

## UI And Testing

- Prefer silent, smooth UX over chatty loading placeholders.
- Prefer existing shadcn/ui primitives or app-owned wrappers over bespoke
  Tailwind-only replacements when they already solve the problem.
- Add or update screenshot coverage whenever a patch changes shipped UI.
- For bugs involving scroll, touch, drag, focus, selection, pane layout, auth
  wiring, or route shell behavior, reproduce and test the real app route first.
- If a fixture is still needed, it must mount the exact production component
  tree without invented headers, wrappers, spacing, or fake chrome.
- For production interaction regressions, add a failing route-level or honest
  production-component Playwright repro before adding narrower fixture coverage.
- Use rectangular app chrome by default.
- Disable async destructive triggers while pending and show an in-button pending
  state.
- Persist user-visible UI state in Convex by default unless per-device behavior
  is explicitly desired.

## shadcn/ui Rules

- Do not manually edit generated files in `apps/noter/src/components/ui/*`
  unless the user explicitly asks for that exact change.
- Use the shadcn CLI via `npx` for component additions or refreshes.
- Prefer repo-owned wrapper entrypoints outside `components/ui/*` when Noter
  needs shared styling or behavior over a generated primitive.
- If a generated file is explicitly edited, keep the change minimal and call out
  the divergence.

## Workflow Shortcuts

When the user says one of these commands, execute it directly:

| Command        | Action                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| `commit`       | Stage changes and create a concise commit                              |
| `push`         | Commit if needed, then push                                            |
| `create pr`    | Push if needed, then create or update a ready PR                       |
| `create draft` | Push if needed, then create or update a draft PR                       |
| `ready`        | Mark the current PR ready                                              |
| `wait`         | Watch CI and report status                                             |
| `ship`         | Commit, push, refresh PR state, clear actionable review feedback, wait |
| `archive`      | Remove the current worktree/local branch after confirming a PR exists  |
| `clean vaults` | Remove temporary Noter-managed vaults for the current worktree         |
| `clean`        | Run `clean vaults`, then remove the shipped worktree/branch            |
| `status`       | Report branch, local changes, and PR state                             |

Detailed flow rules live in `docs/agent-workflows.md`.

## Workflow Rules

- Always use CLI tools such as `gh` and `git`; do not tell the user to click
  through a UI.
- Execute requested git/GitHub workflows instead of describing them.
- Before starting implementation on an existing branch or worktree, fetch
  `origin` and rebase onto the latest `origin/main`.
- Rename auto-generated random `codex/<word>-<word>-<word>` branches early, and
  always before `commit`, `create pr`, or `ship`.
- Before `commit`, `create pr`, or `ship`, inspect the diff shape with
  `git diff --stat` (and `git diff --cached --stat` when relevant).
- Use the exact temporary vault prefix `tmp-<worktree-id>-<intent>` for
  Playwright/manual test repos created from a worktree.
- `clean vaults` must fail closed and only remove matching Noter-managed vaults
  through the dashboard delete flow.
- When the user says `create pr`, create or update a ready non-draft PR.
- Use a draft PR only when the user explicitly says `create draft` or otherwise
  asks to keep the PR draft.
- PR descriptions must explain why the change exists, not just what changed.
- When a PR originates from research or automation work, include `First Message`
  and `Requested Codex Runtime`.
- Keep the PR title and description updated as scope changes.
- Treat actionable Greptile, CodeRabbit, and Codex review comments as required
  fixes while shipping.
- Never merge before CI is green.
- Rebase on the latest `origin/main` immediately before merge.
- Prefer squash merge by default.

## Worktree Rules

- If HEAD is detached, use `./scripts/bootstrap-worktree.js` to create a
  `codex/<...>` branch.
- Treat the current worktree root from `git rev-parse --show-toplevel` as the
  workspace boundary unless the user explicitly asks otherwise.
- Before dev/test/commit work, confirm the current worktree and branch with
  `git worktree list --porcelain` and `git rev-parse --abbrev-ref HEAD`.
- Do not run `npx convex dev --env-file` pointing at another checkout's
  `.env.local`; it breaks the current worktree's local setup.
- Keep one idea per worktree when possible.

## Operator Preferences

- Keep responses concise by default and always include a final `Summary`
  section.
- Expect voice-to-text mistakes. Interpret likely transcription errors before
  asking for clarification.
- Commit meaningful checkpoints instead of letting large local diffs accumulate,
  and push after commits so work is not stranded only in the local worktree.
- Default to additive minimalism in copy and visuals. Do not add decorative
  chrome, filler copy, extra buttons, or ornamental layout unless explicitly
  requested.
- Assume Cloudflare is the default front door and observability layer for
  `noter.md`, and keep application logic in Convex by default unless there is a
  clear reason not to.
- Prefer shell commands first and Node/ECMAScript second; do not reach for
  Python first in this repo.
- Use template literals instead of arrays joined with `'\n'` for multi-line
  JavaScript and TypeScript snippets.
- Format documents with Prettier.
- Prefer exhaustive dispatch with `satisfies never` when it fits.
- When sharing URLs, always format them as clickable Markdown links.
- When a relevant preview exists, include at least one clickable localhost URL
  in the user-facing response; otherwise say that no preview is running.
- When screenshot or visual regression work changes images, show the relevant
  before/after or diff images in the user-facing response.
- When a response relates to an existing PR, mention the PR number as a
  clickable Markdown link.
- Prefer key-only boolean query params such as `?diff`.
- Preserve unrelated query params when changing app URLs. Use the shared query
  param helpers instead of hand-building URLs.
- For Playwright or browser automation, never steal OS focus and never kill all
  Chrome processes. Use isolated Playwright-owned sessions only.
- For this repo, prefer `node ./scripts/playwright-branch-browser.js` or
  `make playwright-open` over raw `@playwright/cli open`.
- Start Playwright validation with the normal unconstrained browser layout
  unless the user asks for a specific viewport. Add a mobile pass when relevant
  before shipping.
- When scripting touch gestures, anchor on visible rendered content inside the
  shipped surface instead of arbitrary coordinates inside oversized containers.
- Worktree frontend should avoid port `5173`; prefer the worktree defaults.
- Treat shadcn-generated files in `apps/noter/src/components/ui/*` as read-only
  unless the user explicitly asks to update shadcn output.
- When asked for OAuth redirect URLs or env vars, give one exact recommendation
  instead of multiple alternatives.
- Treat speculative future-proofing as a bug. Do not add backup env vars,
  imagined code paths, or placeholder config.

## Task-Specific References

- For git/PR/shipping details, use `docs/agent-workflows.md`.
- For live browser validation and route-first UI repros, use
  `skills/noter-playwright-live/SKILL.md`.
- For PR authoring details, use `skills/create-pr/SKILL.md`.
- For macOS UI control, use `skills/mac-app-control/SKILL.md`.
