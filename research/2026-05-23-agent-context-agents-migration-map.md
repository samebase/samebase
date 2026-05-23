# AGENTS.md Migration Map

## Document Control

- Status: Draft migration map after first forward-test pass
- Date: 2026-05-23
- Related:
  - `AGENTS.md`
  - `research/agent-context-draft-skills/`
  - `research/agent-context-draft-overlays/`
  - `research/2026-05-23-agent-context-forward-test-results-1.md`
  - `research/2026-05-23-agent-context-forward-test-results-2.md`
  - `research/2026-05-23-agent-context-forward-test-results-3.md`
  - `research/2026-05-23-agent-context-forward-test-results-4.md`
  - `research/2026-05-23-agent-context-packaging-decision.md`
  - `research/agent-context-draft-bundle/noter-manifest.md`
  - `research/2026-05-23-agent-context-package-results.md`
  - `research/2026-05-23-agent-context-compatibility-map.md`
  - `research/2026-05-23-agent-context-shadcn-ownership-decision.md`
  - `research/2026-05-23-agent-context-cloudflare-boundary-followup.md`
  - `research/2026-05-23-agent-context-shortcut-routing-decision.md`
  - `research/2026-05-23-agent-context-pinned-thread-comparison.md`
  - `research/2026-05-23-agent-context-live-agents-router-slice.md`
  - `packages/agent-context/`

## Purpose

This map translates the current long `AGENTS.md` into candidate context layers. It is not an
`AGENTS.md` rewrite. Its job is to make the eventual rewrite checkable: each section gets a target,
coverage status, and remaining work before anything is moved out of always-loaded context.

## Target Layers

| Target                       | Meaning                                                           |
| ---------------------------- | ----------------------------------------------------------------- |
| `keep-short`                 | Keep a compact always-loaded rule or pointer in `AGENTS.md`.      |
| `agent-engineering-core`     | Portable broad software-agent behavior.                           |
| `typed-product-engineering`  | Portable TypeScript or typed-product engineering guidance.        |
| `route-ui-validation`        | Portable real-route UI validation workflow.                       |
| `pr-workflow-review`         | Portable PR discovery, review, CI, and read-only triage workflow. |
| `exact-resource-cleanup`     | Portable cleanup proof workflow.                                  |
| `research-to-implementation` | Portable evidence-to-decision workflow.                           |
| `noter-app-template`         | `notermd/app` and generated-app overlay.                          |
| `noter-convex`               | Noter-specific Convex module, test, provider, and CLI overlay.    |
| `noter-operator-workflows`   | Local Noter repo/operator workflow overlay.                       |
| `existing-doc-or-skill`      | Already belongs in `docs/*` or `skills/*`; keep only a pointer.   |
| `unresolved`                 | Needs another experiment or packaging decision before moving.     |

## Section Map

| `AGENTS.md` Section         | Migration Target                                                                                    | Coverage | Notes Before Moving                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Startup`                   | `keep-short` plus `noter-operator-workflows`                                                        | Partial  | Keep `grep`/`find` availability and one-line worktree startup pointer always-loaded. Move `pnpm anon` details into operator overlay, but make the overlay load before dev/lint/test/commit workflows.                                                                                                                                                                                                                                |
| `Repo Knowledge Map`        | `keep-short` plus `research-to-implementation`                                                      | Partial  | Keep source priority and "remember this" persistence always-loaded. Move anti-bulk-migration and research/source classification examples into research workflow references.                                                                                                                                                                                                                                                          |
| `Convex CLI`                | `noter-operator-workflows` plus `noter-convex`                                                      | Partial  | Operator overlay has production-read safety, and `noter-convex` records Noter-specific Convex command overrides. Keep a short always-loaded fail-closed pointer until these overlays are installed or guaranteed reachable before backend work.                                                                                                                                                                                      |
| `Architecture`              | `keep-short`                                                                                        | Partial  | Keep the Noter monorepo stack and domain entities always-loaded for now. Do not move this to `noter-app-template`; that overlay is for generated apps derived from `notermd/app`, not this monorepo's full product architecture. Split later only if a separate Noter app overlay exists.                                                                                                                                            |
| `Code Guardrails`           | `typed-product-engineering` plus `noter-convex` plus unresolved UI residues                         | Strong   | Portable rules now cover strict typing, delete-first refactoring, provider/OpenAPI boundaries, state modeling, deterministic sorting, effects, wrappers, and tests. `noter-convex` covers Convex naming/validator conventions, `notEmpty`, provider-boundary rules, and contract tests. App-owned UI style APIs still need existing repo skills/docs or a future Noter UI overlay.                                                   |
| `Non-Functional Guardrails` | `agent-engineering-core` plus `noter-operator-workflows`                                            | Strong   | Secret safety and fail-closed behavior are portable core. Approval, auth, audit, production reads, and provider boundaries stay in operator/app overlays.                                                                                                                                                                                                                                                                            |
| `UI And Testing`            | `route-ui-validation` plus `typed-product-engineering` plus `noter-operator-workflows`              | Strong   | Portable route skill covers exact routes, interaction probes, desktop/mobile, fixtures, screenshots, and baseline handoff. Noter overlay keeps `pnpm anon`, `?dev`/`?prod-ui`, Linux ARM64 baseline command, and branch-scoped Playwright session details.                                                                                                                                                                           |
| `shadcn/ui Rules`           | `existing-doc-or-skill` plus `keep-short`                                                           | Strong   | Keep a compact AGENTS pointer that generated shadcn files are read-only by default and additions use the CLI. The detailed owner is `specs/063_SHADCN_WRAPPER_ENTRYPOINT_SPEC.md`, not portable skills or `noter-app-template`; because that spec is still marked proposed, do not remove the compact AGENTS pointer unless the spec status is accepted/current.                                                                     |
| `Workflow Shortcuts`        | `keep-short` plus `noter-operator-workflows`                                                        | Strong   | Shortcut trigger table stays compact and always-loaded until the runtime guarantees `noter-operator-workflows` loads before bare commands are resolved. Detailed semantics now have a complete landing zone in the operator overlay and `docs/agent-workflows.md`.                                                                                                                                                                   |
| `Workflow Rules`            | `pr-workflow-review`, `exact-resource-cleanup`, `noter-operator-workflows`, `existing-doc-or-skill` | Strong   | Portable PR and cleanup skills now cover read-only triage, review stance, CI, exact cleanup proof, and terminal-state cleanup. Build labels, ready/draft defaults, final directives, and shortcut meanings remain operator-specific.                                                                                                                                                                                                 |
| `Worktree Rules`            | `keep-short` plus `noter-operator-workflows`                                                        | Partial  | Keep root/branch confirmation and detached-HEAD bootstrap pointer visible. Move detailed one-idea-per-worktree and Convex env-file caveats to operator overlay.                                                                                                                                                                                                                                                                      |
| `Operator Preferences`      | `noter-operator-workflows` plus existing UI/refactor docs                                           | Partial  | Many are local response and process preferences. Keep concise response preference and no-preview reporting locally; move mobile URLs, Cloudflare link labels, no Vercel examples, shell-first preference, Playwright session details, and similar local rules to the operator overlay. Move visual minimalism and app-owned component API rules to `skills/noter-refactoring-style` or a future Noter UI overlay, not portable core. |
| `Task-Specific References`  | `keep-short`                                                                                        | Strong   | Keep this as the always-loaded router to `docs/agent-workflows.md`, `skills/create-pr`, `skills/noter-playwright-live`, and any future installed draft skills.                                                                                                                                                                                                                                                                       |
| `Convex AI Block`           | `keep-short` plus `noter-convex`                                                                    | Partial  | Keep a short always-loaded pointer to `apps/noter/convex/_generated/ai/guidelines.md` plus `noter-convex` until the overlay is installed or otherwise guaranteed to load before live Convex edits. The draft overlay has passed read-only planning and isolated editing-capable forward tests after revisions.                                                                                                                       |

## Parallel Review Adjustments

Two independent read-only review agents checked this map's assumptions:

- The product/code review corrected the architecture target: the Noter monorepo architecture should
  remain always-loaded for now and should not be conflated with the `notermd/app` template overlay.
- The same review moved shadcn ownership to `specs/063_SHADCN_WRAPPER_ENTRYPOINT_SPEC.md` plus a
  short always-loaded pointer, not portable skills or the app-template overlay.
- The workflow/operator review confirmed that shortcut recognition, startup essentials, and
  source-routing need at least compact always-loaded pointers because agents must act on `commit`,
  `ship`, `clean`, and worktree setup before optional overlays are guaranteed to load.
- The workflow/operator review found a live inconsistency in `skills/create-pr/SKILL.md`: early
  proactive PRs were still described as draft-first. The skill was updated to match the current
  ready-by-default repo rule, with draft reserved for explicit draft requests or not-yet-reviewable
  checkpoints.

## Minimum Future `AGENTS.md` Shape

A future shortened `AGENTS.md` should probably keep only:

- startup bootstrap essentials: worktree uses Noter operator workflow; primary checkout uses
  `pnpm dev`; `grep`/`find` are the available search tools in this environment
- source-of-truth hierarchy and "remember this" persistence
- compact architecture/domain summary
- one-line safety posture: preserve user changes, no secrets, fail closed for external writes and
  cleanup
- task router: which skill or overlay to load for typed refactors, route UI validation, PR/review,
  cleanup, research-to-implementation, Noter app-template, Noter operator workflows, and existing
  Convex/playwright/PR skills
- shortcut command table, or an explicit pointer to the overlay if the runtime can reliably load it
  before interpreting those commands
- Convex AI pointer until `noter-convex` is installed or otherwise guaranteed to load before live
  Convex work

Do not shrink the architecture section into `noter-app-template`; generated-app template ownership
and monorepo product orientation are separate layers.

## Packaging Decision Draft

The first live packaging target should be a repo-local context bundle, not a flat `skills/`
promotion:

1. Keep the research artifacts as the evidence trail until `packages/agent-context` is accepted as
   the source of truth.
2. Treat `agent-engineering-core` as an always-loaded core context file, not a triggerable skill.
3. Promote the six portable triggerable skills into `skills/`, `$CODEX_HOME/skills`, or another repo
   from `packages/agent-context` only after one package-location validation.
4. Keep Noter overlays outside the portable package. They can live as repo-local overlay references
   or as entries in a Noter manifest.
5. Leave existing skills such as `skills/create-pr/SKILL.md`,
   `skills/noter-playwright-live/SKILL.md`, and `skills/noter-refactoring-style/SKILL.md` in place
   as compatibility entrypoints around packaged portable skills.
6. Add a live `AGENTS.md` pointer to `packages/agent-context/manifests/noter.md` and this migration
   map before removing any broad rule.
7. Only then shrink `AGENTS.md`, one section at a time, with a checklist proving each removed rule
   has a reachable replacement.

## Remaining Validation

- Port the Cloudflare API boundary test hardening on a clean production-code branch when desired.
- Track private authenticated browser-data archival as a possible triggerable skill only if the
  workflow recurs outside pinned/high-salience threads.
