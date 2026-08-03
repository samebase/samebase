# Samebase project adoption contract

This bundled contract is the operative portable source for the skill. The Bristol and Teardown Noita
3D transitions are its first two evidence cases. Record deviations and candidate improvements. Do
not treat one target's constraint as a shared rule. When this skill changes in the Samebase
repository, compare the bundled contract with the active project-adoption research and update both
in the same change when they express the same rule.

## Manager preflight

Complete every row before implementation. Classify each difference as `alignment`,
`target constraint`, `investigation`, or `exact exception`.

| Area        | Required facts                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository  | Application root, package manager, lock file, workspace, runtime, module type, default branch, current instructions                                                              |
| Source      | Authored languages, configuration languages, imports, generated files, type-check inclusion                                                                                      |
| Commands    | Public scripts and every local, CI, provider, and nested caller                                                                                                                  |
| Tools       | Development, build, lint, format, tests, type checks, code generation                                                                                                            |
| Application | Framework, CSS, server rendering, routes, authentication, data and privacy boundaries                                                                                            |
| Provider    | Current host, Samebase vault and Worker join, repository root, both build triggers, commands, preview, production promotion, rollback, environment and browser-account ownership |
| Validation  | Fresh checkout, linked worktree, CI, provider build, browser, observability                                                                                                      |
| Versions    | Runtime and core tool pins                                                                                                                                                       |

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
- Use a repository-backed Worker connected through Samebase. Require separate production and preview
  GitHub Builds triggers.
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

A comprehensive Samebase adoption request includes repository and pull request changes, a new
isolated Samebase-connected Worker, GitHub Builds trigger configuration that cannot start an active
deployment, and preview version uploads when these actions do not replace existing traffic. Do not
classify a pull request as a production change. Require explicit approval before changing an
existing production resource, starting an active deployment, current traffic, schema, data,
authentication, secret, domain, route, or backend promotion.

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
| Samebase Worker join     | pending |                                 |             |
| GitHub Builds triggers   | pending |                                 |             |
| Provider branch build    | pending |                                 |             |
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

## Samebase provider contract

Before a Samebase provider write:

1. Read inventory and reuse the vault that matches the exact repository.
2. Check the active Samebase session, selected provider account, target repository, default branch,
   and provider root.
3. Test and record the Teardown candidate: run the exact install, build, production deploy dry-run,
   and preview deploy dry-run commands from the commit that the provider will build. Keep this check
   as a candidate until another project validates it.
4. Create a new isolated Worker through Samebase by default. Attach an existing Worker only after
   the user selects it and you verify ownership and live traffic. A standalone provider Worker is
   only a boundary spike.
5. Require a production trigger for the default branch and a preview trigger for other branches. If
   setup automatically builds the default branch, continue without new approval only when the
   provider can skip that build or the exact default-branch command must stop before deployment.
   Otherwise, require explicit approval for the named first active deployment before trigger
   creation. An expected pre-deploy failure is not release evidence.
6. Reread inventory after each write.

When the MCP lacks the exact action, test and record the Teardown browser-handoff candidate. Use the
authenticated Samebase browser handoff and complete the same action in the in-app Browser. Do not
switch to a manual provider-only path. Keep this handoff as a candidate until another project
validates it.

A failed repository check or provider build for the reviewed branch blocks Preview. Read native
logs, repair the repository or trigger, push a new reviewed commit, and wait for a new terminal
successful build. Do not use an older successful build or an unrelated manual upload as substitute
evidence.

### First-deployment preview candidate

Teardown Noita 3D supplied one assets-only Worker observation. Before the first active deployment, a
successful preview upload created a version, but its version URL and branch alias returned 404 with
Cloudflare error 1042. After an approved default-branch build created the first active deployment,
the old preview URLs and a fresh pull request preview returned 200. The fresh preview did not
replace the active production version.

Treat this as a candidate, not as a general Cloudflare requirement or proven cause. If a new Worker
has no active deployment and an uploaded preview URL returns error 1042, keep Preview blocked and
record both facts. Do not start an active deployment only to repair Preview. After the user approves
the named first deployment, test the old preview URLs, create a fresh preview, and confirm that the
active production version did not change. Keep this candidate until another project tests it.

## Release evidence

Keep these facts separate and bind them to the reviewed commit:

- Samebase vault, Worker, repository, and root join
- production and preview GitHub Builds triggers
- clean provider build
- successful provider branch build
- uploaded Worker version
- reachable non-production version URL or provider-specific preview deployment
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
