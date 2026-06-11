# AGENTS.md

Always-loaded agent rules for this repo. Keep this file small: Codex truncates combined project docs
at 32 KiB and silently drops the tail (`pnpm check:agents-budget` enforces the budget; history in
`research/2026-06-11-agents-md-truncation-audit.md`). Long or conditional workflows belong in
`docs/` or `skills/` with a pointer here. Sections are ordered so the most behavior-critical rules
sit first.

## Startup

- Use `pnpm dev` as the normal startup command. It runs the primary dev flow from the main checkout
  and the anonymous local flow from linked git worktrees.
- In a git worktree, `pnpm dev --once` or `pnpm dev:worktree:once` bootstraps once after checkout.
- In a git worktree, use the worktree startup flow before dev/lint/test/commit workflows. Do not
  replace it with direct `npx convex dev`.
- If Convex tooling complains about missing `CONVEX_DEPLOYMENT`, or a worktree command fails with
  `Local backend isn't running`, run `pnpm dev --once` and retry.
- `rg` is not available in some agent environments (it does exist on local dev machines). When it is
  missing, use `grep` and `find` instead.

## Workflow Shortcuts

When the user says one of these commands, execute it directly:

| Command        | Action                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commit`       | Stage changes and create a concise commit                                                                                                                      |
| `push`         | Commit if needed, then push                                                                                                                                    |
| `create pr`    | Push if needed, then create or update a ready PR whose title starts with the current `v<N>:` label                                                             |
| `create draft` | Push if needed, then create or update a draft PR whose title starts with the current `v<N>:` label                                                             |
| `ready`        | Mark the current PR ready                                                                                                                                      |
| `wait`         | Watch CI and report status                                                                                                                                     |
| `ship`         | Commit, push, ensure a ready PR exists, clear actionable review feedback, wait                                                                                 |
| `squash`       | Squash-merge the current PR                                                                                                                                    |
| `archive`      | Remove the current worktree/local branch after confirming a PR exists                                                                                          |
| `link machine` | Run the current checkout's `noter.ts` machine-link flow with worktree isolation when needed                                                                    |
| `clean vaults` | Remove temporary Noter-managed vaults for the current worktree                                                                                                 |
| `clean`        | Run `clean vaults`, clean noter.md PR preview resources, remove the current worktree's local machine link, then remove the merged or closed-PR worktree/branch |
| `status`       | Report branch, local changes, and PR state                                                                                                                     |

Detailed flow rules live in `docs/agent-workflows.md`.

## Workflow Rules

The always-on core; the full protocol (PR bodies, timing, review, labels, archive/clean) lives in
`docs/agent-workflows.md`.

- Always use CLI tools such as `gh` and `git`, and execute requested git/GitHub workflows instead of
  describing them.
- Rename auto-generated random `codex/<word>-<word>-<word>` branches early, always before `commit`,
  `create pr`, or `ship`. Do not put `v<N>` build labels in branch names.
- Before starting implementation on an existing branch or worktree, fetch `origin` and rebase onto
  the latest `origin/main`. When the user says `rebase`, treat it as `rebase` plus `push`.
- Inspect the diff shape with `git diff --stat` (and `git diff --cached --stat` when relevant)
  before `commit`, `create pr`, or `ship`.
- Do not leave a meaningful non-`main` work branch, research branch, or Codex thread without a
  GitHub PR; default to a ready non-draft PR unless the user asks for a draft. PR descriptions
  explain why the change exists, not just what changed. When a PR originates from research or
  automation work, include `First Message` and `Requested Codex Runtime`.
- After a branch commit has been shown, pushed, reviewed, or attached to a PR, preserve follow-up
  work as new commits. Never amend, rebase, or squash branch history unless the user explicitly asks
  for that exact rewrite.
- Every PR title starts with the projected `v<N>:` build label computed from the latest
  `origin/main`. Run `node ./scripts/pr-build-label.ts` to compute and apply it after creating,
  updating, rebasing, or marking ready, and again immediately before merge. When creating the final
  `main` commit through `squash` or `ship`, prefix the squash commit subject with the freshly
  recomputed label; prefer an explicit CLI squash subject over the GitHub UI default. Do not
  consider `create pr`, `create draft`, `ship`, or `squash` complete until the PR title carries the
  fresh label.
- When work implements a named or numbered phase from a spec, RFC, rollout, or accepted plan,
  include the phase label after the build label, such as
  `v1146: Phase 2: Move app provisioning to Workflow`.
- When the user says `update PR`, update the PR metadata with `gh pr edit` (title first, then
  description); this does not mean rewriting branch commit subjects.
- Treat actionable Greptile, CodeRabbit, and Codex review comments as required fixes while shipping.
- Never merge before CI is green. Rebase on the latest `origin/main` immediately before merge.
  Prefer squash merge by default.
- Use the exact temporary vault prefix `tmp-<worktree-id>-<intent>` for Playwright/manual test repos
  created from a worktree.
- `link machine` must use the current checkout's `noter.ts` flow and keep every local repo checkout
  isolated with its own `--state-dir` under `~/.noter/checkouts/<checkout-id>`. Never overwrite the
  default `~/.noter` install as part of local dev linking or cleanup.
- `clean vaults` must fail closed and only remove matching Noter-managed vaults through the
  dashboard delete flow.
- `clean` must follow `docs/noter-pr-preview-cleanup.md` before deleting the remote branch. The
  current branch must have a terminal PR: `MERGED` or `CLOSED`. A draft PR still creates preview
  resources, so any branch that ever had a PR must clean both Cloudflare and Convex previews before
  branch deletion. Do not add scripts or deploy metadata for this cleanup. Missing local env files
  or first-pass metadata gaps block `clean`; they are not a reason to skip provider cleanup.

## Worktree Rules

- If HEAD is detached, use `./scripts/bootstrap-worktree.ts` to create a `codex/<...>` branch.
- Treat the current worktree root from `git rev-parse --show-toplevel` as the workspace boundary
  unless the user explicitly asks otherwise.
- Before dev/test/commit work, confirm the current worktree and branch with
  `git worktree list --porcelain` and `git rev-parse --abbrev-ref HEAD`.
- Do not run `npx convex dev --env-file` pointing at another checkout's `.env.local`; it breaks the
  current worktree's local setup.
- Keep one idea per worktree when possible.

## Operator Preferences

- Keep responses concise by default and always include a final `Summary` section.
- Mention only the actionable lever in user-facing explanations. Do not bring up impossible
  non-options or irrelevant caveats.
- Expect voice-to-text mistakes. Interpret likely transcription errors before asking for
  clarification.
- Commit meaningful checkpoints instead of letting large local diffs accumulate, and push after
  commits so work is not stranded only in the local worktree.
- When a change touches many files or multiple concerns, consider splitting it into two or three
  reviewable commits, such as backend model cleanup, UI wiring, and spec/test updates. This is a
  reviewability preference, not a hard requirement.
- Default to additive minimalism in copy and visuals. Do not add decorative chrome, filler copy,
  extra buttons, or ornamental layout unless explicitly requested.
- For app-owned UI, prefer an empty well-behaved container over a clever or richly pre-structured
  abstraction. If the standard needs to evolve, change the standard instead of front-loading
  speculative slots and props.
- Preserve the established visual language. Do not add shadows, rounded corners, custom easing,
  decorative borders, or similar visual embellishments unless the user explicitly asks for them or
  the surrounding component already uses them.
- For motion and timing, prefer Tailwind defaults unless there is a concrete product reason to
  override them.
- Assume Cloudflare is the default front door and observability layer for `noter.md`, and keep
  application logic in Convex by default unless there is a clear reason not to.
- Never use Vercel as an example provider or integration. Use Netlify when a non-Cloudflare
  deploy/preview provider example is needed.
- Prefer shell commands first and Node/ECMAScript second; do not reach for Python first in this
  repo.
- Use template literals instead of arrays joined with `'\n'` for multi-line JavaScript and
  TypeScript snippets.
- Format documents with oxfmt.
- Prefer exhaustive dispatch with `satisfies never` when it fits.
- When sharing URLs, always format them as clickable Markdown links.
- When pointing the operator at code, include a precise location such as a 1-based line number or
  another unambiguous anchor unless the whole file is genuinely the subject. Do not cite only a
  large file path when the relevant code lives in one small area.
- When sharing a Cloudflare URL in a Markdown link, prefix the label with the word `link` followed
  by a space so it renders correctly in ProseMark, for example
  `[link https://example.trycloudflare.com](https://example.trycloudflare.com)`.
- When a relevant preview exists, include at least one clickable localhost URL in the user-facing
  response; otherwise say that no preview is running.
- When sharing a localhost app preview URL in the user-facing response, also include the active
  Cloudflare tunnel URL for that same app when one exists.
- For preview deploy URLs, use the `?prod-ui` query param.
- When screenshot or visual regression work changes images, show the relevant before/after or diff
  images in the user-facing response.
- When a response relates to an existing PR, mention the PR number as a clickable Markdown link.
- Prefer key-only boolean query params such as `?diff`.
- Preserve unrelated query params when changing app URLs. Use the shared query param helpers instead
  of hand-building URLs.
- For advanced numeric controls, a slider can have a sensible drag range, but typed inputs and
  search params should not clamp above that range unless a real product invariant requires a hard
  maximum.
- For Playwright and browser automation rules (isolated sessions, never steal OS focus, never kill
  all Chrome, mobile emulation from launch, touch-gesture anchoring), follow
  `skills/noter-playwright-live/SKILL.md`.
- When sharing a repo file with the operator and the branch is pushed, prefer a `noter.md` vault
  branch/file URL over a local filesystem link. Local file links are not usable from mobile. Use
  filesystem links only when no Noter vault URL exists for that file.
- Worktree frontend should avoid port `5173`; prefer the worktree defaults.
- Treat shadcn-generated files in `apps/noter/src/components/ui/*` as read-only unless the user
  explicitly asks to update shadcn output.
- When asked for OAuth redirect URLs or env vars, give one exact recommendation instead of multiple
  alternatives.
- Treat speculative future-proofing as a bug. Do not add backup env vars, imagined code paths, or
  placeholder config.

## Communication

- Prefer concrete, step-by-step explanations over compressed implementation shorthand. Name the
  thing that changes, where it is stored, when it is read, and why that fixes the user-visible
  behavior.
- Avoid opaque phrases like "per-entry `history.state` persistence" in final handoffs. Say the
  direct version, such as "the app now saves the Back/Forward indexes into the current browser
  history entry before reload and reads them back after reload."

## Repo Knowledge Map

- `specs/` contains accepted, current source-of-truth behavior and active accepted rollout
  contracts. Do not create a spec for routine one-thread or one-PR changes.
- `rfcs/` contains proposals, rollout plans, and work that is still under discussion.
- `research/` contains exploratory investigations, audits, benchmarks, incident notes, and external
  research. It informs decisions but is not itself the source of truth.
- `docs/` contains durable reference material such as workflow runbooks, compliance artifacts, and
  operator-facing documentation that does not define product behavior.
- `skills/` contains reusable, task-specific playbooks. Keep the `SKILL.md` focused and load heavier
  references/scripts only when needed.
- `archive/` contains superseded or historical material that should not guide new implementation.
- When sources conflict, use this priority order: code and tests, then `specs/`, then active
  accepted rollout contracts, then `rfcs/`, then `research/`, then `archive/`.
- Keep `AGENTS.md` for broad, stable repo rules only. Move long or conditional workflows into
  `docs/` or `skills/`.
- When the user says to "remember this", persist durable repo/operator guidance in the appropriate
  repo artifact instead of leaving it only in chat.
- Avoid bulk doc-folder migrations during active branch churn. Reclassify docs in small batches and
  update references in the same change.
- Use `docs/repo-documentation-standard.md` for the decision table, spec threshold, expected spec
  shape, and cleanup rules.

## Sub-Agent Research

- Always consult `skills/delegation-orchestrator/SKILL.md` before deciding how to handle
  implementation, research, review, workflow, or shortcut tasks. It may keep a small task local, but
  consulting it is not optional.
- This is a standing repo-level request and permission to use sub-agents whenever they would improve
  the work; decide by critical path, independence, cost, and expected signal — do not wait for the
  user to say "delegate".
- Keep the main thread on the critical path as supervisor. Give sub-agents narrow scopes and
  explicit pass/fail criteria, ask for concise findings with file/command evidence, and merge back
  only the conclusions needed for the next decision. Do not paste raw logs into the main thread.
- When delegating or testing shortcut commands such as `clean`, `wait`, `create pr`, or `ship`,
  start the sub-agent in the intended checkout context and send only the exact command shape the
  operator used — no expanded checklists.
- For experiments that may edit files, give each sub-agent an isolated worktree and a disjoint write
  scope, and keep exploratory changes out of the main worktree until intentionally integrated.

## Architecture

- Frontend: React 19, Vite, TanStack Start, TanStack Router
- Backend: Convex
- Auth: Convex Auth app login plus provider OAuth/API-key connection flows
- Editor: Monaco plus CodeMirror 6 / `@prosemark/core`
- UI: Tailwind CSS, Radix UI, shadcn/ui
- State: Convex subscriptions plus TanStack Query

Key domain entities:

- `users`
- `providerConnections`
- `vaults`
- `vaultInfrastructureTargets`
- `vaultInfrastructureOwnership`
- `vaultDomains`
- `fileStaging`
- `collaborativeUpdates`
- `folderExpansionState`
- `aiProdAccessRequests`
- `aiProdAccessAudit`

## Convex CLI

Use from `apps/noter` when debugging runtime issues: `npx convex logs` (add `--prod --history 50`
for production), `npx convex dashboard`, `npx convex env list`.

- When checking production from a worktree, never pass `--env-file` pointing at another checkout. If
  that env provides `CONVEX_DEPLOY_KEY`, the CLI silently ignores `--prod` and targets the deploy
  key's deployment. If it prints `Ignoring --prod ... and using deployment from CONVEX_DEPLOY_KEY`,
  stop and rerun with `CONVEX_DEPLOY_KEY=` cleared from the primary checkout.
- Follow `docs/convex-production-reads.md` for the exact safe production-read recipe (deriving a
  comment-free `CONVEX_DEPLOYMENT` from the primary checkout's `.env.local`).

## Code Guardrails

One-line index; the canonical full wording with rationale and examples lives in
`docs/code-guardrails.md` — read it before non-trivial implementation work.

Types and validation:

- Never use `any` or type assertions; `as const` is fine. Any other assertion needs explicit user
  approval for that exact callsite.
- No `Reflect.get`/`Reflect.set` workarounds; prefer real narrows, else the narrowest
  `@ts-expect-error` with a concrete reason. Never `@ts-nocheck`.
- No `globalThis` in app or test code; use the typed host (`window`, `global`) and add declarations
  for new globals first.
- Write real runtime guards/validators when narrowing `unknown` or provider data; never recommend
  assertion-based examples.
- Prefer inference; do not restate types the expression already proves.
- Put the discriminant property first in union variant shapes.
- Let `pure(...)`/`sure(...)` infer inline validator inputs; no redundant `unknown` annotations.
- When a schema exists, derive the type from it; one source-of-truth schema per boundary — no
  parallel hand-written types, strict companions, or validator-issue translation.
- Convex: result validators before handlers, `Infer<typeof ...>`, destructure validator builders
  once; reserve the `v` prefix for reusable Convex validators (`vProviderAuth`), system-specific
  prefixes elsewhere (`ajv...`).
- Required properties and args by default; every optional needs a current justification.
- Put invariants in the state shape (discriminated unions, required variant fields, closed sets,
  validators that reject impossible rows); runtime transitions only for db/time/provider-dependent
  rules. Keep state spaces small and orthogonal; forbid cross-product interactions the product does
  not need.
- For important state models, start tests by enumerating state axes and allowed combinations.
- Deterministic sort order with stable tie-breakers for all returned collections and lists.

Simplicity and deletion:

- Delete-first is the default: no helper, wrapper, formatter, class, or generated artifact the final
  design does not need; keep native library value/error shapes.
- No custom Error subclasses unless production catches or branches on them; tests are not a reason.
- Run a delete-first reduction pass on every patch-introduced helper/adapter/mirror; rerun it after
  swapping validation approaches.
- Generated validation glue is a carrying cost, but do not replace broad OpenAPI coverage with
  hand-written schemas just to shrink generated files.
- When tests want production mappers or branches for prettier assertions, simplify the test.
- No speculative helpers, flags, env vars, allowlists, or config the patch does not use end to end;
  keep config surfaces minimal. Fail closed over placeholder fallbacks.
- Delete temporary adapters once a native API is viable, transitional helpers unused outside tests,
  dead scaffolding, and incomplete extractions.
- App-internal refactors are delete-first: no pass-through props, wrappers, or shims; internal
  backwards compatibility is a non-goal.
- No parameterized helper factories with one callsite.
- Remove `key in object` checks that only appease TypeScript.
- No barrel files for app code; no same-name re-export shims — update imports directly and delete
  shims when found.
- Separate business logic from generic mechanics; small typed utilities in focused shared modules
  whose path carries the context (`pick` in an object module).
- Generated files contain only output derived from their named source of truth.
- Wrap hard-coded tracked-file references in scripts with `trackedFilePath(...)` or
  `noterAppFilePath(...)`.

Effects and reads:

- Justify every `useEffect`/`useLayoutEffect`; prefer route lifecycle, data/cache APIs, handlers,
  derived state, or CSS; collapse duplicate effects. In curated VMs such as the route URL editor,
  effects, observers, and polling need even stronger proof — drop nice-to-have features instead.
- Avoid `"use node"` unless truly required.
- Truthiness checks for `true | undefined` flags; existence checks when existence is the meaning —
  exact `!== undefined`/`typeof` checks only when that exact state is modeled.
- Use `notEmpty` from `@noter-md/dependent` for filtering nullable arrays.
- Repeated `?.` on one value is a correctness smell: narrow once with an explicit missing branch.
- Direct conditions over intermediates; no `!!` or named booleans for engineering theater.

Comments:

- Comment the constraint or invariant, in the code's own terminology (`draftPath`, not invented
  labels); JSDoc for functions with non-obvious ownership or timing; name concrete runtime cases.
- Local-type JSDoc uses the simplest direct vocabulary, multiline blocks without leading `*`
  prefixes; preserve user-authored wording.

UI code:

- `URLSearchParams` is lint-warned: typed route objects and helpers for app search; protocol
  boundaries (OAuth, fixtures, tests) may stay native.
- Closed styling APIs for app-owned components; no `className` pass-throughs without a shipped need;
  evolve the component's standard instead of threading overrides.
- Standardize shared layout chrome structure; no semantic content sub-APIs (`title`, `meta`,
  `leading`, `trailing`) without a real shared pattern.
- No dynamically built Tailwind/CSS class names; map state to full literal strings.
- App-internal navigation goes through TanStack Router `Link`/`navigate`; plain anchors only for
  external URLs, downloads, or deliberate reloads; href-bearing internal actions still SPA-route
  ordinary left-clicks.

## Non-Functional Guardrails

- Never leak tokens, provider credentials, or sensitive user data into logs, screenshots, docs,
  fixtures, or PR text.
- Preserve approval, auth, and audit boundaries. Do not silently widen access to production reads or
  external writes.
- Avoid obvious performance regressions on large files, long lists, and shared editor surfaces.
- Preserve keyboard, focus, selection, and touch behavior when changing shared shells or editor
  integrations.

## UI And Testing

- Prefer silent, smooth UX over chatty loading placeholders.
- Prefer existing shadcn/ui primitives or app-owned wrappers over bespoke Tailwind-only replacements
  when they already solve the problem.
- When designing or extracting UI, start from the smallest viable working surface. Standardize shell
  behavior like sizing, spacing, scrolling, and containment before adding labels, helper copy,
  metadata, or extra chrome. Do not pre-populate new layout components with invented content
  structure or helper APIs.
- For app-owned UI, use as few Tailwind utilities as possible. Every utility class should protect a
  current invariant; if you cannot name the invariant a class preserves, leave it out.
- For pane rails that should feel nearly flush, prefer `px-1` over `px-0` so the content keeps a
  small nonzero inset without reading as padded.
- On iOS/iPadOS WebKit, focused text-entry controls below 16 CSS px can trigger viewport zoom.
  Shipped inputs, textareas, selects, and contenteditable editor fields must render at 16px or
  larger unless the product intentionally accepts focus zoom for that control.
- Browser-owned page scroll is the default for route surfaces. Do not use route-level `h-screen`,
  `h-dvh`, `overflow-hidden`, or full-page `overflow-y-auto` shells under shared app chrome unless
  the route truly needs contained pane behavior. When a route needs to fill the space below shared
  chrome, use route-body flex sizing such as `flex min-h-0 flex-1 flex-col`, and place any
  intentional local scroller lower in the tree so pull-to-refresh and edge-swipe keep working.
- When headings, cards, or selected rows can be opened through a link, query param, or programmatic
  scroll, preserve enough scroll-end space for the last target to align at the top of its
  scrollport.
- Temporary ProseMark workaround: when authoring a Markdown link whose label would exactly equal its
  URL, prefix the label with `link` plus a leading space so the rendered link stays visible until
  that ProseMark bug is fixed.
- Add or update screenshot coverage whenever a patch changes shipped UI.
- For Playwright baselines, live validation, focused-vs-full acceptance runs, session rules, and
  fixture policy, follow `skills/noter-playwright-live/SKILL.md` and
  `docs/playwright-visual-testing.md`. Never accept native macOS screenshots as baselines; the
  canonical local acceptance command is `pnpm test:visual:linux`.
- For bugs involving scroll, touch, drag, focus, selection, pane layout, auth wiring, or route shell
  behavior, reproduce and test the real app route first. Do not create fake visual fixtures just to
  show or approve a behavior screenshot; a fixture must mount the exact production component tree
  without invented chrome, and a failing route-level or honest production-component repro comes
  before narrower fixture coverage (`docs/agent-workflows.md`, Route-First UI Regression Policy).
- Use rectangular app chrome by default.
- Disable async destructive triggers while pending and show an in-button pending state.
- Persist user-visible UI state in Convex by default unless per-device behavior is explicitly
  desired.
- On mobile-first chat or prompt surfaces, Enter must not send by default. Require an explicit send
  action and treat accidental Enter-to-send on mobile as a product bug.

## shadcn/ui Rules

- Do not manually edit generated files in `apps/noter/src/components/ui/*` unless the user
  explicitly asks for that exact change.
- Use the shadcn CLI via `npx` for component additions or refreshes.
- Prefer repo-owned wrapper entrypoints outside `components/ui/*` when Noter needs shared styling or
  behavior over a generated primitive.
- If a generated file is explicitly edited, keep the change minimal and call out the divergence.

## Task-Specific References

- For the extracted agent context bundle and live modularization map, use
  `packages/agent-context/manifests/noter.md` and
  `research/2026-05-23-agent-context-agents-migration-map.md`. The package does not replace live
  routing yet; keep always-loaded rules until a migration proves each replacement is reachable.
- For git/PR/shipping details, use `docs/agent-workflows.md`.
- For safe Convex production reads, use `docs/convex-production-reads.md`.
- For live browser validation and route-first UI repros, use
  `skills/noter-playwright-live/SKILL.md`.
- For PR authoring details, use `skills/create-pr/SKILL.md`.
- For macOS UI control, use `skills/mac-app-control/SKILL.md`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `apps/noter/convex/_generated/ai/guidelines.md` first**
for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules
that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->
