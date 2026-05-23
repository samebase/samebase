# Agent Context Forward Test Results 1

## Document Control

- Status: Targeted draft-skill validation result
- Date: 2026-05-23
- Related:
  - `research/agent-context-draft-skills/`
  - `research/agent-context-draft-overlays/`
  - `research/2026-05-23-agent-context-layer-synthesis.md`

## Purpose

This pass tests the first draft skill and overlay artifacts directly. Unlike the earlier
context-variant experiments, these agents were asked to use the drafted artifacts as their working
instructions and report whether the instructions were enough for realistic repo tasks.

All runs were read-only. Agents were told not to edit files, run dev servers, push, post comments,
delete resources, rerun jobs, or run provider-mutating setup. They were also told to use
`grep`/`find`/`sed` instead of `rg`.

## Runs

| Area                    | Agent                                  | Artifact Context                                         | Task Shape                                                                                    |
| ----------------------- | -------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Typed provider boundary | `019e522a-4ad7-7ec2-8cfc-0ed60bea0a36` | `typed-product-engineering`                              | Simplify generated/provider validation without unsafe assertions.                             |
| Route UI validation     | `019e522a-767c-78b1-9117-ac4eb749cf3d` | `route-ui-validation`                                    | Plan real desktop/mobile route validation without starting the app.                           |
| Cleanup dry-run         | `019e522a-ad3d-7573-90f0-46fae08d3074` | `exact-resource-cleanup` plus `noter-operator-workflows` | Dry-run `archive/clean this worktree if safe`.                                                |
| App-template research   | `019e522a-e70d-7fd3-b298-66aa4a38f334` | `research-to-implementation` plus `noter-app-template`   | Decide whether to add Noter-side generated-app overlay/filtering or harden the existing path. |
| PR blocker triage       | `019e522d-5d48-7130-9ada-e8b41590d98c` | `pr-workflow-review`                                     | Check current PR for actionable blockers without mutating GitHub or git state.                |

## Results

### Typed Provider Boundary

The draft skill was directionally strong but under-specified the provider/OpenAPI proof boundary.
The agent used the Convex Management API and Cloudflare API client surfaces as evidence and found
the missing portable lesson: typed provider boundaries need lossless ID handling, literal
method/path/params/body callsites, generated drift sentinels, and tests that fail when inference
weakens.

Applied revision:

- added a `Provider And OpenAPI Boundaries` section to `typed-product-engineering`

Remaining observation:

- the Cloudflare generated-boundary tests appear thinner than the Convex Management API tests; this
  is useful future implementation hardening, not a skill packaging blocker.

### Route UI Validation

The portable route skill correctly pushed agents toward exact routes, desktop/mobile validation,
real interaction probes, and avoiding fake fixtures. It was not enough to execute Noter-grade
validation because startup, auth, browser session, query mode, and baseline runner rules are
repo-specific.

Applied revisions:

- added an overlay handoff for startup/auth/browser/baseline rules
- required validation of both route state and transition mechanism for desktop/mobile differences
- clarified that local screenshots are diagnostic unless the repo overlay defines them as
  authoritative baselines

### Cleanup Dry-Run

The cleanup skill plus Noter operator overlay prevented unsafe cleanup. The dry-run proved the
current worktree is clean, has a matching open PR, and is pushed to its upstream. It concluded that
`archive` is locally eligible but full `clean` is blocked because PR #818 is still open rather than
`MERGED` or `CLOSED`.

Applied revisions:

- added dry-run constraints against setup commands, provider credentials, and mutating provider
  paths
- added an explicit final decision shape to the portable cleanup skill
- added the Noter distinction between `archive` and `clean`
- added Noter dry-run proof examples for git, PR, machine-state, and process evidence

### App-Template Research

The research skill plus app-template overlay led to the intended decision: do not add a Noter-side
overlay or filter layer for generated apps. Harden the existing `notermd/app` exporter/seeder path
instead.

The test also found a real hardening item: the exporter uses bytewise UTF-8 path ordering, while
runtime seeding still sorts tree entries with `localeCompare`.

Applied revisions:

- clarified that Noter should not filter source-owned `.agents`, docs, or research-looking files
  unless they are proven Noter-owned rather than `notermd/app`-owned
- strengthened the path-ordering rule to require one bytewise comparator, or a proven equivalent,
  across exporter hashing, generated object ordering, binary blob creation, and runtime tree entries
- added read-only validation-gap guidance for cases where app creation or generated-app builds are
  disallowed
- added a final decision/hardening/open-question handoff to `research-to-implementation`

Implementation follow-up:

- consider hardening `apps/noter/convex/starterSeed.ts` so runtime tree-entry ordering uses the same
  bytewise comparator as `scripts/export-notermd-app-manifest.ts`

### PR Blocker Triage

The PR skill was useful but too mutating for a pure "what is blocking?" request. The agent needed a
read-only mode to avoid treating inspection as a PR-update workflow. The current PR had no
actionable blockers in the forward test, but CodeRabbit's green status represented a skipped review
because of rate/credit limits.

Applied revisions:

- added a `Read-Only PR Triage` section
- narrowed fetch/rebase guidance to implementation or PR-update workflows
- added bot-status interpretation rules for skipped, rate-limited, disabled, or not-run review
  tooling
- added example read-only commands and a required blocker decision shape

## Extraction Decisions

- Keep the six drafted portable skills separate. The forward tests found improvements inside each
  relevant skill, but no evidence that these rules should collapse back into one always-loaded
  `AGENTS.md`.
- Keep Noter startup, visual baseline, Convex production-read, PR build-label, cleanup, and response
  conventions in the operator overlay.
- Keep generated-app exact-source, source ownership, provenance, path ordering, and build-command
  rules in the app-template overlay.
- Record implementation hardening discovered by validation, but do not mix those fixes into the
  context-pack extraction unless a follow-up explicitly takes on production code changes.

## Next Work

1. See `research/2026-05-23-agent-context-agents-migration-map.md` for the section-by-section
   `AGENTS.md` migration map.
2. See `research/2026-05-23-agent-context-forward-test-results-2.md` and
   `research/2026-05-23-agent-context-forward-test-results-3.md` for later installed-style and
   editing-capable validation.
3. See `research/2026-05-23-agent-context-packaging-decision.md` for the first context-bundle
   packaging decision.
