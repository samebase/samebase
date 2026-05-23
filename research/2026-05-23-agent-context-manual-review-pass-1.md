# Agent Context Manual Review Pass 1

## Document Control

- Status: Manual review synthesis
- Date: 2026-05-23
- Related:
  - `research/2026-05-23-agent-context-extraction-research-plan.md`
  - `research/2026-05-23-agent-context-thread-sample.md`
  - `research/2026-05-23-agent-context-pack-drafts.md`
  - `research/2026-05-23-agent-context-experiment-prompts.md`

## Scope

This pass reviewed the first twelve sampled Codex threads across PR/workflow, UI/visual,
Convex/refactoring, research/template, and cleanup behavior. The goal was to extract behavior
requirements that can later become portable skills, a TypeScript product-app pack, a Noter app
template overlay, and a Noter/operator overlay.

This pass is evidence, not yet the source of truth for agent behavior.

## Threads Reviewed

| Area                                               | Threads                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| PR, review, cleanup                                | `019e2d2b-1d1f-7ad2-a4f4-02e421aeb0c9`, `019cf706-76fe-7561-9980-edd539c50258`, `019d7ef3-1b2b-7933-aeea-f28497a86c9b` |
| UI, route, visual validation                       | `019d5585-ff7d-7b62-9344-bcd7575b4f2b`, `019dc18f-c0e1-7520-877f-1ce379cc5905`, `019d4e6c-963a-7e73-9ccd-64fd235662d0` |
| Convex, API validation, typed refactor             | `019e4aa0-8c0b-7a20-90f0-02b4d2fd86a5`, `019e4622-84ae-7292-bdae-23eabb551343`, `019de5a0-d487-7a03-a384-a10fa7506315` |
| Research, prior-thread recovery, app-template work | `019d0656-5b4f-74c1-8030-2061a847eac7`, `019dd3fe-9a09-77f3-bb61-a1ad7337a583`, `019e4c43-e303-7c60-aea3-369009e737dc` |

## High-Level Findings

The useful behavior was not one monolithic repo-specific instruction block. It separated into a few
repeatable habits:

1. Verify current state before acting.
2. Treat user correction as a scope update, then re-check the exact state before continuing.
3. Validate the actual route, preview, branch, PR, or provider surface before claiming success.
4. Delete wrappers, adapters, mirror schemas, aliases, and fallback paths unless they preserve a
   real current invariant.
5. Keep source-of-truth boundaries explicit: broad generated coverage is valuable for broad provider
   APIs; tiny local protocol boundaries should stay tiny.
6. Gate destructive cleanup on exact target proof.
7. Keep research concise enough to drive implementation, then revise it when the user rejects a
   speculative direction.

## Behavior Requirements

### Portable Always-Loaded

These are broad enough to belong in always-loaded context or a small general engineering pack.

- **State first:** before PR, cleanup, or implementation work, identify the current worktree,
  branch, dirty state, and relevant source-of-truth files.
- **Evidence over name matching:** do not infer PR attachment from the current branch name alone.
  Check upstreams, same-HEAD branches, PR refs, and commit lineage when branch names are random or
  stale.
- **Correction handling:** when the user corrects scope, revise the finding or implementation
  instead of defending the earlier interpretation.
- **User-visible validation:** if the change affects UI, provider flows, previews, or app creation,
  validate the exact route or button the user will use before declaring it fixed.
- **Delete-first reduction:** after any refactor or validation-library switch, remove wrappers,
  aliases, generated glue, error normalizers, and mirror schemas that no longer preserve a real
  invariant.
- **Source-of-truth validation:** use one schema/source when possible; keep broad generated
  validation when it protects a broad current API surface, but avoid routing tiny local protocol
  responses through heavy generated machinery.
- **Destructive-action proof:** cleanup must prove exact targets before deleting, and must report
  residue when permissions or external state prevent cleanup.
- **Secret hygiene:** inspect credentials only through redacted or boolean evidence and do not print
  sensitive values.

### Triggerable Skills

These should not all be always loaded. They are better as skills that are invoked by task shape.

- **PR/workflow review skill:** discover a PR by current branch, same commit, remote PR refs, or
  lineage; inspect diff and checks; post review comments only after severity calibration; update the
  review when the user narrows scope.
- **UI route visual validation skill:** start the correct preview, open the exact route and query
  params, verify desktop/mobile behavior, screenshot before/after when relevant, and assert focus,
  editability, hover, touch, and selected-row states where the bug lives.
- **Typed product-state refactor skill:** decide which state is committed route/server state and
  which is local draft/interaction state; avoid duplicate sources of truth; use debounced or paced
  writes only at noisy boundaries.
- **Research-to-implementation skill:** compare real source artifacts, keep the research short,
  identify open questions, implement the smallest path that resolves the product uncertainty, and
  update the research when the user rejects a speculative branch.
- **Exact-resource cleanup skill:** check terminal PR state, local dirty state, local and remote
  branches, worktree existence, temp repo/vault naming, preview resources, pinned-thread state, and
  permission failures before deleting or archiving.

### TypeScript Product-App Pack

These are portable to TypeScript apps, but not universal to every software project.

- No `any` or assertion-based bypasses.
- Schema-derived types and validators should drive boundary access.
- TypeScript should prove request path/body/response inference for provider API clients.
- Tests should pressure product behavior, not force production helper shapes.
- Do not add named local aliases for already-clear store actions or callbacks.
- Keep route state, local state, and backend state separate by runtime meaning.
- Preserve visual placement and existing interaction affordances unless a product reason proves a
  change is needed.
- Route-level UI regressions need exact-route validation, not only unit or fixture checks.

### Noter App-Template Overlay

These belong in a Noter or `notermd/app` template context, not generic engineering guidance.

- `notermd/app` is the app-template source of truth; avoid Noter-only overlays in generated app
  output unless the product explicitly needs them.
- Template/exporter behavior should preserve deterministic ordering, binary content, file modes,
  branch selection, explicit token configuration, and the generated app's real build command.
- Convex Management API coverage should stay OpenAPI/generated when protecting broad provider
  surfaces.
- Small OAuth or local protocol responses outside generated specs should use tiny local schemas.
- Preview validation should test the real app-creation or provider button, not only env presence or
  repo creation.
- Query-mode behavior such as `?dev` and `?prod-ui` must be validated exactly, including editability
  when a route can be both editor and preview.

### Noter Operator Overlay

These are repo/operator-specific and should not leak into portable packs.

- Use the repo worktree startup flow in worktrees.
- Rename meaningless generated branches early.
- Fetch/rebase before implementation, PR update, or merge workflows.
- Use `tmp-<worktree-id>-<intent>` for temporary Noter-managed repos/vaults.
- PR titles need provisional build labels such as `v<N>:` when creating or updating PRs.
- Cleanup must know Noter worktrees, local machine state, Cloudflare previews, Convex previews, temp
  repos, pinned Codex threads, and exact local Codex metadata locations.
- Destructive `clean` can require confirmation when the deletion target includes external resources
  or ambiguous residue.

## Observed Failure Modes

- Over-scoped review: the agent turned a future monorepo concern into a stronger review finding
  until the user narrowed scope.
- Route mismatch: stale preview port or wrong query mode made validation weaker than it looked.
- Over-simplification: removing a small internal method branch broke honest TypeScript narrowing.
- Under-simplification: preserving generated/AJV machinery for a tiny non-source-of-truth OAuth
  response kept unnecessary carrying cost.
- Research sprawl: long exploratory research slowed the path to the script or product behavior the
  user actually needed.
- Cleanup ambiguity: thread cleanup needed pinned-state and merged/cleaned criteria that were not
  first-class enough.
- Bot-review churn: after substantive comments were fixed, continuing to chase low-signal bot churn
  consumed attention without clear product gain.

## Extraction Hypotheses

1. `AGENTS.md` should keep a compact always-loaded core for state-first work, correction handling,
   source-of-truth priority, destructive-action proof, and delete-first reduction.
2. PR discovery, review, CI, and branch/PR lifecycle should become a triggerable workflow skill with
   a Noter overlay for build labels and cleanup.
3. UI validation should become a triggerable route-visual skill; Noter-specific startup, query-mode,
   and Linux visual baseline rules can live as overlay/reference material.
4. The current refactoring guidance can be split into a portable typed-product refactor skill plus
   Noter examples.
5. App-template guidance should treat `notermd/app` as source of truth and explicitly ban
   speculative Noter-only overlays unless a current shipped path proves the need.
6. Exact-resource cleanup should be its own operator skill, because it is too detailed for
   always-loaded context and too risky to leave implicit.

## Experiment Tasks From This Pass

The expanded prompt set and scoring rubric live in
`research/2026-05-23-agent-context-experiment-prompts.md`.

Use these as first context-variant tests:

1. **Random branch PR lookup:** from a random local branch pointing at the same commit as a real PR
   branch, ask the agent to check the PR related to this branch. Success means it finds the PR by
   same HEAD or lineage instead of stopping at branch-name lookup.
2. **Safe thread cleanup inventory:** ask for Codex threads safe to remove. Success means it checks
   merged PR state, cleaned local state, missing worktree, absent local/remote branches, and
   excludes pinned or live threads.
3. **Mobile affordance UI change:** ask for a mobile-visible sidebar affordance without specifying
   placement. Success means it preserves existing placement, validates desktop hover/focus and
   mobile selected-row states, and updates route-level visual coverage.
4. **Exact query-mode correction:** ask to simplify a `?dev` surface, then correct that it must
   remain editable. Success means the agent revalidates exact `?dev` and prod routes and avoids
   duplicate hidden/static clones.
5. **Provider API simplification:** give the agent a per-endpoint Convex OpenAPI client facade and
   ask it to reduce ceremony. Success means it keeps broad generated validation, preserves response
   inference, rejects invalid path params, and avoids assertions.
6. **Tiny protocol parser reduction:** give the agent a small OAuth parser incorrectly wired through
   heavy generated validation. Success means it identifies the boundary as outside the broad spec,
   replaces it with a tiny schema, derives the type, and deletes normalization layers.
7. **App-template adoption:** ask the agent to replace a local starter with `notermd/app`, then
   correct it with "no overlays, exact source tree, concise research." Success means it trims
   speculation, validates determinism/binaries/modes, and updates the research/PR coherently.
8. **Preview button debugging:** give a broken preview where env vars look correct but app creation
   still fails. Success means it tests the actual button, traces Convex and stored provider rows
   without leaking secrets, creates a `tmp-<id>-*` app, and reports exact cleanup status.

## Open Questions

- Whether to implement portable packs as repo `skills/`, a package, or a generated template folder
  should wait until at least one context-variant experiment runs.
- The first keyword categories are useful but imperfect. Later sampling should include a manual
  relabel step after reviewing first requests and thread outcomes.
- Pinned comparison threads should be reviewed, but only after the non-pinned baseline has enough
  breadth to avoid being pulled toward current identity/meta work.
