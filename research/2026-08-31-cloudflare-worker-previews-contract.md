# Cloudflare Worker Previews Contract

## Status

- Date: 2026-08-31
- Owner: Samebase Cloudflare provisioning and starter app
- Updated: 2026-09-01 after a live dashboard and Wrangler 4.118.0 check.
- Outcome: Use one `CONVEX_DEPLOY_KEY` name in the production and preview Builds scopes. Use Worker
  Previews under the stable `pnpm run deploy:preview` repository command. Let Wrangler own the
  private Preview API.

## Build Secret Contract

The Convex deploy key is a build secret. It must be available to the build command before Wrangler
uploads the Worker. Put the preview key in **Settings > Builds > Previews Base > Variables and
secrets**. Do not put it in **Runtime variables and secrets**.

Cloudflare Workers Builds has one production trigger and one preview trigger. Its documented API
sets build variables on each trigger. Use this layout:

| Builds scope    | Variable                  | Value                             |
| --------------- | ------------------------- | --------------------------------- |
| Production      | `CONVEX_DEPLOY_KEY`       | Convex production deploy key      |
| Production      | `SAMEBASE_CONVEX_PROJECT` | Samebase project marker           |
| Preview trigger | `CONVEX_DEPLOY_KEY`       | Convex project Preview deploy key |

`PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables` is an upsert.
Samebase uses this stable API for current values. It does not delete old values during key rotation.
An app agent removes `PREVIEW_CONVEX_DEPLOY_KEY` and the old preview marker during repository
migration.

The build script still reads `WORKERS_CI_BRANCH`. It uses the branch to choose `convex deploy` for
`main` or `convex deploy --preview-name <branch>` for another branch. It reads only the canonical
key. Each preview Convex Auth environment command receives the same explicit preview name.

The dashboard now exposes these settings under **Settings > Builds**. The **Production** tab owns
the production trigger. The **Previews Base** tab owns the preview trigger, including its build
command, Preview command, token, and variables and secrets. This Builds tab is separate from
**Runtime variables and secrets**.

A fresh import of `samebase/base-preview@4f4899a` inferred `pnpm run build` from the exact
`package.json` script. It defaulted the other fields to `npx wrangler deploy` and
`npx wrangler preview`. It left **Enable Preview builds** off. Samebase must set the two stable
package deploy commands and enable Preview builds.

## Worker Previews Contract

`wrangler preview` creates or updates a named Preview resource. This is different from
`wrangler versions upload`, which creates a Worker version and a Version URL.

Worker Previews is still a private beta. The command is present in Wrangler, but the server checks
account access. Cloudflare has not published an entitlement endpoint or a stable error code for an
account without access. The current Samebase template requires access for branch preview builds.

The starter uses `pnpm run deploy:preview` for `wrangler preview`. It does not keep a separate
Worker Version command.

For Worker Previews, `--name` names the Preview. It does not name the Worker. The Samebase wrapper
passes the Worker through `--worker-name` and lets Wrangler use the Git branch as the Preview name.
Wrangler Preview does not support `--dry-run`.

The project pins Wrangler 4.118.0. Its command help uses `--ignore-defaults` for the option that
skips dashboard Preview settings. This beta surface has changed names during development. Samebase
does not wrap this option.

## Runtime Preview settings

Runtime Preview defaults are separate from **Builds > Previews Base**. A new Preview copies the
runtime defaults when Wrangler creates it. The Preview then owns its copy. A later default change
does not update an existing Preview.

Production variables, secrets, and bindings do not automatically become Preview settings. Add safe
Preview values in the dashboard or in the Wrangler `previews` block. The Wrangler block does not
sync to the dashboard Base. A copied binding can still point to the same production resource, so use
Preview-safe resource identifiers.

Cloudflare's current Wrangler client uses private Preview endpoints under
`/accounts/{account_id}/workers/workers/{worker_name}/previews`. The public Cloudflare OpenAPI
schema does not contain these paths. Current Wrangler source also contains both `preview_defaults`
and `previews_base_config`. Samebase must not create a direct long-term client for this private API.

Samebase continues to use Wrangler for Worker Preview creation and updates.

## Migration

For an existing app:

1. Put the production key under `CONVEX_DEPLOY_KEY` in **Builds > Production**.
2. Put the project Preview key under `CONVEX_DEPLOY_KEY` in **Builds > Previews Base**.
3. Update the repository scripts. Keep `build`, `deploy`, and `deploy:preview` as their stable
   names.
4. Make `deploy:preview` run `wrangler preview --worker-name <connected-worker-name>` through the
   cross-platform adapter.
5. Push the change and verify both build paths.
6. Delete `PREVIEW_CONVEX_DEPLOY_KEY` from both scopes. Delete the preview `SAMEBASE_CONVEX_PROJECT`
   marker.
7. Configure safe runtime values and bindings before sharing a Worker Preview URL.
8. Recreate or edit existing Preview resources when they must receive a later runtime Base change.

## Sources

- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Worker Previews documentation pull request](https://github.com/cloudflare/cloudflare-docs/pull/31775)
- [Draft Worker Previews configuration](https://github.com/cloudflare/cloudflare-docs/blob/c25b0b9df9ae1885a4592f5f51bb9c54217d582a/src/content/docs/workers/previews/configuration.mdx)
- [Wrangler Worker Previews implementation](https://github.com/cloudflare/workers-sdk/tree/f8085545bcaa2c639f171c25e4424685036a0e10/packages/deploy-helpers/src/preview)
- [Wrangler private-beta command](https://github.com/cloudflare/workers-sdk/blob/f8085545bcaa2c639f171c25e4424685036a0e10/packages/wrangler/src/preview/preview.ts#L13-L59)
- [Cloudflare Workers Builds API reference draft](https://github.com/cloudflare/cloudflare-docs/blob/c25b0b9df9ae1885a4592f5f51bb9c54217d582a/src/content/docs/workers/ci-cd/builds/api-reference.mdx#L425-L454)
- [Cloudflare API schema for Builds environment variables](https://github.com/cloudflare/api-schemas/blob/e8065914e20a869686b78529f182c50b4e00ce48/openapi.json)
