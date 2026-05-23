# Agent Context Forward Test Results 2

## Document Control

- Status: Targeted installed-style, Convex-gap, and overlay forward-test result
- Date: 2026-05-23
- Related:
  - `research/agent-context-draft-skills/typed-product-engineering/SKILL.md`
  - `research/agent-context-draft-overlays/noter-convex.md`
  - `research/2026-05-23-agent-context-agents-migration-map.md`

## Purpose

This pass tests three open questions from the migration map:

1. whether the revised portable skills work when passed as skill artifacts instead of prose notes
2. whether the unresolved Convex guidance should stay as existing docs/skills or become a Noter
   overlay before any `AGENTS.md` modularization
3. whether the first `noter-convex` overlay draft is enough for a realistic Convex planning task

All three runs were read-only. Agents did not edit files, start dev servers, run provider setup, or
touch provider state.

## Runs

| Area                        | Agent                                  | Artifact Context                                                             | Task Shape                                                                                 |
| --------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Installed-style typed audit | `019e5237-e35c-7a80-bbab-480ff5b5fc36` | `typed-product-engineering` plus `agent-engineering-core` as attached skills | Compare Cloudflare generated API boundary tests with Convex Management API boundary tests. |
| Convex guidance gap         | `019e5238-0b10-7972-892c-55a7cc3e4f30` | `agent-engineering-core` plus repo Convex docs/skills                        | Decide what Convex guidance can move, stay, or needs a new overlay.                        |
| Noter Convex overlay test   | `019e523f-8ebb-72d1-9ccb-e23cf71d6450` | `noter-convex` plus `agent-engineering-core`                                 | Plan a Convex module move and backend contract-test task before editing.                   |

## Results

### Installed-Style Typed Audit

Passing `typed-product-engineering` and `agent-engineering-core` as skill artifacts worked. The
agent used the revised provider-boundary checklist to compare local exemplars and reached a specific
hardening recommendation instead of proposing production refactors.

Evidence:

- `apps/noter/convex/cloudflareApi/client.ts` has typed generated path/method overloads, generated
  validators, exact-method validator dispatch, and app-local drift scripts.
- `apps/noter/convex/cloudflareApi/client.test.ts` only checks one Workers Builds trigger-list
  response validator acceptance path.
- `apps/noter/convex/convexManagementApi/client.test.ts` has richer compile-time positive and
  negative request tests, runtime request materialization, lossless large-ID response tests, and
  non-string path-param rejection.
- `apps/noter/package.json` has drift scripts for both Cloudflare and Convex generated boundaries.

Decision:

- The Cloudflare boundary has the generated machinery, but less proof than the Convex Management
  boundary.
- The smallest hardening step is focused test coverage in `cloudflareApi/client.test.ts`, not
  production refactoring.

Applied revision:

- `typed-product-engineering` frontmatter now triggers for reviewing and auditing typed boundaries,
  not only changing them.
- The provider-boundary checklist now says to compare weaker provider tests against the strongest
  local exemplar before adding abstractions.

### Convex Guidance Gap

Existing Convex guidance is useful but split across generated AI files, generic Convex skills,
accepted specs, and local backend docs. It is not enough to safely shrink the current Convex rules
out of `AGENTS.md` because no single loadable artifact names Noter's local Convex rules.

Evidence:

- `apps/noter/AGENTS.md` and the root Convex AI block point agents to generated Convex guidelines.
- The generated guidelines cover generic Convex function registration, validators, auth, queries,
  actions, schema, cron, testing, storage, and other framework rules.
- `.agents/skills/convex-*` covers generic setup, auth, components, migration, and performance
  tasks.
- Accepted specs cover Noter-specific backend contract testing, module layout, provider validation,
  Codespaces/Vault component boundaries, and agent adoption.
- `apps/noter/convex/README.md` maps backend domains but still had stale local command examples.

Decision:

- Add a small Noter Convex overlay before modularizing the Convex parts of `AGENTS.md`.
- Keep a short always-loaded pointer to the generated guidelines plus the Noter Convex overlay when
  touching Convex code.
- Keep generic Convex framework behavior in generated guidance and generic Convex skills.

Applied revisions:

- Added `research/agent-context-draft-overlays/noter-convex.md`.
- Corrected the root `AGENTS.md` Convex pointer to the actual root-relative generated-guidelines
  path.
- Updated `apps/noter/AGENTS.md` to point to the same root-relative generated-guidelines path and
  the draft Noter Convex overlay.
- Updated `apps/noter/convex/README.md` command guidance so it no longer recommends stale
  `npm run dev` / raw prod-log commands that conflict with Noter worktree and production-read
  safety.

### Noter Convex Overlay Forward Test

The new `noter-convex` overlay was mostly sufficient for read-only planning, but it needed a tighter
pre-edit checklist and sharper conflicts with stale generic/generated guidance before it can carry
live Convex context by itself.

Evidence:

- The overlay correctly routed the agent to generated Convex guidelines, accepted backend specs, and
  Noter-specific worktree/production-read rules.
- The agent found the real Vite+ Convex test lane in `vite.config.ts`, the shared Convex test
  harness in `apps/noter/convex/test.setup.ts`, and the accepted backend contract-test spec.
- The agent found the Vault module-layout spec and current function-reference shape before proposing
  module moves.
- The agent found provider-boundary specs for Convex Management and Cloudflare API validation.
- The initial overlay did not explicitly say to read the domain spec and current callsites before
  editing, did not name the provider verification commands, and did not warn against generated
  advice to add separate test config.

Applied revisions:

- Added a `Before Editing` checklist for generated guidance, accepted specs, current tree/callsites,
  and work classification.
- Strengthened test guidance around `makeConvexTest()` as the single harness, `.convex.test.ts` for
  new registered-function/HTTP/scheduling/auth coverage, and no recreated component registration.
- Added a conflict rule against generic/generated advice to add `vitest.config.ts` or install
  packages outside Noter's root-owned config and manifests.
- Added provider verification commands for Convex Management and Cloudflare generated API
  boundaries.
- Added explicit generated-file rules for `apps/noter/convex/_generated/*` and generated OpenAPI
  artifacts.

## Extraction Decisions

- Keep `typed-product-engineering` portable. The installed-style test found a metadata trigger
  refinement, not a need for Noter-specific provider details inside the portable skill.
- Add `noter-convex` as a repo overlay candidate. It owns local Convex module, validator, testing,
  production-read, provider-boundary, and component-boundary rules.
- Treat `noter-convex` as forward-tested for read-only planning after the applied revisions, but not
  yet as an installed live-editing replacement for the always-loaded Convex AI pointer.
- Keep generic Convex instructions in generated guidelines and `.agents/skills/convex-*`.
- Do not move the Convex AI block out of always-loaded context until `noter-convex` is installed or
  otherwise guaranteed reachable before Convex work.

## Next Work

1. See `research/2026-05-23-agent-context-forward-test-results-3.md` for the editing-capable
   `noter-convex` validation.
2. Run an installed-context test for the five portable triggerable skills before promoting them out
   of `research/`.
3. Decide whether to open Cloudflare API boundary test hardening as a separate production-code
   follow-up.
