# 080 Monorepo, Vite, and Convex Code Organization Research

## Status

- Research
- Last updated: 2026-04-01

## Question

How should this repo organize code so the monorepo stays legible, the Vite app
stays easy to work in, and the Convex backend does not keep flattening into one
large directory?

This research is meant to guide follow-up implementation work, not to lock a
full migration immediately.

## Verified Current State

Observed locally on 2026-04-01:

- The workspace is already structured as a Turborepo + PNPM monorepo with
  `apps/*`, `packages/*`, and `eslint-rules` in `pnpm-workspace.yaml`.
- The repo currently has two app packages (`apps/noter`,
  `apps/noter-starter-template`) but only one package under `packages/`
  (`packages/sync`).
- `apps/noter/src/components` currently contains `161` top-level files.
- `apps/noter/convex` currently contains `78` top-level files.
- The frontend app already uses a single app-local alias in
  `apps/noter/tsconfig.json`:
  - `"@/*": ["./src/*"]`
- Existing repo guidance in
  `specs/030_MONOREPO_TYPESCRIPT_RUNTIME_AND_PORTABILITY_SPEC.md` already argues
  for a selective package strategy instead of forcing every shared thing into a
  built library immediately.

Interpretation:

- The main organizational pressure is inside `apps/noter`, not at the workspace
  root.
- The repo is already a monorepo structurally, but most reusable and
  domain-specific code still lives inside the main Vite app and Convex app.
- The next step should be better boundaries, not a large speculative package
  split.

## Skills and Docs Reviewed

### Repo-local skills

Reviewed local repo skills under `skills/`:

- `skills/create-pr/SKILL.md`
- `skills/noter-playwright-live/SKILL.md`
- `skills/mac-app-control/SKILL.md`

Finding:

- none of the current repo-local skills cover monorepo organization, Vite app
  structure, or Convex module structure
- the strongest source of truth for this question is current ecosystem docs, not
  an existing internal skill

### Official ecosystem guidance

#### Turborepo

Reviewed current Turborepo docs:

- [Package types](https://turborepo.dev/docs/core-concepts/package-types)
- [Managing dependencies](https://turborepo.dev/docs/crafting-your-repository/managing-dependencies)
- [Internal packages](https://turborepo.dev/docs/core-concepts/internal-packages)
- [Understanding your repository](https://turborepo.dev/docs/crafting-your-repository/understanding-your-repository)
- [TypeScript guide](https://turborepo.dev/docs/guides/tools/typescript)

Key recommendations from those docs:

- application packages should be the end of the package graph and usually live
  in `apps/`
- internal dependencies should be installed in the package that actually uses
  them instead of accumulated at the repo root
- internal packages can stay "just-in-time" and export TypeScript directly when
  a modern bundler such as Vite is consuming them
- for package-internal absolute imports, prefer Node subpath imports over
  TypeScript `paths`, especially for just-in-time packages
- use `turbo devtools`, `turbo ls`, and `turbo query` to understand whether a
  shared package has become too broad or too invalidation-heavy

#### Vite

Reviewed current Vite docs:

- [Dependency Pre-Bundling](https://main.vite.dev/guide/dep-pre-bundling)
- [Features](https://main.vite.dev/guide/features.html)
- [Shared Options](https://main.vite.dev/config/shared-options.html)

Key recommendations and constraints from those docs:

- in monorepos, linked dependencies that do not resolve from `node_modules` are
  treated as source code rather than pre-bundled dependencies
- those linked dependencies should be valid ESM; otherwise they may need
  `optimizeDeps.include`
- `import.meta.glob` is a useful Vite-only tool for explicit file-system-backed
  registries, but its patterns must stay literal and intentionally scoped
- aliases are supported, but Vite itself does not prescribe a feature-folder or
  type-folder app layout

Interpretation for this repo:

- Vite is friendly to selective internal packages
- Vite does not force a frontend architecture, so the repo needs to choose one
  intentionally instead of letting `src/components` absorb everything

#### Convex

Reviewed current Convex docs:

- [Best Practices](https://docs.convex.dev/understanding/best-practices/)
- [Other Recommendations](https://docs.convex.dev/understanding/best-practices/other-recommendations)
- [Components](https://docs.convex.dev/components)
- [Bundling](https://docs.convex.dev/functions/bundling)

Key recommendations from those docs:

- public `query`, `mutation`, and `action` handlers should stay thin
- most business logic should live in plain TypeScript helper functions, with
  Convex wrappers acting as narrow entrypoints
- public functions should use argument validation
- generated Convex code should be checked into version control
- Convex Components are a real isolation tool, but they are for explicit
  sandboxing and reuse boundaries, not a default answer for every folder problem
- some dynamic dependencies and local-file-dependent libraries are a poor fit
  for Convex bundling, so backend structure should keep runtime-sensitive code
  explicit

Interpretation for this repo:

- the fastest win is not renaming every Convex file
- the fastest win is moving domain logic behind thin, stable Convex entrypoints

## Assessment

### Monorepo

The repo should stay monorepo-first, but it should resist "package because we
can" refactors.

Right now the biggest risk is not under-packaging at the root. The bigger risk
is that `apps/noter` has become a monolith with weaker internal boundaries than
the workspace shape suggests.

Best-fit monorepo rule for this repo:

- keep deployable apps in `apps/`
- extract a `packages/*` workspace package only when one of these is true:
  - the code has a second real consumer
  - the code has a different runtime portability contract
  - the code is so broadly imported that separating it improves the package/task
    graph materially

### Vite app

The Vite app should not stay organized around one giant flat `components/`
folder.

This is not because Vite requires feature folders. It is because the current
repo now mixes too many roles in one place:

- route-level screens
- shared UI wrappers
- domain UI
- visual fixtures
- labs/prototypes
- tests colocated next to all of the above

The better organizing principle here is ownership:

- app shell code
- route shells
- feature-owned code
- shared code
- visual-fixture/test-only surfaces

### Convex app

The Convex backend should optimize for stable public function paths and more
private helper structure behind them.

That matters because a broad folder rename in Convex is riskier than a normal
frontend refactor:

- generated API references are path-sensitive
- public function names become part of the contract
- the repo already has meaningful top-level files that product code depends on

So the recommended migration path is:

- keep stable public entry files at the top level while a migration is in
  progress
- move business logic into clearer domain helpers under `convex/model/` or
  similar repo-owned helper folders
- only move public function files once the codebase is ready to accept API-path
  changes intentionally

## Recommended Direction

### 1. Keep `apps/` as the deployment boundary

Treat `apps/noter` and `apps/noter-starter-template` as the primary deployable
endpoints of the workspace.

Do not make app packages depend on other app packages. If code needs to be
shared, move it to a package or keep it clearly app-local.

### 2. Grow `packages/` only when there is a real second consumer

Near-term rule:

- if code is only used by `apps/noter`, keep it in `apps/noter`
- if code is reused by the starter template, root scripts, or a second app, that
  is the moment to consider extracting a package

This keeps the repo aligned with the existing direction in
`specs/030_MONOREPO_TYPESCRIPT_RUNTIME_AND_PORTABILITY_SPEC.md`.

### 3. Reorganize the Vite app by ownership, not by generic file type

Recommended target shape for `apps/noter/src/`:

```text
src/
  app/
  routes/
  features/
    chat/
    vaults/
    landing/
    machine-control/
    connected-machines/
  shared/
    components/
    hooks/
    lib/
  visual-fixtures/
  content/
```

Guidelines:

- `app/` should hold bootstrap, router wiring, layout wiring, and providers
- `routes/` should hold route shells and screen-level composition
- `features/<name>/` should hold code owned by one product area
- `shared/` should hold code that is actually reused across multiple features
- `visual-fixtures/` should keep fixture-only surfaces out of the main product
  component namespace

Practical migration rule:

- keep code near the owning feature until a second feature uses it
- only then promote it to `shared/`

### 4. Keep the app-local `@/` alias, but do not copy that pattern into future packages

The existing `@/` alias is reasonable for `apps/noter` because it is clearly
app-local.

However, future workspace packages should not rely on TypeScript `paths` as a
runtime contract. If new packages need internal absolute imports, prefer Node
subpath imports as recommended by Turborepo's TypeScript guide.

### 5. Make Convex entrypoints thin and move domain logic behind them

Recommended target shape for `apps/noter/convex/` over time:

```text
convex/
  schema.ts
  auth.ts
  http.ts
  convex.config.ts
  chat/
  model/
    shared/
    auth/
    vaults/
    github/
    connectedMachines/
    billing/
    daytona/
  components/
```

Migration notes:

- `components/` should only appear when the repo intentionally adopts Convex
  Components for a hard isolation or reuse boundary
- top-level files such as `vaultActions.ts`, `github.ts`, or
  `connectedMachines.ts` can remain as stable public entrypoints while they
  delegate to helper modules under `model/`
- tests can stay adjacent to the public entrypoint during migration, but new
  pure helper logic should prefer tests close to the helper it is validating

### 6. Use extraction criteria, not taste, to decide when a new package is worth it

Before extracting a new workspace package, confirm at least one of:

1. another app or runtime already needs the code
2. the code has a different lifecycle or runtime contract than `apps/noter`
3. `turbo query` or `turbo devtools` shows the current dependency graph is
   paying a real cost for the current boundary

This avoids speculative packages and keeps package creation tied to actual repo
pressure.

## Concrete Recommendations for Noter

### Near-term

1. Create a `src/routes/` and `src/features/` split inside `apps/noter/src/`
   before extracting more workspace packages.
2. Move visual-fixture pages and labs out of the flat top-level
   `src/components/` directory into a dedicated `src/visual-fixtures/` or
   adjacent feature-owned fixture folders.
3. Add a `convex/model/` directory and pilot one backend domain migration behind
   stable top-level entrypoints.

### Good first migration targets

Best frontend pilot candidates:

- `vaults`
- `chat`
- `machine-control`

Best Convex pilot candidates:

- `connectedMachines`
- `vault*`
- `github*`

These are good candidates because they already read as domains instead of
low-level shared utilities.

### Things to avoid

- do not split `apps/noter` into many packages just because the repo is already
  a monorepo
- do not rename all Convex public files at once
- do not create a generic `utils` package or `shared` package with vague
  ownership
- do not move app-only UI wrappers into a workspace package before a second app
  actually needs them

## Proposed Rollout

### Phase 1: frontend ownership boundaries

1. Introduce `src/routes/`, `src/features/`, and `src/shared/`.
2. Move one domain at a time out of the flat `src/components/` root.
3. Keep existing imports working through small, mechanical follow-up patches.

### Phase 2: Convex helper extraction

1. Introduce `convex/model/`.
2. Move one domain's non-handler logic into helper modules.
3. Keep top-level public Convex modules as stable wrappers during the migration.

### Phase 3: selective package extraction

1. Re-evaluate which code now has a second real consumer.
2. Extract only those proven cross-app or cross-runtime slices into
   `packages/*`.
3. Use package-local dependencies and Node subpath imports for new packages.

## Bottom Line

The best organizational move for this repo is not "more monorepo."

It is:

- clearer boundaries inside `apps/noter`
- thin Convex entrypoints with deeper helper modules
- selective package extraction only after a second real consumer exists

That direction matches current Turborepo, Vite, and Convex guidance while also
matching the actual pressure points visible in this codebase today.
