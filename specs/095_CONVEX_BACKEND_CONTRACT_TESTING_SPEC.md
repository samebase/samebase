# Convex Backend Contract Testing Spec

## Document Control

- Status: Accepted
- Owner: Samebase backend/runtime
- Last updated: 2026-08-04
- Related files:
  - `vite.config.ts`
  - `package.json`
  - `apps/samebase/convex/test.setup.ts`
  - `apps/samebase/convex/**/*.convex.test.ts`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`

## Summary

Samebase has strong Playwright and helper-level coverage, but backend behavior also needs tests that
exercise registered Convex functions against database state. These tests protect route access,
authorization checks, validators, state transitions, and HTTP endpoints at the Convex API boundary.

The accepted approach is:

1. Keep existing `vite-plus` unit tests as the fast helper suite.
2. Add a dedicated Convex contract test lane that runs under Vitest's `edge-runtime` environment.
3. Use `convex-test` with the app schema, function module map, and installed component test helpers.
4. Add tests beside Convex modules using the suffix `.convex.test.ts`.

## Current Coverage

The existing backend-adjacent tests are valuable, but they mostly import pure helpers from
`apps/samebase/convex`. They do not currently call registered functions through `api` or `internal`,
do not use `t.withIdentity`, and do not call HTTP actions with `t.fetch`.

The current Convex surface contains:

- more than 120 public `query`, `mutation`, and `action` functions
- internal functions that own cross-function state transitions
- 18 app HTTP routes in `apps/samebase/convex/http.ts`
- installed Convex components for workflow behavior

Helper tests should remain, but new backend behavior that depends on Convex auth, schema validation,
function registration, component registration, database writes, scheduling, or HTTP routing should
get Convex contract coverage.

## Test Runtime

`vp test` remains the test command. Vite+ reads Vitest settings from the root `vite.config.ts`, so
this repo should not add a separate `vitest.config.ts` for Convex.

The root test config should define separate projects:

- `unit`: existing Node-based helper, React, script, and package tests.
- `convex`: `apps/samebase/convex/**/*.convex.test.ts` under `edge-runtime`.

`convex-test` and `@edge-runtime/vm` are direct root and `noter` package dev dependencies so CI,
local worktrees, the root test runner, and app-local test imports do not depend on transitive
optional peer resolution.

## Convex Test Helper

`apps/samebase/convex/test.setup.ts` owns the Convex test harness:

- import `convexTest` from `convex-test`
- pass `apps/samebase/convex/schema.ts`
- pass a filtered `import.meta.glob` module map for Convex source files
- register `@convex-dev/workflow` with component name `workflow`

Each test should call the helper at the start of the test so state is isolated. Use `t.run` to seed
database rows, `t.withIdentity` to model authenticated users, `t.query`/`t.mutation`/`t.action` for
registered functions, and `t.fetch` for HTTP actions.

## Coverage Priorities

Cover both personal and organization-owned public surfaces. Personal areas must prove that one user
cannot read or change another user's rows. Organization areas must prove that two members can use
the same rows and that a user from another organization cannot use them:

- users: viewer, approval, provider connection status, disconnect mutations
- vaults: organization membership, listing, branch filter state, branch/tree visibility
- file staging: same-organization access, different-organization denial, create/update/delete rows,
  branch summaries
- MCP/OAuth HTTP: metadata, registration, user and organization grant binding, token, MCP request
  status
- billing/webhooks: organization billing ownership, method/status validation, and signed-event state
  changes

Action tests may stub global `fetch` when testing provider calls. Tests against a real local Convex
backend are reserved for smoke coverage where mock limitations matter, such as limits, hosted
configuration, or full client/backend interaction.

## Rules

- Keep `.convex.test.ts` files focused on Convex function contracts.
- Keep pure helper tests in normal `.test.ts` files.
- Always seed only the rows needed for the behavior under test.
- Prefer `t.withIdentity` over accepting user IDs as test-only function args.
- For personal user-owned data, include cross-user denial coverage. For organization-owned data,
  include same-organization access and different-organization denial coverage.
- Assert persisted state after mutations and actions.
- Use `t.fetch` for HTTP route coverage instead of calling handlers directly.
- Do not add production-only test helpers just to seed data.
- Do not use the real local backend for the default fast backend test lane.
