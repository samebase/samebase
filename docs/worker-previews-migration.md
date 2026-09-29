# Migrate an app to Cloudflare Worker Previews

Use this runbook for an app that already uses Workers Builds and Convex branch previews. This
changes the preview deployment model. It does not move production traffic or create a new Convex
project.

New Workers use Worker Previews by default. Existing Workers can still use version uploads and need
the one-time dashboard switch. Do not infer the model from a successful branch build or a preview
URL. Check **Settings > Builds** for **Set up Worker Previews**.

## Prepare one app

1. Record the repository, Worker, Convex project, production branch, and current build commands in
   the migration PR. Record names and links, not secret values.
2. Keep the production deployment unchanged. Use one app and one migration PR before applying the
   change to other apps.
3. Check that repeated builds already preserve the Convex preview and its auth keys. Fix preview
   recreation separately before this migration. Do not combine data loss with a provider switch.
4. Prepare and test the code locally before pushing it. Set the preview build key before a push can
   start the new build script.

## Keep the command interface

Keep the existing package script names. The implementation can change beneath them:

| Workers Builds field | Command                   | Responsibility in this migration                                |
| -------------------- | ------------------------- | --------------------------------------------------------------- |
| Build command        | `pnpm run build`          | Deploy Convex in Workers CI and build the app for that backend. |
| Deploy command       | `pnpm run deploy`         | Deploy the production Worker.                                   |
| Preview command      | `pnpm run deploy:preview` | Deploy the branch with `wrangler preview`.                      |

`build` is not a pure compile step in Workers CI. State this in the app documentation. A local
`pnpm run build` must still build the app without a deployment. Do not replace the dashboard build
command with `build:cloudflare` or put a Worker name in each dashboard command.

For a static-assets app such as ChessMerge:

- Lock a Wrangler version with native Worker Previews support. ChessMerge uses `4.136.2`.
- Change `deploy:preview` from `wrangler versions upload` to `wrangler preview`.
- Add `"previews": {}` to `wrangler.jsonc`. Keep the existing assets and compatibility settings.
- Keep the production `wrangler deploy` path unchanged.

Workers with server code or bindings need their own preview configuration. Do not copy the empty
static-assets configuration into those apps without checking their runtime requirements.

## Use one Convex key name

The build script reads `CONVEX_DEPLOY_KEY` for both production and preview builds. Cloudflare
selects the value through separate build settings. Remove active reads of
`PREVIEW_CONVEX_DEPLOY_KEY`.

For a preview build:

1. Require `WORKERS_CI_BRANCH` and use it as the Convex preview name.
2. Require a project Preview deploy key. With Convex `1.45.0`, this has the form
   `preview:<team>:<project>|<secret>`. Reject a production or deployment-specific key before any
   Convex command. Key presence alone is not enough: that CLI can ignore `--preview-name` when a
   deployment key selects the target.
3. Use `convex deploy --preview-name <branch>`, not `--preview-create`. The project Preview deploy
   key lets this create a missing branch deployment and reuse it on later builds.
4. Give every preview auth environment read and write the same explicit `--preview-name <branch>`.
   Preserve existing `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL`. Create a matching key pair only when
   both key values are absent. Stop on a partial pair or a failed read.

Keep app-specific auth values, build commands, and asset behavior. A template source-build marker
identifies the source of that file, not the version of the whole app. Do not add or advance a marker
unless the file was actually compared with that source.

## Switch the Cloudflare settings

The switch cannot be reversed. Prepare the repository change and required credentials first.

1. Open the existing Worker, then **Settings > Builds > Set up Worker Previews > Set up**.
2. Check the preview runtime variables, secrets, and bindings. A static-assets-only Worker has none.
   The confirmation in the dialog refers to these runtime requirements.
3. Set **New preview command** to `pnpm run deploy:preview`. The dialog initially suggests
   `npx wrangler preview`, but accepts the package script that invokes Wrangler.
4. Select **I have configured my Preview settings**, then **Switch to Worker Previews**.
5. In the **Builds** section, select the new **Previews Base** tab. Check the build command, preview
   command, root directory, and build token. Keep preview branch builds enabled.
6. Replace the preview build `CONVEX_DEPLOY_KEY` with the Convex project's **Preview deploy key**
   and save. The switch can copy the old build variables, including the production key. Do not run
   the migrated build until this replacement is saved.
7. Check the **Production** tab. Its `CONVEX_DEPLOY_KEY` must remain the production deploy key. Keep
   `SAMEBASE_CONVEX_PROJECT` there for project discovery. It is not required in Previews Base.

Use **Settings > Builds > Previews Base > Variables and secrets** for the Convex deploy key. Do not
put it in **Runtime variables and secrets**. The build process needs the key; the running Worker
does not.

Saved secret values are masked and their names are not editable until replacement. Have the operator
enter and save the preview key. Do not put credentials in chat, PR text, screenshots, or terminal
output. Do not rotate production credentials as part of this migration.

## Verify two preview builds

1. Push the reviewed migration branch and confirm that Cloudflare builds that commit.
2. Read the build log. Confirm the Convex branch deployment, `wrangler preview`, and a successful
   final result. A queued build or a GitHub comment alone is not proof.
3. Open the named Worker Preview URL and check that the app uses the expected Convex preview.
4. Create a test record and keep its authenticated browser session. For ChessMerge, create a guest
   challenge and save its link.
5. Run another build of the same branch. Confirm that the Convex deployment is unchanged, the test
   record remains, and the saved session still works. Test a fresh guest session too.
6. Record the two commit or build links and the preview URL in the PR. Keep temporary verification
   results in the PR, not in this runbook.

After approval to merge, verify the production build and public app. Then remove the obsolete
`PREVIEW_CONVEX_DEPLOY_KEY` from both build configurations and the copied `SAMEBASE_CONVEX_PROJECT`
from Previews Base. This is an operator cleanup step, not a compatibility path in the code. Keep the
production project marker. Do not delete Convex previews or test data during this cleanup.

If a preview build rejects a production key, fix the key in **Builds > Previews Base** and retry. Do
not weaken the key check. If a later issue blocks previews, disable preview branch builds while
repairing the configuration. Reverting the PR does not reverse the provider switch.

## Apply the result to other apps

Use the verified app PR and this runbook as the first migration example. Update the template and its
changelog in their own change. For each later app, compare the affected files, preserve its custom
behavior, repeat the provider steps, and verify two builds before proceeding to the next app. A code
PR alone does not migrate Cloudflare settings.

## References

- [Cloudflare: switch existing Workers to Worker Previews](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/#existing-workers-connected-to-builds)
- [Cloudflare: Worker Previews configuration](https://developers.cloudflare.com/workers/previews/configuration/)
- [Convex 1.45.0 preview deployment implementation](https://github.com/get-convex/convex-js/blob/8e20ab9e02baab41969f998122d9b926ec80effd/src/cli/deploy.ts)
- [ChessMerge preview persistence fix](https://github.com/nicu-chiciuc/chessmerge/pull/56)
- [ChessMerge Worker Previews migration](https://github.com/nicu-chiciuc/chessmerge/pull/55)
