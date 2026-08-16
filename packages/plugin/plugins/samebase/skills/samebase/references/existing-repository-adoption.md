# Existing Repository Adoption

Connect an existing repository to Samebase before provider setup. The connection creates the
Samebase app record and syncs the repository tree. It does not attach or change Convex or Cloudflare
resources. Samebase can therefore represent the app while source and provider work stay separate.

## Recommended Order

Use this order by default:

1. Read the Samebase app inventory and connect the repository when it is not present.
2. Read the repository instructions and deployment commands from its current default branch.
3. Prepare and validate the required source changes in a pull request.
4. Before provider setup, name the exact provider account, the resources to attach or create, and
   any production build that the action can start.
5. After operator approval, attach or create the provider resources and verify their live state.
6. After the reviewed source reaches the default branch, verify production and a reachable pull
   request preview separately.

This order avoids an automatic provider build against source that is not ready. It is suitable for
an important app or an app that already serves traffic.

## Earlier Provider Setup

The operator can choose earlier provider setup for a small or experimental app. Connect the
repository first, then explain the exact effect and get approval before the provider write.

Creating a Worker through Samebase also configures its production and preview GitHub Builds triggers
and requests the first production build. That build can fail because the unchanged default branch
does not yet contain the required deployment contract. Use the failure and its provider logs as
diagnostic evidence while preparing the source pull request. Do not report it as a deployment.

Keep an existing live route or known-good Worker version available until the new production path is
verified.

## Assets-Only Legacy Repositories

The goal is the smallest repository-owned deployment contract. Do not invent a build or source
layout before the provider shows that one is needed.

For an approved early provider setup, read the first build log and change only the failed contract.
Do not infer a directory problem from a missing package manifest or an unreachable preview URL.

The current Samebase-managed Workers Builds contract calls `pnpm run build`, `pnpm run deploy`, and
`pnpm run deploy:preview`. A repository with no package manager can meet that interface with a
minimal package manifest, a lock file, and only the deployment dependency. This is a Samebase
interface requirement, not a Cloudflare requirement.

These are separate Workers Builds phases. Samebase runs the build command before the production or
preview deploy command. Keep each deploy script limited to its provider operation. Do not make it
run the build again only to support direct manual use. The `pnpm run` command layer does not select
the repository's dependency installer.

Use this delete-first order:

1. Keep existing runtime files and routes in place.
2. Find the real build boundary. Use a non-deploying no-op when checked-in files are already
   deployable. Keep an existing compiler or bundler when browser source needs it, and publish its
   existing output directory. When the old host exposes comparable build artifacts, compare their
   file set and hashes before you claim unchanged output.
3. Use direct provider commands and native provider configuration before a custom script.
4. Test native asset filtering against the existing directory. Serving the repository root is valid
   when the deployed file set excludes repository-only files and tool state.
5. Move or copy files only when the current layout cannot express a safe deployed file set or must
   preserve a proven host boundary.
6. Keep safe validation or version upload separate from production promotion.

Preserve an existing package manager, framework adapter, output directory, and provider config when
they satisfy the Samebase command interface. If an existing package manager does not match that
interface, report the product mismatch instead of silently replacing the repository toolchain.

Inspect every lock file, workspace file, and package-manager marker. A provider can select a package
manager from these files even when the README or newest lock file names another one. When markers
conflict, use repository history and the provider build log to identify the active manager. Remove
only a marker that this evidence proves is stale. Do not add a `packageManager` field only to make
the Samebase `pnpm run` command layer look like repository ownership.

Prove the dependency graph from a clean checkout with the same runtime, package-manager version, and
lifecycle-script policy that the provider uses. An install that disables scripts is not provider
proof when the provider runs them. After the native install, run the exact Samebase commands too. If
an unlocked legacy range now resolves a different dependency graph, use the smallest evidence-backed
version pin that preserves the application instead of treating the drift as permission to modernize
it.

Check the clean checkout again after installation. A provider-equivalent install must not rewrite a
lock file or create an untracked package-manager policy file. Commit a required install policy, or
select a supported manager version whose clean install stays reproducible.

A hosting-only adoption does not justify an application framework, formatter, linter, test runner,
or source-language migration. Keep legacy browser artifacts unchanged unless the deployment contract
requires a source change or the operator asks for modernization.

Local development is a separate change. Do not add `wrangler dev`, a custom state directory, or a
new source layout only for local preview. Add a development command later when the operator asks for
that workflow and the repository has a stable watched asset boundary.

Common pitfalls are:

1. moving or copying runtime files before testing the unchanged layout
2. adding a custom build or deploy program when direct commands meet the contract
3. publishing repository-only files from a broad asset directory
4. placing preview state inside the watched asset boundary
5. changing the existing missing-route or fallback behavior
6. trusting a green provider check without testing the public route
7. using a package deploy script as a dry run without proving the final provider arguments
8. keeping competing package-manager markers without checking which one the provider selects
9. running the build again inside a deploy phase that already follows the managed build phase

Verify all of these results separately:

1. the terminal provider build and its source commit
2. the application root, one known asset, and one known missing route
3. representative repository-only files, which must not be reachable
4. the production URL and the pull request preview URL

A green provider check is not route proof. If files moved into a new static directory, confirm that
an old host uses the new publish directory before it remains the rollback target. Remove the old
host only after the new route works and the operator approves the removal.

## First-Deployment Preview Observation

During two assets-only adoptions, a new Worker uploaded a preview version before it had an active
deployment, but its public preview URL was not reachable. One project returned Cloudflare
error 1042. Iterseg returned 404. In the first project, the old preview URLs and a new pull request
preview became reachable after an approved default-branch build created the first active deployment.
The new preview did not replace the production version.

These are project observations, not a general Cloudflare requirement. When the same state appears:

1. Keep preview verification blocked while its URL is not reachable.
2. Do not start a production deployment only to repair the preview without explicit approval.
3. After the approved first production deployment, check the old preview and create a fresh preview.
4. Verify that the fresh preview is reachable and that the active production version did not change.
