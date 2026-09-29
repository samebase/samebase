# Migrate an app to Cloudflare Worker Previews

For existing Convex branch previews on Workers Builds.

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
3. Copy the app's Preview deploy key from Convex > **Project Settings > Preview Deploy Keys**. Check
   that you selected the correct project.
4. Under **Builds > Previews Base > Variables and secrets**, replace `CONVEX_DEPLOY_KEY` with that
   key. Cloudflare initially copies the production key here. Save the replacement before pushing the
   preview branch.
5. Keep the production `CONVEX_DEPLOY_KEY` under **Builds > Production**. Keep the existing
   `SAMEBASE_CONVEX_PROJECT` there. Remove `PREVIEW_CONVEX_DEPLOY_KEY` and `SAMEBASE_CONVEX_PROJECT`
   from **Builds > Previews Base**.
6. Push the migration branch and open a PR.

Deploy keys belong in **Builds**, not **Runtime variables and secrets**.

## Verify

1. Check the build log for the app's Convex team and project, with deployment type **Preview**.
   Confirm the Cloudflare build succeeds. Open the preview URL and sign in.
2. Save test data. Build the same branch again. Check that the Convex deployment, data, and login
   session remain unchanged.
3. Verify production after merge.

## Existing previews

Branches with an existing preview keep their saved Builds variables. If a branch still uses an old
key, use a new branch name to copy the current Base settings. Retrying the build or running
`wrangler preview delete` does not reset those variables. A new branch also gets a new Convex
preview.

Samebase's Builds repair and key rotation still use the old setup. Do not run those actions or
remove and reconnect the Worker after switching.
