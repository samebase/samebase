# Migrate an app to Cloudflare Worker Previews

For existing Convex branch previews on Workers Builds.

For apps connected to Samebase, do not run Builds repair or deploy-key rotation during this pilot.
Those actions still use the old trigger model and shared-key layout. Samebase can report native
preview settings as unavailable. Do not remove and reconnect the Worker to repair that status.

## Prepare the repository

1. Reuse Convex previews with `convex deploy --preview-name <branch>`, not `--preview-create`.
2. Pin Wrangler `4.136.2`. Set `deploy:preview` to `wrangler preview`.
3. Add `"previews": {}` to `wrangler.jsonc` and keep `"preview_urls": true`. Apps with runtime
   bindings need preview-safe settings under `previews`.
4. Read only `CONVEX_DEPLOY_KEY`. Remove reads of `PREVIEW_CONVEX_DEPLOY_KEY`. Keep `build`,
   `deploy`, and `deploy:preview`. Local builds must not deploy.
5. Preserve preview auth keys. Target auth reads and writes with the same `--preview-name <branch>`.

## Switch Cloudflare

The switch cannot be reversed.

1. Open the Worker > **Settings > Builds > Set up Worker Previews > Set up**.
2. Confirm the preview runtime settings. Set **New preview command** to `pnpm run deploy:preview`,
   then switch.
3. Open the app's Convex project > **Project Settings > Preview Deploy Keys**. Check the project
   name before copying its Preview deploy key. Do not use another project's key or a production key.
4. Under **Builds > Previews Base > Variables and secrets**, replace `CONVEX_DEPLOY_KEY` with that
   key. Cloudflare copies the old build variables, including the production key. Save the
   replacement before pushing a branch.
5. Keep the production `CONVEX_DEPLOY_KEY` under **Builds > Production**. Keep the existing
   `SAMEBASE_CONVEX_PROJECT` there. Remove `PREVIEW_CONVEX_DEPLOY_KEY` and `SAMEBASE_CONVEX_PROJECT`
   from **Builds > Previews Base**.
6. After saving Previews Base, move the migration changes to a branch with a new name. Open a new PR
   from that branch.

Deploy keys belong in **Builds**, not **Runtime variables and secrets**.

Existing branches keep their copied build variables. Retrying a build or pushing another commit does
not copy the updated Base values. `wrangler preview delete` does not reset the branch's saved Builds
settings. Use a new branch name to copy the current Base settings. To keep an existing branch,
update its own **Settings > Builds > Variables and secrets** instead.

## Verify

1. Check the build log for the app's Convex team and project, with deployment type **Preview**.
   Confirm the Cloudflare build succeeds. Open the preview URL and sign in.
2. Save test data. Build the same branch again. Check that the Convex deployment, data, and login
   session remain unchanged.
3. Verify production after merge. Samebase's status checks and provider actions still need updates
   for this layout. Do not use key rotation to repair that status.

A new branch gets a new Convex preview. It does not copy data or login sessions from the old branch.
