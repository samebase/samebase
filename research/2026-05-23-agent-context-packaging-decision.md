# Agent Context Packaging Decision

## Document Control

- Status: Draft packaging decision
- Date: 2026-05-23
- Related:
  - `skills/README.md`
  - `research/agent-context-draft-skills/`
  - `research/agent-context-draft-overlays/`
  - `research/2026-05-23-agent-context-agents-migration-map.md`
  - `research/2026-05-23-agent-context-forward-test-results-2.md`
  - `research/2026-05-23-agent-context-forward-test-results-3.md`
  - `research/2026-05-23-agent-context-forward-test-results-4.md`
  - `research/agent-context-draft-bundle/noter-manifest.md`

## Purpose

This note chooses the next packaging shape for the extracted agent context. It is intentionally not
an `AGENTS.md` rewrite. The goal is to make the extracted representation copyable and testable
without pretending that every layer is a Codex skill.

## Inputs

- `skills/README.md` says repo skills are for reusable, task-specific, conditional playbooks. It
  explicitly excludes broad repo invariants that belong in always-loaded context.
- The system `skill-creator` guidance says a skill's frontmatter is the trigger surface and the body
  should stay focused on the task that loaded it.
- The draft artifacts split into one always-applicable core, five portable triggerable skills, and
  three Noter overlays.
- Forward tests show that the triggerable artifacts improve bounded tasks, while repo/operator
  details such as `pnpm anon`, build labels, Convex production reads, and generated-app provenance
  must stay out of the portable core.
- The editing-capable `noter-convex` validation shows repo overlays can guide bounded work without
  absorbing production-code follow-ups into the extraction branch.
- The installed-style portable skill validation shows the five triggerable skills work as skill
  artifacts, but Noter still needs a manifest or equivalent router to pair them with repo overlays.

## Decision

Use a context bundle as the first portable packaging target, not a flat `skills/` promotion.

The bundle should have three layer types:

1. Core context: always-loaded behavior that is not a triggerable skill.
2. Portable skills: task-triggered `SKILL.md` folders that can later be copied into `skills/`,
   `$CODEX_HOME/skills`, or another repo.
3. Overlays: app/repo/operator guidance that composes with the portable core and skills but is not
   part of the portable package by default.

This keeps the repo's own skill rules honest. `agent-engineering-core` is useful, but its current
role is an always-loaded core candidate. Promoting it as a normal triggerable skill would hide
baseline behavior behind a trigger and would violate the repo-local distinction between skills and
always-loaded invariants.

## Proposed Bundle Shape

```text
agent-context/
  core/
    agent-engineering-core.md
  skills/
    typed-product-engineering/SKILL.md
    route-ui-validation/SKILL.md
    pr-workflow-review/SKILL.md
    exact-resource-cleanup/SKILL.md
    research-to-implementation/SKILL.md
  overlays/
    noter-app-template.md
    noter-convex.md
    noter-operator-workflows.md
  manifests/
    noter.md
```

`manifests/noter.md` would describe which core, skills, and overlays to load for this repo. A
different TypeScript product repo could use the same core plus portable skills without the Noter
overlays. A generated `notermd/app` descendant could add `noter-app-template` without inheriting
operator cleanup or PR build-label rules.

## Promotion Gates

Do not move live `AGENTS.md` content merely because the bundle shape is clear.

Before promoting files out of `research/`:

- Use the completed installed-style test for the five portable triggerable skills as evidence, but
  package the bundle shape before promoting live artifacts.
- Use the completed editing-capable `noter-convex` validation as evidence, but keep Convex AI and
  CLI routing always-loaded until the overlay is installed or otherwise guaranteed reachable before
  backend work.
- Decide whether existing repo skills should stay as compatibility wrappers or be refit around the
  portable skills.
- Keep shortcut recognition, startup essentials, source hierarchy, and Convex generated-guidance
  routing always-loaded until the runtime proves those rules are reachable before they are needed.

## Current Packaging Implication

The next code movement should be narrow:

- Keep `research/agent-context-draft-skills/agent-engineering-core/SKILL.md` as a draft artifact for
  now, but treat its final form as `core/agent-engineering-core.md`, not as a normal skill.
- Treat the other five draft skill folders as candidates for direct skill promotion after the bundle
  manifest has a real package location.
- Keep `noter-*` overlays out of the portable package. They can be part of a Noter manifest or
  repo-local overlay routing.
