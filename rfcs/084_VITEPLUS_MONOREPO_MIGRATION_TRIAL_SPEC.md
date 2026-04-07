# 084 VitePlus Monorepo Migration Trial Spec

## Document Control

- Status: In progress in this branch
- Owner: Noter build and developer workflow
- Last updated: 2026-04-08
- Depends on:
  - `package.json`
  - `turbo.json`
  - `scripts/run-primary-dev.js`
  - `scripts/run-primary-dev.test.js`
  - `apps/noter/convex/daytona/localBootstrap.test.ts`
  - `README.md`

## Summary

This branch is a live trial of replacing Turborepo-root orchestration with Vite+
in the Noter monorepo.

The goal is not to guess the final architecture up front. The goal is to keep a
running log of:

- what Turborepo assumptions currently exist
- what `vp migrate` changes automatically
- what still needs manual adaptation in Noter-specific scripts and tests
- which blockers are repo-specific versus current Vite+ limitations

## Initial Plan

1. keep the existing package layout and `pnpm-workspace.yaml`
2. replace root Turbo task entrypoints with `vp run` equivalents
3. add any required root `vite.config.ts` task definitions only where package
   scripts are not enough
4. update tests, docs, and generated expectations that hard-code `turbo.json` or
   `turbo run`
5. verify `make anon-once`, lint, test, and build flows after each step

## Migration Log

### 2026-04-08

- Confirmed the worktree started detached and had to be moved onto a real branch
  before edits.
- Confirmed the repo currently relies on Turbo from:
  - root `package.json` scripts
  - `turbo.json`
  - `scripts/run-primary-dev.js`
  - Daytona bootstrap tests that assert `turbo.json` task env wiring
  - docs and container metadata
- Confirmed Vite+ is published as `vite-plus@0.1.16`, exposes the `vp` CLI, and
  documents `vp migrate --no-interactive` plus `vp run` as the Turbo
  replacement.
- Confirmed the repo is below the Vite+ migration guide's recommended floor for
  some tooling today:
  - root `vitest` is `^1.0.0`
  - `apps/noter` still uses `vite@^5.3.1`
  - `apps/noter-starter-template` uses `vite@^6.0.0`
- Ran `pnpm --package=vite-plus@0.1.16 dlx vp migrate --no-interactive`.
- First hard blocker:
  - Vite+ refuses to auto-migrate while `package.json` still declares
    `vitest@1.6.1`
  - exact failure: "Please upgrade vitest to version >=4.0.0 first"
- First soft blocker:
  - Vite+ detected legacy `.eslintrc.cjs` config and warned that automatic
    Oxlint migration requires ESLint v9 flat config first
- First unexpected side effect from the failed migration:
  - deleted `.nvmrc`
  - added `.node-version` with the same Node major version (`24`)
- Upgraded the repo to the minimum versions Vite+ asked for before retrying:
  - `vite` -> `^8.0.7`
  - `vitest` -> `^4.1.3`
  - `@vitejs/plugin-react` -> `^6.0.1`
- Second `vp migrate --no-interactive` pass succeeded after that upgrade and:
  - rewrote `119` imports from `vitest` to `vite-plus/test`
  - replaced Prettier config with a root `vite.config.ts` `fmt` block
  - replaced Husky hook wiring with `vp config` and `.vite-hooks/`
  - migrated app/package build commands from `vite` to `vp build`
- Manual follow-up was still required because the auto migration does not know
  about Noter's repo-specific wrappers.

### 2026-04-08 follow-up fixes

- Replaced the remaining root Turbo entrypoints in `package.json` with `vp run`
  filters and deleted `turbo.json`.
- Added a small root `vite.config.ts` `run.tasks["noter-dev"]` task so the
  `scripts/run-primary-dev.js` wrapper can target one Vite+ task while keeping
  the explicit env contract that Daytona tests care about.
- Updated `scripts/run-primary-dev.js` and its test to call `vp run noter-dev`
  instead of `turbo run dev --filter=noter`.
- Updated `apps/noter/convex/daytona/localBootstrap.test.ts` to inspect the root
  Vite+ task config instead of `turbo.json`.
- Restored `.nvmrc` after the migration while keeping the new `.node-version`
  file that Vite+ added.
- Pinned `pnpm-workspace.yaml` catalogs to `0.1.16` instead of the generated
  `latest` aliases so the migration stays reproducible.
- Added a safe `scripts/clean-workspace.js` replacement for the old root `clean`
  entrypoint because this repo did not have package-level `clean` scripts for a
  straight `vp run clean` replacement.
- Updated repo docs and devcontainer metadata to describe Vite+ instead of
  Turborepo.
- Regenerated `apps/noter/convex/starterSeedManifest.generated.ts` after the
  starter-template package/devcontainer changes.

### 2026-04-08 blockers found during verification

- `vp run` does not preserve shell-stateful `&& cd ... && command` patterns the
  same way Turbo did because Vite+ splits compound commands into separate task
  steps.
  - Noter impact: app lint scripts that depended on `cd ../..` started loading
    the wrong ESLint config path.
  - Fix used here: replace those scripts with one `pnpm --dir ../.. exec ...`
    command so the repo-root working directory is explicit without relying on
    shell state.
- `apps/noter/scripts/run-vite-dev.js` hard-coded the old `vite` binary layout.
  - Noter impact: `make anon` crashed because
    `require.resolve("vite/package.json")` no longer works after the Vite+ alias
    migration.
  - Fix used here: resolve `vite-plus/package.json` and launch `bin/vp dev`
    instead.
- One test needed a manual Vitest 4 typing update.
  - Noter impact: `vi.fn<Parameters<...>, ReturnType>()` no longer type-checks.
  - Fix used here: switch the typed mock to
    `vi.fn<(deltaX: number) => boolean>()`.
- The first attempt to add explicit Vite+ task caching config caused `vp run`
  task-graph parsing failures with `UserCacheConfig`.
  - Fix used here: keep the root `noter-dev` task definition minimal and rely on
    default Vite+ caching behavior for now.

### 2026-04-08 cleanup pass after initial migration

- Removed the remaining repo-local Prettier and Husky files instead of leaving
  them beside the Vite+ config:
  - deleted root `.prettierrc`
  - deleted root `.husky/pre-commit`
  - deleted starter-template `.prettierrc`
  - deleted starter-template `.husky/pre-commit`
- Removed root `husky`, `lint-staged`, `prettier`, and `vitest` package entries
  once the remaining direct Vitest imports were rewritten to `vite-plus/test`.
- Moved the root test configuration into `vite.config.ts` and deleted
  `vitest.config.ts`, matching the Vite+ guidance to keep test config in the
  main config file.
- Replaced the remaining programmatic Prettier usage in:
  - `apps/noter/vite.config.ts`
  - `scripts/render-daytona-runtime.js`
  - `apps/noter/convex/daytona/runtimeRender.test.ts` with a shared
    `scripts/vitePlusFormatting.js` helper that calls `vite-plus/fmt` with the
    repo's Vite+ formatting options.
- Updated devcontainer/editor defaults and the starter manifest so the branch
  now points at:
  - `VoidZero.vite-plus-extension-pack`
  - `oxc.oxc-vscode`
  - `oxc.fmt.configPath: "./vite.config.ts"` instead of Prettier's VS Code
    extension.
- Removed live repo references to Turbo-era local files where they were only
  migration leftovers:
  - root and app `.gitignore` / `.dockerignore`
  - root `README.md`
  - root `scripts/clean-workspace.js`
  - starter export filters
- Updated simple-view tests to reference `.vite-hooks/pre-commit` instead of the
  deleted `.husky/pre-commit` path.

### 2026-04-08 new issues found during cleanup

- The first root `vite.config.ts` migration still relied on `__dirname`.
  - Noter impact: `vp fmt` could not load the root config under ESM.
  - Fix used here: replace `__dirname` usage with
    `fileURLToPath(import.meta.url)`-derived paths in the root config.
- Giving the starter-template package a `prepare: "vp config"` script looked
  correct in isolation, but broke the monorepo install.
  - Noter impact: `vp install` rewired the repo's `core.hooksPath` to the nested
    starter-template `.vite-hooks/_` directory.
  - Fix used here: remove the starter-template `prepare` script, keep the
    checked-in `.vite-hooks/pre-commit` file, and reset the repo root
    `core.hooksPath` back to `.vite-hooks/_`.
- The starter-template export initially captured Vite+'s generated internal
  `.vite-hooks/_` helper directory.
  - Noter impact: the generated starter manifest still contained Vite+'s
    built-in Husky compatibility shim even after the repo-level Husky files were
    deleted.
  - Fix used here: exclude `.vite-hooks/_` from the starter export so only the
    checked-in hook file is shipped.

### 2026-04-08 residual risks

- The repo is still on legacy ESLint config. Vite+ added a `lint` block to the
  root config, but automatic Oxlint migration remains blocked until this repo
  adopts ESLint v9+ flat config or replaces the current lint path manually.
- `pnpm install` still prints peer warnings because the catalog aliases `vite`
  to `@voidzero-dev/vite-plus-core@0.1.16`, while packages such as
  `@vitejs/plugin-react` still declare a `vite@^8` peer. The install and build
  passed in this branch, but the warning remains unresolved.

### 2026-04-08 verification

- `make anon-once`
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm build:starter`
- `pnpm lint:starter`

All of the above completed successfully after the manual follow-up fixes. The
lint run still reports existing repo warnings, but no lint errors remained.
