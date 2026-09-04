# 124 Monorepo Domain Ownership Rollout

## Document Control

- Status: Active roadmap; Phase 1 merged; Phase 2 in this pull request
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

Implemented in this pull request; pending review and merge.

- Group FileView, its file tree, dialogs, media views, review and sync UI, hooks, helpers, tests,
  and feature fixtures under `apps/samebase/src/repository/editor/`.
- Move repository-specific Monaco file-loading and cache helpers with their tests. Keep generic
  Monaco, CodeMirror, and ProseMark code, shared app chrome, and route-search code at their current
  paths.
- Update direct and dynamic imports, test mocks, fixture dispatch, tracked-file metadata, and
  current documentation references. Keep the Simple View fixture beside its test.
- Preserve function names, UI, routes, query parameters, keyboard, focus, selection, touch behavior,
  and Convex API addresses. Move files without splitting functions or adding re-export shims.

The PR records the exact file map and verification results.

## Next Work

Confirm each later change from the repository state at that time. These are useful next areas:

| Area                    | Next useful change                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Workspace checks        | Correct missing check coverage, stale Vite paths, and the README workspace tree.                   |
| Other frontend features | Move one proven group at a time, such as account, organization, provider, or public-site code.     |
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

For Phase 2, run the existing affected editor and route tests, root checks, the app production
build, and one narrow existing editor browser check. Check production imports, dynamic imports, test
mocks, fixture dispatch, and tracked-file references. Do not add tests or change screenshots only
because file paths changed.

Each later PR selects its existing owner tests under the
[Samebase test policy](../.agents/skills/samebase-test-policy/SKILL.md). CI owns the configured full
suites.

A change is complete when its related code is easier to locate, old live path references are gone,
and its verification passes. Update this roadmap when evidence changes the next useful step. Move
durable accepted rules into a focused spec only when future work needs that contract. Remove
completed rollout detail when code, tests, and focused documentation make it redundant.
