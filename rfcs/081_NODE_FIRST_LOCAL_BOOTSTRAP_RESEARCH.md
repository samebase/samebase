# 081 Node-First Local Bootstrap Research

## Status

- Research
- Last updated: 2026-04-01

## Related Files

- `Makefile`
- `package.json`
- `scripts/bootstrap-worktree.js`
- `scripts/convex-sync-dev-env.js`
- `scripts/convex-seed-dev-auth.js`
- `apps/noter/convex/daytona/devServerCommand.ts`
- `specs/019_NOTER_CLI_WORKTREE_PREVIEW_PROVISIONING_SPEC.md`
- `specs/053_DAYTONA_LOCAL_RUNTIME_PROFILE_AND_SEED_SOURCE_SPEC.md`
- `specs/075_ANON_KILLPORT_SPEC.md`

## Summary

Noter's current local bootstrap contract is operator-friendly on macOS, but the
repo still treats `make` as the canonical orchestration layer for primary local
checkout, worktree, anonymous bootstrap, and Daytona-local startup.

That choice is now a concrete product constraint:

1. native Windows does not ship `make`
2. this repo's `Makefile` depends on POSIX shell tools and syntax, not just GNU
   Make itself
3. several runtime selectors and specs treat `make run`, `make anon`, or
   `make daytona-local` as the durable contract

The repo already has a stronger cross-platform primitive available: Node. Node
is a required dependency anyway, and most of the real bootstrap logic already
lives in repo-owned Node scripts.

This RFC recommends making Node-owned scripts the source of truth for local
bootstrap orchestration, while keeping `make` only as an optional compatibility
wrapper during migration.

## Why This Matters Now

On 2026-04-01, a first native-Windows setup pass on a machine outside WSL found
the following sequence:

1. Node was already installed
2. PNPM was missing but straightforward to add
3. `make` was not available on `PATH`
4. even after dependencies were installed, the repo still relied on shell
   behavior that was Unix-first

That confirms the current product problem is broader than one Windows bug. The
outer bootstrap contract itself is not portable enough.

## Current Bootstrap Inventory

Today the repo exposes these operator-facing root targets:

1. `make run`
2. `make anon`
3. `make anon-once`
4. `make daytona-local`
5. `make daytona-local-once`
6. `make connect`
7. `make connect-once`
8. `make playwright-open`
9. `make record-start`
10. `make record-stop`

The current split is important:

1. most stateful logic already lives in Node scripts
2. `make` mostly sequences commands and injects environment variables
3. a smaller set of targets still depends directly on shell-only behavior

### What Already Lives In Node

1. dependency/bootstrap hashing and detached-HEAD branch creation:
   `scripts/bootstrap-worktree.js`
2. Convex seed-env sync: `scripts/convex-sync-dev-env.js`
3. local password-account auth seeding: `scripts/convex-seed-dev-auth.js`
4. Daytona source-env generation: `scripts/daytona-write-source-env.js`
5. PR polling/connect loop: `scripts/noter-pr-connect.js`
6. Playwright branch-session control: `scripts/playwright-branch-browser.js`

### What Still Depends On Shell-Specific Semantics

1. `killport` uses `sed`, `head`, `lsof`, and `kill`
2. `daytona-local` / `daytona-local-once` use shell `if [ -f ... ]` branching
3. `playwright-open` / `record-start` / `record-stop` use `/tmp`, `mkdir -p`,
   shell interpolation, and inline redirection
4. `make` target chaining is used as the primary operator contract in docs and
   runtime selectors

## Current Coupling Outside The Makefile

This is not just an implementation detail in one file.

### Docs And Operator Rules

`AGENTS.md` and several specs currently encode `make` as the default local
entrypoint, especially:

1. primary checkout: `make run`
2. worktree bootstrap: `make anon` / `make anon-once`
3. Daytona bootstrap: `make daytona-local`

That means changing the command contract later will require deliberate doc and
operator migration, not only code changes.

### Daytona Runtime Selection

`apps/noter/convex/daytona/devServerCommand.ts` currently hardcodes:

1. `make daytona-local`
2. `make run`
3. `pnpm run dev`
4. `make anon`

So the current sandbox/runtime chooser already treats Make targets as product
API, not as a local convenience wrapper.

### Existing Specs

Older specs such as `019`, `053`, and `075` consistently talk about `make`
targets as the local bootstrap contract. Those docs are useful because they also
reveal where migration risk will show up:

1. worktree bootstrap assumptions
2. Daytona runtime equivalence assumptions
3. anonymous local cleanup assumptions

## Findings

### 1. `make` Is The Wrong Layer To Own Cross-Platform Behavior

The repo already depends on Node and PNPM. Requiring Windows users to install
GNU Make plus enough Unix shell tooling to satisfy the current `Makefile` adds a
second orchestration runtime that is not necessary for the product itself.

### 2. Raw `pnpm` Scripts Alone Are Not Sufficient

Package scripts are useful aliases, but they are not a good portability layer by
themselves because shell syntax can leak into `package.json` too.

The right ownership boundary is:

1. Node scripts own orchestration
2. `pnpm` scripts may alias those Node scripts
3. `make` may wrap those same Node scripts temporarily

### 3. The Repo Already Has Most Of The Building Blocks

This is not a greenfield rewrite.

Most meaningful work is already implemented in repo-owned JavaScript files. The
migration cost is mostly:

1. consolidate orchestration into one Node entrypoint
2. replace shell-only helper behavior such as `killport`
3. change docs, starter contracts, and Daytona selection logic

### 4. Daytona Is The Highest-Risk Consumer

Local operator flows can adapt to new commands fairly easily. Daytona is more
sensitive because the repo currently uses explicit command strings as a
bootstrap contract. Any Node-first migration has to preserve:

1. the explicit `daytona-local` semantics
2. the distinction between primary-checkout and worktree bootstrap
3. the difference between normal local dev and anonymous local Convex bootstrap

## Recommendation

Adopt this contract:

1. Node scripts become the source of truth for local bootstrap orchestration
2. `pnpm` scripts expose the user-facing aliases
3. `make` becomes a compatibility wrapper, not the primary contract

Concretely, the repo should converge on a single Node entrypoint that owns
subcommands such as:

1. `run`
2. `anon`
3. `anon-once`
4. `daytona-local`
5. `daytona-local-once`
6. `killport`

The exact script file and final user-facing aliases can still be decided later.
The important design choice is that the orchestration logic should live in Node,
not in Make recipes.

## Proposed Migration Shape

### Phase 1: Add Node-Owned Bootstrap Entrypoints

1. Introduce a repo-owned Node CLI, for example
   `node ./scripts/dev-entrypoint.js <subcommand>`
2. Reproduce current `make run`, `make anon`, `make anon-once`,
   `make daytona-local`, and `make daytona-local-once` behavior in that CLI
3. Implement a Node replacement for `killport`

### Phase 2: Expose Stable User-Facing Aliases

1. Add root `package.json` scripts that call the Node CLI
2. Update README and operator-facing setup docs to prefer the new aliases
3. Update the primary local checkout flow first, because that is the lowest
   migration-risk path

### Phase 3: Migrate Daytona And Worktree Contracts

1. Update `apps/noter/convex/daytona/devServerCommand.ts` to prefer the new
   Node-owned contract over Make target strings
2. Update starter-template/bootstrap expectations where they assume Make
3. Update specs and manual tests that encode Make as the canonical contract

### Phase 4: Demote Or Remove Make

1. Keep `Makefile` only as a thin wrapper during transition, or
2. remove it entirely once all callers have switched

## Non-Goals

This RFC does not propose:

1. changing the inner app runtime away from `pnpm dev`
2. changing Convex auth/bootstrap policy
3. changing Daytona provisioning architecture by itself
4. replacing every shell script in the repo immediately
5. rewriting Playwright helper flows unless they block the main bootstrap path

## Risks

### Operator Muscle Memory

Many local instructions, habits, and scripts currently say `make`. Migration
should preserve old aliases long enough to avoid breaking active work.

### Partial Migration Confusion

The repo should avoid landing a half-migrated state where:

1. docs say Node
2. Daytona still resolves Make
3. worktrees still depend on different bootstrap contracts

### Scope Creep

The core problem is bootstrap orchestration, not every shell script in the
repository. The migration should focus first on the commands required to start
local development reliably across macOS, Linux, and Windows.

## Open Questions

1. Should the stable operator-facing command be `pnpm <alias>` or
   `node ./scripts/<entrypoint>.js <subcommand>`?
2. Should the repo preserve the semantic names `run`, `anon`, and
   `daytona-local`, or rename them during migration?
3. Should `Makefile` remain committed as a compatibility wrapper for macOS/Linux
   operators, or should the repo remove it once Node parity exists?
4. Which Playwright and recording targets are in-scope for the first migration
   slice versus a later cleanup?

## Suggested Next Step

Open a follow-up implementation PR that does only Phase 1:

1. add a single Node bootstrap CLI
2. migrate `run`, `anon`, `anon-once`, `daytona-local`, and `killport`
3. keep `make` as a wrapper during that PR

That would let the repo prove the cross-platform orchestration design without
mixing it with a large docs or Daytona product-contract rewrite.
