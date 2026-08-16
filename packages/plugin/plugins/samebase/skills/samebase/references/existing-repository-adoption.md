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

## Small and Legacy Repositories

Use the smallest repository-owned deployment contract. Start with the existing source layout and
change only a requirement that repository or provider evidence proves.

The current Samebase-managed Workers Builds contract calls `pnpm run build`, `pnpm run deploy`, and
`pnpm run deploy:preview`. These are separate phases. Keep each deploy script limited to its
provider operation. Do not repeat the build in a deploy script. The `pnpm run` command layer does
not select the dependency installer.

Find the real build boundary before you add files:

- Use a non-deploying no-op only when the checked-in files are already complete browser assets.
- Keep the existing compiler or bundler when generated browser output is not checked in. A broken
  old installer does not prove that the source cannot build. First test the smallest version pin or
  installer repair that preserves the output.
- Commit generated output only when a clean provider-equivalent build cannot reproduce it and the
  operator accepts that generated-file contract.

Preserve a working package manager, framework adapter, output directory, and provider configuration.
Inspect every lock file, workspace file, and package-manager marker because the provider can use
them to select its installer. When markers conflict, use repository history and the provider build
log to identify the active manager. Remove only a marker that this evidence proves is stale.

Prove the dependency graph from a clean checkout with the provider runtime, package-manager version,
and lifecycle-script policy. After installation, the checkout must not contain a rewritten lock file
or an unexpected policy file. Run the exact Samebase build command after the native install.

Prefer direct provider commands and native asset configuration. Test filtering against the existing
directory before you move or copy files. The repository root is a valid asset directory when native
filtering excludes source, documentation, dependency files, and tool state. Add a custom program or
new source layout only when the provider contract needs it.

For a safe validation, call the provider CLI directly with its safe mode. Never run a deploy package
script and forward flags through the package runner to try to make it a dry run. Treat an unproven
deploy script as a provider write.

A hosting-only adoption does not justify a framework, formatter, linter, test runner,
source-language migration, or local development command. Add local preview later when the operator
requests it.

## Convex Workers Builds

Use the portable [`build-cloudflare.ts`](../assets/build-cloudflare.ts) only when the Cloudflare
build must deploy a Convex production deployment or branch preview before it builds the frontend.
Copy the file without repository-specific changes when `main` is the production branch. Make the
package `build` script run this file and keep the repository's real frontend command in `build:app`.

The file exists because the Cloudflare dashboard shows one shared build-variable table. Samebase
writes both `CONVEX_DEPLOY_KEY` and `PREVIEW_CONVEX_DEPLOY_KEY` to both Workers Builds triggers so
dashboard-managed and Samebase-managed setups have the same shape. The file reads
`WORKERS_CI_BRANCH`, selects the matching key, gives only that key to Convex as `CONVEX_DEPLOY_KEY`,
and adds the branch as the Convex preview name when needed.

Keep the adapter limited to that job. Put application behavior in `build:app` or another explicit
package step. Do not add a local fallback to the adapter. Run `node --run build:app` for a local
application build. A repository whose production branch is not `main` needs an explicit adaptation
and validation.

Verify the provider build and source commit, the application root, one known asset, one missing
route, representative repository-only files, production, and a reachable pull request preview as
separate results. If files moved, confirm that the old host still serves them before it remains the
rollback target.

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
