# Noter Agent Context Bundle Manifest Draft

## Purpose

This manifest describes how the draft extracted context should compose for Noter without moving live
`AGENTS.md` content yet. It is a package-like test artifact, not an installed runtime file.

## Layers

### Core

- `../agent-context-draft-skills/agent-engineering-core/SKILL.md`

Load intent: always-loaded candidate. Its final package form should be a core context file, not a
triggerable skill, because it contains baseline agent behavior that should not depend on a task
trigger.

### Portable Triggerable Skills

- `../agent-context-draft-skills/typed-product-engineering/SKILL.md`
- `../agent-context-draft-skills/route-ui-validation/SKILL.md`
- `../agent-context-draft-skills/pr-workflow-review/SKILL.md`
- `../agent-context-draft-skills/exact-resource-cleanup/SKILL.md`
- `../agent-context-draft-skills/research-to-implementation/SKILL.md`

Load intent: installed-style skills that should work without Noter-only commands or product
assumptions.

### Noter Overlays

- `../agent-context-draft-overlays/noter-app-template.md`
- `../agent-context-draft-overlays/noter-convex.md`
- `../agent-context-draft-overlays/noter-operator-workflows.md`

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

## Installed-Style Validation Result

`research/2026-05-23-agent-context-forward-test-results-4.md` validates the five portable
triggerable skills as installed-style artifacts. The test found that the skills are useful when
loaded alone, but Noter work still needs this manifest or an equivalent router so agents know which
overlay to pair with each portable skill.

## Promotion Rule

Do not promote these files out of `research/` until the next packaging change creates either:

- a real bundle directory with this manifest and copied core/skill/overlay files, or
- repo-local installed skills plus a reachable always-loaded router that maps Noter tasks to the
  right overlays.
