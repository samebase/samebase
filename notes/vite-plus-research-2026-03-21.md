# Vite+ research

Date: 2026-03-21

## Goal

Capture the current state of Vite+ and whether it is relevant to Noter's
monorepo versus multi-repo thinking.

## Executive summary

Vite+ is real and very new.

The most important date distinction is:

- 2025-10-13: original public announcement described Vite+ as
  source-available/commercial
- 2026-03-13: current alpha announcement flipped Vite+ to MIT/open source

As of 2026-03-21, the npm package state observed was:

- `vite-plus` latest: `0.1.12`
- `vite-plus` alpha dist-tag: `0.1.13-alpha.1`

The product is not just "Vite rebranded". The real surface is the unified `vp`
CLI, which aims to cover:

- environment/runtime management
- dependency installation
- project creation
- linting/formatting/checks
- build/test/dev
- workspace task running

That said, it is still alpha, and some flows are wrappers around existing tools
plus Vite+ config and conventions.

## Official sources used

- https://voidzero.dev/posts/announcing-vite-plus-alpha
- https://voidzero.dev/posts/announcing-vite-plus
- https://viteplus.dev/
- https://viteplus.dev/guide/create
- https://viteplus.dev/guide/run

## Local validation performed

Everything below was tested in isolated scratch paths under `~/dev/forks/`, not
inside the current Noter repo.

Scratch root used:

- `/Users/nicu/dev/forks/vite-plus-smoke-20260318`

The global-style installer was also isolated by using a fake home:

- `/Users/nicu/dev/forks/vite-plus-smoke-20260318/home`

This avoided modifying the normal user shell config.

## What was tested

### 1. Installer and CLI

Observed:

- the install script from `https://vite.plus`
- isolated install succeeded
- `vp --version` reported `vp v0.1.12`

### 2. Application scaffold

Path created:

- `/Users/nicu/dev/forks/vite-plus-smoke-20260318/app`

Command used:

- `vp create vite:application --directory app --no-interactive --verbose`

Confirmed behavior:

- Vite+ bootstrapped its own `pnpm` version first
- the scaffold delegated initial app creation to `create-vite`
- afterward Vite+ rewrote the generated app with its own config and deps

Important generated shape:

- `package.json` scripts use `vp dev`, `vp build`, and `vp preview`
- the app depends on `vite-plus`
- `vite` is overridden to `npm:@voidzero-dev/vite-plus-core@latest`
- `vite.config.ts` imports `defineConfig` from `vite-plus`
- staged git hooks run `vp check --fix`

Validation run:

- `vp check` passed
- `vp build` passed
- `vp dev --host 127.0.0.1 --port 4173` served correctly

### 3. Monorepo scaffold

Path created:

- `/Users/nicu/dev/forks/vite-plus-smoke-20260318/monorepo`

Command used:

- `vp create vite:monorepo --directory monorepo --no-interactive --verbose`

Confirmed behavior:

- initialized a git repo
- created `apps/website`
- created `packages/utils`
- added a root `vite.config.ts`
- added root scripts that call `vp`

Interesting root scripts:

- `dev`: `vp run website#dev`
- `ready`: `vp fmt && vp lint && vp run test -r && vp run build -r`

### 4. Workspace task running and caching

Command used:

- `vp run build -r`

Observed:

- recursive task execution across workspace packages worked
- cache was disabled for those package.json-driven tasks by default in the
  generated scaffold
- the summary showed `0/3 cache hit`

Then tested:

- `vp run --cache build -r`

Observed:

- first run populated cache entries and still reported `0/3 cache hit`
- running `vp run --cache build -r` a second time replayed cached results
- summary showed `3/3 cache hit`

Practical takeaway:

- Vite+ workspace task running is real
- caching is real
- caching is not automatic for all plain package.json scripts by default

This matches the current docs more than the broad marketing summary.

## Why this matters for Noter

### 1. It makes monorepo tooling less painful

If the main complaint about monorepos is the operational/tooling burden, Vite+
does improve that story by unifying more of the workflow under one CLI.

### 2. It does not answer the product-UX question

Vite+ does not change the underlying product argument about whether Noter should
feel dashboard-first and repo-scoped.

It can improve implementation ergonomics for a monorepo, but it does not
invalidate the case for a multi-vault dashboard-first user experience.

### 3. It is still early

This is alpha software.

That suggests:

- okay to prototype with
- okay to monitor closely
- too early to make deep repo-wide strategic commitments around it

## Recommendation

Short version:

- treat Vite+ as a serious emerging toolchain
- do not bet core Noter architecture on it yet
- consider it as a future tooling candidate or isolated prototype path

More specifically:

1. Keep watching Vite+ because it meaningfully improves monorepo ergonomics.
2. Do not let Vite+ alone drive the monorepo versus multi-repo decision.
3. If Noter wants to experiment, do it in a greenfield side project or starter
   template spike first.
4. Re-evaluate once Vite+ is further out of alpha and the task/config story is
   more settled.
