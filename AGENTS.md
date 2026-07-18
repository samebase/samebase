# AGENTS.md

Always-loaded agent rules. Keep it small: Codex truncates combined project docs at 32 KiB and
silently drops the tail (`pnpm check:agents-budget` enforces the budget; history in
`research/2026-06-11-agents-md-truncation-audit.md`).

## Startup

- Use `pnpm dev` everywhere. It installs dependencies, completes linked-worktree local Convex
  seed/auth setup, then starts the correct primary or anonymous dev flow. It does not depend on a
  Codex setup command.
- In a new linked worktree, use `pnpm dev --once` to perform the same setup and exit before
  lint/test/commit workflows. Do not replace this flow with direct `npx convex dev`.
- If Convex tooling complains about missing `CONVEX_DEPLOYMENT`, or a worktree command fails with
  `Local backend isn't running`, run `pnpm dev --once` and retry.

## Punctuation

- Never use the U+2014 em dash character in repo-authored text, code comments, UI copy, docs, PR
  text, or agent responses. Rephrase with commas, colons, parentheses, or separate sentences
  instead.

## Workflow Shortcuts

When the user says one of these commands, execute it directly:

| Command        | Action                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `commit`       | Stage changes and create a concise commit                                                                                                                          |
| `push`         | Commit if needed, then push                                                                                                                                        |
| `create pr`    | Push if needed, then create or update a ready PR whose title starts with the current `v<N>:` label                                                                 |
| `create draft` | Push if needed, then create or update a draft PR whose title starts with the current `v<N>:` label                                                                 |
| `ready`        | Mark the current PR ready                                                                                                                                          |
| `wait`         | Watch CI and report status                                                                                                                                         |
| `squash`       | Squash-merge the current PR                                                                                                                                        |
| `link machine` | Run the current checkout's `samebase.ts` machine-link flow with worktree isolation when needed                                                                     |
| `clean vaults` | Remove temporary Samebase-managed vaults for the current worktree                                                                                                  |
| `clean`        | Run `clean vaults`, clean samebase.com PR preview resources, remove the current worktree's local machine link, then remove the merged or closed-PR worktree/branch |
| `status`       | Report branch, local changes, and PR state                                                                                                                         |

## Workflow Rules

The always-on core; the full protocol (PR bodies, timing, review, labels, archive/clean) lives in
`docs/agent-workflows.md`.

- Always use CLI tools such as `gh` and `git`, and execute requested git/GitHub workflows instead of
  describing them.
- Rename auto-generated random `codex/<word>-<word>-<word>` branches early, always before `commit`
  or `create pr`. Do not put `v<N>` build labels in branch names.
- Before starting implementation on an existing branch or worktree, fetch `origin` and rebase onto
  the latest `origin/main`. When the user says `rebase`, treat it as `rebase` plus `push`.
- Inspect the diff shape with `git diff --stat` (and `git diff --cached --stat` when relevant)
  before `commit` or `create pr`.
- For implementation, docs, or research on a meaningful non-`main` branch, commit and push
  reviewable checkpoints as coherent slices land; do not save one large local diff for the end. Do
  not send the final response until the branch has a ready GitHub PR unless the user opts out or
  asks for a draft. PR descriptions explain why the change exists, not just what changed. When a PR
  originates from research or automation work, include `First Message` and
  `Requested Codex Runtime`.
- After a branch commit has been shown, pushed, reviewed, or attached to a PR, preserve follow-up
  work as new commits. Never amend, rebase, or squash branch history unless the user explicitly asks
  for that exact rewrite.
- Every PR title starts with the projected `v<N>:` build label computed from the latest
  `origin/main`. Run `node ./scripts/pr-build-label.ts` to compute and apply it after creating,
  updating, rebasing, or marking ready, and again immediately before merge. When creating the final
  `main` commit through `squash`, prefix the squash commit subject with the freshly recomputed
  label; prefer an explicit CLI squash subject over the GitHub UI default. Never infer the label
  from existing branch commit subjects, stale PR titles, or the branch name. Do not consider
  `create pr`, `create draft`, or `squash` complete until the PR title carries the fresh label.
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
- `link machine` must use the current checkout's `samebase.ts` flow and keep every local repo
  checkout isolated with its own `--state-dir` under `~/.samebase/checkouts/<checkout-id>`. Never
  overwrite the default `~/.samebase` install as part of local dev linking or cleanup.
- `clean vaults` must fail closed and only remove matching Samebase-managed vaults through the
  dashboard delete flow.
- `clean` requires a terminal PR (`MERGED`/`CLOSED`) and must follow
  `docs/samebase-pr-preview-cleanup.md` first: any branch that ever had a PR (drafts included) must
  clean both Cloudflare and Convex previews before deleting the branch. Missing env files or
  metadata gaps block `clean`; they never justify skipping provider cleanup.

## Worktree Rules

- On detached HEAD, `pnpm dev` and `pnpm dev --once` create the `codex/<...>` branch themselves.
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
  non-options or irrelevant caveats. When asked for any value or decision (OAuth redirect URLs, env
  vars, names), give one exact recommendation instead of alternatives.
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
- Use Tailwind motion and timing defaults unless the product requires otherwise.
- Assume Cloudflare is the default front door and observability layer for `samebase.com`, and keep
  application logic in Convex by default unless there is a clear reason not to.
- In copy, docs, and examples: never use Vercel as an example provider; use Netlify when a
  non-Cloudflare provider example is needed. The product is provider-agnostic; Samebase itself runs
  on and recommends Cloudflare.
- Prefer shell commands first and Node/ECMAScript second; do not reach for Python first in this
  repo.
- Use template literals instead of arrays joined with `'\n'` for multi-line JavaScript and
  TypeScript snippets.
- Format documents with oxfmt.
- Prefer exhaustive dispatch with `satisfies never` when it fits.
- Assume responses may be read from a phone: every reference must be a tappable URL reachable off
  this machine: clickable Markdown links everywhere, PR numbers as links, the Cloudflare tunnel URL
  alongside any localhost URL, and samebase.com vault file URLs instead of local filesystem paths
  whenever the branch is pushed.
- Code references need a precise line or anchor; do not cite only a large file.
- Link a relevant localhost preview, or say none is running.
- For preview deploy URLs, use the `?prod-ui` query param.
- When screenshot or visual regression work changes images, show the relevant before/after or diff
  images in the user-facing response.
- Prefer key-only boolean query params such as `?diff`.
- Preserve unrelated query params when changing app URLs. Use the shared query param helpers instead
  of hand-building URLs.
- UI affordances (slider drag ranges, preset lists) may suggest values; only a real product
  invariant may reject typed input, URL params, or API values. Never convert a UI convenience into a
  hard limit.
- For Playwright and browser automation rules (isolated sessions, never steal OS focus, never kill
  all Chrome, mobile emulation from launch, touch-gesture anchoring), follow
  `skills/samebase-playwright-live/SKILL.md`.
- Worktree frontend should avoid port `5173`; prefer the worktree defaults.
- Treat shadcn-generated files in `apps/samebase/src/components/ui/*` as read-only unless the user
  explicitly asks to update shadcn output.
- Do not add speculative env vars, code paths, allowlists, or placeholder config.

## Communication

- Prefer concrete, step-by-step explanations over compressed implementation shorthand. Name the
  thing that changes, where it is stored, when it is read, and why that fixes the user-visible
  behavior.
- Treat operator suggestions as hypotheses to evaluate, not instructions to accept by default. Say
  whether the suggestion is correct, partially correct, or would make the code worse, then name the
  deciding reason.
- When a code decision is questioned or a follow-up edit would reverse an earlier choice, explain
  the rationale before editing. Do not substitute a patch for the reason the decision was made.
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

- Always load and apply `skills/delegation-orchestrator/SKILL.md` before deciding how to handle
  implementation, research, review, workflow, or shortcut tasks. It may keep a small task local, but
  consulting it is not optional.
- This is a standing repo-level request and permission to use sub-agents whenever they would improve
  the work; decide by critical path, independence, cost, and expected signal. Do not wait for the
  user to say "delegate".
- Treat sub-agent tooling as a cheap default for sidecar research, log/test sweeps, public-doc
  comparisons, or technical spikes whose details are not needed in the main thread.
- Choose model and isolation by task: fast models without a worktree for bounded searches or
  summaries; xhigh agents with their own worktrees for hard design, verification, or implementation
  probes that need deep reasoning or editable experiments.
- Keep the main thread on the critical path as supervisor. Give sub-agents narrow scopes and
  explicit pass/fail criteria, ask for concise findings with file/command evidence, and merge back
  only the conclusions needed for the next decision. Treat sub-agent output as a context filter;
  close sub-agent threads once findings are integrated, and do not paste raw logs or bulky detail
  into the main thread or final response unless the user asks for it.
- When delegating or testing shortcut commands such as `clean`, `wait`, or `create pr`, start the
  sub-agent in the intended checkout context and send only the exact command shape the operator used
  with no expanded checklists.
- For experiments that may edit files, give each sub-agent an isolated worktree and a disjoint write
  scope, and keep exploratory changes out of the main worktree until intentionally integrated.

## Architecture

- Frontend: React 19, Vite, TanStack Start, TanStack Router
- Backend: Convex
- Auth: Convex Auth app login plus provider OAuth/API-key connection flows
- Editor: Monaco plus CodeMirror 6 / `@prosemark/core`
- UI: Tailwind CSS, Base UI, shadcn/ui
- State: Convex subscriptions plus TanStack Query
- Chat/agent, GitHub Codespaces, and remote-machine features are dormant: they have no active users
  or planned release. Preserve them cheaply, but do not let them drive migrations or expand task
  scope unless the operator explicitly reactivates them.

Key domain entities:

- `users`
- `providerConnections`
- `vaults`
- `operations_vaultProvisioningPlans`
- `operations_vaultProvisioningWriteLocks`
- `vaultDomains`
- `operations_fileStaging`
- `operations_aiProductionReadRequests`
- `audit_aiProductionReadEvents`

## Convex CLI

Use from `apps/samebase` when debugging runtime issues: `npx convex logs` (add `--prod --history 50`
for production), `npx convex dashboard`, `npx convex env list`.

- When checking production from a worktree, never pass `--env-file` pointing at another checkout. If
  that env provides `CONVEX_DEPLOY_KEY`, the CLI silently ignores `--prod` and targets the deploy
  key's deployment. If it prints `Ignoring --prod ... and using deployment from CONVEX_DEPLOY_KEY`,
  stop and rerun with `CONVEX_DEPLOY_KEY=` cleared from the primary checkout.
- Follow `docs/convex-production-reads.md` for the exact safe production-read recipe.

## Code Guardrails

One-line index; the canonical full wording with rationale and examples lives in
`docs/code-guardrails.md`; read it before non-trivial implementation work.

Types and validation:

- Type-unsafety must be explicit, searchable, and quarantined: hiding a type gap is worse than
  declaring one; TypeScript serves the mental model, not the other way around.
- Never use `any` or type assertions except `as const`; use the narrowest `@ts-expect-error` plus a
  runtime fact for unavoidable gaps. Rare `any` is limited to type-level generics where
  `unknown`/`never` cannot express a constraint and needs a next-line lint-disable. Lint exceptions
  are `eslint-disable-next-line` + reason on the exact offending line; file-top only when a rule
  saturates the file. Never config-level exemptions; only generated files get config overrides.
- Never launder type gaps through overloads the implementation cannot prove, `as unknown as`, or
  type-erasing generics. Overloads may refine truths the implementation guarantees (`map`/`atLeast`
  in `@samebase/dependent`), never costume types the code cannot earn.
- Type predicates are unsafe by default (assertion-lite): never hand-write a `value is T` claim TS
  cannot check. A disconnected predicate keeps narrowing to a stale shape when the source evolves,
  with no error. Derive predicates with `guard<Input, Target>` from `@samebase/dependent`
  (generics-first; the callback returns the narrowed value or null; identity-checked); where a sure
  schema proves the shape, let the validator's own result narrow. Plain local boolean checks may
  rely on TS-inferred predicates ("disconnected type safety" in `docs/code-guardrails.md`).
- Absorb recurring TS technicalities into tiny shared wrappers with honest signatures and the
  `@ts-expect-error` inside (`includes`, `entries`, `pick` in `@samebase/dependent`; `packages/sure`
  is the philosophy at its extreme). Keep that vocabulary small; no long-named one-line helpers
  sprawling through app code.
- No `Reflect.get`/`Reflect.set` workarounds; prefer real narrows, else the narrowest
  `@ts-expect-error` with a concrete reason. Never `@ts-nocheck`.
- No `globalThis` in app or test code; use the typed host (`window`, `global`) and add declarations
  for new globals first.
- Write real runtime guards/validators when narrowing `unknown` or provider data; never recommend
  assertion-based examples.
- Prefer inference; do not restate types the expression already proves.
- For generic function members on object types, prefer `fn: <T>(...) => R` over `fn<T>(...): R`
  unless method semantics are required; this avoids VS Code TextMate tokenization bugs.
- Put the discriminant property first in union variant shapes.
- Let `pure(...)`/`sure(...)` infer inline validator inputs; no redundant `unknown` annotations.
- When a schema exists, derive the type from it; one source-of-truth schema per boundary, with no
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
  design does not need (including factories parameterized for a single callsite); keep native
  library value/error shapes.
- No custom Error subclasses unless production catches or branches on them; tests are not a reason.
- Run a delete-first reduction pass on every patch-introduced helper/adapter/mirror; rerun it after
  swapping validation approaches.
- When changing a helper, inspect every production call site and its tests before keeping it;
  one-call helpers and tests that only restate the wrapper are delete-first signals.
- Generated validation glue is a carrying cost, but do not replace broad OpenAPI coverage with
  hand-written schemas just to shrink generated files.
- When tests want production mappers or branches for prettier assertions, simplify the test.
- No speculative helpers, flags, env vars, allowlists, or config the patch does not use end to end;
  keep config surfaces minimal. Fail closed over placeholder fallbacks.
- Delete temporary adapters once a native API is viable, transitional helpers unused outside tests,
  dead scaffolding, and incomplete extractions.
- App-internal refactors are delete-first: no pass-through props, wrappers, or shims; internal
  backwards compatibility is a non-goal.
- No runtime statements whose only job is appeasing the type checker (presence checks, redundant
  guards). Declare the gap instead.
- No barrel files for app code; no same-name re-export shims. Update imports directly and delete
  shims when found.
- Separate business logic from generic mechanics; small typed utilities in focused shared modules
  whose path carries the context (`pick` in an object module).
- Generated files contain only output derived from their named source of truth.
- Wrap hard-coded tracked-file references in scripts with `trackedFilePath(...)` or
  `samebaseAppFilePath(...)`.

Effects and reads:

- Justify every `useEffect`/`useLayoutEffect`; prefer route lifecycle, data/cache APIs, handlers,
  derived state, or CSS; collapse duplicate effects. In curated VMs such as the route URL editor,
  effects, observers, and polling need even stronger proof. Drop nice-to-have features instead.
- Avoid `"use node"` unless truly required.
- Truthiness checks for `true | undefined` flags; existence checks when existence is the meaning.
  Exact `!== undefined`/`typeof` checks only when that exact state is modeled.
- Use `notEmpty` from `@samebase/dependent` for filtering nullable arrays.
- Repeated `?.` on one value is a correctness smell: narrow once with an explicit missing branch.
- Direct conditions over intermediates; no `!!` or named booleans for engineering theater.

Comments:

- Comment the constraint or invariant, in the code's own terminology (`draftPath`, not invented
  labels); JSDoc for functions with non-obvious ownership or timing; name concrete runtime cases.
- Local-type JSDoc uses the simplest direct vocabulary, multiline blocks without leading `*`
  prefixes; preserve user-authored wording.

UI code:

- Closed styling APIs for app-owned components; no `className` pass-throughs without a shipped need;
  evolve the component's standard instead of threading overrides.
- Standardize shared layout chrome structure; no semantic content sub-APIs (`title`, `meta`,
  `leading`, `trailing`) without a real shared pattern.
- No dynamically built Tailwind/CSS class names; map state to full literal strings.
- Workspace pane content is pane-responsive: container variants (`@3xl:`, `cqw`) against the pane
  container from `WorkspaceLayoutV2PaneFrame`, never viewport `sm:`/`md:`/`vw`; viewport-relative
  styling only for true viewport concerns such as `svh` scroll-end space.
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
- On iOS/iPadOS WebKit, focused text-entry controls below 16 CSS px can trigger viewport zoom.
  Shipped inputs, textareas, selects, and contenteditable editor fields must render at 16px or
  larger unless the product intentionally accepts focus zoom for that control.
- Browser-owned page scroll is the default for route surfaces: no route-level
  `h-screen`/`h-dvh`/`overflow-hidden`/full-page `overflow-y-auto` under shared chrome unless the
  route truly needs a contained pane. Fill space below chrome with `flex min-h-0 flex-1 flex-col`
  and keep local scrollers lower in the tree so pull-to-refresh and edge-swipe keep working.
- Preserve enough scroll-end space for the last link/param/scroll target to align at the top of its
  scrollport.
- Temporary ProseMark workaround: prefix a Markdown link label that would equal its URL with `link`
  plus a leading space so the link renders visibly.
- Add or update screenshot coverage whenever a patch changes shipped UI.
- For Playwright baselines, live validation, focused-vs-full acceptance runs, session rules, and
  fixture policy, follow `skills/samebase-playwright-live/SKILL.md` and
  `docs/playwright-visual-testing.md`. `pnpm test:visual:linux` is the canonical local acceptance
  command for visual/Playwright validation. Do not substitute host-native
  `pnpm --filter samebase test:visual`, Playwright shards, or focused specs for acceptance unless
  the user explicitly asks for that exact non-canonical command; if a non-canonical visual run was
  used first, say so and run the Docker/Linux wrapper before reporting visual acceptance.
- For bugs involving scroll, touch, drag, focus, selection, pane layout, auth wiring, or route shell
  behavior, reproduce and test the real app route first. Do not create fake visual fixtures just to
  show or approve a behavior screenshot; a fixture must mount the exact production component tree
  without invented chrome, and a failing route-level or honest production-component repro comes
  before narrower fixture coverage. Fixture ownership must match the changed product surface
  (`docs/agent-workflows.md`, Route-First UI Regression Policy).
- Authenticated app routes keep the standard right sidebar for navigation unless a documented
  product requirement removes it.
- Disable async destructive triggers while pending and show an in-button pending state.
- Persist user-visible UI state in Convex by default unless per-device behavior is explicitly
  desired.

## shadcn/ui Rules

- Do not manually edit generated files in `apps/samebase/src/components/ui/*` unless the user
  explicitly asks for that exact change.
- Use the shadcn CLI via `npx` for component additions or refreshes.
- Prefer repo-owned wrapper entrypoints outside `components/ui/*` when Samebase needs shared styling
  or behavior over a generated primitive.
- If a generated file is explicitly edited, keep the change minimal and call out the divergence.

## Task-Specific References

- For the extracted agent context bundle and live modularization map, use
  `packages/agent-context/manifests/samebase.md` and
  `research/2026-05-23-agent-context-agents-migration-map.md`. The package does not replace live
  routing yet; keep always-loaded rules until a migration proves each replacement is reachable.
- For git/PR/shipping details, use `docs/agent-workflows.md`.
- For safe Convex production reads, use `docs/convex-production-reads.md`.
- For live browser validation and route-first UI repros, use
  `skills/samebase-playwright-live/SKILL.md`.
- For PR authoring details, use `skills/create-pr/SKILL.md`.
- For macOS UI control, use `skills/mac-app-control/SKILL.md`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `apps/samebase/convex/_generated/ai/guidelines.md`
first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains
rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->
