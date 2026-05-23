# Agent Context Forward Test Results 3

## Document Control

- Status: Editing-capable overlay validation and packaging decision
- Date: 2026-05-23
- Related:
  - `research/agent-context-draft-overlays/noter-convex.md`
  - `research/2026-05-23-agent-context-packaging-decision.md`
  - `apps/noter/convex/cloudflareApi/client.test.ts`

## Purpose

This pass tests the next unresolved extraction questions:

1. whether `noter-convex` is sufficient for a bounded Convex/provider-boundary edit in an isolated
   worktree
2. whether the Cloudflare API boundary hardening discovered by the validation belongs in this
   extraction PR or a separate production-code follow-up
3. whether the first live packaging target should be repo-local skills, a separate context bundle,
   or a mixed shape

## Runs

| Area                              | Agent                                  | Context                                | Task Shape                                                                                     |
| --------------------------------- | -------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Noter Convex editing validation   | `019e5248-7a22-7ed3-abb3-123c6a250506` | `noter-convex` plus agent core context | In an isolated worktree, harden `cloudflareApi/client.test.ts` from local provider exemplars.  |
| Context bundle packaging decision | Main thread                            | draft artifacts and `skills/README.md` | Decide the package shape without flattening always-loaded core, skills, and overlays together. |

## Noter Convex Editing Validation

Validation ran in the isolated worktree
`/Users/nicu/.codex/worktrees/c464-convex-overlay-validation/noter` on branch
`codex/noter-convex-overlay-validation`. The worker did not push, commit, start dev servers, run
worktree startup, or touch provider state.

Fork-only changed path:

- `apps/noter/convex/cloudflareApi/client.test.ts`

The worker added a focused test-hardening sketch modeled on the stronger Convex Management API
boundary tests:

- compile-time path, method, params, and response checks
- typed request return checks
- runtime MCP request materialization
- fail-before-transport validation for non-string path params

Commands passed in the isolated worktree:

- `pnpm exec vp fmt --write apps/noter/convex/cloudflareApi/client.test.ts`
- `pnpm exec vp fmt --check apps/noter/convex/cloudflareApi/client.test.ts`
- `pnpm exec vp test apps/noter/convex/cloudflareApi/client.test.ts`
- `pnpm --dir apps/noter exec tsgo --noEmit --pretty false`
- `git diff --check`

The typecheck initially caught an invalid overload shape in the worker's runtime-invalid test
sketch. Tightening the test made the command pass, which is useful evidence that the local typed
boundary catches the kind of mistake this overlay should guide agents toward.

## Overlay Decision

`noter-convex` is sufficient for this bounded editing-capable task after the revision below. It
routed the worker to generated Convex guidance, specs `103` and `104`, current tree/callsites, and
the strongest local provider-boundary exemplar. It also kept the edit in a regular provider
`.test.ts` file, avoided provider state, avoided generated files, and prevented accidental
production reads.

Applied revisions:

- Clarified that provider API client boundary tests can stay in normal `.test.ts` files with mocked
  transports; `.convex.test.ts` is for Convex function, db, auth, HTTP route, and scheduler
  behavior.
- Named the provider-boundary exemplar shape more concretely: `expectType`, negative
  `@ts-expect-error` cases, request materialization, lossless identifier coverage when relevant, and
  fail-before-transport runtime validation.
- Added a local-check fallback when a validation task explicitly forbids provider-state bootstrap.
- Noted that fresh validation worktrees may need dependency materialization from the lockfile before
  `pnpm exec` commands can run.

## Cloudflare Boundary Decision

Do not integrate the fork's Cloudflare API test patch into this extraction PR. The patch is real
production-code hardening and deserves a separate small reviewable change. This extraction PR should
record the finding, refine `noter-convex`, and leave the production code untouched.

Follow-up candidate:

- Add focused Cloudflare API boundary tests to `apps/noter/convex/cloudflareApi/client.test.ts`
  using the fork validation as a starting point.

## Packaging Decision

`research/2026-05-23-agent-context-packaging-decision.md` selects a context-bundle shape as the next
packaging target:

- `agent-engineering-core` becomes core context, not a triggerable skill.
- Five portable triggerable skills can later be promoted into `skills/`, `$CODEX_HOME/skills`, or
  another repo after an installed-context test.
- Noter overlays stay outside the portable package and are loaded through a Noter manifest or
  repo-local overlay routing.

## Remaining Work

- See `research/2026-05-23-agent-context-forward-test-results-4.md` for installed-style validation
  of the five portable triggerable skills.
- Package the draft bundle shape in a real directory or installable repo-local skill layout.
- See `research/2026-05-23-agent-context-cloudflare-boundary-followup.md` for the decision to keep
  Cloudflare API boundary hardening as a separate production-code follow-up.
- Only shrink `AGENTS.md` after each removed rule has a reachable core, skill, overlay, doc, or spec
  replacement.
