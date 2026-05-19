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
