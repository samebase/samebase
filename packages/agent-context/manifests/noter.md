# Noter Agent Context Bundle Manifest

## Purpose

This manifest describes how the extracted context composes for Noter. It does not replace live
`AGENTS.md` routing yet.

Package-local paths in this manifest are authoritative over matching draft paths under `research/`.
The research files remain the evidence trail; this package is the candidate runtime/source bundle.

## Layers

### Core

- `../core/agent-engineering-core.md`

Load intent: always-loaded context. This is not a triggerable skill because it contains baseline
agent behavior that should not depend on a task trigger. Before shrinking live `AGENTS.md`, the
shortened file must either inline this core or point to it in a way that loads before task-specific
skills are chosen.

### Portable Triggerable Skills

- `../skills/typed-product-engineering/SKILL.md`
- `../skills/route-ui-validation/SKILL.md`
- `../skills/pr-workflow-review/SKILL.md`
- `../skills/exact-resource-cleanup/SKILL.md`
- `../skills/research-to-implementation/SKILL.md`

Load intent: installed-style skills that work without Noter-only commands or product assumptions.

### Noter Overlays

- `../overlays/noter-app-template.md`
- `../overlays/noter-convex.md`
- `../overlays/noter-operator-workflows.md`

Load intent: repo/app/operator composition. These overlays supply Noter-specific startup, route
mode, Convex, provider, PR, cleanup, and response rules that portable skills intentionally omit.

## Trigger Map

| Task shape                           | Core | Portable skill(s)            | Noter overlay(s)                                                                                        |
| ------------------------------------ | ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| typed app code or provider client    | yes  | `typed-product-engineering`  | `noter-convex` for Convex/provider paths and scripts                                                    |
| shipped UI route or interaction      | yes  | `route-ui-validation`        | `noter-operator-workflows`; `noter-app-template` when generated-app/template routes are involved        |
| PR, CI, review, or blocker triage    | yes  | `pr-workflow-review`         | `noter-operator-workflows` for build labels, ready/draft defaults, and review-bot requirements          |
| cleanup, archive, stale resources    | yes  | `exact-resource-cleanup`     | `noter-operator-workflows` for vaults, previews, machine state, and Codex archive/pin checks            |
| ambiguous research to implementation | yes  | `research-to-implementation` | `noter-app-template`, `noter-convex`, or `noter-operator-workflows` only when the evidence points there |

## Promotion Rule

Do not shrink live `AGENTS.md` until each removed rule has a reachable replacement in core context,
portable skills, Noter overlays, repo docs, or accepted specs.
