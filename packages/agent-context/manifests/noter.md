# Noter Agent Context Bundle Manifest

## Purpose

This manifest describes how the extracted context composes for Noter. It does not replace live
`AGENTS.md` routing yet.

Package-local paths in this manifest are authoritative over matching draft paths under `research/`.
The historical draft manifest is `../../../research/agent-context-draft-bundle/noter-manifest.md`.
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
- `../skills/agent-context-extraction-lab/SKILL.md`

Load intent: installed-style skills that work without Noter-only commands or product assumptions.

### Noter Overlays

- `../overlays/noter-app-template.md`
- `../overlays/noter-convex.md`
- `../overlays/noter-operator-workflows.md`

Load intent: repo/app/operator composition. These overlays supply Noter-specific startup, route
mode, Convex, provider, PR, cleanup, and response rules that portable skills intentionally omit.

### Repo Docs And Specs

- `../../../specs/063_SHADCN_WRAPPER_ENTRYPOINT_SPEC.md`

Load intent: source docs for narrow repo policies that do not earn a portable skill or package
overlay. Shadcn/ui ownership stays as a compact always-loaded `AGENTS.md` reminder until spec 063 is
accepted/current or the repo chooses to keep that pointer permanently.

## Trigger Map

| Task shape                           | Core | Portable skill(s)              | Noter overlay(s)                                                                                        |
| ------------------------------------ | ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| typed app code or provider client    | yes  | `typed-product-engineering`    | `noter-convex` for Convex/provider paths and scripts                                                    |
| shipped UI route or interaction      | yes  | `route-ui-validation`          | `noter-operator-workflows`; `noter-app-template` when generated-app/template routes are involved        |
| shadcn primitive ownership           | yes  | n/a                            | n/a; use `../../../specs/063_SHADCN_WRAPPER_ENTRYPOINT_SPEC.md` plus compact `AGENTS.md` pointer        |
| bare workflow shortcut command       | yes  | PR or cleanup skill by task    | `noter-operator-workflows`; keep compact `AGENTS.md` command table until overlay loading is guaranteed  |
| PR, CI, review, or blocker triage    | yes  | `pr-workflow-review`           | `noter-operator-workflows` for build labels, ready/draft defaults, and review-bot requirements          |
| cleanup, archive, stale resources    | yes  | `exact-resource-cleanup`       | `noter-operator-workflows` for vaults, previews, machine state, and Codex archive/pin checks            |
| ambiguous research to implementation | yes  | `research-to-implementation`   | `noter-app-template`, `noter-convex`, or `noter-operator-workflows` only when the evidence points there |
| extracting agent workflow context    | yes  | `agent-context-extraction-lab` | repo overlays, docs, specs, or thread evidence only after the sample points there                       |

## Promotion Rule

Do not shrink live `AGENTS.md` until each removed rule has a reachable replacement in core context,
portable skills, Noter overlays, repo docs, or accepted specs.

## Existing Repo Skill Compatibility

Keep existing repo skills as compatibility entrypoints unless a later migration proves they can be
deleted:

- `skills/create-pr/SKILL.md` wraps `pr-workflow-review` with Noter PR creation/update conventions.
- `skills/noter-playwright-live/SKILL.md` wraps `route-ui-validation` with live browser startup and
  branch-session mechanics.
- `skills/noter-refactoring-style/SKILL.md` wraps `typed-product-engineering` and
  `route-ui-validation` with Noter app/UI refactoring style.
