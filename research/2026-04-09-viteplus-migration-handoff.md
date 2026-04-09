# VitePlus Migration Handoff

## Purpose

This note captures the practical issues from the 2026-04-08 Vite+ migration
trial so a future migration thread can restart from current `main` without
repeating the same churn.

For the full chronological log, see
`rfcs/084_VITEPLUS_MONOREPO_MIGRATION_TRIAL_SPEC.md`.

## What went wrong

### 1. Formatter drift made the diff much noisier than the real migration

- Vite+ formatting defaults did not match Noter's existing repo style.
- The first passes introduced large quote and semicolon churn that obscured the
  actual tooling migration.
- A later repo-wide format pass made rebases and review much harder without
  adding migration value.

Recommendation:

- Start the next attempt by locking Vite+ formatting to the repo's current
  style before any broad `vp fmt` or staged hook runs.
- Treat formatter-only edits as a failure mode, not progress.
- Do not land a repo-wide format commit as part of the migration.

### 2. The migration touched more files than expected because Vite+ affects more than root scripts

- `vp migrate` changed root formatting, test imports, hooks, and package
  scripts, not just Turborepo orchestration.
- The repo also had manual Prettier usage in generated-file flows, checked-in
  Husky files, and standalone Vitest config outside the obvious root files.
- New tests added on `main` after the initial migration still imported
  `vitest`, so a later rebase needed one more cleanup pass.

Recommendation:

- Audit all formatter, test-runner, and git-hook entrypoints up front.
- Expect the migration surface to include:
  - root and starter-template formatter config
  - checked-in hook files
  - programmatic formatting helpers
  - direct `vitest` imports in tests added after the first pass
  - any generated starter or manifest output

### 3. Some repo-specific scripts broke even after `vp migrate` succeeded

- `vp migrate` required a manual Vite 8 / Vitest 4 upgrade before it would run.
- `vp run` did not preserve Turbo-era shell assumptions like `cd ../.. && ...`
  inside lint scripts.
- `apps/noter/scripts/run-vite-dev.js` assumed the old `vite` binary layout and
  had to be changed to launch `vp`.
- The root `vite.config.ts` needed ESM-safe path handling because `__dirname`
  broke under the new config shape.

Recommendation:

- Validate repo wrappers immediately after `vp migrate`, before cleaning up
  secondary tooling.
- Pay special attention to:
  - `scripts/run-primary-dev.js`
  - `apps/noter/scripts/run-vite-dev.js`
  - lint commands that rely on `cd`
  - tests that assert build-tool config shape

### 4. Nested `vp config` usage broke git hooks in the monorepo

- Adding `prepare: "vp config"` inside the starter template looked reasonable,
  but it rewired the repo root `core.hooksPath` to the nested package.
- The correct local fix was to keep checked-in `.vite-hooks/pre-commit` files
  and avoid running `vp config` from nested packages.

Recommendation:

- Only let the repo root own hook installation.
- Do not add nested `prepare: "vp config"` scripts in packages inside this
  monorepo.

### 5. Rebasing the old migration history was the wrong strategy once `main` moved

- After `main` moved to the TanStack Router baseline, replaying the old Vite+
  branch history caused huge conflicts.
- The worst conflict source was the formatter/history stack, not the real
  migration logic.
- The cleaner approach was to apply the branch's net diff onto current `main`
  and resolve the few real conflicts there.

Recommendation:

- Do not revive or rebase the original Vite+ commit stack again.
- Start a fresh branch from current `main`.
- If a later rebase is needed, prefer:
  - reapplying the net diff onto `main`, or
  - cherry-picking only the meaningful migration commits
- Avoid replaying formatter-heavy or cleanup-history commits.

## Known technical blockers and caveats

- `vp migrate` currently wants Vite 8+ and Vitest 4+ before it will complete.
- ESLint is still on the legacy config path, so a full Oxlint / flat-config
  migration is separate work.
- `pnpm` still warns about `vite` peer expectations when aliased to
  `@voidzero-dev/vite-plus-core`.

## Suggested order for the next migration attempt

1. Start from the latest `main` with the TanStack Router baseline already in
   place.
2. Lock formatter behavior to Noter's current quote and semicolon style before
   broad formatting runs.
3. Upgrade to the minimum Vite / Vitest versions Vite+ requires.
4. Run `vp migrate`.
5. Fix repo-specific wrappers and test expectations.
6. Remove leftover Prettier / Husky / standalone Vitest config only after the
   main flows are green.
7. Regenerate starter-template outputs last.
8. Keep the diff focused on real migration behavior, not repo-wide formatting.

## Minimum acceptance bar for the next attempt

- `make anon`
- `pnpm test`
- `pnpm build`
- `pnpm lint`
- `pnpm build:starter`
- `pnpm lint:starter`
- diff review confirms there is no quote-only or semicolon-only churn outside
  files that truly need formatting changes
