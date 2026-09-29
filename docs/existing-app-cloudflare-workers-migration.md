# Existing App Migration to Cloudflare Workers

## Purpose

Use this runbook to move an existing application from another host to Cloudflare Workers. Keep the
old host available until the new deployment, public hostname, and rollback path pass.

## Decide the Runtime and Toolchain

Inspect the repository before provider changes:

1. Identify the application root, framework, routes, package manager, lock file, and build commands.
2. Find server-rendered pages, API routes, middleware, image transforms, and other server features.
3. Use static assets only when every production route is static.
4. Use the current Cloudflare adapter when the application needs a server runtime.
5. Record the intended package manager, task runner, formatter, linter, test runner, and source
   language before implementation starts.

Do not remove server rendering only to simplify hosting. A lock file proves the current dependency
graph. It does not decide which toolchain the owner wants after the migration.

## Record the Baseline

Record only the facts needed to validate or reverse the migration:

- source commit and public URL
- old host deployment and DNS rollback target
- Cloudflare account, Worker, active version, and deployment
- Convex project and production deployment
- application root and provider build commands
- the Worker identity, production build settings, and Previews Base build settings
- non-secret environment variable names

Do not copy credentials, private data, response bodies, or raw private logs into the record.

## Use Samebase and Provider State

Read the Samebase repository inventory first. Reuse the connected repository, Convex project, and
Worker when their stable identities match. Do not create replacement resources from names alone.

Samebase inventory proves the connected resource identities and workflow state. It does not prove
that a provider build or deployment completed. Use live Cloudflare and Convex reads for terminal
build results, Worker versions, active deployments, public routes, and backend state.

Keep configuration separate from production promotion. Show the exact provider change before a
write, and start production only after branch validation passes.

## Commit the Deployment Contract

Keep these facts in the application repository:

- Worker and framework adapter configuration
- locked runtime and deployment dependencies
- production and preview build and deploy scripts
- local and provider dry-run commands
- generated-file policy
- release and rollback commands

Remove production and preview deploy keys before application-build and upload child processes start.
Commit generated files only when a clean provider build requires them.

## Protect Private Applications

Before public preview or cutover:

1. Prove that an anonymous private request stops before private content renders.
2. Confirm that its redirect or error response contains no private body.
3. Test a valid saved browser session and a rejected saved session.
4. Keep a valid session during a temporary provider failure.
5. Clear credentials and private client state after provider-confirmed rejection.

Use status, headers, and synthetic data for probes. Do not save private response bodies.

## Separate Production and Preview

Use separate Production and Previews Base build settings and credentials:

| Setting       | Production                 | Preview                    |
| ------------- | -------------------------- | -------------------------- |
| Branch        | Default branch only        | Other branches             |
| Deploy result | Active Worker deployment   | Named Worker Preview       |
| Convex target | Production deployment      | Branch preview deployment  |
| Convex secret | Production deploy key only | Project Preview deploy key |

Do not use the word `preview` for all provider states. Name the exact state: branch build, Worker
Preview, Worker Preview URL, or Convex preview deployment.

## Migrate to Worker Previews

Older Samebase apps can have both `CONVEX_DEPLOY_KEY` and `PREVIEW_CONVEX_DEPLOY_KEY` on both
Workers Builds triggers. The new layout uses `CONVEX_DEPLOY_KEY` with a different value in
Production and Previews Base build settings. Worker Previews is a public open beta and the default
for new Workers Builds projects. Existing Workers need the one-time switch below.

Apply the
[starter changelog](../packages/plugin/plugins/samebase/skills/samebase/references/starter-changelog.md)
to each app through a reviewable branch. Use that update path for the rollout so each app tests the
same published migration instructions.

### Prepare the repository change

1. Read the app's `Samebase source build` line and the relevant starter changelog entries.
2. Compare its deployment scripts and runtime settings with the maintained template. Preserve
   app-specific Convex Auth setup, static-asset deployment, and validation steps.
3. Update the Wrangler dependency and lockfile to the supported starter version, currently
   `4.136.2`. Worker Previews requires at least `4.135.0`.
4. Add `previews` to `wrangler.jsonc`. Use `previews: {}` for static-only apps. Add preview-safe
   runtime variables and bindings when the app needs them. Keep assets and compatibility settings at
   the top level. Copy dashboard-generated preview configuration into this block.
5. Keep `pnpm run build`, `pnpm run deploy`, and `pnpm run deploy:preview` as the public interface.
   Use direct `wrangler deploy` and `wrangler preview` where those commands complete the app's
   deployment. Remove only helpers whose sole purpose is to pass the Worker name.
6. Read `CONVEX_DEPLOY_KEY` in the build script. Use `WORKERS_CI_BRANCH` to select the production or
   named Convex preview deployment. Make preview Auth environment commands use the same
   `--preview-name <WORKERS_CI_BRANCH>` as the Convex deploy.
7. Update the app's deployment docs. Run its focused checks, build, and production upload dry run.
8. Push the branch and open a pull request. Record the source update, app commit, and pull-request
   URL. Update `Samebase source build` only when the applicable starter changes are complete, as
   described by the app's `AGENTS.md`.

Wrangler reads `WRANGLER_CI_OVERRIDE_NAME` in Workers Builds. For a local Preview, use
`pnpm run deploy:preview --worker-name <actual-worker-name>`. The `--name` option selects the
Preview name. Worker Previews has no dry-run mode.

### Switch the provider settings

The one-time switch cannot be reversed. Existing Workers retain the previous preview model until the
operator completes this switch. If the Worker already uses Worker Previews, verify the settings
without repeating it.

1. Open **Settings > Builds > Set up Worker Previews** and select **Set up**.
2. Configure the preview runtime settings. Keep runtime secrets outside the repository in Previews
   Base. Base secret changes affect new Previews only, so update active Previews separately when
   needed.
3. Select **Switch to Worker Previews**. Cloudflare replaces the Preview command with
   `npx wrangler preview`.
4. Restore `pnpm run deploy:preview` as the Preview command. Verify `pnpm run build` on both build
   configurations and `pnpm run deploy` on Production. Enable Preview builds for non-production
   branches.
5. Under **Settings > Builds > Production**, verify that `CONVEX_DEPLOY_KEY` holds the production
   key. Keep the readable `SAMEBASE_CONVEX_PROJECT` marker there.
6. Under **Settings > Builds > Previews Base**, set `CONVEX_DEPLOY_KEY` to the project Preview key.
   Replace a copied production key before the first branch build.

Do not put the Convex deploy key under **Runtime variables and secrets**. The build process needs
that key before the Worker runs. Runtime secrets and Builds secrets are separate settings.

### Verify the preview and production

1. Start a branch build and confirm that it uses the reviewed commit.
2. Confirm that Cloudflare creates the named Worker Preview and posts its URL on the pull request.
3. Open the Preview URL and test authentication, routes, and an app data change. Confirm that the
   app uses the branch's Convex deployment and separate data.
4. After approval to merge and deploy, merge the change. Confirm a successful production build and
   repeat the production checks.
5. Record the preview build result, Preview URL, Convex preview target, and production build result
   for that repository. Keep code completion and provider verification as separate statuses.

### Remove the old variables

After both deployments pass, delete `PREVIEW_CONVEX_DEPLOY_KEY` from both build configurations.
Delete `SAMEBASE_CONVEX_PROJECT` from **Builds > Previews Base** if present. Keep the production
marker.

The worker-level Builds settings API updates only named environment variables. It requires an
explicit null entry to delete a variable. Existing apps delete old values as migration work.
Samebase does not delete them during key rotation.

## Validate and Cut Over

Before merge:

1. Run the repository checks, build, dry runs, and safe route tests.
2. Confirm that the provider branch build used the reviewed commit.
3. Confirm the uploaded Worker version receives no production traffic.
4. Test the public branch URL when the application supports one.
5. Test the named browser profile and account that the operator uses.

For cutover:

1. Record the current deployment and DNS rollback facts.
2. Merge only the reviewed commit.
3. Wait for a terminal successful production build.
4. Confirm the expected Worker version is active.
5. Test the Workers URL before the public hostname changes.
6. Move the public hostname and repeat the route and named-session checks.
7. Observe the application for a predefined window with application-specific limits.

Filter telemetry by the exact request URL and status. A broad status group can include unrelated
browser or service-worker traffic.

## Roll Back

If the cutover fails:

1. Restore the old DNS target or known-good Worker version.
2. Restore compatible Convex functions when the backend changed.
3. Repeat the safe route and named-session checks.

Keep the old host until the new host passes its observation window. Remove the old host only in a
later task with its own approval.

## Sources

- [Cloudflare framework guides](https://developers.cloudflare.com/workers/framework-guides/)
- [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Cloudflare Workers Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)
- [Cloudflare Worker Previews setup](https://developers.cloudflare.com/workers/previews/get-started/)
- [Cloudflare Worker Previews configuration](https://developers.cloudflare.com/workers/previews/configuration/)
- [Existing Workers Builds migration](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/#existing-workers-connected-to-builds)
- [Cloudflare Workers versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Convex deployment documentation](https://docs.convex.dev/production/multiple-deployments)
