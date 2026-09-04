# 124 Monorepo Domain Ownership Rollout

## Document Control

- Status: Proposed roadmap; Phase 1 is included in this pull request
- Owner: Samebase monorepo
- Updated: 2026-09-04
- Related: [Documentation standard](../docs/repo-documentation-standard.md),
  [code guardrails](../docs/code-guardrails.md), and
  [Convex repository layout](../specs/100_CONVEX_REPOSITORY_MODULE_LAYOUT_SPEC.md)

## Problem and Direction

The monorepo roots already have useful roles. The main navigation problem is inside the Samebase
app: large `components`, `lib`, and `hooks` folders mix unrelated features. A developer must search
several folders to find the UI, state, helpers, and tests for one feature.

Group related code by its current owner. Start with the repository dashboard, where existing
components and callers already show a clear group. Keep shared utilities small and direct. Keep
tests and feature fixtures beside the code they exercise.

The purpose is to make features easier to find and change. Empty root folders, a fixed maximum file
count, and a complete new folder tree are not goals.

## Phase 1: Repository Dashboard

This pull request contains the roadmap and the first folder cleanup.

- Group dashboard components, hooks, helpers, tests, and feature fixtures under
  `apps/samebase/src/repository/dashboard/`.
- Move files from the crowded roots when their current callers show dashboard ownership.
- Keep reusable repository code outside the dashboard subfolder when editor or other repository
  surfaces also use it.
- Keep shared app-shell and provider-brand code separate from dashboard ownership.
- Leave the existing shared chrome, provider-logo, and schema-graph files at their current paths in
  this first change. Their owners can move them in a later focused PR.
- Update direct imports, test mocks, build references, and current documentation affected by the
  move. Regenerate tracked-file metadata from its existing source.
- Preserve function names, rendered UI, CSS selectors, routes, query parameters, and Convex API
  addresses. This change moves code; it does not redesign the dashboard.

The pull request records the exact file map and verification results. This RFC does not duplicate
that changing inventory.

## Next Work

Confirm each later change from the repository state at that time. These are useful next areas, not
prerequisites for Phase 1:

| Area                    | Next useful change                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Repository editor       | Group FileView UI, state, helpers, and existing tests under one repository editor owner.           |
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

For Phase 1, run the existing affected dashboard and route tests, the app production build, and
repository checks. Check that moved files resolve from production imports, dynamic imports, test
mocks, build configuration, and tracked-file references. Use the existing route or visual fixture
for a browser smoke check. Do not add tests or change screenshots only because file paths changed.

Each later PR selects its existing owner tests under the
[Samebase test policy](../.agents/skills/samebase-test-policy/SKILL.md). CI owns the configured full
suites.

A change is complete when its related code is easier to locate, old live path references are gone,
and its verification passes. Update this roadmap when evidence changes the next useful step. Move
durable accepted rules into a focused spec only when future work needs that contract. Remove
completed rollout detail when code, tests, and focused documentation make it redundant.
