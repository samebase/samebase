# Cloudflare Worker Previews Contract

## Status

- Date: 2026-08-31
- Owner: Samebase Cloudflare provisioning and starter app
- Outcome: Use one `CONVEX_DEPLOY_KEY` name in the production and preview Builds scopes. Keep Worker
  Previews as an explicit private-beta option. Let Wrangler own the private Preview API.

## Build Secret Contract

The Convex deploy key is a build secret. It must be available to the build command before Wrangler
uploads the Worker. Do not put this key in the runtime **Variables and secrets > Previews Base**
section.

Cloudflare Workers Builds has one production trigger and one preview trigger. Its documented API
sets build variables on each trigger. Use this layout:

| Builds scope    | Variable                  | Value                             |
| --------------- | ------------------------- | --------------------------------- |
| Production      | `CONVEX_DEPLOY_KEY`       | Convex production deploy key      |
| Production      | `SAMEBASE_CONVEX_PROJECT` | Samebase project marker           |
| Preview trigger | `CONVEX_DEPLOY_KEY`       | Convex project Preview deploy key |
| Preview trigger | `SAMEBASE_CONVEX_PROJECT` | Samebase project marker           |

`PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables` is an upsert. It
does not remove an old variable. Migration must also call
`DELETE /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables/PREVIEW_CONVEX_DEPLOY_KEY`
for each trigger that still has the old name. Both endpoints require Workers Builds Configuration
Edit, which the API schema calls Workers CI Write.

The build script still reads `WORKERS_CI_BRANCH`. It uses the branch to choose `convex deploy` for
`main` or `convex deploy --preview-name <branch>` for another branch. A preview build prefers the
legacy name when it exists, then reads the canonical name. This keeps the old shared dashboard
layout safe while an app migrates.

## Worker Previews Contract

`wrangler preview` creates or updates a named Preview resource. This is different from
`wrangler versions upload`, which creates a Worker version and a Version URL.

Worker Previews is still a private beta. The command is present in Wrangler, but the server checks
account access. Cloudflare has not published an entitlement endpoint or a stable error code for an
account without access. Samebase cannot safely enable this command for every account.

The starter therefore keeps two explicit commands:

- `pnpm run deploy:preview` uses `wrangler versions upload` for the general path.
- `pnpm run deploy:worker-preview` uses `wrangler preview` for an entitled account.

For Worker Previews, `--name` names the Preview. It does not name the Worker. The Samebase wrapper
passes the Worker through `--worker-name` and lets Wrangler use the Git branch as the Preview name.
Wrangler Preview does not support `--dry-run`.

The project pins Wrangler 4.118.0. Its command help uses `--ignore-defaults` for the option that
skips dashboard Preview settings. This beta surface has changed names during development. Samebase
does not wrap this option.

## Runtime Previews Base

Runtime Previews Base is separate from Workers Builds variables. A new Preview copies the dashboard
Base configuration when Wrangler creates it. The Preview then owns its copy. A later Base change
does not update an existing Preview.

Production variables, secrets, and bindings do not automatically become Preview settings. Add safe
Preview values in the dashboard or in the Wrangler `previews` block. The Wrangler block does not
sync to the dashboard Base. A copied binding can still point to the same production resource, so use
Preview-safe resource identifiers.

Cloudflare's current Wrangler client uses private Preview endpoints under
`/accounts/{account_id}/workers/workers/{worker_name}/previews`. The public Cloudflare OpenAPI
schema does not contain these paths. Current Wrangler source also contains both `preview_defaults`
and `previews_base_config`. Samebase must not create a direct long-term client for this private API.

The only new direct API operation in this change is the stable Builds variable `DELETE`. Samebase
continues to use Wrangler for Worker Preview creation and updates.

## Migration

For an existing app:

1. Update `scripts/build-cloudflare.ts` to accept the scoped `CONVEX_DEPLOY_KEY` on preview builds.
   Keep the old `PREVIEW_CONVEX_DEPLOY_KEY` preference during the layout transition so a build
   cannot use the production key before the provider settings change.
2. Put the production key under `CONVEX_DEPLOY_KEY` in the production Builds scope.
3. Put the project Preview key under `CONVEX_DEPLOY_KEY` in the preview Builds scope.
4. Delete `PREVIEW_CONVEX_DEPLOY_KEY` from both scopes.
5. If the account has Worker Previews access, change the Preview command to
   `pnpm run deploy:worker-preview`. Otherwise, keep `pnpm run deploy:preview`.
6. Configure runtime Previews Base values and safe bindings before sharing a Worker Preview URL.
7. Recreate or edit existing Preview resources when they must receive a later Base change.

## Sources

- [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Worker Previews documentation pull request](https://github.com/cloudflare/cloudflare-docs/pull/31775)
- [Draft Worker Previews configuration](https://github.com/cloudflare/cloudflare-docs/blob/c25b0b9df9ae1885a4592f5f51bb9c54217d582a/src/content/docs/workers/previews/configuration.mdx)
- [Wrangler Worker Previews implementation](https://github.com/cloudflare/workers-sdk/tree/f8085545bcaa2c639f171c25e4424685036a0e10/packages/deploy-helpers/src/preview)
- [Wrangler private-beta command](https://github.com/cloudflare/workers-sdk/blob/f8085545bcaa2c639f171c25e4424685036a0e10/packages/wrangler/src/preview/preview.ts#L13-L59)
- [Cloudflare Workers Builds API reference draft](https://github.com/cloudflare/cloudflare-docs/blob/c25b0b9df9ae1885a4592f5f51bb9c54217d582a/src/content/docs/workers/ci-cd/builds/api-reference.mdx#L425-L454)
- [Cloudflare API schema for Builds environment variables](https://github.com/cloudflare/api-schemas/blob/e8065914e20a869686b78529f182c50b4e00ce48/openapi.json)
