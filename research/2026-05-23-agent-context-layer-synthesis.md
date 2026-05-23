# Agent Context Layer Synthesis

## Document Control

- Status: Draft extraction synthesis after five context experiments
- Date: 2026-05-23
- Related:
  - `research/2026-05-23-agent-context-pack-drafts.md`
  - `research/2026-05-23-agent-context-experiment-results-1.md`
  - `research/2026-05-23-agent-context-experiment-results-2.md`
  - `research/2026-05-23-agent-context-experiment-results-3.md`
  - `research/2026-05-23-agent-context-experiment-results-4.md`
  - `research/2026-05-23-agent-context-experiment-results-5.md`

## Purpose

This note turns the first five experiment results into a concrete drafting plan. It is still a
research artifact, not the final `AGENTS.md` modularization.

## Stable Layer Decisions

### Always-Loaded Core

Keep this small. The experiments support always loading only behavior that is broadly useful across
software repos:

- inspect current state before acting
- preserve user and parallel-agent changes
- prefer source-of-truth evidence over names, memory, or assumptions
- treat user corrections as scope changes
- fail closed for destructive actions, external writes, and cleanup
- validate completion against current evidence
- recognize when the existing implementation already satisfies the requested architecture
- delegate bounded side tasks with explicit output contracts

Do not put repo commands, provider-specific cleanup, visual baseline workflows, PR build labels, or
Noter-specific dev startup into the portable core.

### Triggerable Skills

Draft these as separate skill files:

- `pr-workflow-review`: PR discovery beyond branch name, review stance, CI/check summaries, and
  review-bot calibration.
- `route-ui-validation`: exact URL/query validation, desktop/mobile interaction checks,
  focus/editability probes, real-route or production-component coverage, and screenshot rules.
- `typed-product-engineering`: schema-derived types, generated validation boundaries, delete-first
  refactoring, negative type tests, and TypeScript proof-boundary caution.
- `research-to-implementation`: concise evidence/decision/open-question structure, correction
  handling, and stopping when implementation direction is clear.
- `exact-resource-cleanup`: dry-run cleanup, exact target proof, terminal PR state,
  pinned/live/dirty exclusions, and external-resource identity checks.

### App/Repo Overlays

Draft these as overlays rather than portable skills:

- `noter-app-template`: `notermd/app` source-of-truth rules, exact exported source tree, manifest
  provenance, binary/text split, file modes, deterministic ordering, generated app build-command
  validation, and Cloudflare/Convex app-template assumptions.
- `noter-convex`: Noter-specific Convex generated-guidance routing, worktree/prod CLI safety, module
  layout, validator naming, contract-test lane, component boundary cautions, and provider API
  validation rules.
- `noter-operator-workflows`: context-aware dev startup, Convex production-read safety, PR build
  labels, shortcut workflows, temporary vault naming, cleanup mechanics, localhost/tunnel response
  preferences, and ProseMark link workaround.

## Boundary Lessons From Experiments

- Cleanup: portable core should say "fail closed"; exact resource proof and Codex pinned-thread
  metadata belong in cleanup skill plus Noter operator overlay.
- PR lookup: core can ask for evidence; robust PR discovery belongs in a GitHub/PR skill;
  build-label and review-bot interpretation belong in the operator overlay.
- UI validation: exact path validation is core; desktop/mobile/focus/editability is a route skill;
  `?dev` and `?prod-ui` semantics are Noter app-template context.
- Typed refactoring: delete-first is core-shaped; generated/OpenAPI validation and TypeScript
  proof-boundary rules belong in typed-product skill; Noter-specific Convex module, CLI, and
  provider-boundary conventions belong in `noter-convex`.
- App template adoption: research-to-implementation skill should prevent research sprawl and notice
  when architecture already exists; Noter app-template overlay should prevent Noter-side overlays or
  filtering.
- Noter worktree dev bootstrap is useful operator workflow context, but unsafe as generic read-only
  test setup because it can touch anonymous Convex/provider state.

## Drafting Order

1. Draft `agent-engineering-core` and `typed-product-engineering` first, because they define the
   smallest always-loaded baseline and the riskiest code-quality behavior.
2. Draft `route-ui-validation`, `pr-workflow-review`, and `exact-resource-cleanup` next.
3. Draft `research-to-implementation` after those so it can reference the same evidence/decision
   structure used here.
4. Draft `noter-app-template`, `noter-convex`, and `noter-operator-workflows` last, with clear
   labels that they are overlays, not portable defaults.

## Draft Artifacts

The first draft artifacts now live under `research/agent-context-draft-skills/` and
`research/agent-context-draft-overlays/`. They are not installed skills and do not rewrite
`AGENTS.md`.

Portable skill drafts:

- `agent-engineering-core/SKILL.md`
- `typed-product-engineering/SKILL.md`
- `route-ui-validation/SKILL.md`
- `pr-workflow-review/SKILL.md`
- `exact-resource-cleanup/SKILL.md`
- `research-to-implementation/SKILL.md`

Noter overlay drafts:

- `noter-app-template.md`
- `noter-convex.md`
- `noter-operator-workflows.md`

A separate explorer sanity check over the experiment artifacts agreed with this split and reinforced
the main boundary risk: Noter worktree startup belongs in the Noter operator overlay, not portable
or read-only experiment context.

## Forward-Test Revisions

`research/2026-05-23-agent-context-forward-test-results-1.md` validates the draft artifacts on five
targeted tasks and applies the first revision pass:

- `typed-product-engineering` now names provider/OpenAPI proof-boundary invariants such as lossless
  IDs, literal method/path callsites, generated drift checks, and negative type tests.
- `route-ui-validation` now hands off to repo overlays for startup/auth/browser/baseline rules and
  sharpens desktop/mobile transition validation.
- `exact-resource-cleanup` and `noter-operator-workflows` now distinguish dry-run safety, `archive`,
  and terminal-PR-gated `clean`.
- `research-to-implementation` and `noter-app-template` now require a final direction/hardening
  handoff and clarify source-owned generated-app files plus bytewise path ordering.
- `pr-workflow-review` now has a non-mutating read-only PR triage mode.

## Migration Map

`research/2026-05-23-agent-context-agents-migration-map.md` compares the revised draft artifacts
against the current long `AGENTS.md`. The map keeps startup essentials, source routing,
architecture, shortcut recognition, task references, and Convex AI routing visible until installed
skills or overlays prove they can be loaded before those rules are needed. It also identifies
unresolved follow-up for installed Convex overlay behavior and shadcn/UI ownership.

`research/2026-05-23-agent-context-forward-test-results-2.md` resolves the first Convex follow-up by
adding a draft `noter-convex` overlay and forward-testing it on a read-only Convex planning task.
`research/2026-05-23-agent-context-forward-test-results-3.md` adds an isolated editing-capable
validation for that overlay. The overlay is now tested for planning and bounded provider-boundary
editing, but still needs to be installed or otherwise guaranteed reachable before the Convex AI
block or production CLI guidance can move out of always-loaded context.

`research/2026-05-23-agent-context-forward-test-results-4.md` validates all five portable
triggerable skills as installed-style artifacts. The pass supports the skill split, but also shows
that Noter needs a package manifest or equivalent router to pair portable skills with the right
overlays.

`research/2026-05-23-agent-context-package-results.md` creates the first real package layout at
`packages/agent-context`, with package-local core, skills, overlays, and Noter manifest.

`research/2026-05-23-agent-context-compatibility-map.md` keeps existing repo skills as compatibility
entrypoints around the packaged portable skills instead of deleting them or flattening their
Noter-specific procedure into the portable package.

## Open Questions Before Moving `AGENTS.md`

- How much of `AGENTS.md` should remain as repo memory hierarchy versus become a loadable core file.
- Whether `noter-app-template` should be tested against an actual generated app build before moving
  any template guidance out of always-loaded context.
