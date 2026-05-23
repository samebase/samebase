# Agent Context Extraction Research Plan

## Document Control

- Status: Research scaffold
- Date: 2026-05-23
- Owner: Codex agent workflow extraction
- Scope: `AGENTS.md`, repo skills, workflow docs, Codex thread history, and later context
  experiments

## Goal

Extract a portable representation of the workflow context that makes agents effective in this repo.
The target is not a shorter `AGENTS.md` by itself. The target is a validated set of reusable
guidance layers, skills, and Noter-specific overlays that can be applied to other TypeScript apps,
`notermd/app`-style templates, and general software engineering work.

The extraction must be empirical. Current docs and personal taste are useful inputs, but the final
shape should be tested against real historical Codex work and parallel context variants before large
parts of the always-loaded repo context are moved.

## Evidence Inspected So Far

Repo guidance sources:

- `AGENTS.md` is the main always-loaded repo guidance file.
- `apps/noter/AGENTS.md` adds Convex-specific guidance delegation.
- `docs/agent-workflows.md` contains workflow details for worktrees, PRs, validation, review, ship,
  and cleanup.
- `docs/playwright-visual-testing.md` contains the canonical visual baseline workflow.
- `docs/noter-pr-preview-cleanup.md` contains exact-resource cleanup rules.
- `skills/create-pr/SKILL.md`, `skills/noter-playwright-live/SKILL.md`,
  `skills/mac-app-control/SKILL.md`, and `skills/noter-refactoring-style/SKILL.md` already split
  some conditional workflows out of `AGENTS.md`.
- `research/2026-05-23-agent-context-thread-sample.md` contains the first deterministic sample
  manifest.
- `research/2026-05-23-agent-context-manual-review-pass-1.md` contains the first manual review
  synthesis and behavior requirements.
- `research/2026-05-23-agent-context-pack-drafts.md` contains the first candidate pack boundaries.
- `research/2026-05-23-agent-context-experiment-prompts.md` contains context-variant experiment
  prompts and scoring rules.
- `research/2026-05-23-agent-context-experiment-results-1.md` contains the first context-variant
  experiment result.
- `research/2026-05-23-agent-context-experiment-results-2.md` contains the random-branch PR lookup
  experiment result.
- `research/2026-05-23-agent-context-experiment-results-3.md` contains the UI route validation
  experiment result.
- `research/2026-05-23-agent-context-experiment-results-4.md` contains the typed provider-boundary
  refactoring experiment result.
- `research/2026-05-23-agent-context-experiment-results-5.md` contains the
  research-to-implementation and app-template adoption experiment result.
- `research/2026-05-23-agent-context-layer-synthesis.md` summarizes the surviving layer boundaries
  after the first five experiments and sets the skill-drafting order.
- `research/agent-context-draft-skills/` and `research/agent-context-draft-overlays/` contain the
  first draft portable skills and Noter overlays. They are research artifacts, not installed skills
  or an active `AGENTS.md` rewrite.
- `research/2026-05-23-agent-context-forward-test-results-1.md` contains the first targeted
  forward-test pass against those draft artifacts and the revisions it produced.

Local thread evidence:

- Active session JSONL files live under `/Users/nicu/.codex/sessions`.
- Archived session JSONL files live under `/Users/nicu/.codex/archived_sessions`.
- Machine-local pinned thread state lives in `/Users/nicu/.codex/.codex-global-state.json` under
  `pinned-thread-ids`.
- The local archive currently has 798 JSONL thread files: 85 active and 713 archived.
- 716 session files have a `cwd` under a Noter path.
- 20 Noter sessions are currently pinned; they should be sampled separately instead of mixed into
  the baseline.

The JSONL records expose enough metadata for sampling:

- `session_meta.payload.id`
- `session_meta.payload.timestamp`
- `session_meta.payload.cwd`
- `session_meta.payload.git`
- `turn_context.payload.model`
- `turn_context.payload.effort`
- first non-bootstrap user message
- event signals such as `task_complete`, `turn_aborted`, `context_compacted`, and
  `thread_rolled_back`

## Initial Behavior Clusters

Portable beyond Noter:

- repo memory hierarchy and source-of-truth priority
- read-first, preserve-user-work editing discipline
- PR body quality, diff inspection, ready/draft semantics, validation summaries, and review updates
- agent-owned end-to-end validation
- route-first UI regression policy for interactive product repos
- fail-closed cleanup and exact-resource proof
- delete-first typed refactoring

TypeScript and product-app specific:

- no `any` or assertion-based bypasses
- schema-derived types
- small durable state spaces
- deterministic sort order for user-visible collections
- Tailwind literal class mapping
- shadcn wrapper discipline
- route-level Playwright and visual coverage expectations

Noter/operator-specific:

- `pnpm anon:once` and `pnpm anon` worktree startup
- Convex CLI production-read safety
- temporary vault naming
- `noter.ts` machine-link isolation
- Cloudflare as default front door
- PR build labels such as `v<N>:`
- cleanup of Cloudflare previews, Convex previews, temp repos, and local machine state
- ProseMark link-label workaround and localhost/tunnel reporting preferences

## Anti-Survivorship Sampling Method

Pinned threads are useful, but they are biased toward memorable or currently important work. They
must be a comparison stratum, not the main task source.

Build the primary sample from all Noter session JSONL files:

1. Filter by `session_meta.payload.cwd` containing `/noter`.
2. Join with `pinned-thread-ids`.
3. Exclude pinned threads from the baseline.
4. Keep active and archived sessions in separate source buckets.
5. Stratify by month and task category.
6. Use first non-bootstrap user request text only for categorization.
7. Manually inspect selected threads after sampling, rather than trusting keyword labels alone.

Baseline sample target:

- 60 non-pinned Noter sessions across active and archived stores.
- 10 pinned Noter sessions as a comparison set.
- 5 automation or projectless sessions if they are relevant to workflow extraction.

Working categories:

- `git_pr_ci_review`
- `ui_visual_routes`
- `convex_backend_auth`
- `code_quality_bugfix`
- `tooling_dev_workflow`
- `docs_research_planning`
- `ops_automation_sessions`
- `other`

## Initial Thread Probe

A deterministic metadata scan found 696 non-pinned Noter sessions and 20 pinned Noter sessions with
extractable first requests.

Initial non-pinned probe threads:

- `019e2d2b-1d1f-7ad2-a4f4-02e421aeb0c9`: PR review work. Useful for extracting review stance,
  GitHub inspection, and comment severity calibration.
- `019e4aa0-8c0b-7a20-90f0-02b4d2fd86a5`: Convex API client simplification. Useful for
  generated-vs-handwritten validation tradeoffs and cleanup workflow.
- `019d5585-ff7d-7b62-9344-bcd7575b4f2b`: landing prerender and bundle split discussion. Useful for
  frontend performance and route loading behavior.
- `019d4e6c-963a-7e73-9ccd-64fd235662d0`: machine thread pinning. Useful for mobile/desktop
  affordance design, local Codex state, visual validation, and cleanup.
- `019dd3fe-9a09-77f3-bb61-a1ad7337a583`: `notermd/app` starter-template adoption research. Useful
  for deciding what should become a Noter app-template overlay instead of generic TypeScript advice.
- `019d7ef3-1b2b-7933-aeea-f28497a86c9b`: thread cleanup inventory. Useful for exact-resource
  safety, pinned-thread bias, and machine-local archive reasoning.

Initial pinned comparison threads included current logo/theme work, mobile keyboard editing,
lowercase Convex deploy key compatibility, and this context-extraction thread. These confirm that
pinned threads overrepresent ongoing identity, app-shell, and meta-work, so they should not define
the baseline alone.

## Manual Review Pass 1 Findings

The first manual review pass sharpened the extraction boundary. The portable lesson is not a single
tool choice or repo ritual. It is a set of behaviors that showed up repeatedly across unrelated
threads:

1. verify the current branch, route, provider, or cleanup target before acting
2. treat user corrections as scope changes and re-check exact state
3. validate the user-visible path before claiming success
4. delete wrappers and compatibility layers that no longer preserve a current invariant
5. keep broad generated validation when it protects a broad provider API surface
6. keep tiny local protocol boundaries tiny
7. gate destructive cleanup on exact target proof

This pass also added the first experiment task list in
`research/2026-05-23-agent-context-manual-review-pass-1.md`.

The first pack draft keeps only `agent-engineering-core` as always-loaded. PR/review, route
validation, typed refactoring, research-to-implementation, and cleanup behavior remain triggerable
skills or overlays until experiments show otherwise.

The first context-variant experiment tested safe cleanup inventory. It supported keeping generic
fail-closed cleanup in core, exact target proof in a triggerable cleanup skill, and Codex pinned
thread/session/worktree metadata in the Noter operator overlay.

The second experiment tested random-branch PR lookup. All variants found the PR in an exact-SHA
fixture, but the PR workflow skill supplied the more robust lookup path and the Noter overlay
improved interpretation of ready/build-label/review-bot state.

The third experiment tested real root-route query modes. It showed core can validate exact URLs, the
route UI skill expands coverage to desktop/mobile and focus/editability, and the Noter app-template
overlay improves `?dev`/`?prod-ui` interpretation plus safe non-mutating input probes.

The fourth experiment tested typed refactoring at the Convex Management API boundary. It showed the
typed-product pack helps agents reduce wrappers without crossing TypeScript's proof boundary, while
the Noter app-template overlay names why generated validation and decimal-string IDs are real
provider-safety invariants. It also exposed that `pnpm anon` is an operator workflow with provider
side effects, not a portable read-only test instruction.

The fifth experiment tested `notermd/app` adoption with a mid-run correction forbidding Noter-only
overlays. All variants recognized the exporter/seeder path already exists, but the
research-to-implementation pack improved test-ownership judgment and the Noter app-template overlay
found the concrete exact-source invariant that runtime seeding should use the same deterministic
bytewise ordering as the exporter.

## Candidate Layer Shape

### Layer 1: General Agent Engineering

Reusable across languages and repos:

- read current state before acting
- preserve user changes
- use source-of-truth priority
- make reversible hypotheses
- delegate bounded side tasks with clear output contracts
- review as bugs, risks, regressions, and missing tests
- fail closed for cleanup and external writes
- verify claims against current evidence before completion
- recognize when the current implementation already satisfies the request and should be hardened
  instead of replaced

### Layer 2: Typed Product Engineering

Reusable for TypeScript and similar typed app repos:

- derive types from schemas
- avoid assertions and `any`
- make impossible states unrepresentable
- prefer deterministic ordering
- use route-level reproduction for interaction regressions
- keep UI copy and styling minimal unless product behavior proves the need
- remove wrappers and compatibility shims when direct APIs become viable
- keep small helper branches when they are the boundary that lets TypeScript prove method/path/body
  inference without unsafe indexing

### Layer 3: Noter App Template

Reusable for `notermd/app` or close descendants:

- Convex runtime and schema conventions
- React Router, Vite, shadcn, Tailwind, Playwright visual workflows
- Cloudflare-first hosting and preview expectations
- provider connection and vault concepts
- app-owned route shell and mobile pane behavior
- exact `notermd/app` source export without Noter-side overlays or filtering
- generated-manifest provenance, binary/text split, file modes, bytewise path ordering, branch
  selection, content hash, and generated app build-command validation

### Layer 4: Noter Operator Overlay

Specific to this repo and this operator:

- `pnpm anon` worktree lifecycle
- exact shortcut command meanings: `commit`, `push`, `create pr`, `ship`, `clean`, and related flows
- PR build-label rules
- temporary vault and preview cleanup
- local machine-link isolation
- response formatting preferences

## Experiment Design

Each extraction is a hypothesis. Do not permanently move large context until experiments show the
reduced context still produces the desired behavior.

Context variants:

- full current context
- reduced `AGENTS.md` plus linked skills
- portable engineering-only pack
- TypeScript product-app pack
- Noter app-template pack
- Noter operator overlay
- intentionally missing-context variants for failure discovery

Experiment tasks:

- implement a small TypeScript bugfix
- review a historical PR
- debug a Convex/backend issue
- change a route-level UI behavior and verify it visually
- run a git/PR workflow shortcut
- clean or archive a terminal worktree
- perform a research-to-spec task

Rubric:

- chose the right source-of-truth files
- avoided unsafe type assertions or speculative wrappers
- preserved user and parallel-agent changes
- selected appropriate tests and verification
- handled browser/visual validation when relevant
- used PR and cleanup workflows correctly
- produced concise operator-facing summaries
- knew when a rule was portable vs Noter-specific

Backtracking rule:

If a reduced context variant causes agents to miss a material workflow invariant, do not patch the
same reduced file blindly. First decide whether the missing invariant belongs in always-loaded
context, a triggerable skill, a workflow doc, or an operator overlay.

## Next Work

1. Compare the revised draft artifacts against the long `AGENTS.md` sections and mark the intended
   migration target for each cluster.
2. Forward-test the revised artifacts as installed or package-like skills in an isolated context.
3. Manually review the pinned comparison threads after the non-pinned baseline has more breadth.
4. Only then move durable material out of `AGENTS.md`.
