# Noter Convex Overlay Draft

## Purpose

This overlay is for Convex work inside the Noter monorepo. It complements the generated Convex
guidelines and generic Convex skills; it is not a portable TypeScript skill and not a replacement
for Convex's generated guidance.

## Load First

- When touching Noter Convex code, read `apps/noter/convex/_generated/ai/guidelines.md` first.
- Then load the relevant generic Convex skill when the task matches it:
  - `convex-migration-helper` for breaking schema/data migrations
  - `convex-performance-audit` for latency, read amplification, subscription cost, or OCC issues
  - `convex-create-component` only when the feature genuinely needs a Convex component boundary
  - `convex-setup-auth` for auth provider or user-identity wiring
- This overlay overrides generic Convex quickstart/dev advice inside this repo: use Noter's
  context-aware `pnpm dev` worktree flow, not raw `npx convex dev`.

## Before Editing

- Read the generated Convex guidelines, then the accepted spec for the touched domain when one
  exists.
- Inspect the current module tree and callsites with `find` and `grep`; do not rely on stale docs or
  old import paths.
- Classify the work before changing code: schema migration, module move, contract test,
  provider-boundary work, HTTP route, scheduled function, auth flow, component boundary, or pure
  helper.
- Do not manually edit files under `apps/noter/convex/_generated/*`. Regenerate or typecheck them
  through the normal Noter workflow when code edits are allowed.

## Local And Production Commands

- In worktrees, use the Noter operator workflow: `pnpm dev --once` or `pnpm dev:worktree:once` once
  after checkout, then context-aware `pnpm dev` for the dev flow.
- If an experiment or review explicitly forbids provider-state bootstrap, run only local checks that
  do not need Convex/provider state, such as formatting, static type checks, or unit tests with
  mocked transports. Skip backend-dependent commands and record the reason.
- Fresh validation worktrees may need dependencies materialized from the lockfile before `pnpm exec`
  commands can run.
- Production reads from worktrees must derive `CONVEX_DEPLOYMENT` from the primary checkout and
  clear `CONVEX_DEPLOY_KEY` in the same command environment.
- If Convex CLI output says it is ignoring `--prod` because of `CONVEX_DEPLOY_KEY`, stop and rerun
  with `CONVEX_DEPLOY_KEY=` from the primary checkout.

## Noter Module And API Shape

- Keep `apps/noter/convex/schema.ts` as the app schema entrypoint.
- Organize modules by product responsibility. Do not preserve old Convex function references with
  root-level re-export shims or `index.ts` dumping grounds.
- For app-owned module moves, update current callsites directly instead of keeping compatibility
  wrappers.
- Prefer responsibility-scoped Convex paths such as `api.vault.dashboard.*`, `api.vault.records.*`,
  and `internal.vault.deletion.*`.
- Use Convex components only when the domain owns isolated tables or a true reusable boundary.
  Domains that reference Noter app tables, such as Vault and Codespaces, stay app-owned unless a
  current spec says otherwise.

## Validators And Types

- In Convex modules, define result validators before handlers, derive types via `Infer<typeof ...>`,
  and destructure Convex validator builders once when that keeps callsites clear.
- Reserve the leading `v` prefix for reusable Convex value validators from `convex/values`, such as
  `vProviderAuth`; name the inferred type without the prefix, such as `ProviderAuth`.
- Runtime validators from other systems use a system-specific prefix, such as
  `ajvPlatformProjectDetails`.
- Use the shared `notEmpty` predicate from `@noter-md/dependent` when filtering nullable arrays.

## Tests

- Use the existing Vite+ project setup. Do not add a separate `vitest.config.ts` for Convex tests,
  even when generated or generic Convex guidance suggests one; Noter owns test config in the root
  `vite.config.ts` and package manifests.
- Add `.convex.test.ts` coverage when behavior depends on Convex auth, schema validation, function
  registration, component registration, database writes, scheduling, or HTTP routing.
- Provider API client boundary tests can remain normal `.test.ts` files when they use mocked
  transport and do not need Convex function registration, database state, auth, HTTP routing, or
  scheduler behavior.
- New registered-function, HTTP, scheduling, and auth coverage belongs in `.convex.test.ts` unless
  intentionally maintaining an existing older test file. Do not copy old unsuffixed `.test.ts`
  Convex examples just because they happen to use the harness.
- Keep pure helper tests in normal `.test.ts` files.
- Use `makeConvexTest()` from `apps/noter/convex/test.setup.ts` as the single harness. Seed only
  needed rows, use `t.withIdentity` for authenticated users, call registered functions through
  `t.query`, `t.mutation`, `t.action`, and use `t.fetch` for HTTP routes.
- Do not recreate component registration in individual tests; the harness owns current component
  registration.
- User-owned public surfaces should include cross-user denial coverage.
- Do not add production-only test helpers only to seed data.

## Provider Boundaries

- Convex Management API and Cloudflare API boundaries use generated OpenAPI types, checked-in drift
  sentinels, standalone validators, literal method/path/params/body callsites, and focused boundary
  tests.
- Verify generated provider boundaries with `pnpm --dir apps/noter run verify:convex-management-api`
  and `pnpm --dir apps/noter run verify:cloudflare-api`.
- Do not hand-edit generated OpenAPI artifacts; regenerate from the source contract.
- Keep `/oauth/token` and other endpoints outside a generated provider contract as explicit small
  local schemas.
- Feature code should not parse provider records with fallback field readers once the endpoint is
  covered by the generated boundary.
- For provider-boundary comparisons, inspect weaker tests against the strongest local exemplar
  before recommending production refactors.
- Strong provider-boundary tests usually include type assertions such as `expectType`, negative
  compile-time cases for wrong methods or missing required params, request materialization checks,
  lossless identifier coverage when relevant, and fail-before-transport runtime validation.

## Research Notes

Derived from `AGENTS.md`, `apps/noter/AGENTS.md`, `apps/noter/convex/_generated/ai/guidelines.md`,
Convex task skills, `specs/095_CONVEX_BACKEND_CONTRACT_TESTING_SPEC.md`,
`specs/100_CONVEX_REPOSITORY_MODULE_LAYOUT_SPEC.md`, `specs/103_CONVEX_API_VALIDATION_SPEC.md`, and
`specs/104_CLOUDFLARE_MCP_API_VALIDATION_SPEC.md`.
