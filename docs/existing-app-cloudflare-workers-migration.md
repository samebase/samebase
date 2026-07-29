# Existing App Migration to Cloudflare Workers

## Purpose

Use this runbook to move an existing repository from another web host to Cloudflare Workers. It
covers applications that use Convex and are connected to Samebase.

Keep the old host online until the Cloudflare deployment and the public hostname pass all checks.

## Choose the Runtime

Inspect the application before you change provider settings.

1. Identify the framework, package manager, lock file, build command, and current production URL.
2. Search for server-rendered pages, API routes, middleware, image transforms, and incremental
   static regeneration.
3. Use a static Worker only when every production route can be built as static files.
4. Use the current Cloudflare adapter for the framework when the application needs a server runtime.
   For Next.js server rendering, use OpenNext on Workers.
5. Check the adapter support table against the exact framework version. Upgrade the framework only
   when the selected adapter requires it.

Do not convert a server-rendered application to a static export only to make the provider change
easier. That changes application behavior and increases migration risk.

## Record the Baseline

Record this evidence before the first provider write:

- repository and default branch
- source commit
- current public URL and old provider deployment ID
- framework and adapter versions
- current DNS record ID, type, target, and proxy state
- current Convex project and deployment
- current Worker name, stable tag, versions, deployments, routes, and domains
- production and preview build trigger IDs
- non-secret environment variable names for each trigger

Do not copy deploy keys, tokens, private application data, or raw private logs into the record.

## Use Samebase

1. Read the Samebase vault inventory.
2. Reuse the existing vault when the repository is already connected.
3. When no Worker exists, create an empty Worker in Cloudflare without a production route or custom
   domain. Samebase cannot yet create the first Worker for an adopted repository.
4. Discover and attach the exact Convex project and Cloudflare Worker.
5. Compare the discovered repository root with the real application root.
6. Read provider state after each Samebase action.

Samebase inventory proves the attachment state. It does not prove that a provider build or
deployment completed. Use the Cloudflare API or dashboard for the terminal build result, Worker
version, deployment, custom domain, and runtime logs.

Do not use an action that will give both Convex deploy keys to both build triggers. The production
trigger gets only the production key. The preview trigger gets only the preview key.

Current Samebase observation expects both secret names on both triggers. A least-privilege split
therefore reports the Worker-to-Convex build relationship as `incomplete`. Record this state. Do not
use the repair action because it will broaden secret access. Samebase must model the production and
preview trigger secrets separately before it can report this safer layout as configured.

## Build Contract

Commit these parts of the deployment contract:

- Worker configuration with compatibility settings, assets, logs, and trace sampling
- framework adapter configuration
- locked adapter, framework, Wrangler, and package manager versions
- production and preview deploy scripts
- a build script that selects the correct Convex deployment
- a dry-run command for each deploy mode
- a local Worker preview command
- static asset cache headers
- an operator file with release, rollback, and monitoring steps

Remove both Convex deploy keys from the environment before the application build and Worker upload
children start. This prevents a secret from entering the bundle or the upload process.

Some Convex deploy commands run the frontend command before code generation. If the provider build
does not have generated Convex files, commit the generated directory or change the command order
only when the Convex CLI contract permits it.

## Protect Private Server Rendering

For a private application, an unauthenticated server request must stop before a private page
renders. Use the application's supported authentication design.

1. Identify the browser credential, the server validation source, and the invalid-session behavior.
2. Make the validated identity available to private server rendering.
3. When the auth library cannot provide the identity to the server, bridge it with the smallest
   supported session mechanism. An HTTP-only and same-site cookie is one option, not a universal
   requirement.
4. When the design uses a session write endpoint, require a same-origin fetch signal, a matching
   `Origin` host, and the expected content type.
5. Clear a rejected saved credential. Keep a valid saved credential during a temporary provider or
   network failure.
6. Redirect an unauthenticated private route to the sign-in page.
7. Confirm that the redirect response has no private body.
8. Disable public account creation when preview deployments have no safe user bootstrap.

Run a production dependency audit. Fix critical findings before cutover. Record a narrow
classification for each accepted finding.

## Configure Workers Builds

Use two separate Cloudflare build triggers.

| Setting        | Production                 | Preview                                |
| -------------- | -------------------------- | -------------------------------------- |
| Branch         | Default branch only        | All branches except the default branch |
| Build command  | Repository build command   | Repository build command               |
| Deploy command | Production deploy          | Version upload only                    |
| Convex secret  | Production deploy key only | Preview deploy key only                |
| Project marker | Same non-secret marker     | Same non-secret marker                 |

Keep public version preview URLs off when an empty Convex preview deployment has no safe account
bootstrap. A successful branch build can still validate the full build and upload path without
sending traffic to the uploaded version.

## Validate a Branch

Run local checks first:

1. lint
2. type check
3. application and Worker build
4. production upload dry run
5. preview upload dry run
6. local Worker preview route checks
7. production dependency audit

Push a branch and wait for the Cloudflare build to stop. Record:

- source commit
- build ID, start time, stop time, duration, and outcome
- upload size and compressed size
- Worker version ID
- confirmation that the version received no production traffic

Do not merge while any current check fails.

## Cut Over Production

1. Keep the old host and DNS record active.
2. Merge the reviewed branch to the default branch.
3. Wait for the production build to stop with a successful outcome.
4. Confirm the new Worker deployment ID and active version ID.
5. Check the `workers.dev` URL before you change the public hostname.
6. Test the sign-in page, private routes, disabled API routes, unknown routes, and static assets.
7. Attach the existing public hostname as a Workers Custom Domain.
8. Record the Custom Domain ID and the DNS change.
9. Confirm the same route behavior on the public hostname.
10. Open a protected route in the named browser profile that the operator already uses for the
    application. Confirm that a stored valid login stays valid and that a rejected stored login
    clears itself and returns to sign-in.
11. Update the repository homepage only after the public hostname and the existing browser state
    pass.

Use status and headers for private route probes. Do not save a private response body in logs or test
evidence.

## Monitor

Keep full Worker logs for 30 minutes after the hostname change. Keep a small trace sample enabled.
Run the safe route probes every five minutes.

Use a bounded telemetry window for each probe. Filter CPU measurements by the exact
`$workers.event.request.url` and response status. A status-only group can include unrelated browser
or service-worker traffic and give the checked route the wrong CPU result.

Define the latency and CPU thresholds before cutover from the application's measured baseline or
production SLO. The acceptance thresholds are:

- zero Worker exceptions
- zero HTTP 5xx probe responses
- no private body in an unauthenticated redirect
- no Convex authentication or connection error
- no unrecoverable stored browser session
- each warm checked route stays inside the recorded application CPU threshold

Roll back when one Worker exception occurs, the same route returns 5xx after an immediate retry, or
a warm route exceeds the recorded CPU threshold in two consecutive checks. Also roll back when the
named existing browser profile cannot recover from its stored authentication state.

## Roll Back

Record the old DNS target and the last good Worker version before cutover.

1. Detach the Workers Custom Domain.
2. Restore the old DNS record.
3. Confirm that the public hostname serves the old deployment.
4. If application code must also roll back, restore the matching Convex functions before the
   matching Worker version.
5. Run the safe route checks again.

Do not delete the old provider site during the migration. Stop its new builds after the Worker
branch build passes. Delete the old site only in a later, explicit cleanup task.

## Required Evidence

A complete migration record has:

- baseline provider and DNS state
- source commit and pull request
- local command results
- branch build and version
- production build, version, and deployment
- Workers Custom Domain and public URL
- 30-minute monitoring table
- rollback target
- Samebase action trace
- product gaps, their effect, and the safe workaround

## Sources

- [Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [OpenNext Cloudflare guide](https://opennext.js.org/cloudflare/get-started)
- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Convex deploy command](https://docs.convex.dev/cli/reference/deploy)
