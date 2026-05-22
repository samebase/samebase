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
`pnpm anon` into the portable core.

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
- `noter-operator-workflows`: `pnpm anon`, Convex production-read safety, PR build labels, shortcut
  workflows, temporary vault naming, cleanup mechanics, localhost/tunnel response preferences, and
  ProseMark link workaround.

## Boundary Lessons From Experiments

- Cleanup: portable core should say "fail closed"; exact resource proof and Codex pinned-thread
  metadata belong in cleanup skill plus Noter operator overlay.
- PR lookup: core can ask for evidence; robust PR discovery belongs in a GitHub/PR skill;
  build-label and review-bot interpretation belong in the operator overlay.
- UI validation: exact path validation is core; desktop/mobile/focus/editability is a route skill;
  `?dev` and `?prod-ui` semantics are Noter app-template context.
- Typed refactoring: delete-first is core-shaped; generated/OpenAPI validation and TypeScript
  proof-boundary rules belong in typed-product skill; Convex decimal-string IDs belong in Noter app
  context.
- App template adoption: research-to-implementation skill should prevent research sprawl and notice
  when architecture already exists; Noter app-template overlay should prevent Noter-side overlays or
  filtering.
- `pnpm anon` is useful operator workflow context, but unsafe as generic read-only test setup
  because it can touch anonymous Convex/provider state.

## Drafting Order

1. Draft `agent-engineering-core` and `typed-product-engineering` first, because they define the
   smallest always-loaded baseline and the riskiest code-quality behavior.
2. Draft `route-ui-validation`, `pr-workflow-review`, and `exact-resource-cleanup` next.
3. Draft `research-to-implementation` after those so it can reference the same evidence/decision
   structure used here.
4. Draft `noter-app-template` and `noter-operator-workflows` last, with clear labels that they are
   overlays, not portable defaults.

## Open Questions Before Moving `AGENTS.md`

- Whether the portable artifacts should live as repo-local `skills/*`, a separate package, or both.
- Whether existing repo skills should be renamed/refit or left as compatibility wrappers.
- How much of `AGENTS.md` should remain as repo memory hierarchy versus become a loadable core file.
- Whether `noter-app-template` should be tested against an actual generated app build before moving
  any template guidance out of always-loaded context.
