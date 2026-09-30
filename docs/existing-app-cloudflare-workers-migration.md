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
- production and preview trigger identities
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

To replace the version-upload model below, follow the
[Worker Previews migration steps](https://samebase.com/docs/cloudflare-previews-migration).

Use separate build triggers and credentials:

| Setting       | Production                 | Preview                   |
| ------------- | -------------------------- | ------------------------- |
| Branch        | Default branch only        | Other branches            |
| Deploy result | Active Worker deployment   | Inactive Worker version   |
| Convex target | Production deployment      | Branch preview deployment |
| Convex secret | Production deploy key only | Preview deploy key only   |

Do not use the word `preview` for all provider states. Name the exact state: branch build, Worker
version upload, public version URL, or Convex preview deployment.

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
- [Cloudflare Workers versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Convex deployment documentation](https://docs.convex.dev/production/multiple-deployments)
