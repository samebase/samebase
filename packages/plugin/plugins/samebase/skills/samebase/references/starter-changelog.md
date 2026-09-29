# Samebase starter changelog

Read this only when the user asks to review or apply improvements from a newer Samebase starter to
one or more apps.

This changelog lists starter changes that can be useful to existing apps. It is not a complete
history and does not define update state.

A Samebase starter build identifies the Samebase change that produced a starter snapshot. It is an
origin hint, not the version of the user's app. New apps record this build in the first Git commit
message. Inspect only entries with a higher build number. If that message has no starter build,
inspect all entries.

For a marked file, use its `Samebase source build: v<N>` value as the source for comparison. When
you apply a change from a newer starter build to a marked file, replace that file's line with the
newer build number.

The user owns all app code. Inspect the current app before you use this list. The app code is the
source of truth. Skip an entry when the app already has its result. Apply only changes that are
relevant, and preserve unrelated user changes.

For a review of several apps, compare each repository independently. Do not reuse one app's starter
build or relevance result for another app.

## v2060: Use native Worker Previews and separate build secrets

Cloudflare made Worker Previews public in September 2026. New Workers Builds projects use
`wrangler preview` by default. Existing projects need a separate one-time switch. This replaces
version preview URLs, not the app's production deployment.

Relevant to apps deployed through Workers Builds, including static apps without Convex. Inspect the
package scripts, resolved Wrangler version, config, build/auth helpers, repository default branch,
and provider build settings. A `preview_urls: true` setting does not enable Worker Previews.
Exported repositories must change through their monorepo source, not a separate patch.

### Prepare the repository

1. Keep `build`, `deploy`, and `deploy:preview` as the public command interface. Keep the current
   package manager and monorepo working directory. Upgrade Wrangler to at least `4.135.0` and update
   the lockfile. This starter uses `4.136.2`. Do not bundle unrelated dependency upgrades.
2. Make `deploy` run `wrangler deploy` and `deploy:preview` run `wrangler preview`. Wrangler now
   reads the parent Worker name from `WRANGLER_CI_OVERRIDE_NAME` in Workers Builds. Remove a wrapper
   whose only purpose is selecting a key, copying that name, or running `versions upload`. Do not
   add a Worker name to the template or a new name environment variable. For a manual deployment
   without a configured name, use `pnpm run deploy:preview --worker-name <connected-worker-name>`.
   Wrangler `--name` selects the Preview, not the parent Worker.
3. Add a `previews` block to the Wrangler config. Use `"previews": {}` for an asset-only app. Keep
   `assets`, compatibility settings, and production routes at the top level. Runtime `vars` and
   resource bindings are not inherited. If the Worker reads these, define the same binding names
   under `previews`, with test resources and preview-safe values. Do not copy production storage,
   email destinations, or backend URLs. If the app has no isolated resource, report the missing
   setup and keep the live preview switch pending. Runtime secrets belong in Previews Base
   configuration; changes there affect newly created Previews, not existing ones.
4. For Convex apps, read only `CONVEX_DEPLOY_KEY` during a Workers build. Cloudflare supplies the
   production key from Production build settings and the project Preview deploy key from Previews
   Base build settings. Do not read `PREVIEW_CONVEX_DEPLOY_KEY`, keep a fallback, or add a provider
   cleanup path. Keep normal local `build` free of deployment side effects. In Workers Builds,
   deploy the selected backend and build the frontend with the backend URL before deploying
   Cloudflare. Preserve the actual production branch instead of assuming it is `main`.
5. Pass `--preview-name <WORKERS_CI_BRANCH>` to preview Convex environment reads and writes. Keep
   the app's existing `convex deploy --preview-name` or deliberate `--preview-create` behavior.
   Preserve auth, seeding, branch-head checks, custom asset publication, release verification, and
   specialized Worker deployments. A wrapper with those responsibilities still needs its useful
   steps. Replace only its obsolete key selection and version-preview commands or API handling. If a
   removed wrapper also built local assets, preserve that step in `deploy:dry-run` and document the
   build command before a manual deploy. Remove preview dry-run aliases instead of passing an
   unsupported flag to `wrangler preview`. Native previews also reject `--keep-vars` and `--strict`;
   retain those options only on production commands that support them.
6. Update setup docs and the app's existing deployment tests. Update source-build markers only on
   files changed from this starter. Run the affected tests, type checks, normal app build, and a
   production Wrangler dry run when available. Worker Previews has no dry-run mode. A production dry
   run does not prove that preview runtime bindings work.

If required runtime resources are missing, keep the PR draft and label the migration incomplete. Do
not add an empty `previews` block to suppress Wrangler's missing-configuration error. Without the
block, non-interactive Wrangler fails before publication. Interactive Wrangler can offer to import
Base settings after confirmation, so do not use that flow until the isolated resources are known.

### Switch the connected Worker

Prepare the code change first. Switching an existing Worker changes provider state and is
irreversible. Confirm the selected repository, Worker, and account before that step. A pull request
and passing local checks mean code-ready, not provider-ready.

1. Set Production's `CONVEX_DEPLOY_KEY` to the production deploy key. Set Previews Base's same-named
   secret to the project Preview deploy key. These are build secrets, not Worker runtime secrets. In
   the dashboard, use the build variables/secrets for **Production** and **Previews Base** under
   **Settings > Builds**. Do not put deploy keys under **Runtime variables and secrets**. Static
   apps without Convex need neither key.
2. For an existing connection, use **Settings > Builds > Set up Worker Previews**. This one-time
   switch overwrites the preview command with `npx wrangler preview`. Restore the stable commands:
   `pnpm run build`, `pnpm run deploy`, and `pnpm run deploy:preview`. Use `npm run` instead for an
   existing npm app. Keep the app's existing build root. Do not infer completion from a package
   script or from the Preview builds toggle alone.
3. Enable non-production branch builds. Run the migrated branch preview and inspect its URL, runtime
   bindings, frontend backend URL, auth, and app-specific checks. Verify that production is
   unchanged. After the approved production rollout, confirm its build and app checks too.
4. Remove `PREVIEW_CONVEX_DEPLOY_KEY` from both build configurations. Remove
   `SAMEBASE_CONVEX_PROJECT` from Previews Base. Keep that readable project marker in Production
   only. Perform cleanup after the corresponding new build setup is verified, not from application
   code.

For an all-app update, record each repository as update needed, already current, not relevant, or
unavailable. Include the source commit, pull request, checks, and remaining provider steps. Keep
code completion separate from a verified live rollout. Report app-specific cases that the
instructions did not cover so the next agent can use the same procedure.

An app that inspects version preview URLs needs a separate inspector update for native Previews and
their latest deployments. Wrangler 4.136.2 has no Preview list/get command. Use the documented
Workers API with scoped authentication, preserve account and Worker identity checks, and never log
tokens. Keep the inspector incomplete until a populated native Preview response is verified. An
empty-list check does not prove the success path.

Sources: [Samebase change](https://github.com/samebase/samebase/pull/1562),
[Cloudflare launch](https://developers.cloudflare.com/changelog/post/2026-09-22-worker-previews/),
[configuration](https://developers.cloudflare.com/workers/previews/configuration/),
[existing Worker switch](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/#existing-workers-connected-to-builds).

## v1996: Upgrade Convex to 1.45.0

The starter now uses Convex 1.45.0. This release upgrades local deployments in place and adds
service-token generation for the upcoming Convex AI gateway.

Relevant when an app uses an older Convex client. Upgrade `convex` to `^1.45.0`. When the app uses
`convex-test`, upgrade it to 0.0.56 in the same change. Keep unrelated runtime, package manager,
test runner, and lint updates separate.

Run the app's normal checks and verify its preview deployment.

Source:
[samebase/base v1996](https://github.com/samebase/base/commit/166e1c9dd2357ceefd74e6311a48f1b30c4c0327)

## v1983: Use one public-page configuration

The root `prerender.config.ts` file defines the public pages for both TanStack Start and the
Cloudflare redirect generator. This prevents the two page lists from becoming different.

Relevant when the app defines prerendered pages separately in Vite and in a Cloudflare script.

Adapt the existing page definitions into one root configuration. Import it from `vite.config.ts` and
`scripts/generate-cloudflare-redirects.ts`. Preserve the app's routes and output paths. Keep
`/index.html` as the route-neutral SPA shell, and give the prerendered `/` page a different output
file.

Verify the generated redirects, build the app, and directly load each public route and one unknown
route.

Source:
[samebase/base v1983](https://github.com/samebase/base/commit/d22ed3dc279d05ffd91434ed7a5aad01b340df43)

## v1982: Make direct SPA routes hydrate correctly

An explicit TanStack Router catch-all route and canonical prerender redirects make the first client
render match the static SPA shell. This prevents React hydration error 418 on direct unknown URLs.

Relevant when Cloudflare SPA mode serves `/index.html` for unknown routes, or when generated HTML
file URLs can load as separate public URLs.

Add an explicit `src/routes/$.tsx` catch-all route. Redirect each generated HTML file URL to its
canonical route before the exact route-to-file aliases. Keep `/index.html` as the route-neutral SPA
shell. Regenerate the route tree and redirects instead of editing generated files.

Verify that the router matches an unknown path with `/$`. Directly load the canonical public routes
and one unknown route, and confirm that the browser console has no hydration error.

Source:
[samebase/base v1982](https://github.com/samebase/base/commit/7969b12686b42a009cfd70ca0e5af9e1a7ff122f)
