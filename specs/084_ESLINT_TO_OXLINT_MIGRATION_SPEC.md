# 084 ESLint To Oxlint Migration Spec

## Document Control

- Status: Accepted
- Owner: Noter linting/tooling
- Last updated: 2026-04-10
- Depends on:
  - `.eslintrc.type-aware.cjs`
  - `.eslintrc.cjs`
  - `.oxlintrc.json`
  - `package.json`
  - `tsconfig.scripts.json`
  - `apps/noter/package.json`
  - `apps/noter/tsconfig.json`
  - `apps/noter/eslintConfig.test.ts`
  - `apps/noter-starter-template/package.json`
  - `eslint-rules/index.js`
  - `eslint-rules/use-query-param-helpers.js`

## Summary

Noter should migrate from ESLint-first linting to Oxlint-first linting before
the repo takes on a Vite-plus migration.

This migration is accepted as a phased rollout, not a flag day.

The first accepted target is:

- Oxlint becomes the primary lint runner for repo JavaScript and TypeScript
  surfaces that it can cover today.
- The local `use-query-param-helpers` rule stays enforced.
- Convex-specific lint rules stay enforced.
- Type-aware lint coverage that depends on TypeScript semantic analysis stays as
  close as possible to current behavior.
- Real migration blockers and partial workarounds are recorded here as the
  source of truth instead of being left in chat.

This document should be updated during the migration whenever a new rule gap,
tooling incompatibility, or rollout decision appears.

## Goals

1. Make Oxlint the primary lint entrypoint for Noter.
2. Preserve the repo-local query-param helper rule.
3. Preserve Convex-specific lint coverage.
4. Keep TypeScript-aware lint coverage for the current high-signal rules, even
   if a temporary fallback is required.
5. Reduce the amount of ESLint-only configuration over time instead of carrying
   two full lint stacks indefinitely.
6. Keep a running migration log with concrete issues, attempted fixes, and
   outcomes.

## Non-Goals

1. Forcing the repo onto Oxlint type-aware mode everywhere in one patch.
2. Deleting ESLint immediately if it still covers accepted gaps.
3. Rewriting the app tsconfig structure just to satisfy a linter backend.
4. Expanding scope into formatter, router, or Vite-plus work in this spec.

## Current State

- `.eslintrc.cjs` is the repo's active lint contract.
- The config uses `plugin:@typescript-eslint/recommended-type-checked`, so the
  current lint behavior is not syntax-only.
- The repo adds one local plugin, `eslint-plugin-noter-local`, whose
  `use-query-param-helpers` rule prevents direct mutation of URL query params
  and hardcoded root query strings outside the helper layer in
  `apps/noter/src/lib/queryParams.ts`.
- The repo also depends on `plugin:@convex-dev/recommended`, which currently
  enforces Convex-specific rules such as
  `@convex-dev/no-old-registered-function-syntax` and
  `@convex-dev/no-args-without-validator` inside `**/convex/**/*.ts`.
- The app/frontend lint entrypoints live in `apps/noter/package.json` and
  `apps/noter-starter-template/package.json`.
- Root `package.json` also runs an ESLint pass for `runtime/**/*.js` and
  `scripts/**/*.js` using `tsconfig.scripts.json`.
- The first migration slice moves `apps/noter` and repo-root script linting to
  Oxlint-first flows, while `apps/noter-starter-template` remains on the old
  ESLint path for now so this branch does not also take on starter-manifest
  regeneration churn.

## Accepted Migration Contract

### 1. Oxlint is the primary linter

The repo should add an Oxlint config and move primary lint scripts onto Oxlint
where that can be done without dropping accepted protections.

### 2. The custom query-param rule must survive

The rule in `eslint-rules/use-query-param-helpers.js` is accepted behavior, not
optional cleanup.

Its current contract is:

- reject direct mutation calls on likely query-param objects: `append`,
  `delete`, `set`
- reject hardcoded root query strings such as `/?...` and `?...`
- allow tagged CSS template literals to avoid false positives in styles
- apply to `apps/noter/src/**/*.{ts,tsx}` except the helper module, one dev-mode
  utility, and tests

The migration must keep an equivalent rule enabled.

### 3. Type-aware coverage stays explicit

These current rules depend on TypeScript semantic analysis and should be treated
as accepted coverage:

- `@typescript-eslint/no-unsafe-argument`
- `@typescript-eslint/no-unsafe-assignment`
- `@typescript-eslint/no-unsafe-call`
- `@typescript-eslint/no-unsafe-member-access`
- `@typescript-eslint/no-unsafe-return`
- `@typescript-eslint/no-unnecessary-condition`

If Oxlint cannot yet run these reliably for a repo surface, the migration may
keep a narrow ESLint fallback for those rules only.

### 4. Syntax-level rules should move first

Rules that Oxlint can cover without the repo's current type-aware blockers
should move first. That includes the current migration candidates such as:

- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/ban-ts-comment`
- `@typescript-eslint/consistent-type-assertions`
- `@typescript-eslint/no-unused-vars`
- `react-hooks/exhaustive-deps`
- `react-refresh/only-export-components`

### 5. Real blockers belong in this spec

When a rule cannot move cleanly, this document must record:

- the exact blocker
- what was tried
- the result
- the accepted temporary behavior

## Working Log

### 2026-04-10

- Problem: the repo relies on one local ESLint plugin, so a naive Oxlint switch
  would silently drop repo-specific behavior. Tried: inspected `.eslintrc.cjs`,
  `eslint-rules/index.js`, and `eslint-rules/use-query-param-helpers.js`, then
  verified Oxlint JS-plugin loading against the local rule implementation.
  Result: Oxlint can execute the local rule through `jsPlugins`, so the custom
  rule is not a reason to stay on full ESLint.

- Problem: the migration needs to preserve the meaning of the custom rule, not
  just its filename. Tried: traced the rule logic directly. Result: the rule
  protects two invariants:
  1. do not mutate likely `URLSearchParams` instances directly in app code
  2. do not hardcode root query URLs such as `/?foo=bar`; use
     `apps/noter/src/lib/queryParams.ts` helpers instead

- Problem: the repo currently depends on TypeScript-aware ESLint coverage.
  Tried: inventoried `.eslintrc.cjs` and separated the explicit semantic rules
  from syntax-only rules. Result: `no-unsafe-*` and `no-unnecessary-condition`
  are the main accepted semantic rules that need a deliberate migration path.

- Problem: Oxlint type-aware mode is not available by default. Tried: ran
  `oxlint --type-aware` directly. Result: Oxlint currently requires the separate
  `oxlint-tsgolint` package for type-aware runs.

- Problem: the app/frontend TypeScript config does not currently initialize
  Oxlint type-aware mode. Tried: ran Oxlint type-aware against
  `apps/noter/tsconfig.json`. Result: the run fails on the app tsconfig because
  the backend rejects `baseUrl` and recommends removing it, which is not a safe
  migration step for this repo while the app still uses `@/*` path aliases.

- Problem: not all repo surfaces are blocked equally. Tried: ran Oxlint
  type-aware against `tsconfig.scripts.json`. Result: type-aware mode does run
  for the repo's `scripts/**/*.js` and `runtime/**/*.js` surface, so script
  linting can migrate more aggressively than the frontend app surface.

- Problem: the migration also depends on Convex-specific rules. Tried: inspected
  `@convex-dev/eslint-plugin` and verified that Oxlint can load JS plugins by
  rule id when configured from the repo root. Result: Convex lint coverage looks
  compatible with an Oxlint JS-plugin bridge, so the accepted first pass should
  attempt that before keeping a broader ESLint fallback.

- Problem: Oxlint's built-in React plugin does not use the same namespace shape
  as `eslint-plugin-react-refresh` in config files. Tried: wired
  `react-refresh/only-export-components` directly into `.oxlintrc.json`. Result:
  Oxlint rejects that namespace during config parsing. The built-in rule lives
  under `react/only-export-components`, not `react-refresh/...`.

- Problem: even after the namespace fix, Oxlint's built-in export-components
  rule does not behave like the repo's current `allowConstantExport` setup.
  Tried: enabled `react/only-export-components` in Oxlint and ran app linting.
  Result: Oxlint started flagging existing constant exports that the current
  ESLint plugin accepts, so the accepted first pass keeps
  `only-export-components` on the ESLint fallback instead of forcing unrelated
  component-file churn.

- Problem: Oxlint surfaced duplicate unused-catch diagnostics in Convex code
  even after the repo configured `@typescript-eslint/no-unused-vars` with
  underscore ignores. Tried: disabled the core rule in `.oxlintrc.json` and
  reran linting. Result: unused catch bindings still needed code cleanup, so the
  first pass accepts a few direct `catch {}` / binding cleanup edits instead of
  relying on config-only suppression.

- Problem: script linting switched to Oxlint type-aware mode cleanly, but that
  also surfaced stale disable comments. Tried: ran `pnpm lint:scripts` after the
  migration. Result: the scripts pass succeeds, but Oxlint now reports unused
  `eslint-disable` comments in `scripts/convex-seed-dev-auth.js`; those are
  accepted as warning-only cleanup for a later pass.

- Problem: the integrated migration needed a clear acceptance bar. Tried: ran
  focused config tests plus the repo lint entrypoints. Result:
  `pnpm exec vitest run apps/noter/eslintConfig.test.ts`, `pnpm lint:scripts`,
  and `pnpm lint` now pass. Remaining output is warning-only, led by existing
  `consistent-type-assertions` warnings that were already accepted as warning
  severity in the old ESLint contract.
