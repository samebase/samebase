# AGENTS.md

## Startup

- In a git worktree, run `pnpm anon:once` once after checkout.
- In a git worktree, use `pnpm anon` as the full startup command before
  dev/lint/test/commit workflows. Do not replace it with `pnpm dev` or
  `npx convex dev`.
- In the primary local checkout, use `pnpm dev`.
- If Convex tooling complains about missing `CONVEX_DEPLOYMENT`, or a worktree
  command fails with `Local backend isn't running`, run `pnpm anon` and retry.
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
- Default to required properties and required function/mutation/action
  arguments. Treat every optional field or argument as another explicit state
  that must be justified by current behavior, data migration, external input, or
  patch semantics. Start from the simplest required shape, then make something
  optional only after a real caller or persisted-data constraint proves it needs
  that extra state.
- When returning collections from queries or building user-visible lists, always
  choose an explicit deterministic sort order with stable tie-breakers. Do not
  rely on incidental storage order or live-update fields unless the product
  intentionally wants rows to reshuffle.
- New or materially changed code should include concise comments that explain
  the constraint or invariant being preserved. Prefer JSDoc above functions when
  a function-level explanation is needed.
- Prefer comments that name the concrete runtime case over abstract ownership
  language. For example:
  `if durable state says "left" but this layout has no left pane, render "main"; same for "right".`
- For JSDoc above local types, props, and small config unions, write the app
  contract in the simplest direct vocabulary. Prefer concrete value meanings
  over polished prose, and preserve user-authored wording instead of rewriting
  it. Example:
  ```ts
  /**
   * all = shows sidebar toggle on mobile an desktop
   *
   * desktop = shows sidebar toggle on desktop only
   *
   * hidden = hides sidebar toggle on both desktop and mobile
   */
  type WorkspaceLayoutV2ToggleVisibility = "all" | "desktop" | "hidden";
  ```
- Specific app hooks and utilities with non-obvious ownership, timing, or
  synchronization behavior should have function-level JSDoc explaining what they
  do and why the indirection exists.
- Avoid `"use node"` unless the module truly requires it.
- Treat every `useEffect` and `useLayoutEffect` as something to justify. Before
  adding or keeping one, check whether the behavior belongs in a route lifecycle
  such as `beforeLoad`, a data/cache API, an event handler, derived render
  state, or CSS. Collapse duplicate effects that share the same trigger/concern.
- Prefer inference from already-typed initializers and callbacks. Do not restate
  local variable types when the expression is already strongly typed unless the
  annotation changes the contract, clarifies object-spread shape composition, or
  prevents a real widening problem.
- Prefer truthiness checks for typed flags whose domain is already
  `true | undefined`. Use `=== true` only when the distinction from other truthy
  values is part of the current logic.
- When the runtime meaning is that a value exists, write an existence check.
  Avoid exact `!== undefined`, `!== null`, or `typeof value === "string"` checks
  unless the exact missing value, runtime type, empty string, or union
  discriminator is the state being modeled.
- Treat repeated optional chaining on the same value as a code smell. If later
  logic reads the object more than once, first check whether an explicit
  missing-value branch would make the state clearer, then use narrowed direct
  access for the rest. Keep `?.` when a single maybe-read really is the point.
- Prefer direct conditions over intermediate variables when the expression is
  already easy to read. Do not add `!!` coercions, named booleans, helper
  wrappers, or provider splits just to look more engineered; add a name only
  when it makes confusing logic clearer.
- When business logic is tangled with generic mechanics such as picking object
  keys, mapping entries, or reshaping values, step back and separate the two.
  Prefer a small typed utility in the right shared module when it lets the
  business code read directly, then delete any one-off wrapper that no longer
  earns its place.
- Let focused module paths carry generic utility context. Prefer names like
  `pick` from an object module over prefixing every export, and avoid broad
  barrel exports that erase that context.
- Do not add speculative helpers, flags, env vars, allowlist entries,
  compatibility paths, or config surface that the current patch does not use end
  to end.
- When cleanup or migration work makes a direct native API viable, prefer
  deleting the temporary adapter instead of keeping a near-equivalent wrapper,
  renamed mirror, or reshaped object around it. Always check whether an extra
  abstraction can be removed, not just whether it can be tolerated.
- For app-internal refactors, prefer delete-first changes over
  compatibility-preserving patches. When a shared abstraction owns the wrong
  responsibility, remove or narrow it and update all current callsites instead
  of adding pass-through props, transitional wrappers, convenience APIs, or
  shims. Treat backwards compatibility for app-internal components as a non-goal
  unless the user explicitly asks for it.
- If a transitional helper, adapter, or mirror object ends up unused outside
  tests, delete it instead of preserving it "just in case". Do not keep dead
  migration scaffolding, test-only production helpers, or simplified wrappers
  that no longer pull their weight.
- Avoid parameterized local helper factories when a helper has one current
  callsite and can read the needed local constants directly. Keep the direct
  function until multiple shipped callsites prove configurability is useful.
- Remove property-presence checks such as `key in object` when they only exist
  to appease TypeScript. Keep them only when own-key presence is real runtime
  state, such as distinguishing an explicit `undefined` clear from a missing
  key. Prefer the simple `key in object` form unless prototype safety is a
  proven issue for that object.
- Fail closed rather than inventing placeholder fallbacks unless the patch is
  implementing a real migration.
- Do not keep test-only production abstractions, incomplete extractions, or dead
  scaffolding.
- Do not add barrel files for app code.
- Do not add same-name re-export shim files or one-line pass-through modules
  that only re-export another module. Update imports directly instead, and
  delete these wrappers when you find them. They pollute the tree and break
  editor cmd-click/navigation when tracing real implementations and usages.
- Keep config surfaces minimal and current.
- `URLSearchParams` is globally warned by lint so app search defaults to typed
  route objects and route-specific helpers. Intentional protocol boundaries such
  as OAuth, external URLs, parser/serializer helpers, fixtures, and tests can
  stay native while warning output keeps those callsites visible.
- For app-owned components, default to closed styling APIs. Do not add
  pass-through styling props such as `className`, `bodyClassName`, or
  `headerClassName` unless a current shipped callsite truly needs them.
- When a shared component's styling standard stops fitting, prefer changing the
  component's standard directly over threading more class-name override props
  through the tree.
- For shared layout chrome, standardize structure and behavior rather than
  inventing semantic content sub-APIs like `title`, `meta`, `leading`, or
  `trailing` unless the product truly needs one shared content pattern.
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
- When designing or extracting UI, start from the smallest viable working
  surface. Standardize shell behavior like sizing, spacing, scrolling, and
  containment before adding labels, helper copy, metadata, or extra chrome.
- Do not pre-populate new layout components with invented content structure or
  helper APIs. Leave them mostly empty by default and add the next layer only
  when a current shipped use case proves it is necessary.
- For app-owned UI, use as few Tailwind utilities as possible. Every utility
  class should protect a current invariant; if you cannot name the invariant a
  class preserves, leave it out. Start from native element behavior for
  diagnostic/operator surfaces and avoid decorative backgrounds, borders,
  radius/notch classes, opacity tweaks, and height caps unless the current UI
  truly needs them.
- For pane rails that should feel nearly flush, prefer `px-1` over `px-0` so the
  content keeps a small nonzero inset without reading as padded.
- Browser-owned page scroll is the default for route surfaces. Do not use
  route-level `h-screen`, `h-dvh`, `overflow-hidden`, or full-page
  `overflow-y-auto` shells under shared app chrome unless the route truly needs
  contained pane behavior.
- When a route needs to fill the space below shared chrome, use route-body flex
  sizing such as `flex min-h-0 flex-1 flex-col`, and place any intentional local
  scroller lower in the tree so browser pull-to-refresh and edge-swipe gestures
  keep working.
- When headings, cards, or selected rows can be opened through a link, query
  param, or programmatic scroll, preserve enough scroll-end space for the last
  target to align at the top of its scrollport.
- Temporary ProseMark workaround: when authoring a Markdown link whose label
  would exactly equal its URL, prefix the label with `link` plus a leading space
  so the rendered link stays visible until that ProseMark bug is fixed.
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

| Command        | Action                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `commit`       | Stage changes and create a concise commit                                                                     |
| `push`         | Commit if needed, then push                                                                                   |
| `create pr`    | Push if needed, then create or update a ready PR                                                              |
| `create draft` | Push if needed, then create or update a draft PR                                                              |
| `ready`        | Mark the current PR ready                                                                                     |
| `wait`         | Watch CI and report status                                                                                    |
| `ship`         | Commit, push, ensure a ready PR exists, clear actionable review feedback, wait                                |
| `squash`       | Squash-merge the current PR                                                                                   |
| `archive`      | Remove the current worktree/local branch after confirming a PR exists                                         |
| `link machine` | Run the current checkout's `noter.ts` machine-link flow with worktree isolation when needed                   |
| `clean vaults` | Remove temporary Noter-managed vaults for the current worktree                                                |
| `clean`        | Run `clean vaults`, remove the current worktree's local machine link, then remove the shipped worktree/branch |
| `status`       | Report branch, local changes, and PR state                                                                    |

Detailed flow rules live in `docs/agent-workflows.md`.

## Workflow Rules

- Always use CLI tools such as `gh` and `git`; do not tell the user to click
  through a UI.
- Execute requested git/GitHub workflows instead of describing them.
- Do not leave a meaningful non-`main` work branch, research branch, or Codex
  thread without a GitHub PR. Before concluding the task, create or update the
  branch PR unless the user explicitly says not to open one.
- Default proactive PR state is ready/non-draft so work is preserved in GitHub.
  Use a draft PR only when the work is still in progress or the user explicitly
  asks to keep it draft.
- Before starting implementation on an existing branch or worktree, fetch
  `origin` and rebase onto the latest `origin/main`.
- Rename auto-generated random `codex/<word>-<word>-<word>` branches early, and
  always before `commit`, `create pr`, or `ship`.
- Before `commit`, `create pr`, or `ship`, inspect the diff shape with
  `git diff --stat` (and `git diff --cached --stat` when relevant).
- When the user says `rebase`, treat it as `rebase` plus `push` so the local
  branch and `origin/<branch>` stay aligned after the history rewrite.
- Use the exact temporary vault prefix `tmp-<worktree-id>-<intent>` for
  Playwright/manual test repos created from a worktree.
- `link machine` must use the current checkout's `noter.ts` flow and keep every
  local repo checkout isolated with its own `--state-dir` under
  `~/.noter/checkouts/<checkout-id>`. Never overwrite the default `~/.noter`
  install as part of local dev linking.
- `clean vaults` must fail closed and only remove matching Noter-managed vaults
  through the dashboard delete flow.
- `clean` must fail closed and only remove the current checkout's isolated
  machine state directory under `~/.noter/checkouts/<checkout-id>`. Never delete
  the default `~/.noter` install as part of local cleanup.
- When the user says `create pr`, create or update a ready non-draft PR.
- Use a draft PR only when the user explicitly says `create draft` or otherwise
  asks to keep the PR draft.
- `ship` must leave the current branch with an updated ready PR before waiting
  on CI.
- PR descriptions must explain why the change exists, not just what changed.
- When a PR originates from research or automation work, include `First Message`
  and `Requested Codex Runtime`.
- Keep the PR title and description updated as scope changes.
- Prefix every PR title with the projected landing-page build label, such as
  `v1146:`, and refresh it after creating, updating, rebasing, marking ready, or
  whenever `origin/main` advances. Treat the label as provisional until merge.
- When work implements a named or numbered phase from a spec, RFC, rollout, or
  accepted plan, include the phase label in the PR title after the build label,
  such as `v1146: Phase 2: Move app provisioning to Workflow`, so the eventual
  squash commit preserves the phase context.
- Do not amend or rewrite branch commit subjects only to add or refresh
  provisional build labels during normal PR updates. GitHub's squash UI uses the
  lone commit subject as the default squash title for one-commit PRs, and the PR
  title for PRs with two or more commits; handle that only during final merge
  prep.
- Do not put app build version labels in branch names.
- Treat actionable Greptile, CodeRabbit, and Codex review comments as required
  fixes while shipping.
- Never merge before CI is green.
- Rebase on the latest `origin/main` immediately before merge.
- When creating the final `main` commit through `squash` or `ship`, compute the
  landing-page build number from the latest `origin/main` immediately before
  merge, add 1, refresh the PR title if needed, and prefix the squash commit
  subject with `v<N>:`. Prefer an explicit CLI squash subject over relying on
  the GitHub UI default.
- Prefer squash merge by default.

## Worktree Rules

- If HEAD is detached, use `./scripts/bootstrap-worktree.ts` to create a
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
- Mention only the actionable lever in user-facing explanations. Do not bring up
  impossible non-options or irrelevant caveats.
- Expect voice-to-text mistakes. Interpret likely transcription errors before
  asking for clarification.
- Commit meaningful checkpoints instead of letting large local diffs accumulate,
  and push after commits so work is not stranded only in the local worktree.
- When a change touches many files or multiple concerns, consider splitting it
  into two or three reviewable commits, such as backend model cleanup, UI
  wiring, and spec/test updates. This is a reviewability preference, not a hard
  requirement.
- Default to additive minimalism in copy and visuals. Do not add decorative
  chrome, filler copy, extra buttons, or ornamental layout unless explicitly
  requested.
- For app-owned UI, prefer an empty well-behaved container over a clever or
  richly pre-structured abstraction. If the standard needs to evolve, change the
  standard instead of front-loading speculative slots and props.
- Preserve the established visual language. Do not add shadows, rounded corners,
  custom easing, decorative borders, or similar visual embellishments unless the
  user explicitly asks for them or the surrounding component already uses them.
- For motion and timing, prefer Tailwind defaults unless there is a concrete
  product reason to override them.
- Assume Cloudflare is the default front door and observability layer for
  `noter.md`, and keep application logic in Convex by default unless there is a
  clear reason not to.
- Prefer shell commands first and Node/ECMAScript second; do not reach for
  Python first in this repo.
- Use template literals instead of arrays joined with `'\n'` for multi-line
  JavaScript and TypeScript snippets.
- Format documents with oxfmt.
- Prefer exhaustive dispatch with `satisfies never` when it fits.
- When sharing URLs, always format them as clickable Markdown links.
- When pointing the operator at code, include a precise location such as a
  1-based line number or another unambiguous anchor unless the whole file is
  genuinely the subject. Do not cite only a large file path when the relevant
  code lives in one small area.
- When sharing a Cloudflare URL in a Markdown link, prefix the label with the
  word `link` followed by a space so it renders correctly in ProseMark, for
  example
  `[link https://example.trycloudflare.com](https://example.trycloudflare.com)`.
- When a relevant preview exists, include at least one clickable localhost URL
  in the user-facing response; otherwise say that no preview is running.
- When sharing a localhost app preview URL in the user-facing response, also
  include the active Cloudflare tunnel URL for that same app when one exists.
- For preview deploy URLs, use the `?prod-ui` query param.
- When screenshot or visual regression work changes images, show the relevant
  before/after or diff images in the user-facing response.
- When a response relates to an existing PR, mention the PR number as a
  clickable Markdown link.
- Prefer key-only boolean query params such as `?diff`.
- Preserve unrelated query params when changing app URLs. Use the shared query
  param helpers instead of hand-building URLs.
- For Playwright or browser automation, never steal OS focus and never kill all
  Chrome processes. Use isolated Playwright-owned sessions only.
- For this repo, prefer `node ./scripts/playwright-branch-browser.ts` or
  `pnpm playwright:open` over raw `@playwright/cli open`.
- When the user asks to reproduce or inspect a mobile issue, start Playwright in
  a mobile-emulated context from launch. Do not begin in a desktop context and
  resize later.
- Start Playwright validation with the normal unconstrained browser layout
  unless the user asks for a specific viewport. Add a mobile pass when relevant
  before shipping.
- When scripting touch gestures, anchor on visible rendered content inside the
  shipped surface instead of arbitrary coordinates inside oversized containers.
- On mobile-first chat or prompt surfaces, Enter must not send by default.
  Require an explicit send action and treat accidental Enter-to-send on mobile
  as a product bug.
- When sharing a repo file with the operator and the branch is pushed, prefer a
  `noter.md` vault branch/file URL over a local filesystem link. Local file
  links are not usable from mobile. Use filesystem links only when no Noter
  vault URL exists for that file.
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

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md`
first** for important guidelines on how to correctly use Convex APIs and
patterns. The file contains rules that override what you may have learned about
Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
