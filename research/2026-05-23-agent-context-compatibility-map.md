# Agent Context Compatibility Map

## Document Control

- Status: Compatibility decision
- Date: 2026-05-23
- Related:
  - `packages/agent-context/manifests/noter.md`
  - `skills/create-pr/SKILL.md`
  - `skills/noter-playwright-live/SKILL.md`
  - `skills/noter-refactoring-style/SKILL.md`

## Purpose

This note decides how existing repo skills relate to the packaged agent-context bundle. It does not
delete or replace live skills.

## Decision

Keep the existing repo skills as compatibility entrypoints for now. They contain useful Noter
workflow and UI details that are intentionally outside the portable package. Replacing them with
thin package re-exports would lose local procedure, while duplicating portable rules inside them
would create drift.

Instead, each relevant repo skill now names its packaged counterpart:

| Repo skill                                | Packaged portable context                                                                     | Why keep the repo skill                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `skills/create-pr/SKILL.md`               | `packages/agent-context/skills/pr-workflow-review/SKILL.md`                                   | PR creation/update body shape, ready/draft defaults, and Noter runtime metadata            |
| `skills/noter-playwright-live/SKILL.md`   | `packages/agent-context/skills/route-ui-validation/SKILL.md`                                  | Live app startup, branch-scoped Playwright sessions, seeded auth, and screenshot mechanics |
| `skills/noter-refactoring-style/SKILL.md` | `packages/agent-context/skills/typed-product-engineering/SKILL.md` plus `route-ui-validation` | Noter-specific UI ownership and shared-shell refactoring taste                             |

`skills/mac-app-control/SKILL.md` stays outside this map because it is a local Mac automation skill,
not part of the extracted software-engineering context bundle.

## Applied Changes

- Added `Packaged Context Relationship` sections to the three relevant repo skills.
- Added an `Existing Repo Skill Compatibility` section to
  `packages/agent-context/manifests/noter.md`.

## Remaining Work

- If `AGENTS.md` is later shortened, keep a compact router to both packaged context and these repo
  compatibility entrypoints.
- Revisit deletion only after a package-location task can complete without loading the repo skill
  and without losing Noter-specific procedure.
