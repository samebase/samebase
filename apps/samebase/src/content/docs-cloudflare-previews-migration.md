# Migrate to Cloudflare Worker Previews

New Samebase apps use native Worker Previews. For an existing app with the old preview setup, update
the repository before switching Cloudflare. The Cloudflare switch cannot be reversed.

## Prepare the repository

1. Reuse Convex previews with `convex deploy --preview-name <branch>`, not `--preview-create`.
2. Pin Wrangler `4.136.2`. Set `deploy` to `wrangler deploy` and `deploy:preview` to
   `wrangler preview`.
3. Add `"previews": {}` to `wrangler.jsonc` and keep `"preview_urls": true`. Apps with runtime
   bindings need preview-safe settings under `previews`. Workers Builds supplies the Worker name.
4. Read only `CONVEX_DEPLOY_KEY`. Remove reads of `PREVIEW_CONVEX_DEPLOY_KEY` and the old deploy
   wrapper. Keep `build`, `deploy`, and `deploy:preview`. Local builds must not deploy Convex.
5. Preserve preview auth keys. Target auth reads and writes with the same `--preview-name <branch>`.
   Stop auth setup if an environment read fails.

Ask your agent to apply the native Worker Previews starter update to your app. It must preserve your
app's code and check the build before you switch Cloudflare.

## Switch Cloudflare

Deploy keys belong in **Builds > Variables and secrets**, not **Runtime variables and secrets**.
Runtime secrets become Worker bindings and are not available to the build command.

1. Open the Worker > **Settings > Builds > Set up Worker Previews > Set up**.
2. Confirm the preview runtime settings. Set **New preview command** to `pnpm run deploy:preview`,
   then switch. Keep `pnpm run build` and the production deploy command `pnpm run deploy`.
3. Copy the app's Preview deploy key from Convex > **Project Settings > Preview Deploy Keys**. Check
   that you selected the correct project.
4. Under **Builds > Previews Base > Variables and secrets**, replace `CONVEX_DEPLOY_KEY` with that
   key. Cloudflare initially copies the production key here. Save the replacement before pushing the
   preview branch.
5. Keep the production `CONVEX_DEPLOY_KEY` and `SAMEBASE_CONVEX_PROJECT` under **Builds >
   Production**. Remove `PREVIEW_CONVEX_DEPLOY_KEY` from both build environments. Remove
   `SAMEBASE_CONVEX_PROJECT` from **Builds > Previews Base**.
6. Push a new migration branch and open a PR.

Do not add `VITE_CONVEX_URL`. Convex supplies the selected deployment URL to the frontend build
through `convex deploy --cmd`. Adding `"previews": {}` permits native preview deployment but does
not enable preview builds in the dashboard.

## Verify the migration

1. Check the build log for the app's Convex team and project, with deployment type **Preview**.
   Confirm the Cloudflare build succeeds. Open the preview URL and sign in.
2. Save test data. Build the same branch again. Check that the Convex deployment, data, and login
   session remain unchanged.
3. Verify production after merge.

## Existing previews

Existing branches keep their saved Builds variables. After a Base-only key correction, use a new
branch name to copy the current Base settings. Retrying the build or deleting the Worker preview
does not reset those variables. A new branch also gets a new Convex preview.

Switch an existing Worker to native previews before configuring Builds or rotating its Convex deploy
keys in Samebase. Samebase key rotation updates production, Previews Base, and existing preview
keys, so later preview builds do not use a revoked key.

## Build order and local checks

The build script builds the frontend, then deploys Convex. Cloudflare then runs `deploy` or
`deploy:preview` to publish the Worker assets. The script uses `WORKERS_CI_BRANCH` as the stable
Convex preview name.

Concurrent builds can finish out of order. Immediately before Convex pushes functions, the starter
checks the checked-out commit against the remote branch head. A stale build stops without deploying
Convex. This check also applies to production, but the branch can still advance between the check
and the push.

Local builds do not deploy Convex, even when the shell has a deploy key. To build and validate a
Worker package without publishing it, run:

```sh
pnpm run deploy:dry-run --name my-worker
```

Wrangler does not support a native preview dry run. Use a real test branch to verify a preview.
