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

| Artifact                                                      | Load intent          | Scope                                                                |
| ------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------- |
| `../agent-context-draft-overlays/noter-app-template.md`       | App-template overlay | `notermd/app` and generated apps                                     |
| `../agent-context-draft-overlays/noter-operator-workflows.md` | Operator overlay     | This repo's local workflow, PR, Convex, cleanup, and response rules  |
| `../agent-context-draft-overlays/noter-convex.md`             | Convex overlay       | Noter-specific Convex module, test, provider-boundary, and CLI rules |

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
- `research/2026-05-23-agent-context-forward-test-results-1.md` records targeted forward tests for
  five draft artifacts: typed provider boundaries, route UI validation, cleanup, app-template
  research, and read-only PR triage. The resulting revisions were applied to the draft skills and
  overlays.
- `research/2026-05-23-agent-context-agents-migration-map.md` maps the current `AGENTS.md` sections
  to keep-short pointers, portable skills, Noter overlays, existing docs/skills, and unresolved
  follow-up areas before any live modularization.
- `research/2026-05-23-agent-context-forward-test-results-2.md` records an installed-style typed
  audit plus a Convex guidance gap probe. The pass added the `noter-convex` overlay draft and
  refined the typed skill trigger metadata.
- A follow-up `noter-convex` forward test found the overlay sufficient for read-only Convex planning
  after revisions to its pre-edit checklist, test-harness guidance, generated-file rules, and
  provider verification commands.
- `research/2026-05-23-agent-context-packaging-decision.md` selects a context-bundle packaging
  shape: core context, five portable triggerable skills, and Noter overlays kept as separate layers.
- `research/2026-05-23-agent-context-forward-test-results-3.md` records an isolated editing-capable
  `noter-convex` validation and the decision to split Cloudflare API boundary hardening out of this
  extraction PR.
- `research/2026-05-23-agent-context-forward-test-results-4.md` records installed-style validation
  for all five portable triggerable skills and the revisions it produced.
- `research/agent-context-draft-bundle/noter-manifest.md` maps the current core, portable skills,
  and Noter overlays into the first package-like bundle manifest.
- `research/2026-05-23-agent-context-package-results.md` records the first real package layout in
  `packages/agent-context`.
- `research/2026-05-23-agent-context-compatibility-map.md` keeps existing repo skills as
  compatibility entrypoints around the packaged portable skills.
- `research/2026-05-23-agent-context-shadcn-ownership-decision.md` keeps shadcn/ui ownership in spec
  063 plus a compact `AGENTS.md` pointer.

## Next Validation

- Decide whether shortcut recognition can safely move out of always-loaded context in the current
  Codex runtime.
