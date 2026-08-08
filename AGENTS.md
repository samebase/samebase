# AGENTS.md

Only report to me in ASD-STE100 Simplified Technical English.

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

| Command        | Action                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `commit`       | Stage changes and create a concise commit                                                                        |
| `push`         | Commit if needed, then push                                                                                      |
| `create pr`    | Push if needed, then create or update a ready PR whose title starts with the current `v<N>:` label               |
| `create draft` | Push if needed, then create or update a draft PR whose title starts with the current `v<N>:` label               |
| `ready`        | Mark the current PR ready                                                                                        |
| `wait`         | Watch CI and report status                                                                                       |
| `squash`       | Squash-merge the current PR                                                                                      |
| `clean vaults` | Remove temporary Samebase-managed vaults for the current worktree                                                |
| `clean`        | Run `clean vaults`, clean samebase.com PR preview resources, then remove the merged or closed-PR worktree/branch |
| `status`       | Report branch, local changes, and PR state                                                                       |

## Workflow Rules

The full protocol for PR bodies, review, labels, and cleanup lives in `docs/agent-workflows.md`.

- Always use CLI tools such as `gh` and `git`, and execute requested git/GitHub workflows instead of
  describing them.
- Rename random `codex/<word>-<word>-<word>` branches before `commit` or `create pr`. Do not put
  `v<N>` labels in branch names.
- Keep PR branches linear. Rebase onto the latest `origin/main`; never merge `main` into them. The
  `rebase` command includes a push.
- Inspect the diff shape with `git diff --stat` (and `git diff --cached --stat` when relevant)
  before `commit` or `create pr`.
- Commit and push meaningful non-`main` work in reviewable checkpoints. Finish with a ready PR
  unless the user opts out or asks for a draft.
- Prefer new commits over amending existing commits.
- Run `node ./scripts/pr-build-label.ts` after PR or branch updates and before merge. The current PR
  title and final squash commit must use its fresh `v<N>:` label.
- When work implements a named or numbered phase from a spec, RFC, rollout, or accepted plan,
  include the phase label after the build label, such as
  `v1146: Phase 2: Move app provisioning to Workflow`.
- `update PR` changes the title first, then the description. It does not change commit subjects.
- Treat actionable Greptile, CodeRabbit, and Codex review comments as required fixes while shipping.
- Merge only with green CI and a branch rebased on the latest `origin/main`. Prefer squash merge.
- Use the exact temporary vault prefix `tmp-<worktree-id>-<intent>` for Playwright/manual test repos
  created from a worktree.
- `clean vaults` must fail closed and only remove matching Samebase-managed vaults through the
  dashboard delete flow.
- `clean` requires a merged or closed PR. Follow `docs/samebase-pr-preview-cleanup.md` and fail
  closed if provider cleanup cannot finish.

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
- When a change touches many files or multiple concerns, consider splitting it into two or three
  reviewable commits, such as backend model cleanup, UI wiring, and spec/test updates. This is a
  reviewability preference, not a hard requirement.
- Default to additive minimalism in copy and visuals. Do not add decorative chrome, filler copy,
  extra buttons, or ornamental layout unless explicitly requested.
- For app-owned UI, prefer an empty well-behaved container over a clever or richly pre-structured
  abstraction. If the standard needs to evolve, change the standard instead of front-loading
  speculative slots and props.
- Preserve established visual language. Do not add shadows, rounded corners, custom easing, or
  decorative borders unless requested or already established.
- Prefer spacing at section endings; empty states and section endings do not get bottom borders.
- Use Tailwind motion and timing defaults unless the product requires otherwise.
- Assume Cloudflare is the default front door and observability layer for `samebase.com`, and keep
  application logic in Convex by default unless there is a clear reason not to.
- In copy, docs, and examples: never use Vercel as an example provider; use Netlify when a
  non-Cloudflare provider example is needed. The product is provider-agnostic; Samebase itself runs
  on and recommends Cloudflare.
- Use shell for one-offs. Handwritten Node automation uses normal `.ts` files run directly by Node
  24 under the package's ESM `"type": "module"`. Automation must work on macOS, Linux, and Windows
  without Bash or PowerShell. Do not reach for Python first.
- Treat authored `.js`, `.mjs`, and `.cjs` files as a review smell. Keep one only when a named tool
  or runtime cannot use normal TypeScript, and document that exact boundary. Generated output and
  required shipped browser artifacts can be valid exceptions.
- Use template literals instead of arrays joined with `'\n'` for multi-line JavaScript and
  TypeScript snippets.
- Vite+ owns the shared app dev, build, test, lint, and format commands. Oxlint and Oxfmt are the
  linter and formatter behind that contract. Treat a direct ESLint runner or dependency as a review
  smell that needs an exact reason.
- Specialized tools can own product-specific execution, such as Remotion Studio, bundle, and render
  commands. Their lint and format commands stay on the root Vite+ contract.
- Format documents with Oxfmt through Vite+.
- Prefer exhaustive dispatch with `satisfies never` when it fits.
- Assume responses may be read from a phone: every reference must be a tappable URL reachable off
  this machine: clickable Markdown links everywhere, PR numbers as links, the Cloudflare tunnel URL
  alongside any localhost URL, and samebase.com vault file URLs instead of local filesystem paths
  whenever the branch is pushed.
- In Codex Desktop responses, render inline images from absolute local filesystem paths. Remote
  image URLs, including raw GitHub URLs, show as broken thumbnails. When off-machine access is also
  needed, put a separate tappable remote URL beside the locally rendered image.
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
- Worktree frontend should avoid port `5173`; prefer the worktree defaults.

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

- Load and follow `skills/delegation-orchestrator/SKILL.md` before implementation, research, review,
  workflow, or shortcut tasks. This is standing permission to delegate when it improves the work.
- Keep delegated tasks narrow. For experiments that may edit files, use an isolated worktree and a
  disjoint write scope. Preserve the user's exact command when delegating a workflow shortcut.

## Architecture

- Frontend: React 19, Vite, TanStack Start, TanStack Router
- Backend: Convex
- Auth: Convex Auth app login plus provider OAuth/API-key connection flows
- Editor: Monaco plus CodeMirror 6 / `@prosemark/core`
- UI: Tailwind CSS, Base UI, shadcn/ui
- State: Convex subscriptions plus TanStack Query
- Samebase does not ship an in-app AI chat or agent graph. Agents use the app through MCP and
  browser handoff. Reintroduction requires a new accepted product decision.

Key domain entities:

- `users`
- `organizations`
- `organizationMemberships`
- `organizationBillingAccounts`
- `organizationProviderCredentials`
- `vaults`
- `workflow_vaultProvisioning_plans`
- `workflow_vaultProvisioning_writeLocks`
- `vaultStagedFiles`

## Convex CLI

Use from `apps/samebase` when debugging runtime issues: `npx convex logs` (add `--prod --history 50`
for production), `npx convex dashboard`, `npx convex env list`.

- Follow `docs/convex-production-reads.md` exactly for production reads.

## Code Guardrails

Read `docs/code-guardrails.md` before non-trivial implementation work. This section is only its
always-loaded index.

Types and validation:

- Keep type gaps explicit and searchable. Never use `any` or assertions except `as const`; use the
  narrowest `@ts-expect-error` with the runtime fact. Rare type-level `any` needs a local lint
  reason. Never use `@ts-nocheck` or config-level exemptions.
- Put lint exceptions on the exact line with a reason. Use a file-level exception only when one rule
  saturates the file. Only generated files can use config-level overrides.
- Do not hide type gaps with false overloads, casts, reflection, `globalThis`, hand-written type
  predicates, or runtime checks added only for TypeScript. Use inference, validation, typed hosts,
  `guard<Input, Target>`, or a small shared wrapper with an honest signature.
- Do not hand-write a `value is T` claim that TypeScript cannot check. Use `guard<Input, Target>`
  for reusable predicates, the validator result when a schema proves the shape, or an inferred local
  predicate for a simple one-off check.
- Validate unknown and provider data at runtime.
- Provider parsers use sourced real payloads; synthetic fixtures only mutate them for negative
  tests.
- Prefer inference. Use one source-of-truth schema per boundary and derive its type. Put union
  discriminants first and let `pure(...)` or `sure(...)` infer inline inputs.
- Do not add parallel response types, strict companion schemas, or validator-issue translations.
- For generic function members on object types, prefer `fn: <T>(...) => R` unless method semantics
  are part of the contract.
- Overloads can refine a runtime truth. They cannot give an implementation a type it cannot prove.
- Follow `docs/data-modeling-vocabulary.md` for Convex tables. Put result validators before
  handlers, derive types with `Infer`, and reserve `v` for reusable Convex value validators.
- Destructure Convex validator builders once. Use system-specific prefixes for other validators.
- Make properties and arguments required by default. Put durable invariants in the state shape and
  keep unsupported state combinations unrepresentable.
- Use runtime state transitions only for rules that depend on database contents, time, or provider
  responses. Keep independent state axes small.
- For important state models, start tests by enumerating state axes and allowed combinations.
- Give all returned collections and lists a deterministic order with stable tie-breakers.

Simplicity and deletion:

- Delete-first is the default. Do not add a helper, wrapper, formatter, class, adapter, mirror, or
  generated artifact that the final design does not need.
- Run a delete-first pass on each helper, adapter, mirror, or validator wrapper introduced by a
  patch. Run it again after a validation approach changes.
- Before keeping a helper, inspect all production call sites and its tests. One-call helpers and
  tests that only restate a wrapper are deletion signals.
- Keep native library value and error shapes. Add a custom Error class only when production catches
  it, branches on it, or an existing module contract requires it.
- Generated validation glue is a carrying cost, but do not replace broad OpenAPI coverage with
  hand-written schemas just to shrink generated files.
- Simplify tests instead of adding production mappers or branches for cleaner assertions.
- Do not add speculative helpers, flags, env vars, allowlists, compatibility paths, or config. Fail
  closed instead of using placeholder fallbacks.
- Delete obsolete adapters, test-only production helpers, pass-through props, re-export shims, and
  dead scaffolding. App-internal backwards compatibility is a non-goal.
- Do not add app barrel files or same-name re-export files. Update imports directly.
- Do not add presence checks, redundant guards, or other runtime statements only to satisfy the type
  checker. Declare the type gap instead.
- Separate business logic from generic mechanics; small typed utilities in focused shared modules
  whose path carries the context (`pick` in an object module).
- Generated files contain only output derived from their named source of truth.
- Wrap hard-coded tracked-file references in scripts with `trackedFilePath(...)` or
  `samebaseAppFilePath(...)`.

Effects and reads:

- Justify every effect, observer, subscription, and poll. Prefer route lifecycle, data APIs,
  handlers, derived state, or CSS, especially in curated view models.
- In a curated view model, drop or narrow a nice-to-have feature before adding unproven reactive
  machinery.
- Avoid `"use node"` unless truly required.
- Use truthiness for `true | undefined` flags and existence checks when existence is the meaning.
- Use `notEmpty` from `@samebase/dependent` for filtering nullable arrays.
- Narrow a nullable value once instead of repeating `?.`.
- Prefer direct conditions. Do not add `!!`, named booleans, or wrappers without a readability need.

Comments:

- Comment current constraints and invariants in the code's terminology. Use JSDoc for non-obvious
  ownership or timing. Name the concrete runtime case and preserve user-authored comments.
- Local-type JSDoc uses direct vocabulary and can omit leading `*` prefixes.

UI code:

- Keep app-owned styling APIs closed. Change a component standard instead of adding pass-through
  classes. Standardize shared chrome without speculative content slots.
- No dynamically built Tailwind/CSS class names; map state to full literal strings.
- Make workspace content respond to the container from `WorkspaceLayoutV2PaneFrame`. Use container
  variants and `cqw`, not viewport breakpoints or `vw`; use viewport units only for true viewport
  concerns such as scroll-end space.
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
- Follow `skills/samebase-playwright-live/SKILL.md` and `docs/playwright-visual-testing.md` for
  browser rules. `pnpm test:visual:linux` is the canonical acceptance command.
- Use the route-first policy in `docs/agent-workflows.md` for interaction bugs.
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

- Git, PR, and shipping details: `docs/agent-workflows.md`.
- Repository exports: `docs/repository-exports.md`.
- Safe Convex production reads: `docs/convex-production-reads.md`.
- Live browser and route-first UI checks: `skills/samebase-playwright-live/SKILL.md`.
- Agent plugin updates and model tests: `skills/update-samebase-agent-plugin/SKILL.md`.
- PR authoring: `skills/create-pr/SKILL.md`.
- macOS UI control: `skills/mac-app-control/SKILL.md`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `apps/samebase/convex/_generated/ai/guidelines.md`
first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains
rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->
