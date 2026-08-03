# Samebase project adoption contract

This bundled contract is the operative portable source for the skill. The Bristol transition is its
first completed evidence case. Record deviations and candidate improvements. Do not treat one
target's constraint as a shared rule. When this skill changes in the Samebase repository, compare
the bundled contract with the active project-adoption research and update both in the same change
when they express the same rule.

## Manager preflight

Complete every row before implementation. Classify each difference as `alignment`,
`target constraint`, `investigation`, or `exact exception`.

| Area        | Required facts                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Repository  | Application root, package manager, lock file, workspace, runtime, module type, default branch, current instructions |
| Source      | Authored languages, configuration languages, imports, generated files, type-check inclusion                         |
| Commands    | Public scripts and every local, CI, provider, and nested caller                                                     |
| Tools       | Development, build, lint, format, tests, type checks, code generation                                               |
| Application | Framework, CSS, server rendering, routes, authentication, data and privacy boundaries                               |
| Provider    | Current host, build adapter, preview, production promotion, rollback, environment ownership                         |
| Validation  | Fresh checkout, linked worktree, CI, provider build, browser, observability                                         |
| Versions    | Runtime and core tool pins                                                                                          |

Repeat the same table after integration. Existing files and passing commands describe the current
state. They do not select the desired state.

## Portable Samebase baseline

Use this baseline for classification, not for blind replacement:

- Use pnpm as the package and repository command layer for a new project.
- Keep another package manager in an existing project only when its lock file, operator contract, or
  provider contract makes that a deliberate target constraint.
- Use Node 24 with ESM package semantics.
- Write handwritten application, automation, supported configuration, and tests as normal
  TypeScript.
- Let Vite+ own application development, build, lint, format, and tests.
- Use Oxlint and Oxfmt through Vite+.
- Type-check application and Node surfaces through every real check and provider build.
- Keep application logic and durable data in Convex by default.
- Use Cloudflare as the front door, Worker runtime, and observability layer by default.
- Keep preview and production authority separate.

Treat authored `.js`, `.mjs`, and `.cjs` files and direct ESLint, Prettier, Vitest, or Vite runners
as review smells. Keep one only when a named tool or runtime cannot use the normal TypeScript and
Vite+ path. Document that exact boundary. Do not add source-extension or selected-tool scanners.

Name scripts by stable operator intent. Update every owned caller in the same change. Keep an old
alias only when an external caller cannot move.

## Behavior contract

Select the applicable surfaces before framework changes:

- public routes and redirects
- protected server-rendered routes
- server endpoints
- authentication success, rejection, sign-out, and saved-session recovery
- sign-out clears private browser caches before another identity can use them
- anonymous rejection and authenticated access at each private data function
- navigation, assets, browser history, focus, touch, and responsive behavior
- provider build and non-production upload
- no private data or secret-like synthetic canaries in client output, logs, screenshots, fixtures,
  or pull request text

Use synthetic data for tests and release evidence.

## Production data and configuration plan

Before any production write, record:

- the exact schema, data, authentication, domain, secret, provider, backend, or traffic change
- the source and destination, volume, ordering, validation, retry, and idempotency rules
- backup or export evidence and the rollback point
- the dry-run or non-production rehearsal result
- the operator who can approve the write
- the post-change integrity and access checks

Keep every production write blocked until the user gives explicit approval for that named change.

## Worktree ownership

For a linked worktree:

1. Derive its identity from Git and bind local state to that exact worktree.
2. Remove inherited production, provider, and authentication values before setup.
3. Serialize first-run setup and create only required synthetic identity and data.
4. Keep credentials out of command arguments, logs, screenshots, and repository files.
5. Test two setup, run, stop, and restart cycles from committed `HEAD` when the migration changes
   linked-worktree behavior.
6. Remove only state owned by the exact worktree.

## Adoption record

Keep one compact record with these sections:

### Run identity

- target repository and starting commit
- requested outcome
- preserved behavior
- production-cutover authority
- rollback target

### Gate register

| Gate                     | State   | Evidence                        | Next action |
| ------------------------ | ------- | ------------------------------- | ----------- |
| Manager preflight        | pending |                                 |             |
| Behavior contract        | pending |                                 |             |
| Boundary spikes          | pending |                                 |             |
| Implementation           | pending |                                 |             |
| Independent review       | pending |                                 |             |
| Preview                  | pending |                                 |             |
| External production work | blocked | Explicit user approval required |             |
| Production approval      | blocked | Explicit user approval required |             |
| Cutover                  | blocked | Explicit user approval required |             |
| Observation              | blocked | Cutover approval required       |             |
| Bidirectional extraction | pending |                                 |             |

Use `pending`, `in progress`, `passed`, `failed`, `blocked`, or `not applicable`. Do not mark a gate
passed without direct evidence.

For a preview-only run, mark external production work, production approval, cutover, and observation
`not applicable` at handoff. For an approved production run, define the observation duration,
signals, failure threshold, rollback trigger, rollback command, and rollback verification before
changing the relevant production system.

### Delegation register

For each delegated task, record:

- task and parent task
- agent role and write scope
- input contract and acceptance criteria
- worktree or branch
- output artifact
- validation evidence
- integrated or rejected decision
- blocker or approval boundary

Do not record hidden reasoning.

### Owned-resource register

For each temporary Worker, backend, domain, vault, preview, or other provider resource, record:

- provider and stable resource identifier
- creation evidence and owning gate
- whether it contains only synthetic data
- final decision: promote, retain for review, or remove
- cleanup evidence when removed

Remove only resources owned by this run. Do not leave a temporary resource without a final decision.

### Decision register

For each material difference, record the fact, source, decision, validation result, and final
destination.

## Release evidence

Keep these facts separate and bind them to the reviewed commit:

- clean provider build
- uploaded Worker version
- active preview deployment
- preview backend state
- working preview routes and authentication
- explicit production approval
- active production deployment
- production backend state
- public route and saved-session checks
- observation result

A Samebase inventory state is not terminal provider evidence. Use provider-native reads for live
build, version, deployment, backend, domain, and telemetry state when no Samebase tool exposes the
required fact.

## Final classification

Classify each reusable result as `target only`, `Samebase`, `shared`, `intentionally different`, or
`deferred`. Put Samebase changes on a separate branch and pull request. Keep provider journals,
temporary identifiers, and obsolete validation logs out of the final case record.
