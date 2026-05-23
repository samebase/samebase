# Agent Context Draft Artifacts

## Status

These are draft extraction artifacts, not installed skills and not an `AGENTS.md` rewrite. They are
meant to be reviewed, forward-tested, and revised before any live context modularization.

## Portable Skills

| Artifact                              | Load intent                  | Scope                                                |
| ------------------------------------- | ---------------------------- | ---------------------------------------------------- |
| `agent-engineering-core/SKILL.md`     | Always-loaded core candidate | General software engineering agent behavior          |
| `typed-product-engineering/SKILL.md`  | Triggerable skill            | Typed product apps, especially TypeScript            |
| `route-ui-validation/SKILL.md`        | Triggerable skill            | Frontend route and interaction validation            |
| `pr-workflow-review/SKILL.md`         | Triggerable skill            | PR discovery, review stance, CI, PR narrative        |
| `exact-resource-cleanup/SKILL.md`     | Triggerable skill            | Safe cleanup of local and external resources         |
| `research-to-implementation/SKILL.md` | Triggerable skill            | Evidence-led research that turns into implementation |

## Noter Overlays

| Artifact                                                      | Load intent          | Scope                                                               |
| ------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| `../agent-context-draft-overlays/noter-app-template.md`       | App-template overlay | `notermd/app` and generated apps                                    |
| `../agent-context-draft-overlays/noter-operator-workflows.md` | Operator overlay     | This repo's local workflow, PR, Convex, cleanup, and response rules |

## Validation So Far

- The split follows `research/2026-05-23-agent-context-layer-synthesis.md`.
- The draft skill bodies keep repo-specific startup commands, build labels, Convex production-read
  rules, generated-app provenance, and cleanup naming out of the portable skills.
- The artifact set intentionally avoids scripts, assets, and nested references until forward tests
  prove a repeated deterministic operation belongs in the package.
- A separate explorer pass over the research artifacts agreed with the split and flagged the main
  risk: `pnpm anon` is required for normal Noter worktree workflows but can touch provider state, so
  it must remain out of portable and read-only experiment instructions.
- A lightweight Node structural check confirmed all six draft skill folders have matching `SKILL.md`
  frontmatter and body headings. The system `skill-creator` validator could not run in this
  environment because Python was missing `PyYAML`.

## Next Validation

- Forward-test `typed-product-engineering` on a small typed boundary refactor.
- Forward-test `route-ui-validation` on a route-shell or screenshot task.
- Forward-test `exact-resource-cleanup` with a dry-run cleanup prompt in an isolated worktree.
- Forward-test `research-to-implementation` on a source-of-truth comparison where the correct answer
  may be "the implementation already exists; harden it."
- Compare the overlay split against the long `AGENTS.md` sections before moving any active context.
