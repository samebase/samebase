# 084 ESLint To Oxlint Migration Spec

## Document Control

- Status: Accepted
- Owner: Noter linting/tooling
- Last updated: 2026-05-01
- Depends on:
  - `vite.config.ts`
  - `package.json`
  - `tsconfig.scripts.json`
  - `apps/noter/package.json`
  - `apps/noter/tsconfig.json`
  - `apps/noter/convex/jsonUtils.ts`
  - `apps/noter/convex/jsonUtils.test.ts`
  - `apps/noter/lintConfig.test.ts`

## Summary

Noter should standardize on Oxlint as the repo's linter while keeping the
configuration colocated with the wider Vite+ workflow surface.

This migration is accepted as a simplification pass, not a 100%-compatibility
exercise.

The accepted target is:

- Oxlint becomes the primary lint runner for repo JavaScript and TypeScript
  surfaces.
- The former local `use-query-param-helpers` plugin is retired; app route search
  params should use TanStack Router search schemas and link/navigate APIs
  instead of a generic query-param helper layer.
- Convex-specific lint rules stay enforced.
- Type-aware lint coverage that depends on TypeScript semantic analysis stays as
  close as possible to current behavior without preserving deprecated tsconfig
  behavior.
- Real migration blockers, simplifications, and accepted behavior changes are
  recorded here as the source of truth instead of being left in chat.

This document should be updated during the migration whenever a new rule gap,
tooling incompatibility, or rollout decision appears.

## Goals

1. Make Oxlint the primary lint entrypoint for Noter.
2. Retire the repo-local query-param helper rule once route-owned search params
   move to TanStack Router search schemas.
3. Preserve Convex-specific lint coverage.
4. Keep TypeScript-aware lint coverage for the current high-signal rules inside
   the Oxlint config.
5. Remove repo lint entrypoints that still depend on the ESLint CLI when Oxlint
   can carry the accepted contract directly.
6. Keep a running migration log with concrete issues, attempted fixes, and
   outcomes.

## Non-Goals

1. Preserving deprecated `tsconfig` behavior just to satisfy legacy lint wiring.
2. Chasing every last old ESLint warning before the repo can standardize.
3. Rewriting the app tsconfig structure beyond what the TypeScript 6 guidance
   already recommends.
4. Reworking unrelated router or app-runtime behavior as part of the lint
   migration.

## Current State

- The root `vite.config.ts` `lint` block is the repo's active lint contract.
- The config enables Oxlint type-aware mode and carries the repo's explicit
  semantic rule choices directly.
- The former `eslint-plugin-noter-local` workspace plugin has been removed.
- `URLSearchParams` is globally warned by `no-restricted-globals` so app search
  defaults to TanStack Router search-schema contracts. Intentional protocol
  boundaries stay visible in lint output instead of being hidden behind file
  globs.
- The repo loads `@convex-dev/eslint-plugin` and `eslint-plugin-react-refresh`
  through Oxlint's JS-plugin bridge.
- Convex-specific rules such as `@convex-dev/no-old-registered-function-syntax`
  and `@convex-dev/no-args-without-validator` inside `**/convex/**/*.ts`.
- The app/frontend lint entrypoints in `apps/noter/package.json` now run Oxlint
  directly.
- Root `package.json` also runs Oxlint for `runtime/**/*.ts`, `scripts/**/*.ts`,
  and `apps/noter/scripts/**/*.ts` using `tsconfig.scripts.json`.
- `baseUrl` has been removed from the app tsconfigs so the repo aligns with the
  TypeScript 6 and TypeScript 7 direction instead of preserving deprecated
  lookup-root behavior.
- The app package keeps the old intended TypeScript-focused lint surface instead
  of silently expanding into unrelated top-level JavaScript files just because
  Oxlint traverses more files by default than the previous `eslint --ext ts,tsx`
  command did.

## Accepted Migration Contract

### 1. Oxlint is the primary linter

The repo should keep one root Oxlint config inside `vite.config.ts` and move
primary lint scripts onto Oxlint where that can be done without dropping
accepted protections.

### 2. The custom query-param rule is retired

The old rule in `eslint-rules/use-query-param-helpers.ts` was temporary
scaffolding around `apps/noter/src/lib/queryParams.ts`.

Current app-route URL behavior should be expressed through:

- route-local `validateSearch` schemas
- `Link`, route `useNavigate`, or `router.buildLocation`
- small route-specific search builders when code needs typed search objects
  outside component render
- native `URL`/`URLSearchParams` for external URLs or internal API request paths
  that are not app routes

Do not add a replacement generic query-param lint rule unless a new accepted
spec defines a concrete invariant that TanStack Router cannot express.

The accepted invariant is: app search code should not parse the visible URL
string directly by default. Use route `validateSearch`, `Route.useSearch`,
`Link`/navigate search callbacks, `router.buildLocation`, or route-specific
search builders instead. Native `URL`/`URLSearchParams` remains appropriate for
external URLs, internal API request paths, fixtures, tests, and the small
parser/serializer boundaries that intentionally bridge browser strings into
typed route search. The current lint posture is warning-only while the repo
burns down existing native callsites.

### 3. Type-aware coverage stays explicit

These current rules depend on TypeScript semantic analysis and should be treated
as accepted coverage:

- `@typescript-eslint/no-unsafe-argument`
- `@typescript-eslint/no-unsafe-assignment`
- `@typescript-eslint/no-unsafe-call`
- `@typescript-eslint/no-unsafe-member-access`
- `@typescript-eslint/no-unsafe-return`
- `@typescript-eslint/no-unnecessary-condition`

These should live in the root `vite.config.ts` `lint` block directly rather than
through a parallel ESLint fallback.

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

### 2026-05-01

- Problem: the local query-param rule now points contributors toward a helper
  layer that predates the app's TanStack Router search schemas. Tried: converted
  current app-route search callsites to typed route search objects and left
  non-route URLs on native `URL`/`URLSearchParams`. Result: the `eslint-rules`
  workspace package and `apps/noter/src/lib/queryParams.ts` helper are retired
  instead of being preserved as a second URL abstraction.

### 2026-04-10

- Problem: the repo relies on one local ESLint plugin, so a naive Oxlint switch
  would silently drop repo-specific behavior. Tried: inspected the previous
  ESLint config, `eslint-rules/index.ts`, and
  `eslint-rules/use-query-param-helpers.ts`, then verified Oxlint JS-plugin
  loading against the local rule implementation. Result: Oxlint can execute the
  local rule through `jsPlugins`, so the custom rule is not a reason to stay on
  full ESLint.

- Problem: the migration needs to preserve the meaning of the custom rule, not
  just its filename. Tried: traced the rule logic directly. Result: the rule
  protects two invariants:
  1. do not mutate likely `URLSearchParams` instances directly in app code
  2. do not hardcode root query URLs such as `/?foo=bar`; use
     `apps/noter/src/lib/queryParams.ts` helpers instead

- Problem: the repo previously depended on TypeScript-aware ESLint coverage.
  Tried: inventoried the old ESLint config and separated the explicit semantic
  rules from syntax-only rules. Result: `no-unnecessary-condition`,
  `no-floating-promises`, `restrict-template-expressions`, and the related
  semantic rules are the main accepted type-aware checks to keep during the
  migration.

- Problem: Oxlint type-aware mode is not available by default. Tried: ran
  `oxlint --type-aware` directly. Result: Oxlint currently requires the separate
  `oxlint-tsgolint` package for type-aware runs.

- Problem: the app/frontend TypeScript config did not initially initialize
  Oxlint type-aware mode. Tried: ran Oxlint type-aware against
  `apps/noter/tsconfig.json`, then checked the current TypeScript guidance on
  `baseUrl`. Result: TypeScript 6 now deprecates `baseUrl`, Oxlint's type-aware
  backend rejects it, and the repo's `@/*` alias still works through explicit
  `paths`, so removing `baseUrl` is accepted simplification rather than unsafe
  drift.

- Problem: not all repo surfaces were blocked equally. Tried: ran Oxlint
  type-aware against `tsconfig.scripts.json`. Result: type-aware mode already
  worked for the repo's `scripts/**/*.ts`, `runtime/**/*.ts`, and
  `apps/noter/scripts/**/*.ts` surface, so the script pass could move first
  while the app tsconfig cleanup was in flight.

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
  ESLint plugin accepts, so the built-in rule is not accepted as a drop-in
  replacement.

- Problem: Oxlint surfaced duplicate unused-catch diagnostics in Convex code
  even after the repo configured `@typescript-eslint/no-unused-vars` with
  underscore ignores. Tried: disabled the core rule in `.oxlintrc.json` and
  reran linting. Result: unused catch bindings still needed code cleanup, so the
  first pass accepts a few direct `catch {}` / binding cleanup edits instead of
  relying on config-only suppression.

- Problem: script linting switched to Oxlint type-aware mode cleanly, but that
  also surfaced stale disable comments. Tried: ran `pnpm lint:scripts` after the
  migration. Result: the scripts pass succeeds, but Oxlint now reports unused
  `eslint-disable` comments in `scripts/convex-seed-dev-auth.ts`; those are
  accepted as warning-only cleanup for a later pass.

- Problem: removing the app-specific ESLint fallback would still drop the exact
  `react-refresh/only-export-components` behavior if the repo stayed on Oxlint's
  built-in React rule. Tried: moved `eslint-plugin-react-refresh` to the repo
  root and loaded it through Oxlint's `jsPlugins`. Result: Oxlint can preserve
  the repo's existing `allowConstantExport` behavior without keeping ESLint in
  the lint scripts.

- Problem: Oxlint and ESLint do not lint exactly the same default file surface.
  Earlier starter-template-specific hidden-folder handling is obsolete because
  the monorepo-local starter app was removed in favor of exporting
  `notermd/app`.

- Problem: standardization mattered more than perfect historical parity for this
  migration. Tried: removed `baseUrl` from app tsconfigs, moved app scripts onto
  Oxlint-only flows, and deleted the repo's `.eslintrc` files. Result: the repo
  now has one linter entrypoint, one root config, and one place to maintain
  type-aware rule coverage.

- Problem: removing `baseUrl` exposed a real dependency on it in app imports.
  Tried: ran `pnpm --filter noter lint:ci` after the tsconfig cleanup. Result: a
  handful of `convex/schema` imports were relying on app-root lookup-root
  behavior, so the accepted simplification replaces them with explicit relative
  imports instead of adding another broad `paths` alias that could shadow the
  real Convex package subpaths.

- Problem: Oxlint traverses a broader default file surface than the previous app
  lint command. Tried: ran Oxlint directly against `apps/noter`. Result: the
  command started linting top-level TypeScript helpers and `public/noter.ts`
  that the old `eslint --ext ts,tsx` script never covered, so the accepted
  migration keeps those files outside the app package lint scope for now rather
  than treating this standardization pass as a surprise lint expansion.

- Problem: the integrated migration needed a clear acceptance bar. Tried: ran
  focused config tests plus the repo lint entrypoints. Result:
  `pnpm exec vp test run apps/noter/lintConfig.test.ts`, `pnpm lint:scripts`,
  and `pnpm lint` now pass. Remaining output is warning-only, led by existing
  `consistent-type-assertions` warnings that were already accepted as warning
  severity in the old ESLint contract.

- Problem: even after the lint flow switched, repo-facing docs and templates
  still mentioned ESLint in a few current surfaces. Tried: audited repo-wide
  `eslint` references and separated historical migration notes from active docs,
  devcontainers, tool allowlists, and starter-template exports. Result: the
  accepted cleanup updates current-facing docs and template surfaces while
  leaving historical spec and research references intact.

- Problem: the first Oxlint-only pass had reintroduced a broad app-wide
  `@typescript-eslint/no-explicit-any` override. Tried: removed the override,
  then fixed the remaining handwritten `any` usage in
  `apps/noter/src/lib/convexQueryCache.ts`,
  `apps/noter/convex/gitOperationsActions.ts`, `apps/noter/convex/schema.ts`,
  and `apps/noter/src/lib/convexUtils.tsx`. Result: `no-explicit-any` is
  enforced again for handwritten app code; remaining `any` references are
  limited to generated Convex bindings and TanStack's generated route tree.

- Problem: review surfaced a server-side safety regression outside the lint
  config itself. Tried: removed `JSON.stringify(error)` fallback behavior from
  `apps/noter/convex/jsonUtils.ts`, limited `toErrorMessage()` to `Error`
  instances, primitives, and a small allowlist of plain-object message keys, and
  added `apps/noter/convex/jsonUtils.test.ts` coverage. Result: the Oxlint
  migration no longer broadens arbitrary thrown-object logging in Convex code,
  so the accepted simplification still respects the repo's no-sensitive-logs
  guardrail.
