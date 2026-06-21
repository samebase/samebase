# samebase/app Artifact Regeneration

`samebase/app` is a public teaching artifact, not the place where the messy design process should
live. Keep regeneration instructions, prompts, and decision notes in the Samebase repo, then
regenerate the artifact repository from those instructions when the target shape is clear.

## Core Idea

The artifact history is a curriculum, not a diary.

Each generated commit should teach one stack layer in an order a new user could repeat. Exploratory
work, false starts, and platform research belong in Samebase docs or disposable repos. The public
artifact should look deliberately built.

## Regeneration Rules

- Preserve any existing generated attempt first, usually as `v0`, `v1`, or the next obvious archive
  branch.
- Start the new public history from an orphan branch and create `0: empty commit`.
- Use numbered commit subjects after that, matching the `samebase/app` style: `1. initialize ...`,
  `2. add ...`, and so on.
- Create or update `REPO_HISTORY.md` inside each numbered commit. It is part of the teaching
  artifact, not a report reconstructed at the end.
- Treat the current `samebase/app` final state as the feature-parity source before changing the
  stack. Inventory small visible details, including the QR share block, shadcn primitives, Convex
  todo backend, local workflow, Convex AI files, docs, and logos.
- Do not put regeneration prompt files inside generated artifact repos. Put them here, or in another
  durable Samebase repo document.

## CLI Preference

Prefer CLI commands whenever a clean CLI exists.

For the first step, use Vite+ the same way `samebase/app` does:

```sh
vp create vite:application \
  --directory <target-directory> \
  --agent codex \
  --editor vscode \
  --hooks \
  --no-interactive \
  --verbose
```

Then continue with Vite+ commands where possible:

```sh
vp add ...
vp add -D ...
vp dlx ...
vp exec ...
vp run ...
```

Avoid hand-writing the first Vite+ application shell unless the CLI is broken and the reason is
recorded in `REPO_HISTORY.md`.

The first numbered commit should add `REPO_HISTORY.md` with the exact command that created the first
step. For example:

````md
## 1. initialize vite plus application

```sh
vp create vite:application \
  --directory app-start-workers \
  --agent codex \
  --editor vscode \
  --hooks \
  --no-interactive \
  --verbose
```
````

Prefer exact command blocks over broad prose when a step is created by a CLI. The command in
`REPO_HISTORY.md` should be the command that actually ran.

## TanStack Start Scaffolding

The TanStack Start CLI is useful for research, but it adds too much at once for the teaching
artifact.

If TanStack Start CLI output is useful, create it only in a throwaway directory or branch and
inspect it as reference material. Do not let generator leftovers become part of the artifact history
unless a step intentionally teaches them.

Do not keep files such as:

- `.cta.json`
- `.cursorrules`
- extra demo routes
- devtools/demo components
- adapters or config that the first app does not need

Avoid `vp create` with a TanStack Start template if it introduces confusion between template
package-manager expectations and the Vite+ command surface. For this artifact, start with the simple
Vite+ application and add TanStack Start manually.

### Scaffold Experiment Findings

Direct TanStack CLI is the cleaner research scaffold:

```sh
pnpm dlx @tanstack/cli@latest create <name> \
  --framework react \
  --package-manager pnpm \
  --no-install \
  --no-git \
  --no-examples \
  --no-toolchain \
  --no-intent \
  --target-dir <name> \
  --non-interactive
```

It still creates files and dependencies the artifact usually does not want:

- `.cta.json`
- public PWA/logo files
- TanStack devtools
- testing dependencies
- Vite scripts instead of Vite+ scripts

Converting that scaffold to Vite+ is possible, but it still needs cleanup: remove the generator
receipt and demo assets, replace Vite scripts with `vp` scripts, remove devtools/testing
dependencies if unused, switch `vite` to `npm:@voidzero-dev/vite-plus-core@latest`, add `vite-plus`,
and run `vp build` once before `tsc` can see the generated `src/routeTree.gen.ts`.

The Vite+ TanStack Start path:

```sh
vp create @tanstack/start -- <name> ...
```

is currently heavier for this artifact. It installs dependencies immediately, writes `.cta.json`,
adds `AGENTS.md`, Vite hooks, and editor config, and may add Nitro or other adapter pieces that are
not part of the first app.

So the current preference is:

1. Use `vp create vite:application` for the artifact history.
2. Use direct TanStack CLI only as a disposable reference scaffold.
3. Avoid the Vite+ TanStack Start template for the public artifact until it can produce a smaller
   SPA-only shape.

## Workers Migration Notes

For a Workers version of the artifact:

- Use TanStack Start in SPA mode.
- Keep Convex as the backend.
- Use Cloudflare Workers Static Assets through `wrangler.jsonc`.
- Make `package.json` `build` the Cloudflare dashboard build entrypoint, usually delegating to a
  Cloudflare-specific script while keeping the plain static app build visible as `build:app` or
  similar.
- Keep `wrangler.jsonc` as the deploy contract for the static asset directory, SPA fallback, preview
  URL preference, and local Wrangler deploy/dry-run behavior. Do not hard-code `name` in the
  reusable artifact template.
- Make `package.json` `deploy` and `deploy:preview` repo-owned wrappers around `wrangler deploy` and
  `wrangler versions upload` so the real Worker name can come from Cloudflare's connected-build
  environment or Samebase automation.
- Keep deploy/build helper scripts runnable by plain `node` in Cloudflare's Workers Builds image. If
  those helpers are TypeScript, pin Node 24 with `.node-version` or `NODE_VERSION`; otherwise use
  ESM JavaScript helpers or an explicit TypeScript runner.
- Keep `build.command` out of the reusable `wrangler.jsonc`; Workers Builds has its own dashboard
  `Build command`, and local deploy wrappers can run the build before Wrangler.
- Do not tell users to leave the Cloudflare Workers Git build command empty. Workers Builds has its
  own dashboard build command and currently does not honor Wrangler custom build settings there.
- Keep Convex deploy-key names aligned with Samebase production and Samebase-provisioned generated
  apps: `PROD_CONVEX_DEPLOY_KEY` for `main`, `PREVIEW_CONVEX_DEPLOY_KEY` for non-production
  branches, and no generic `CONVEX_DEPLOY_KEY` in the parent Workers build environment.
- Document Convex deploy-key permissions with the current least-privilege split: production
  `PROD_CONVEX_DEPLOY_KEY` is a production deployment key with exactly `deployment:deploy`,
  `deployment:env:view`, `deployment:env:write`, and `deployment:data:view`; do not add data write,
  function-run, logs, backups, or integrations permissions. Preview `PREVIEW_CONVEX_DEPLOY_KEY` is
  Convex's separate project-level Preview deploy key flow and does not use the production permission
  list.
- Keep Workers request handlers, server functions, and SSR complexity out of the first app unless
  the template truly needs them.

Workers research can happen in disposable repos first. Once the shape is known, regenerate the
artifact history from scratch.

The current Cloudflare Workers Git install trace lives in
`docs/artifacts/samebase-app/cloudflare-workers-install.md`.

## Toolchain Alignment

Treat the generated app artifact and the Samebase app as one shared stack surface. When either side
changes runtime or package-manager versions, update the other side deliberately instead of letting
them drift.

Keep these aligned by default:

- Node version pins such as `.node-version`, `NODE_VERSION`, or CI build image settings.
- Package manager pins such as `packageManager`, pnpm versions, and build image `PNPM_VERSION`
  settings.
- Core deploy tooling such as Wrangler, Convex CLI/runtime packages, Vite+, TanStack Start,
  TypeScript, and React versions when they are part of the shared app/deploy story.

This is a manual invariant for now. Do not introduce an automation script until the migration shape
is stable enough that the check is clearly worth owning.
