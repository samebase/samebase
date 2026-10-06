# The `cf` CLI and a Vite+ TanStack Start app: the gaps, as of beta.12

Date: 2026-10-06. Status: research. Versions: `cf` 1.0.0-beta.12, `@cloudflare/config` 0.23.0,
Wrangler 4.136.2 in the templates (4.147 checked for the config surface). Context: the Samebase
starter templates (`templates/base`, `templates/base-actions`) and Mail
(`samebase/convex-cloudflare-email-inbox`), all TanStack Start apps built by Vite+ (`vp build`),
deployed by Workers Builds as a Worker with static assets and no Worker code.

This note records why the templates stay on `wrangler.jsonc` for now and what `cf` would need for
them to move. It continues
[Alchemy setup stack and the Wrangler split](./2026-10-05-alchemy-setup-stack-and-wrangler-split.md),
which holds the `cf` direction and the Mail migration. It informs decisions; it does not define
product behavior. It is written so it can be given to the `cf` team as feedback.

## Summary

- For this kind of app, `wrangler.jsonc` is one file: `wrangler deploy` reads the assets directory
  and uploads; `wrangler preview` does the same for a branch and writes the output file that the
  Workers Builds pull request comment reads.
- The same app on `cf` needs four files and one internal interface: `cloudflare.config.ts`,
  `wrangler.config.ts`, a build script that calls Wrangler's bundler delegate, and a preview deploy
  script that writes the output line `cf previews deploy` leaves out. Mail carries all of them.
- Nothing `cf` adds today (typed modes, cross-Worker bindings, account settings) is used by these
  apps. Decision 2026-10-06 (Nicu): the templates stay on `wrangler.jsonc`; Mail stays on `cf` as
  the dogfood; the templates move when the gaps below close.

## What "build" means here

Two steps hide behind the word:

1. The app build. Vite+ runs it (`vp build`, TanStack Start) and writes `dist/client`. Nothing in
   `cf` or Wrangler replaces it.
2. The packaging. Wrangler turns `dist/client` plus the Worker configuration into the upload.
   `wrangler deploy` does it as part of the deploy. `cf` separates it: `cf build` writes a "Build
   Output" folder (`.cloudflare/output/v0/`), and `cf deploy --prebuilt` uploads that folder.

The gaps are all in step 2.

## The gaps

1. **No prebuilt assets directory in the config.** `@cloudflare/config` 0.23.0 `defineWorker` has
   `assets: { htmlHandling, notFoundHandling, ... }` and no `directory`, no `build`, no `command`.
   The directory goes into a second file, `wrangler.config.ts`
   (`defineWranglerConfig({ assetsDirectory: "./dist/client" })`), which `cf` scaffolds itself when
   the project has no `@cloudflare/vite-plugin`. Expected: one file that says where the built assets
   are, as `wrangler.jsonc` `assets.directory` does.
2. **`cf build` and `cf deploy` run the framework build themselves.** Framework detection
   (`autoconfig`) maps TanStack Start to
   `build: { command: "vite build", directory: "dist/client" }`. Vite+ has no `vite` bin, so the
   detected command cannot run, and there is no setting for the project's own build command.
   Expected: a build command setting, or a mode that only packages an existing `dist/client`.
3. **No preview build.** `cf build` has no flag for a preview variant. Mail's `build-worker.ts`
   calls `wrangler/bin/cf-wrangler.js build [--preview]`, Wrangler's delegate, directly. That is an
   internal interface and the first thing to revisit on every `cf` upgrade. Expected:
   `cf build --preview`, or `cf previews deploy` building the preview itself.
4. **`cf previews deploy` writes no output file.** Workers Builds shows the preview URL in the pull
   request comment only from Wrangler's output file (`WRANGLER_OUTPUT_FILE_PATH` or
   `WRANGLER_OUTPUT_FILE_DIRECTORY`, NDJSON entry
   `{ version: 1, type: "preview", worker_name, preview_id, preview_name, preview_slug, preview_urls, deployment_id, deployment_urls, timestamp }`).
   `cf previews deploy` does not write it (`cf` repository,
   `test_bugs/versions-upload-no-json-output.md`), so Mail's `deploy-mail.ts` writes the line
   itself. Expected: the same output file Wrangler writes.
5. **Importing the config can crash a deploy step.** A `cloudflare.config.ts` that fails closed on a
   missing variable under `WORKERS_CI` (Mail: `VITE_CONVEX_SITE_URL`) crashes any script that
   imports it in the deploy step. Mail reads the Worker name from the Build Output
   (`.cloudflare/output/v0/workers/default/worker.config.json`) instead. Expected: a documented way
   to read the Worker name without evaluating the config.
6. **`cf migrate` writes a setting Wrangler rejects.** It wrote `types: { generate: false }` into
   `wrangler.config.ts`; Wrangler 4.136.2 refused it.
7. **Declared secrets and previews.** `cf` refuses a version whose declared `bindings.secret()` the
   Worker, or the preview base configuration, lacks. A secret that exists only in production must be
   declared only for production. Correct behavior, but it needs a sentence in the docs.
8. **Earlier finding, unverified:** whether Workers Builds sets `WRANGLER_CI_OVERRIDE_NAME` for the
   build command and not only for the deploy command. A config that derives the Worker name from the
   environment stops the build if it does not. Mail cannot show it because its default name equals
   its Worker name.

## What works, for completeness

- `cf deploy --prebuilt` uploads the Build Output and Workers Builds records the deployment with
  source `cf_cli`; production works (Mail, version d7b486aa, 2026-10-05).
- `WRANGLER_CI_OVERRIDE_NAME` read in the config lands a preview on the connected Worker.
- `cf previews deploy --prebuilt <name>` takes the positional name as given and returns JSON with
  `preview_urls`; `GET/POST .../workers/{worker}/previews` and `DELETE .../previews/{name}` work
  through the API (`cf previews` has no delete in beta.12).
- The typed config itself: `defineWorker` as a plain object that another file can import for the
  Worker name.

## What would make the templates move

The first four gaps closed: an assets directory and a build command (or a package-only mode) in
`cloudflare.config.ts`, a preview build, and the output file from `cf previews deploy`. With those,
the `cf` layout is one file again and the templates can carry it.

## Sources

- `cf` 1.0.0-beta.12 `dist/autoconfig-*.mjs` (framework table, `wrangler.config.ts` scaffolding) and
  `dist/command-*.mjs` (`--prebuilt`: "Use existing Build Output Specification files without
  building").
- `@cloudflare/config` 0.23.0 `dist/public-*.d.mts` (`assets` options).
- Mail: `apps/mail/scripts/build-worker.ts`, `deploy-mail.ts`, `wrangler.config.ts`,
  `cloudflare.config.ts` in `samebase/convex-cloudflare-email-inbox`.
- The 2026-10-05 research note above, sections "Direction: `cf` and `cloudflare.config.ts`" and
  "Mail on `cf`".
