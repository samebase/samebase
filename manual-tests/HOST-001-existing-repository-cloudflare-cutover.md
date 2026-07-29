# HOST-001: Existing Repository Cloudflare Cutover

## Purpose

Check that an existing private application can move to Cloudflare Workers without exposing private
data or losing a tested rollback path.

## Preconditions

- The repository, Convex project, and Worker are connected to one Samebase vault.
- The old host and its DNS record are active.
- Production and preview builds use separate deploy keys.
- The operator can read Cloudflare builds, versions, deployments, domains, and logs.

## Steps

1. Record the source commit, old deployment, DNS record, Worker versions, and active deployment.
2. Inspect the framework and confirm whether the application needs a server runtime.
3. Run lint, type check, build, both upload dry runs, the local Worker preview, and the production
   dependency audit.
4. Push a branch and wait for the Cloudflare branch build to stop.
5. Confirm that the build passed, created a Worker version, and sent no production traffic to it.
6. Confirm that unauthenticated private routes redirect with no private response body.
7. Merge only after all current checks pass.
8. Wait for the production build to pass and record its build, version, and deployment IDs.
9. Check the safe route set on the `workers.dev` URL.
10. Attach the public hostname as a Workers Custom Domain.
11. Open a protected route in the named existing browser profile. Confirm that a valid saved login
    stays valid, or that a rejected saved login clears itself and returns to sign-in.
12. Check the same safe route set on the public hostname every five minutes for 30 minutes.
13. Confirm that Worker logs contain no exception or HTTP 5xx result.

## Expected Results

1. Samebase inventory identifies the exact repository, Convex project, and Worker.
2. Provider state proves the terminal branch and production build results.
3. The public hostname serves the new Worker after cutover.
4. The old host remains available as a rollback target.
5. No private body, credential, deploy key, or private application data enters test evidence.
6. The 30-minute window has zero Worker exceptions and zero HTTP 5xx probe responses.
7. Existing browser authentication state cannot trap the application on an error screen.

## Evidence

- Cloudflare build, version, deployment, and Custom Domain IDs
- A table of UTC probe times and status codes
- The pull request and merge commit URLs

## Cleanup

- Stop new builds on the old host, but keep its last deployment until a later cleanup task.
- Close temporary browser tabs and local Worker previews.
