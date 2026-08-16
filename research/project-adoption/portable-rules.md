# Portable Project Adoption Rules

## Status

- Evidence: [Bristol TSX](cases/bristol-tsx.md) and [Teardown Noita 3D](cases/teardown-noita-3d.md)
- Validation: promoted rules have two-project evidence; one adoption is complete and one is partial
- Use: validated rules plus clearly marked one-case candidates for the next project

## Start Without Private Samebase Source

Give the worker this file and the target repository first. Do not give it private Samebase source
until it asks for a specific missing fact or a safety boundary needs a direct check.

The manager can use Samebase as an adviser. Record each escalation, because it shows either a
missing portable rule or a real project-specific difference.

## Complete The Preflight First

Map these areas before implementation:

| Area        | Required facts                                                                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository  | app root, package manager, lock file, workspace, runtime, module type                                                                                                       |
| Source      | authored languages, configuration languages, imports, type-check inclusion                                                                                                  |
| Commands    | public scripts and every local, CI, provider, and nested caller                                                                                                             |
| Tools       | development, build, lint, format, tests, type checks, code generation                                                                                                       |
| Application | framework, CSS, server rendering, authentication, data boundaries                                                                                                           |
| Provider    | host, repository and Worker join, root, production and preview triggers, exact commands, preview, production promotion, rollback, environment and browser-account ownership |
| Validation  | fresh checkout, linked worktree, CI, provider build, browser, observability                                                                                                 |
| Versions    | runtime and core tool pins                                                                                                                                                  |

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

Treat every lock file, workspace file, and package-manager marker as provider input. When these
markers conflict, use repository history and the provider build log to find the active manager.
Remove only a marker that this evidence proves is stale. After a provider-equivalent clean install,
require a clean working tree so rewritten lock files and generated policy files cannot hide.

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

## Keep Validation Proportionate And Protect Private Data

Keep validation proportionate to the project and the migration risk. Discuss material cost and
coverage tradeoffs with the operator. Do not turn Samebase adoption into an unrelated testing
upgrade.

Preserve the behavior that matters to the operator. Keep known security defects separate from
parity.

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

Two-case evidence supports reviewed-commit binding and the separation of build, upload, deployment,
and route evidence. The exact four-command preflight and Samebase control-surface rules below come
from Teardown Noita 3D. Treat them as one-case candidates until another project uses them.

Before provider configuration, run the exact install, build, production deploy dry-run, and preview
deploy dry-run commands from the commit that the provider will build. Do not configure a provider
against commands that exist only in another branch or local worktree.

When the provider has separate build and deploy phases, keep those phases separate in the repository
contract. Do not make the deploy phase repeat a build that the provider already completed.

For Samebase, use a repository-backed Worker connected to the matching vault. Require a production
GitHub Builds trigger for the default branch and a preview trigger for other branches. A Worker that
was created directly at the provider is a boundary spike until Samebase joins it to the repository.
Read Samebase inventory before and after each write.

Create a new isolated Worker by default. Attach an existing Worker only after the user selects it
and its ownership and live traffic are known. If trigger setup automatically builds the default
branch, continue without new approval only when the provider can skip that build or the exact
default-branch command must stop before deployment. Otherwise, require explicit approval for the
named first active deployment before trigger creation. An expected pre-deploy failure is not preview
evidence.

If the Samebase MCP does not expose the required action, verify the active Samebase session and
provider account, then use the authenticated browser handoff to complete the same Samebase UI
action. Do not replace it with a provider-only workflow.

Separate branch build, Worker version upload, public preview, backend preview, and production
promotion. A successful build is not a deployment.

Bind provider validation to the reviewed full source commit. Use provider-native reads for the
terminal build, Worker version, active deployment, and backend state. Use the operator's named
browser profile for saved-session checks.

A failed repository check or provider build for the reviewed branch blocks the preview. Read the
native logs, repair the repository or provider trigger, push a new reviewed commit, and wait for its
terminal successful build. An older build or unrelated manual upload is not evidence for the new
commit.

Require a reachable non-production version URL or provider-specific preview deployment. A version
record with an unreachable URL does not pass the preview.

### Teardown first-deployment preview candidate

One assets-only Worker gave this sequence. Before its first active deployment, a successful preview
upload created a version, but the version URL and branch alias returned 404 with Cloudflare
error 1042. After an approved default-branch build created the first active deployment, the old
preview URLs and a new pull request preview returned 200. The new preview did not replace the active
production version.

Treat this as a one-project candidate, not as a general Cloudflare requirement or proven cause. If a
new Worker has no active deployment and its uploaded preview URL returns error 1042, keep Preview
blocked and record both facts. Do not start an active deployment only to repair Preview. After the
user approves the named first deployment, test the old preview URLs, create a fresh preview, and
confirm that the active production version did not change.

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
