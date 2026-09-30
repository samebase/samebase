# Migrate to Cloudflare Worker Previews

New Samebase apps use native Worker Previews. For an existing app with the old preview setup, update
the repository before switching Cloudflare. The Cloudflare switch cannot be reversed.

## Prepare the repository

Ask your agent to apply the native Worker Previews starter update to your app. It must preserve your
app's code and check the build before you switch Cloudflare.

The update must:

- Reuse Convex previews with `convex deploy --preview-name <branch>`, not `--preview-create`.
- Use the Wrangler version from the starter. Set `deploy` to `wrangler deploy` and `deploy:preview`
  to `wrangler preview`.
- Add `"previews": {}` to `wrangler.jsonc` and keep `"preview_urls": true`. Apps with runtime
  bindings need preview-safe settings under `previews`. Workers Builds supplies the Worker name.
- Read only `CONVEX_DEPLOY_KEY`. Remove reads of `PREVIEW_CONVEX_DEPLOY_KEY` and the old deploy
  wrapper. Keep `build`, `deploy`, and `deploy:preview`. Local builds must not deploy Convex.
- Preserve preview auth keys. Target auth reads and writes with the same `--preview-name <branch>`.
  Stop auth setup if an environment read fails.

Commit the update on a new branch. Push it only after the Cloudflare switch.

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
6. Push the prepared branch and open a PR.

After step 2, you can ask your agent to rotate the Convex deploy keys through Samebase instead of
copying the key in steps 3 and 4. This sets both keys, updates existing previews, and starts a
production build.

## Verify the migration

1. Check the build log for the app's Convex team and project, with deployment type **Preview**.
   Confirm the Cloudflare build succeeds. Open the preview URL and sign in.
2. Save test data. Build the same branch again. Check that the Convex deployment, data, and login
   session remain unchanged.
3. Verify production after merge.

## Existing previews

Existing branches keep their saved Builds variables. If you changed the key only in Previews Base,
use a new branch name to copy the current Base settings. Retrying the build or deleting the Worker
preview does not reset those variables. A new branch also gets a new Convex preview.
