# Netlify To Cloudflare Workers Migration Inventory

## Document Control

- Status: Read-only research
- Owner: Noter app migration and operator app consolidation
- Created: 2026-05-19
- Source: Chrome read-only pass through the Netlify dashboard for the
  `nicuchiciuc-netlify` team
- Related:
  - `research/2026-05-18-tsx-md-workers-migration.md` in the `tsx_md` repository
  - `specs/001_TSX_MD_TANSTACK_START_MIGRATION_SPEC.md` in the `tsx_md`
    repository
  - `research/2026-05-15-notermd-workers-provisioning-migration.md`
  - `specs/030_MONOREPO_TYPESCRIPT_RUNTIME_AND_PORTABILITY_SPEC.md`

## Prompt

Inventory the remaining Netlify apps before doing any real migration work.

The operator wants to move personal and toy apps into the Noter-supported GitHub
plus Convex plus Cloudflare Workers stack, but the main requirement is to avoid
losing migration knowledge. This pass intentionally did not mutate Netlify,
Cloudflare, GitHub, Convex, DNS, environment variables, or deployed apps.

## Current Finding

The Netlify estate is small enough to migrate manually, but it is varied enough
to justify a written migration playbook. The seven projects fall into four
useful migration classes:

1. Netlify Next.js apps with generated server functions: `ailegis-front`,
   `bristol.tsx.md`.
2. Convex-backed static/SPA apps with `dist` output: `chessmerge.com`,
   `automato.tsx.md`, `weight.tsx.md`.
3. Static/SPA app without visible Convex env: `event-miner`.
4. Legacy static or manually configured app with no visible build settings:
   `iterseg`.

The Convex-backed `dist` apps look like the best first real migration targets
because they already match the Cloudflare Workers Static Assets shape more
closely than the Next.js apps. The Next.js apps are more valuable for learning,
but they should start with a source-code inspection because Netlify is currently
deploying them through a generated `Next.js Server Handler` function.

## Safety Notes

- This pass recorded environment variable names only. Values were not opened or
  copied.
- No deploy settings, domains, DNS records, provider connections, tokens, or app
  code were changed.
- The Forms pages only showed generic Netlify Forms product copy in this pass,
  not evidence of project-specific form handling.
- No deployed Edge Functions were visible in the Netlify dashboard for any
  project.

## Inventory

| Project           | Public URL                          | Repository                            | Runtime | Build                                                                           | Output                      | Domains                                                          | Env names                                                                              |
| ----------------- | ----------------------------------- | ------------------------------------- | ------- | ------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `ailegis-front`   | `https://ailegis-front.netlify.app` | `github.com/nicu-chiciuc/ailegis`     | Next.js | `cd ../.. && turbo build --filter=nextjs-ailegis...` from `apps/nextjs-ailegis` | `apps/nextjs-ailegis/.next` | `ailegis-front.netlify.app`                                      | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_AILEGIS_API_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| `chessmerge.com`  | `https://chessmerge.com`            | `github.com/nicu-chiciuc/chessmerge`  | Not set | `npx convex deploy --cmd 'npm run build'` from `/`                              | `dist`                      | `chessmerge.netlify.app`, `chessmerge.com`, `www.chessmerge.com` | `CONVEX_DEPLOY_KEY`                                                                    |
| `bristol.tsx.md`  | `https://bristol.tsx.md`            | `github.com/nicu-chiciuc/bristol_tsx` | Next.js | `npx convex deploy --cmd "npm run build"` from `/`                              | `.next`                     | `bristol-tsx.netlify.app`, `bristol.tsx.md`                      | `CARA_CARE_API_TOKEN`, `CONVEX_DEPLOY_KEY`, `NEXT_PUBLIC_CONVEX_URL`                   |
| `automato.tsx.md` | `https://automato.tsx.md`           | `github.com/nicu-chiciuc/automato`    | Not set | `npx convex deploy --cmd 'npm run build'` from `/`                              | `dist`                      | `automato-tsx.netlify.app`, `automato.tsx.md`                    | `CONVEX_DEPLOY_KEY`                                                                    |
| `weight.tsx.md`   | `https://weight.tsx.md`             | `github.com/nicu-chiciuc/weight_tsx`  | Not set | `npx convex deploy --cmd 'npm run build'` from `/`                              | `dist`                      | `weight-tsx.netlify.app`, `weight.tsx.md`                        | `CONVEX_DEPLOY_KEY`, `VITE_CONVEX_URL`                                                 |
| `event-miner`     | `https://event-miner.netlify.app`   | `github.com/nicu-chiciuc/event-miner` | Not set | `npm run build` from `/`                                                        | `dist`                      | `event-miner.netlify.app`                                        | None visible                                                                           |
| `iterseg`         | `https://iterseg.netlify.app`       | `github.com/nicu-chiciuc/iterseg`     | Not set | Not set                                                                         | Not set                     | `iterseg.netlify.app`                                            | None visible                                                                           |

## Deploy And Branch Settings

All seven projects use Node.js `22.x` in Netlify.

All seven projects are configured to deploy only the production branch, with
deploy previews enabled for pull requests against the production branch or
branch deploy branches.

Production branches:

- `main`: `ailegis-front`, `chessmerge.com`, `bristol.tsx.md`,
  `automato.tsx.md`, `weight.tsx.md`, `event-miner`
- `master`: `iterseg`

Latest production deploys visible in Netlify:

- `ailegis-front`: `main@63ad40a`, published 2026-02-17,
  `chore: bump next and tailwind`
- `chessmerge.com`: `main@acdbe1d`, published 2026-02-10, `something`
- `bristol.tsx.md`: `main@2328b79`, published 2026-02-03,
  `add claude code local settings`
- `automato.tsx.md`: `main@8da124f`, published 2026-01-12,
  `Refactor WorkflowPanel component for improved code readability and consistency; format function return types and clean up whitespace`
- `weight.tsx.md`: `main@e26a383`, published 2025-12-26, `fix ts error`
- `event-miner`: `main@3ba2ada`, published 2025-12-25, `No deploy message`
- `iterseg`: `master@HEAD`, published 2025-10-02, `No deploy message`

## Function Signals

`ailegis-front`:

- Netlify reports one production function.
- Function shown: `Next.js Server HandlerSystem`.

`bristol.tsx.md`:

- Netlify reports one production function.
- Function shown: `Next.js Server HandlerSystem`.

All other projects:

- No production function list was visible in this dashboard pass.
- A default `netlify/functions` directory appears in the build settings, but
  that alone does not prove deployed functions exist.

## Migration Interpretation

### Straight Workers Static Assets Candidates

`chessmerge.com`, `automato.tsx.md`, and `weight.tsx.md` are probably the
lowest-risk first migrations. They already build to `dist`, use Convex deploy
keys, and do not show Netlify Functions or Edge Functions.

Expected migration work:

- inspect each repository for framework and package manager details
- add or update `wrangler.jsonc`
- add Cloudflare Workers build/deploy scripts
- decide whether the Convex deployment stays as-is or is recreated under Noter
- move deploy-key usage from Netlify env to the Workers build contract
- attach custom domains after a successful Workers production deploy
- record every setting diff before disabling or deleting the Netlify project

### Next.js/Server Function Candidates

`ailegis-front` and `bristol.tsx.md` need more care. Netlify is not just serving
static assets; it is running a generated Next.js server handler.

Expected migration work:

- inspect whether the apps actually need server-side Next.js behavior
- if server behavior is not needed, migrate to a static/SPA or TanStack-style
  Workers app
- if server behavior is needed, evaluate a Workers-compatible Next.js target
  before touching production
- preserve Clerk and API/env contracts for `ailegis-front`
- preserve the Cara Care API token and Convex env contract for `bristol.tsx.md`

### Legacy/Unknown Candidate

`iterseg` needs a source-code pass before any platform plan. Netlify shows no
build command, no publish directory, no env vars, and production branch
`master`.

Expected migration work:

- inspect the repository history and current file layout
- determine whether Netlify is serving a manual/static deploy or an older build
  shape not visible in the current settings panel
- preserve the current public URL behavior before replacing the deploy target

### Plain Static/SPA Candidate

`event-miner` is likely a simple Workers Static Assets migration. It has a
normal `npm run build` and `dist` output with no visible env vars or custom
domains.

## Proposed Next Pass

Before changing any provider settings, inspect the repositories for the three
likely-first apps:

1. `github.com/nicu-chiciuc/weight_tsx`
2. `github.com/nicu-chiciuc/automato`
3. `github.com/nicu-chiciuc/chessmerge`

For each repository, document:

- current framework and package manager
- current Convex deployment naming and env contract
- whether it already has Cloudflare or Wrangler files
- whether the app has app-specific memory such as `AGENTS.md`, skills, or
  migration notes
- exact Netlify-to-Workers file changes required
- whether the custom domain can move immediately or needs a staged DNS cutover

After one migration is completed, extract the repeatable parts into a
`migration-to-noter` skill rather than leaving the process only in this research
document.

## `weight.tsx.md` Source Inspection

Inspected 2026-05-19 from a fresh checkout of
`github.com/nicu-chiciuc/weight_tsx` at `main@e26a383`.

### Source Facts

- App shape: root-level Vite React SPA with Convex Auth and Tailwind.
- Package manager shape: npm project, no tracked lockfile. `.gitignore`
  explicitly ignores `package-lock.json`.
- Current build: `npm run build` runs `tsc -b && vite build` and emits `dist`.
- Current Netlify build command: `npx convex deploy --cmd 'npm run build'`.
- Current Netlify env names: `CONVEX_DEPLOY_KEY`, `VITE_CONVEX_URL`.
- Current custom domain: `weight.tsx.md`.
- Current Netlify subdomain: `weight-tsx.netlify.app`.
- No `wrangler.jsonc`, Cloudflare config, `netlify.toml`, `_redirects`, or
  `_headers` files exist in the repository.
- `vercel.json` still exists only to rewrite all routes to `/index.html`.
- No `AGENTS.md` or app-specific reusable memory exists in the repository.

Baseline commands from the inspection checkout:

```sh
npm install
npm run build
```

`npm run build` passed. The production build emitted:

- `dist/index.html`
- `dist/assets/index-*.css`
- `dist/assets/index-*.js`
- copied public assets including `manifest.json`, `favicon.png`, `sw.js`

`npm run lint` failed before any migration changes:

- `convex/auth.config.ts` is outside the ESLint parser project list.
- `src/App.tsx` has an unnecessary `FormData` assertion.
- `src/App.tsx` has an existing React hook dependency warning for the fallback
  `entries` array.

These are existing quality issues, not Workers migration blockers.

### Migration Risks

The app is a good first Workers migration target because it is already a static
Vite build backed by Convex. There is no visible server runtime to port.

The main migration-specific risk is the PWA layer:

- `public/sw.js` caches source paths such as `/src/main.tsx`, `/src/App.tsx`,
  and `/src/index.css`.
- Those paths are not stable production assets after Vite builds into `dist`.
- `public/manifest.json` and `index.html` reference `/icon.png`, but the repo
  only has `public/favicon.png` and `public/convex.svg`.

The safest first migration should either remove the service worker registration
and stale `public/sw.js`, or replace it with a minimal runtime-safe service
worker that does not precache source files. PWA polish can come after the
provider migration is verified.

### Recommended Code Patch

Keep this as a minimal platform migration, not a full app rewrite.

1. Add `wrangler` as a dev dependency.
2. Stop ignoring `package-lock.json` and commit the lockfile, unless the
   migration intentionally converts the repo to pnpm.
3. Add `wrangler.jsonc` with Workers Static Assets:

   ```jsonc
   {
     "$schema": "./node_modules/wrangler/config-schema.json",
     "compatibility_date": "2026-05-19",
     "preview_urls": true,
     "assets": {
       "directory": "./dist",
       "not_found_handling": "single-page-application",
     },
   }
   ```

   Do not hard-code `name` in `wrangler.jsonc`; the Worker name should come from
   Cloudflare Workers Builds or the local deploy wrapper.

4. Split `package.json` scripts:

   ```json
   {
     "build": "node ./scripts/build-cloudflare.mjs",
     "build:app": "tsc -b && vite build",
     "deploy": "node ./scripts/deploy-cloudflare.mjs deploy",
     "deploy:dry-run": "node ./scripts/deploy-cloudflare.mjs deploy --dry-run",
     "deploy:preview": "node ./scripts/deploy-cloudflare.mjs preview",
     "deploy:preview:dry-run": "node ./scripts/deploy-cloudflare.mjs preview --dry-run"
   }
   ```

5. Add `scripts/build-cloudflare.mjs`:
   - fail if a generic `CONVEX_DEPLOY_KEY` is present in Workers build env
   - read `WORKERS_CI_BRANCH`
   - use `PROD_CONVEX_DEPLOY_KEY` for `main`
   - use `PREVIEW_CONVEX_DEPLOY_KEY` for non-production branches
   - run `npx convex deploy --cmd 'npm run build:app'` with the selected key
   - for local builds with no deploy keys, run `npm run build:app`

6. Add `scripts/deploy-cloudflare.mjs`:
   - read `WRANGLER_CI_OVERRIDE_NAME` in Workers Builds
   - read `CLOUDFLARE_WORKER_NAME` for local deploy checks
   - reject manually passed Wrangler `--name` flags
   - run `npx wrangler deploy --name <worker>` for production
   - run `npx wrangler versions upload --name <worker>` for previews
   - run the Cloudflare build path locally before Wrangler, but skip that extra
     build inside Workers Builds because the dashboard build command already ran

7. Remove `vercel.json`; Workers Static Assets SPA fallback replaces it.
8. Remove or repair the service worker and `/icon.png` references before the
   first Workers smoke test.
9. Add a short `AGENTS.md` to the `weight_tsx` repo with the app contract: Vite
   React SPA, Convex Auth backend, deploys through Cloudflare Workers Static
   Assets, production domain `weight.tsx.md`, and the split Convex deploy-key
   build contract.

### Cloudflare Workers Build Settings

Use these values for the first Workers project:

- Worker name: `weight-tsx`
- Git repository: `github.com/nicu-chiciuc/weight_tsx`
- Production branch: `main`
- Root directory: `/`
- Build command: `npm run build`
- Deploy command: `npm run deploy`
- Non-production branch deploy command: `npm run deploy:preview`
- Build secret: `PROD_CONVEX_DEPLOY_KEY`
- Build secret: `PREVIEW_CONVEX_DEPLOY_KEY`

For the first production migration, preserve the existing Convex production
deployment so existing weight data stays intact. Copy the current production
Netlify `CONVEX_DEPLOY_KEY` value into Cloudflare as `PROD_CONVEX_DEPLOY_KEY`.
Create or choose a separate Convex preview deploy key before enabling
non-production branch builds; otherwise keep non-production Workers builds
disabled until the preview key exists.

Do not add `VITE_CONVEX_URL` manually unless a build proves Convex is not
injecting the correct URL through `convex deploy --cmd`. The current Netlify
build command already relies on `convex deploy --cmd`, and the Workers build
script should preserve that shape.

### Validation Plan

Before changing DNS:

```sh
npm install
npm run build
CLOUDFLARE_WORKER_NAME=weight-tsx npm run deploy:dry-run
CLOUDFLARE_WORKER_NAME=weight-tsx npm run deploy:preview:dry-run
```

After the first Cloudflare production deploy:

- open the `workers.dev` URL
- confirm SPA fallback by refreshing a non-root route, if any route exists
- confirm sign-in/sign-up still works
- add a test weight entry
- confirm the entry appears after reload
- confirm browser console has no service worker install errors
- confirm the app does not point at the wrong Convex deployment

Only after that smoke test should `weight.tsx.md` move from Netlify to
Cloudflare. Keep the Netlify project enabled until the Cloudflare domain is live
and verified.

### External References Checked

- Cloudflare Workers Builds runs a build command followed by a deploy command;
  preview builds use the non-production branch deploy command:
  <https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>
- Workers Builds injects `WORKERS_CI` and `WORKERS_CI_BRANCH` by default:
  <https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#default-variables>
- Workers Static Assets supports SPA fallback through
  `assets.not_found_handling: "single-page-application"`:
  <https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/>

### Cutover Order

1. Land the repository patch on a migration branch.
2. Create the Cloudflare Worker connected to the GitHub repo.
3. Add Cloudflare build secrets.
4. Trigger a production Workers build for `main`.
5. Smoke test the Workers URL.
6. Attach or route `weight.tsx.md` to the Worker.
7. Smoke test `https://weight.tsx.md`.
8. Leave Netlify in place as rollback until the domain has been stable.
9. Record final Worker name, Convex deployment, and domain state in Noter.

### Noter Product Notes

This migration should become a reusable Noter workflow step:

- classify existing Netlify app
- inspect source repo
- generate the Workers config/build wrapper patch
- preserve or create Convex deployment keys
- create Cloudflare Worker
- move domain only after Worker smoke test passes
- store provider identities in the dashboard

`weight.tsx.md` also reinforces the need for Noter to show provider identity
plainly. During and after this migration, the dashboard should surface at least
the GitHub repo, Convex project/deployment, Cloudflare Worker name, production
URL, and custom domain.
