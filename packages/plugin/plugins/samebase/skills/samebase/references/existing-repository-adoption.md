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

The goal is a safe repository-owned deployment contract, not a pretend build. Before provider setup:

1. Make the configured build, production deploy, and preview deploy commands work from the selected
   root. The current Samebase defaults are `pnpm run build`, `pnpm run deploy`, and
   `pnpm run deploy:preview`.
2. Keep the build command non-deploying. It can transform files, validate existing files, or do no
   work when the source is already deployable.
3. Define a deployable asset boundary that excludes repository-only files and tool state.
4. Keep local preview output and state outside any watched asset boundary.
5. Keep safe validation or version upload separate from production promotion.

Preserve an existing package manager, framework adapter, output directory, and provider config when
they satisfy these outcomes. Resolve any mismatch with the commands that Samebase will configure
before provider setup. Add only the runtime and deployment dependencies needed for reproducible
builds.

A hosting-only adoption does not justify an application framework, formatter, linter, test runner,
or source-language migration. Keep legacy browser artifacts unchanged unless the deployment contract
requires a source change or the operator asks for modernization.

Common pitfalls are:

1. serving the repository root because there is no generated output
2. adding a copy program when it creates no deployment or compatibility boundary
3. placing preview state inside the watched asset boundary
4. changing the existing missing-route or fallback behavior
5. trusting a green provider check without testing the public route
6. forwarding an unverified flag through a deploy script and starting production by mistake

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
