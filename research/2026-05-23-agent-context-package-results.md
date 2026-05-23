# Agent Context Package Results

## Document Control

- Status: Package checkpoint
- Date: 2026-05-23
- Related:
  - `packages/agent-context/`
  - `research/agent-context-draft-bundle/noter-manifest.md`
  - `research/2026-05-23-agent-context-forward-test-results-4.md`
  - `research/2026-05-23-agent-context-shadcn-ownership-decision.md`
  - `research/2026-05-23-agent-context-shortcut-routing-decision.md`
  - `packages/agent-context/skills/agent-context-extraction-lab/SKILL.md`

## Purpose

This note records the first real package-like layout for the extracted agent context. It does not
shrink `AGENTS.md`, install repo skills, or change live runtime routing.

## Package Shape

The package lives at `packages/agent-context` and is included in the PNPM workspace as
`@noter-md/agent-context`.

Contents:

- `core/agent-engineering-core.md`
- `skills/typed-product-engineering/SKILL.md`
- `skills/route-ui-validation/SKILL.md`
- `skills/pr-workflow-review/SKILL.md`
- `skills/exact-resource-cleanup/SKILL.md`
- `skills/research-to-implementation/SKILL.md`
- `skills/agent-context-extraction-lab/SKILL.md`
- `overlays/noter-app-template.md`
- `overlays/noter-convex.md`
- `overlays/noter-operator-workflows.md`
- `manifests/noter.md`

`agent-engineering-core` is packaged as core Markdown rather than a skill because its purpose is
always-loaded baseline behavior. The six portable artifacts remain normal `SKILL.md` folders. The
Noter overlays are package-local composition layers, not part of the portable default.

## Package Validation

Package-level validation is intentionally lightweight:

- `@noter-md/agent-context` has a `check` script that runs `vp fmt --check packages/agent-context`.
- The root `check:packages` script now includes `@noter-md/agent-context check`.
- Structural validation should confirm the package manifest points at existing core, skill, and
  overlay files, and that each packaged skill has frontmatter name/description plus an H1.
- `pnpm --filter @noter-md/agent-context check` passed.
- `pnpm run check:packages` passed with the new package included.
- The package structural verifier passed for all package manifest targets and six packaged skill
  folders.
- A read-only package-location subagent validation loaded only package-local manifest, core,
  `pr-workflow-review`, and `noter-operator-workflows` paths. It found no unresolved actionable PR
  blocker and confirmed the previous CodeRabbit wording issue was resolved.

Applied validation revision:

- `packages/agent-context/manifests/noter.md` now states that package-local paths are authoritative
  over matching draft research paths.
- The manifest now says a future shortened `AGENTS.md` must inline or point to core context before
  task-specific skills are chosen.
- The manifest now points shadcn/ui ownership to spec 063 plus a compact `AGENTS.md` pointer instead
  of introducing a portable skill or new Noter overlay.
- The manifest now routes bare workflow shortcut commands to `noter-operator-workflows` while
  keeping the compact `AGENTS.md` command table until overlay loading is guaranteed.
- The extraction method itself is now packaged as `agent-context-extraction-lab`, with a reference
  for sampling, subagent experiment prompts, scoring, and a simple method-note outline.

## Decision

This package is the first concrete portable representation of the extracted context. Future work can
now validate or install from `packages/agent-context` instead of using only research draft paths.

Do not remove matching research artifacts yet. They remain the evidence trail for why the package
has this shape and should stay until the package is accepted as the source of truth.

## Remaining Work

- See `research/2026-05-23-agent-context-compatibility-map.md` for the decision to keep existing
  repo skills as compatibility entrypoints around packaged portable skills.
- See `research/2026-05-23-agent-context-shadcn-ownership-decision.md` for the decision to keep
  shadcn/ui ownership in spec 063 plus a compact `AGENTS.md` pointer.
- See `research/2026-05-23-agent-context-shortcut-routing-decision.md` for the decision to keep
  shortcut recognition compact and always-loaded for now.
- Keep `AGENTS.md` intact until each removed rule has a reachable core, skill, overlay, doc, or spec
  replacement.
