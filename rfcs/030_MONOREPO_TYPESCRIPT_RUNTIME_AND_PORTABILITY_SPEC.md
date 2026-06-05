# 030 Monorepo TypeScript Runtime and Portability Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-03-01
- Related:
  - `README.md`
  - `tsconfig.base.json`
  - `specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md`
  - `rfcs/026_PROVIDER_CONNECTIONS_SPEC.md`

## Summary

Define a low-friction TypeScript package strategy for this monorepo:

1. Internal workspace packages run as source TypeScript in Node (no build step in day-to-day
   development).
2. Portable packages (shared across runtimes or published externally) emit JavaScript + `.d.ts` as
   the compatibility contract.
3. Package setup is standardized behind shared tsconfig presets and package templates so adding a
   package does not require custom build wiring.

This keeps local development fast while preserving cross-runtime portability (Node + Cloudflare
Workers + other standards-based runtimes).

## Why This Spec Exists

Current package creation cost is too high because every package tends to grow its own build config.
That slows down monorepo expansion and encourages copy/paste config drift.

At the same time, runtime portability matters. Native Node TypeScript execution is useful for local
ergonomics, but it is not a universal runtime contract for all deployment targets.

## Research Findings

### Native Node TypeScript is now usable, but scoped

1. Modern Node can run `.ts` directly with built-in type stripping.
2. Built-in type stripping still rejects TypeScript files under `node_modules`
   (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`).
3. Runtime behavior does not read `tsconfig.json` for path alias or emit rules.
4. Relative imports must use explicit file extensions.
5. Non-erasable syntax (for example `enum`) requires additional transform mode, so erasable syntax
   is the safe default.

Implication: use Node-native TS for internal workspace development convenience, not as the only
long-term portability contract.

### Local verification snapshot (2026-03-01, Node v24.13.0)

1. Workspace package import from `./packages/*/src/index.ts` works without a build step.
2. A TypeScript dependency physically located under `node_modules` fails with
   `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
3. Running with `--preserve-symlinks` can turn a workspace package import into the same failing
   `node_modules` case.

### Cloudflare Workers is TypeScript-first but deploys JavaScript artifacts

1. Workers supports TypeScript authoring and typed APIs.
2. Wrangler bundles modules by default and resolves package exports.
3. Workers is web-standards first with optional Node compatibility flags.

Implication: portable libraries should ship ESM JavaScript + types and avoid hard Node-only
assumptions in core modules.

### Repository baselines reviewed

Reviewed repositories:

1. `https://github.com/nicu-chiciuc/ailegis` (private)
2. `https://github.com/robolex-app/robo-turbo` (private)
3. `https://github.com/robolex-app/public_ts` (public)

Patterns worth reusing:

1. Shared tsconfig package (`tsconfig/base*.json`) consumed via workspace.
2. NodeNext ESM base profile for package code.
3. Clear package-level `exports` + emitted declaration files for publishable packages.

Gap to improve for this repo:

1. Avoid forcing dist builds for every internal package during dev.
2. Keep build-required behavior only for portable/published packages.

## Goals

1. Add new package with minimal boilerplate and no ad-hoc build setup.
2. Support Node-first local development without mandatory transpile loops.
3. Preserve cross-runtime execution compatibility for shared code.
4. Keep strict typing and predictable ESM behavior across packages.

## Non-goals

1. Migrating Noter apps (`apps/noter*`) to a new runtime model immediately.
2. Requiring Bun or Deno as primary runtime.
3. Publishing all workspace packages.

## Locked Decisions

1. Package model is dual-mode:
   - `internal` packages: source TypeScript runtime in workspace.
   - `portable` packages: emitted ESM JavaScript + `.d.ts`.
2. Shared presets live in a workspace config package (`packages/tsconfig`).
3. Runtime import model is ESM-first.
4. Path aliases are not part of package runtime contract.
5. Portable packages must not depend on Node-only APIs unless isolated behind explicit runtime
   adapters.

## Package Kinds

### Internal Package (workspace-only, no build)

Use when:

1. Package is only consumed inside this monorepo.
2. Fast iteration is more important than external distribution.

Contract:

1. `private: true`.
2. `exports` points to source TS entry (for example `./src/index.ts`).
3. `check` runs the package's full static gate, with `typecheck` remaining the narrow helper.
4. Runtime executes source directly (Node native TS in workspace).

### Portable Package (cross-runtime or publishable)

Use when:

1. Package is consumed outside this monorepo.
2. Package must run in multiple runtime families (Node/Workers/browser server edge, etc).

Contract:

1. `exports` points to emitted JS.
2. `types` points to emitted `.d.ts`.
3. `build` emits `dist/` with ESM JS + declarations.
4. CI verifies both typecheck and build outputs.

## Technical Contract

### Runtime rules for internal source packages

1. Use ESM (`"type": "module"`).
2. Use explicit relative extensions in source imports (for example `./x.ts`).
3. Do not rely on runtime `paths` alias resolution.
4. Do not run Node with `--preserve-symlinks` for workspace source imports.
5. Prefer erasable TS syntax in runtime-executed files.

### Portability rules for portable packages

1. Target standards APIs by default (`fetch`, `URL`, `crypto.subtle`, streams).
2. Keep Node-specific modules behind adapter entrypoints, not core logic.
3. Publish/export only built artifacts (`dist/*.js`, `dist/*.d.ts`).
4. Prefer conditional exports only when required by concrete runtime divergence.

### Shared tsconfig architecture

Create `packages/tsconfig` with preset files:

1. `base.json`
   - strict shared compiler safety defaults.
2. `node-runtime.json`
   - NodeNext ESM, `noEmit`, `allowImportingTsExtensions`, `verbatimModuleSyntax`,
     `erasableSyntaxOnly`.
3. `portable-lib.json`
   - NodeNext ESM library profile for emit builds.
4. Optional targeted presets:
   - `worker-lib.json` for packages that intentionally compile against Worker globals.

Existing app-focused bundler config remains unchanged for Vite apps.

## Package templates

### Internal package template

```json
{
  "name": "@noter/<name>",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "scripts": {
    "check": "pnpm run typecheck && pnpm run lint",
    "typecheck": "tsgo -p tsconfig.json --noEmit"
  }
}
```

### Portable package template

```json
{
  "name": "@noter/<name>",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsgo -p tsconfig.build.json",
    "check": "pnpm run typecheck && pnpm run lint",
    "typecheck": "tsgo -p tsconfig.json --noEmit"
  }
}
```

## Build and CI expectations

1. `pnpm check` and `pnpm test` remain workspace entrypoints.
2. Add workspace `check` task across all packages that have an owned static validation surface, with
   `typecheck` kept as the narrow helper command.
3. Build task applies only to packages that define `build`.
4. Portable packages require a smoke test in at least:
   - Node runtime
   - one Worker-like runtime path (Wrangler/miniflare CI lane).

## Rollout Plan

### Phase 1: Baseline and templates

1. Add `packages/tsconfig` with shared presets.
2. Add docs for `internal` vs `portable` package choice.
3. Add package templates + one creation script (`scripts/new-package.js`).

Exit criteria:

1. New package can be scaffolded with one command.
2. No package requires bespoke tsconfig duplication.

### Phase 2: Pilot two packages

1. Create one `internal` utility package and consume it from app code without a build step.
2. Create one `portable` utility package that emits `dist`.

Exit criteria:

1. Internal package runs in Node with source TS imports.
2. Portable package emits valid JS + `.d.ts` and is consumed from emitted exports.

### Phase 3: Portability verification lane

1. Add Worker-target smoke check for portable packages.
2. Add guardrail lint rule for portable packages against accidental Node-only imports.

Exit criteria:

1. CI catches runtime-compat regressions before merge.

## Risks and Mitigations

1. Risk: Native Node TS behavior differences across Node versions.
   - Mitigation: pin minimum Node version in repo engines and CI.
2. Risk: Internal package accidentally depends on non-erasable TS syntax.
   - Mitigation: enable `erasableSyntaxOnly` for runtime source profiles.
3. Risk: Portable package drifts into Node-only APIs.
   - Mitigation: portability lint rule + Worker smoke lane.
4. Risk: Too many package variants increase cognitive load.
   - Mitigation: exactly two package kinds, scaffolded templates, and a single decision rule.

## References

1. Node.js TypeScript modules: `https://nodejs.org/api/typescript.html`
2. Node.js native TypeScript overview: `https://nodejs.org/en/learn/typescript/run-natively`
3. TypeScript `erasableSyntaxOnly`:
   `https://www.typescriptlang.org/tsconfig/erasableSyntaxOnly.html`
4. TypeScript `allowImportingTsExtensions`:
   `https://www.typescriptlang.org/tsconfig/allowImportingTsExtensions.html`
5. Cloudflare Workers TypeScript: `https://developers.cloudflare.com/workers/languages/typescript/`
6. Cloudflare Workers bundling: `https://developers.cloudflare.com/workers/wrangler/bundling/`
7. Cloudflare Workers Node compatibility:
   `https://developers.cloudflare.com/workers/runtime-apis/nodejs/`
