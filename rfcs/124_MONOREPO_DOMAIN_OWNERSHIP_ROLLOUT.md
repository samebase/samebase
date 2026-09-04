# 124 Monorepo Domain Ownership Rollout

## Document Control

- Status: Phases 1 to 4 merged; Phase 5 in this pull request; then stop
- Owner: Samebase monorepo
- Updated: 2026-09-05
- Related: [Documentation standard](../docs/repo-documentation-standard.md),
  [code guardrails](../docs/code-guardrails.md), and
  [Convex repository layout](../specs/100_CONVEX_REPOSITORY_MODULE_LAYOUT_SPEC.md)

## Problem and Direction

The monorepo roots already have useful roles. The main navigation problem is inside the Samebase
app: large `components`, `lib`, and `hooks` folders mix unrelated features. A developer must search
several folders to find the UI, state, helpers, and tests for one feature.

Group related code by its current owner. The repository dashboard and editor have clear groups in
their existing callers. Keep shared utilities small and direct. Keep tests and feature fixtures
beside the code they exercise.

The purpose is to make features easier to find and change. Empty root folders, a fixed maximum file
count, and a complete new folder tree are not goals.

Phase numbers identify delivered batches. They do not define a fixed sequence from an earlier draft.

## Phase 1: Repository Dashboard

Merged in [PR 1587](https://github.com/samebase/samebase/pull/1587).

Dashboard components, hooks, helpers, tests, and feature fixtures now live under
`apps/samebase/src/repository/dashboard/`. Shared repository code, app chrome, provider logos, and
schema-graph code kept their existing owners. The PR records the file map and checks.

## Phase 2: Repository Editor

Merged in [PR 1589](https://github.com/samebase/samebase/pull/1589).

Repository editor components, hooks, helpers, tests, and feature fixtures now live under
`apps/samebase/src/repository/editor/`. Generic Monaco, CodeMirror, and ProseMark code, shared app
chrome, and route-search code kept their existing owners. The PR records the file map and checks.

## Phase 3: Workspace Checks

Merged in [PR 1590](https://github.com/samebase/samebase/pull/1590).

- Run the existing domain-router and PostHog proxy dry-run checks and the Solid layout app type
  check from both root workspace check commands. Include the existing PostHog and Solid type checks
  in the root `typecheck` command.
- Remove stale starter-template lint paths. `templates/base` keeps its separate workspace checks.
- Correct the README app and package tree, starter path, and Vite+ hook reference.

## Phase 4: Account and Organization

Merged in [PR 1591](https://github.com/samebase/samebase/pull/1591).

Account settings, MCP client settings, and account deletion code now live under
`apps/samebase/src/account/`. Organization code lives under `apps/samebase/src/organization/`, with
provider connection code under `organization/providers/`. Owner tests and feature fixtures moved
with their code. The PR records the file map and checks.

## Phase 5: Repository Setup

This PR contains the complete approved group and its checks. Group app creation, repository
connection, repository picker search, and shared deployment setup controls under
`apps/samebase/src/repository/setup/`. Move their existing tests and fixtures with them. Update all
direct callers, mock paths, fixture dispatch, tracked metadata, and active document references.

The shared controls serve app creation, dashboard setup dialogs, and organization settings. Keep
their exports and behavior unchanged. Database attachment helpers, route declarations, shared
contracts, and provider logos keep their current owners.

Stop after this ready PR. Any further folder work needs a new user decision.

## Backlog

These areas are backlog, not automatic tasks. Select any later work through a new user decision.

| Area                    | Next useful change                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Other frontend features | Move a proven group, such as public-site code.                                                     |
| Dead files              | Delete confirmed unused files and re-export shims after checking runtime and generated references. |
| Documents               | Reclassify small batches using the documentation standard and update links in the same change.     |
| Convex                  | Move plain helpers where ownership is clear. Assess registered function path changes separately.   |

Do not require RFC 123 production cleanup before unrelated folder changes. A specific runtime
dependency must be demonstrated before it becomes a prerequisite.

## Working Rules

- Keep detailed implementation work in a separate worktree and agent. This task owns scope, review,
  and the stop decision.
- Give each PR one clear purpose. Include its relevant RFC update in that PR.
- Sequence changes that share files or depend on earlier moves. Independent work can proceed when
  its file scope and dependencies are clear.
- Preserve the current behavior during path moves. Handle substantial module splitting separately.
- Update callers directly. Do not add barrels, re-export shims, or temporary compatibility files.
- Keep generated files, shadcn components, route declarations, and framework entrypoints with their
  existing tool or runtime owner.
- Keep a small registered Convex function intact when that is the clearest code. Extract an
  implementation only when it improves ownership or readability.
- For a registered Convex path change, check actual clients, scheduled calls, and active workflows
  before choosing a migration. A source import search alone is not sufficient.
- Add narrow automated ownership checks when a completed move establishes a useful rule. Avoid a
  speculative registry of every public file in every future domain.

## Verification and Completion

For Phase 5, run the existing setup and affected caller tests, root `check:ci`, and app `build:ci`.
Verify that the moved code differs only in path references. Use existing narrow browser coverage
when it adds useful evidence. Do not add tests or screenshot baselines for path moves alone.

Each later PR selects its existing owner tests under the
[Samebase test policy](../.agents/skills/samebase-test-policy/SKILL.md). CI owns the configured full
suites.

A change is complete when its related code is easier to locate, old live path references are gone,
and its verification passes. Update this roadmap when evidence changes the next useful step. Move
durable accepted rules into a focused spec only when future work needs that contract. Remove
completed rollout detail when code, tests, and focused documentation make it redundant.
