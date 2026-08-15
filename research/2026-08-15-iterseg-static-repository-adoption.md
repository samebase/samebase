# Iterseg Static Repository Adoption

## Document Control

- Status: completed case study
- Date: 2026-08-15
- Repository: [nicu-chiciuc/iterseg](https://github.com/nicu-chiciuc/iterseg)
- Migration: [pull request 1](https://github.com/nicu-chiciuc/iterseg/pull/1)
- Production: [iterseg.pfp.workers.dev](https://iterseg.pfp.workers.dev/)
- Related guidance:
  - [existing application migration](../docs/existing-app-cloudflare-workers-migration.md)
  - `packages/plugin/plugins/samebase/skills/samebase/references/existing-repository-adoption.md`

## Result

Iterseg was an assets-only browser application. It had no database, server code, package manifest,
lock file, framework build, or CI. Samebase connected the repository to a Cloudflare Worker and used
the standard managed commands:

1. `pnpm run build`
2. `pnpm run deploy`
3. `pnpm run deploy:preview`

The source pull request added a pnpm package boundary and a Wrangler deployment manifest. It moved
the files that browsers need into `public/`. It did not add a build program or generate a second
copy of the site. The `build` command only checks the existing JavaScript.

Cloudflare now serves the site. The old Netlify project was removed only after the Cloudflare route
worked and the operator approved the removal.

## Decisions

| Question                                           | Decision                                                           | Reason                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Are the three pnpm commands the Samebase standard? | Yes, for the current Samebase-managed Workers Builds path.         | Samebase writes `build` to both trigger records, `deploy` to production, and `deploy:preview` to preview.                       |
| Does Cloudflare require pnpm?                      | No. Samebase requires this command interface for the managed path. | Cloudflare accepts other package managers, but one Samebase command contract makes similar repositories repeatable.             |
| Does an assets-only app need a real build?         | No.                                                                | A non-deploying validation command is enough when source files are already the deployable files.                                |
| Does it need `build.ts`?                           | No.                                                                | Wrangler can upload the dedicated static directory directly. A copy program would add a second site tree with no product value. |
| Does it need `wrangler.jsonc`?                     | Yes, for this repository-owned deployment contract.                | The file records the static asset directory and keeps deploy behavior out of dashboard-only settings.                           |
| Does local preview need a custom state path?       | No.                                                                | Plain `wrangler dev` works after deployable files are isolated from Wrangler state and repository files.                        |

The pnpm requirement is a Samebase product decision, not a statement about Cloudflare. A mature
repository that intentionally uses another package manager needs an explicit migration decision or
future Samebase support for a different command contract. A repository with no package manager can
adopt pnpm without changing its browser runtime.

## Iterseg Implementation

These exact choices describe iterseg. They are evidence for the general outcomes, not a required
template for every assets-only repository:

1. Confirm that every production route and dependency can run from static files.
2. Move only browser-reachable files into `public/`.
3. Add `package.json`, a pnpm lock file, a Node version pin, a pnpm version pin, and a pinned
   Wrangler development dependency.
4. Make `build` run useful checks and never deploy.
5. Make `preview` run plain `wrangler dev`.
6. Make `deploy` run `wrangler deploy`.
7. Make `deploy:preview` run `wrangler versions upload`.
8. Add dedicated `deploy:dry-run` and `deploy:preview:dry-run` scripts.
9. Commit `wrangler.jsonc` with `assets.directory` set to `./public`.
10. Validate locally, publish a pull request, and verify the provider branch build from that commit.
11. Verify production and preview URLs separately.
12. Remove the old host only after the new route works and the operator approves the removal.

Do not pass a dry-run flag as `pnpm run deploy -- --dry-run`. In this case, Wrangler received the
separator before the flag and performed a real deployment. Run a dedicated dry-run script whose
package definition contains `--dry-run`.

## Evidence From the Migration

### Static directory isolation

Using the repository root as `assets.directory` caused `wrangler dev` to reload repeatedly when
Wrangler wrote local state. An `.assetsignore` file did not make the root a stable deployment
boundary. It also made repository files part of the public-file risk surface.

Moving the browser files to `public/` fixed the reload loop. It also made the deployment set easy to
review. The successful Cloudflare build reported 30 files from `public/`. Repository files such as
`package.json`, the lock file, and `wrangler.jsonc` stayed outside the served directory.

### Build and route proof

A successful provider check did not prove that the application URL worked. After the files moved,
the old Netlify check stayed green while its root route returned 404 because its publish directory
still used the old layout. It also served repository configuration from the repository root.

The reusable validation therefore needs separate proof for:

1. the terminal build result and reviewed commit
2. the application root and a known asset
3. repository-only paths such as `/package.json`, `/pnpm-lock.yaml`, and `/wrangler.jsonc`
4. the production URL and the branch preview URL

### First production deployment

Before the Worker had an active deployment, a successful preview upload produced a public URL that
returned 404. This was the second assets-only adoption where a preview upload completed before its
URL was reachable. The earlier project returned Cloudflare error 1042 instead. One earlier project
made its previews reachable after the first approved production deployment.

This remains observed behavior, not a general Cloudflare requirement. Samebase must keep a preview
in an unverified state until the URL itself responds. It must not start production only to make a
preview reachable without explicit approval.

### Trigger commands and environment variables

Cloudflare stores the production and preview build commands on separate trigger records. During the
adoption, a dashboard edit changed the production trigger command but did not change the preview
trigger command. Recreating the preview trigger reset its deploy command to Cloudflare's default.
Samebase already writes the build and deploy commands to both trigger records, so no product-code
change was necessary.

This observation did not test or show a change to Cloudflare's shared environment-variable UI.
Samebase must continue to write and verify the required variables and secrets on both trigger IDs.

## Samebase Product Knowledge

This case gives Samebase a low-complexity adoption baseline. Future repository work can use an
adoption ladder instead of treating every migration as the same task:

1. assets-only browser repository with no package manifest
2. static framework application with an existing build
3. existing application moved from another host to Cloudflare through Samebase
4. server application that keeps its framework and adds the correct Cloudflare adapter
5. separate framework migration, such as Next.js to TanStack Start, when the product owner wants
   that architecture change

Hosting migration and framework migration are separate decisions. Samebase should not require a
framework rewrite only to connect a repository or move its hosting.

A future repository-readiness feature can detect the first class and prepare a pull request that
makes the required outcomes true. It should show the exact source changes before provider setup,
keep the build non-deploying, isolate the deployable files, and use live URL checks as terminal
evidence. It should not require one directory name, configuration file, or helper script when the
repository's existing toolchain proves the same contract.

## Sources

- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/)
