# Portable Project Adoption Rules

## Status

- Evidence: [Bristol TSX](cases/bristol-tsx.md)
- Validation: one project
- Use: candidate input for the next project

## Start Without Private Samebase Source

Give the worker this file and the target repository first. Do not give it private Samebase source
until it asks for a specific missing fact or a safety boundary needs a direct check.

The manager can use Samebase as an adviser. Record each escalation, because it shows either a
missing portable rule or a real project-specific difference.

## Complete The Preflight First

Map these areas before implementation:

| Area        | Required facts                                                                |
| ----------- | ----------------------------------------------------------------------------- |
| Repository  | app root, package manager, lock file, workspace, runtime, module type         |
| Source      | authored languages, configuration languages, imports, type-check inclusion    |
| Commands    | public scripts and every local, CI, provider, and nested caller               |
| Tools       | development, build, lint, format, tests, type checks, code generation         |
| Application | framework, CSS, server rendering, authentication, data boundaries             |
| Provider    | build adapter, preview, production promotion, rollback, environment ownership |
| Validation  | fresh checkout, linked worktree, CI, provider build, browser, observability   |
| Versions    | runtime and core tool pins                                                    |

Classify every difference as alignment, a proven target constraint, an investigation, or one exact
tested exception. Do not start implementation with an unclassified row.

Repeat the same comparison after integration. Existing files and passing commands show the current
state. They do not select the desired stack.

## Use The Samebase-Aligned Baseline

For a new project in this ecosystem:

- use pnpm as the package-manager and repository command layer
- use Node 24 with ESM package semantics
- write handwritten automation, tests, and supported configuration as normal TypeScript
- let Vite+ own application development, build, lint, format, and tests
- use Oxlint and Oxfmt through the Vite+ configuration
- type-check application and Node surfaces through every real check and provider build

Direct pnpm commands are normal. Vite+ owns the tool behavior, but it does not need to wrap every
package-script call.

For an existing project, keep another package manager only when its lock file and operator or
provider contract make that a deliberate constraint. Bristol kept npm for this reason. Its
clean-root commands use npm to start a small Node TypeScript bootstrap because Vite+ cannot load an
installed configuration before dependencies exist.

Treat authored `.js`, `.mjs`, and `.cjs` files as a review smell. Keep one only when a named tool or
runtime cannot use TypeScript. Document that boundary. Do not add an extension scanner or a
tool-name scanner. Code review, explicit TypeScript projects, and real workflow checks provide the
useful proof.

Treat direct ESLint, Prettier, Vitest, and Vite runners as the same type of review smell when Vite+
is the selected owner. Preserve a required rule through Oxlint before removing its old runner.

## Name Scripts By Operator Intent

Before a package-script rename:

1. find every caller
2. state the operation that the script represents
3. keep the stable operator action separate from its current implementation
4. update all owned callers in the same change
5. keep an old alias only when an external caller cannot move
6. prove the name through the real workflow

Do not copy script names only because another project has them. Remove spike scripts and aliases
when no final caller needs them.

## Own Linked-Worktree State

For a linked worktree:

1. derive identity from Git and bind local state to that exact worktree
2. remove inherited production, provider, and authentication values before setup starts
3. serialize first-run setup and create only the required synthetic identity and data
4. keep credentials out of command arguments, logs, screenshots, and repository files
5. test two setup, run, stop, and restart cycles from committed `HEAD`, then remove only the exact
   owned worktree and state

Use project-specific commands and ownership primitives. Do not copy Samebase names or internal
implementation only to make the projects look similar.

## Protect Behavior And Private Data

Add framework-neutral characterization tests before a framework migration. Cover public and private
routes, redirects, server endpoints, authentication recovery, assets, navigation, and the provider
build.

Authorize private data at its data boundary. Route authentication alone is not enough. Test
anonymous rejection and authenticated behavior for each public data function.

Use synthetic data in tests, previews, logs, screenshots, and pull request text. Clear private
browser caches on sign-out unless the product has an explicit retention contract.

## Use A Small Runtime Spike

For a server-rendered Cloudflare application, prove at least:

- one public route
- one protected server-rendered route
- one server endpoint
- backend access in the correct environment
- static assets
- the Worker build and non-production upload
- no private source or synthetic canary in client output

Keep framework runtime, repository workflow, and provider integration as separate decisions.

## Keep Release Evidence Exact

Separate branch build, Worker version upload, public preview, backend preview, and production
promotion. A successful build is not a deployment.

Bind provider validation to the reviewed full source commit. Use provider-native reads for the
terminal build, Worker version, active deployment, and backend state. Use the operator's named
browser profile for saved-session checks.

Keep provider configuration separate from production promotion. Keep the old host or known-good
Worker version available until the cutover and observation gate pass.

Use the detailed
[existing application migration runbook](../../docs/existing-app-cloudflare-workers-migration.md)
when Cloudflare Workers is in scope.

## Finish With Bidirectional Review

For each difference, decide whether the target adopts the baseline, Samebase adopts the target
practice, both share an extraction, both stay different, or the decision waits.

Move a Samebase change to its own branch and pull request. The next project should start with these
rules and no private Samebase source, then record every escalation.
