# Migrate to Cloudflare Worker Previews

New Samebase apps use native Worker Previews. For an existing app with the old preview setup, update
the repository before switching Cloudflare. The Cloudflare switch cannot be reversed.

## Prepare the repository

Ask your agent to apply the native Worker Previews starter update to your app. It must preserve your
app's code and check the build before you switch Cloudflare.

Use the files from one commit of [the current starter](https://github.com/samebase/base), so the
scripts and their tests match. For an app with the standard build, copy these files unchanged,
including their `Samebase source build` comments:

| File                                                                                                                        | What it does                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`scripts/build-cloudflare.ts`](https://github.com/samebase/base/blob/main/scripts/build-cloudflare.ts)                     | Reads `CONVEX_DEPLOY_KEY` in Workers Builds and reuses the branch's Convex preview. Local builds do not deploy Convex. |
| [`scripts/ensure-convex-auth.ts`](https://github.com/samebase/base/blob/main/scripts/ensure-convex-auth.ts)                 | Reads and writes auth keys on that same Convex preview. Keeps existing keys and stops if a read fails.                 |
| [`scripts/verify-current-branch-head.ts`](https://github.com/samebase/base/blob/main/scripts/verify-current-branch-head.ts) | Stops an older build from publishing after a newer commit was pushed. The build script calls this file.                |

Copy each script's matching `.test.ts` file too. Keep the app's own build steps in `build:app`. If
the app has extra deployment steps, preserve them and explain any script differences in the PR.

Make these changes in `package.json`:

```json
{
  "scripts": {
    "build": "node ./scripts/build-cloudflare.ts",
    "deploy": "wrangler deploy",
    "deploy:preview": "wrangler preview"
  }
}
```

Keep `build:app` as the command that checks and builds the frontend. Use the Wrangler version from
the starter and update the lockfile. These scripts use Vite+ and expect the production branch to be
`main`; preserve the app's toolchain and branch selection if they differ.

In `wrangler.jsonc`, add `"previews": {}` and keep `"preview_urls": true`. Apps with runtime
bindings need separate preview settings under `previews`. Workers Builds supplies the Worker name.

Delete the old `scripts/deploy-cloudflare.ts` wrapper and its tests after updating their callers.
Remove `deploy:preview:dry-run` and all reads of `PREVIEW_CONVEX_DEPLOY_KEY`.

Commit the update on a new branch. Push it only after the Cloudflare switch and key setup below.
Every push to a non-production branch can start a preview build, even before a PR exists.

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
2. Verify production after merge.

If you changed the starter's preview selection or auth logic, also save test data and build the same
branch again. Check that the Convex deployment, data, and login session remain unchanged.

## Existing previews

Existing branches keep their saved Builds variables. If you changed the key only in Previews Base,
use a new branch name to copy the current Base settings. Retrying the build or deleting the Worker
preview does not reset those variables. A new branch also gets a new Convex preview.
