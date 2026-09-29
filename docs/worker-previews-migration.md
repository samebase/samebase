# Migrate an app to Cloudflare Worker Previews

For existing Convex branch previews on Workers Builds.

For Samebase-managed apps, do not run deploy-key rotation during this pilot. The current action
writes the production key into both build configurations. Samebase's status checks also expect the
old key layout. A successful preview build does not prove those actions support the new layout.

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
3. Under **Builds > Previews Base > Variables and secrets**, replace `CONVEX_DEPLOY_KEY` with the
   Convex project Preview deploy key. Cloudflare copies the old build variables, including the
   production key. Save the replacement before pushing.
4. Keep the production `CONVEX_DEPLOY_KEY` under **Builds > Production**. Keep the same
   `SAMEBASE_CONVEX_PROJECT` in both build configurations until Samebase's readers and writers
   change.

Deploy keys belong in **Builds**, not **Runtime variables and secrets**.

## Verify

1. Push the branch. Confirm the build succeeds, then open the preview URL and sign in.
2. Save test data. Build the same branch again. Check that the Convex deployment, data, and session
   remain unchanged.
3. Verify production after merge. Remove `PREVIEW_CONVEX_DEPLOY_KEY` only after Samebase's status
   checks and provider actions support the new layout. Do not use key rotation to repair that
   status.
