# 124 Monorepo Domain Ownership Rollout

## Document Control

- Status: Active roadmap; Phases 1 to 3 merged; Phase 4 in this pull request
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

Implemented in this pull request; pending review and merge.

- Group account settings, MCP client settings, and the account deletion UI and browser state under
  `apps/samebase/src/account/`.
- Group organization pages, context, route helpers, and GitHub identity reads under
  `apps/samebase/src/organization/`. Put organization provider connections and their setup dialog
  and popup helper under `organization/providers/`.
- Move the existing owner tests and feature fixtures with their code. Update direct imports, route
  consumers, fixture dispatch, and active document references.

Route declarations, route-search modules, generic auth code, shared app chrome, and provisioning
controls keep their existing owners. This phase changes file paths only.

## Next Work

Confirm each later change from the repository state at that time. These are useful next areas:

| Area                    | Next useful change                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Other frontend features | Move one proven group at a time, such as provisioning controls or public-site code.                |
| Dead files              | Delete confirmed unused files and re-export shims after checking runtime and generated references. |
| Documents               | Reclassify small batches using the documentation standard and update links in the same change.     |
| Convex                  | Move plain helpers where ownership is clear. Assess registered function path changes separately.   |

Do not require RFC 123 production cleanup before unrelated folder changes. A specific runtime
dependency must be demonstrated before it becomes a prerequisite.

## Working Rules

- This Codex task owns the roadmap and cross-change decisions. Later implementation PRs can use
  separate Codex tasks and worktrees so their detailed code work stays out of the planning context.
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

For Phase 4, run the existing account and organization owner tests, root `check:ci`, app `build:ci`,
and a focused organization route check. Verify that the moved code differs only in path references.

Each later PR selects its existing owner tests under the
[Samebase test policy](../.agents/skills/samebase-test-policy/SKILL.md). CI owns the configured full
suites.

A change is complete when its related code is easier to locate, old live path references are gone,
and its verification passes. Update this roadmap when evidence changes the next useful step. Move
durable accepted rules into a focused spec only when future work needs that contract. Remove
completed rollout detail when code, tests, and focused documentation make it redundant.
