# Agent Context Pack Drafts

## Document Control

- Status: Draft pack boundaries
- Date: 2026-05-23
- Related:
  - `research/2026-05-23-agent-context-extraction-research-plan.md`
  - `research/2026-05-23-agent-context-manual-review-pass-1.md`

## Purpose

This document drafts the portable context packs implied by the first manual review pass. These packs
are not wired into `AGENTS.md` yet. They are hypotheses to test with context-variant experiments.

The intended load shape is layered:

1. a small always-loaded core
2. one product/repo overlay
3. task-triggered skills
4. operator-specific workflow overlays only when the workflow needs them

## Pack Map

| Pack                         | Load Mode                            | Portability                       | Purpose                                                                                               |
| ---------------------------- | ------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `agent-engineering-core`     | Always loaded                        | General software engineering      | Preserve evidence-first, correction-aware, user-work-preserving agent behavior across repos.          |
| `typed-product-engineering`  | Repo/app pack or triggerable skill   | TypeScript and typed product apps | Capture schema-derived typing, state ownership, route validation, and delete-first typed refactoring. |
| `pr-workflow-review`         | Triggerable skill                    | Broad Git/GitHub repos            | Handle PR discovery, review stance, CI/check summaries, and scope calibration.                        |
| `route-ui-validation`        | Triggerable skill                    | Interactive frontend apps         | Validate user-visible UI on exact routes, devices, query modes, and interaction states.               |
| `research-to-implementation` | Triggerable skill                    | General product engineering       | Convert research into scoped implementation without research sprawl or speculative overlays.          |
| `exact-resource-cleanup`     | Triggerable skill with repo overlays | Repos with external resources     | Dry-run and perform cleanup only after exact target proof.                                            |
| `noter-app-template`         | App-template overlay                 | `notermd/app` and descendants     | Keep template/exporter behavior aligned with the app template source of truth.                        |
| `noter-operator-workflows`   | Operator overlay                     | This repo/operator                | Keep `pnpm anon`, PR build labels, temp vault naming, preview cleanup, and machine state rules.       |

## `agent-engineering-core`

Always-loaded guidance should stay small and behavior-shaped.

Include:

- inspect current state before changing it
- preserve user and parallel-agent changes
- use the repo's source-of-truth hierarchy
- treat user corrections as scope changes
- prefer evidence over branch names, UI assumptions, or remembered context
- validate completion against current evidence
- fail closed for external writes and cleanup
- avoid leaking secrets
- delegate bounded side tasks with clear output contracts

Exclude:

- repo-specific commands
- provider-specific cleanup steps
- visual baseline commands
- TypeScript-only examples
- PR build-label policy

## `typed-product-engineering`

This pack is portable to TypeScript and similar typed app repos, but too specific for general core.

Include:

- no `any` or assertion-based bypasses
- derive types from validators or schemas
- keep broad generated validation when it protects broad provider APIs
- keep tiny local protocol boundaries tiny
- rerun delete-first reduction after switching validation approaches
- avoid test-shaped production helpers
- keep small overload branches, formatter helpers, or implementation adapters when removing them
  makes TypeScript rely on unsafe indexing, `never` collapse, or assertions
- add negative type tests when reducing a typed request facade could accidentally permit invalid
  params, bodies, methods, or response shapes
- model state through required fields, closed variants, and deterministic ordering
- separate committed route/server state from local draft/interaction state
- justify effects and collapse duplicate synchronization
- preserve existing UI placement and interaction affordances unless product behavior proves a change

Trigger when:

- changing TypeScript boundary parsing
- refactoring state ownership
- introducing or removing validation
- simplifying wrappers, generated clients, or app-owned UI abstractions

## `pr-workflow-review`

This skill should handle GitHub work that is too detailed for core.

Include:

- discover PRs by current branch, upstream, same HEAD, remote PR refs, and commit lineage
- inspect diff shape before reviewing
- lead review responses with actionable findings
- calibrate severity after user correction
- distinguish blocking correctness issues from future-context comments
- update PR comments or descriptions when scope changes
- summarize check status without hiding failures

Repo overlay hooks:

- branch prefix rules
- build-label PR titles
- ready vs draft defaults
- review-bot expectations
- exact commit/push/PR directives for the client

## `route-ui-validation`

This skill should load for shipped UI, route-shell, editor, touch, focus, scroll, or visual work.

Include:

- open the exact route and preserve query params
- validate the same route/state the user sees
- check desktop and mobile states when behavior differs
- verify hover, focus, touch, selected-row, editability, and pending states at the real interaction
  point
- show before/after or diff images when screenshots change
- prefer real app routes or production-component harnesses over fake fixtures
- report the active localhost URL and tunnel URL when one exists

Noter overlay hooks:

- `pnpm anon` startup
- `?dev` and `?prod-ui` route expectations
- Linux ARM64 visual baseline command
- `noter-playwright-live` session rules

## `research-to-implementation`

This skill should keep research useful without letting it become a sink.

Include:

- compare source artifacts directly
- separate evidence, decisions, and open questions
- keep research concise enough to drive the next implementation step
- stop when the product question has enough evidence
- update research when user corrections invalidate a speculative direction
- prefer small script or fixture probes when they resolve uncertainty faster than prose
- identify when the implementation already matches the requested architecture and the right next
  step is hardening tests or invariants instead of replacing code

Noter app-template hook:

- if the task is about generated apps, treat `notermd/app` as the source of truth and avoid
  Noter-only overlays unless current product behavior proves the need.

## `exact-resource-cleanup`

This skill should be triggerable because cleanup is risky and context-heavy.

Include:

- dry-run first unless the user explicitly requested deletion and the target is exact
- prove PR terminal state when cleanup depends on PR state
- prove local dirty state and worktree existence
- prove local and remote branch targets
- prove external resource names match the current worktree or branch
- skip resources whose ownership cannot be proven
- report permission blockers and residue explicitly

Noter overlay hooks:

- `tmp-<worktree-id>-<intent>` vault/repo naming
- Cloudflare preview versions
- Convex preview deployments
- local machine state under `~/.noter/checkouts/<checkout-id>`
- Codex pinned-thread metadata and archive state

## `noter-app-template`

This overlay is for the reusable Noter app template, not for the local repo operator workflow.

Include:

- `notermd/app` is the template source of truth
- Noter exports and seeds; `notermd/app` owns generated app content
- remove unwanted generated-app files upstream in `notermd/app`, not by filtering them out in Noter
- exported manifests must preserve deterministic ordering, binary content, file modes, branch
  selection, explicit token config, and the generated app's real build command
- use one deterministic path-ordering rule across exporter, manifest hashing, binary blob creation,
  and runtime tree entries
- avoid Noter-only overlays in generated app output
- validate generated app behavior through its actual build or app-creation path
- keep artifact-regeneration prompts and messy research in Noter docs, never inside generated app
  output
- keep Cloudflare-first assumptions only where the app template currently owns them

Exclude:

- local Codex worktree cleanup
- PR build labels
- operator response style
- current repo branch management

## `noter-operator-workflows`

This overlay is intentionally not portable.

Include:

- use `pnpm anon:once` after checkout and `pnpm anon` before worktree dev/lint/test/commit workflows
- treat `pnpm anon` as an operator workflow that can touch anonymous Convex/provider state; in
  read-only experiments, either use a verification path that does not require it or explicitly
  record why provider-state bootstrap was allowed
- derive production Convex commands from the primary checkout without leaking deploy keys
- rename meaningless branches early
- fetch/rebase before implementation and PR workflows
- use exact shortcut meanings for `commit`, `push`, `create pr`, `create draft`, `ship`, `squash`,
  `archive`, `clean vaults`, `clean`, and `status`
- keep PRs ready by default unless explicitly draft
- use provisional build labels in PR titles
- include clickable PR, localhost, and tunnel URLs in operator responses when relevant
- use the ProseMark link-label workaround for URL-equal labels

## Boundary Mistakes To Avoid

- Do not put Noter cleanup mechanics into the portable core.
- Do not flatten Convex/OpenAPI details into generic TypeScript guidance.
- Do not make every UI task load heavy visual baseline instructions.
- Do not make research prompts always loaded; they are useful only for ambiguous source-of-truth or
  product-direction tasks.
- Do not package operator response style as product-app guidance.
- Do not replace empirical thread findings with a neat taxonomy that has not survived experiments.

## First Extraction Hypothesis

The likely stable shape is:

1. keep `AGENTS.md` broad and short
2. move long workflow details into `noter-operator-workflows`
3. split `noter-refactoring-style` into a portable typed-product pack plus Noter examples
4. split Playwright/live route validation into a portable route skill plus Noter startup/baseline
   references
5. keep `notermd/app` rules in an app-template overlay rather than the operator overlay
