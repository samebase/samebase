# 124 Monorepo Domain Ownership Rollout

## Document Control

- Status: Closed by the final organization pull request; Phases 1 to 5 merged
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

Merged in [PR 1592](https://github.com/samebase/samebase/pull/1592).

App creation, repository connection, repository picker search, and shared deployment setup controls
now live under `apps/samebase/src/repository/setup/`, with their existing tests and fixtures.

The shared controls serve app creation, dashboard setup dialogs, and organization settings. Keep
their exports and behavior unchanged. Database attachment helpers, route declarations, shared
contracts, and provider logos keep their current owners.

## Phase 6: Backend Identity and Organization

The final PR groups 14 plain backend modules and seven owner tests under
`apps/samebase/convex/identity/` and `apps/samebase/convex/organization/`. It changes direct imports
and generated module metadata, not registered function paths, table names, validators, or behavior.

This replaces the proposed provisioning function-path migration. Existing
[workflow starts](../apps/samebase/convex/repositoryProvisioningWorkflow.ts#L81) save function and
completion callback references. Running provider actions can also call the shared authority after a
deployment. A read that finds no active work cannot prevent new work from starting before
deployment. The six registered modules therefore keep their current paths as runtime-owned
exceptions in [Spec 100](../specs/100_CONVEX_REPOSITORY_MODULE_LAYOUT_SPEC.md). No production
maintenance gate or compatibility wrapper was added for folder organization.

## Phase 7: Confirmed Cleanup

The final PR archives superseded dashboard RFCs 066, 068, 087, 088, and 092. Their links identify
[Spec 116](../specs/116_PULL_REQUEST_PROVIDER_QUERY_SPEC.md) as the current contract. Their old
implementation was replaced in [PR 1234](https://github.com/samebase/samebase/pull/1234).

No product code deletion was justified by this fixed batch. Active tests, opt-in tools, and
workspaces were retained. References, generated tracked paths, and the existing file-list fixture
were updated with the document moves.

## Phase 8: Closure

The final PR includes the remaining code and document changes, their verification, and this closure.
This record moves to `archive/`; it no longer assigns future work. Current guardrails remain in
`AGENTS.md`, the code guardrails, the documentation standard, and Spec 100. No separate closure PR
or broad new architecture-check framework is required.

## Intentional Deferrals

- Registered Convex path changes require a separate migration decision and production coordination.
- Public-site, admin, brand, and further document grouping are not part of this round.
- RFC 123 production data cleanup remains separate. No production data was read or changed here.

Empty folders and a fixed maximum file count are not completion requirements. Further organization
work needs a new purpose and scope; these deferrals are not automatic tasks.

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

The final PR records focused owner and caller tests, root `check:ci`, app `build:ci`, source
equivalence checks, and a comparison of the local deployed function metadata. The checks must show
that registered API paths and schemas remain unchanged. Document links and tracked-file references
must resolve. CI owns the configured full suites under the
[Samebase test policy](../.agents/skills/samebase-test-policy/SKILL.md).

This round ends with the verified final PR ready for review. Merge and deployment remain separate
operator actions. No further phase starts from this archived record.
