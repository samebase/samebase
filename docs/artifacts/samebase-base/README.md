# samebase/base artifact regeneration

`templates/base` is the maintained source for the public `samebase/base` teaching artifact. Routine
changes belong in the template and publish through the repository exporter. Keep major edition
instructions, prompts, and decision notes here.

## Core Idea

The artifact history is a curriculum, not a diary.

Each generated commit should teach one stack layer in an order a new user could repeat. Exploratory
work, false starts, and platform research belong in Samebase docs or disposable repos. The public
artifact should look deliberately built.

## Major Edition Rules

- Use a separate edition branch when a major stack change needs a newly curated teaching sequence.
- Do not rewrite public `main`. It is append-only.
- Use numbered commit subjects after that, matching the `samebase/base` style: `1. initialize ...`,
  `2. add ...`, and so on.
- Create or update `REPO_HISTORY.md` inside each numbered commit. It is part of the teaching
  artifact, not a report reconstructed at the end.
- Treat the current `templates/base` state as the feature-parity source before changing the stack.
  Inventory small visible details, including the QR share block, shadcn primitives, Convex todo
  backend, local workflow, Convex AI files, docs, and logos.
- After the edition is accepted, copy its final tree into `templates/base`. Let the normal publisher
  append that accepted state to public `main`.
- Do not put regeneration prompt files inside generated artifact repos. Put them here, or in another
  durable Samebase repo document.

## CLI Preference

Prefer CLI commands whenever a clean CLI exists.

For the first step, use Vite+ the same way `samebase/base` does:

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
  settings, and local Wrangler deploy/dry-run behavior. Include the required `previews: {}` block
  for static-only apps. Do not hard-code `name` in the reusable artifact template.
- Make `package.json` `deploy` use `wrangler deploy`. Wrangler reads the connected Worker name from
  Cloudflare's build environment.
- Make `package.json` `deploy:preview` run `wrangler preview` directly. Pin a Wrangler release at
  least `4.135.0`, which reads the connected Worker name from Cloudflare's build environment. For
  local use, pass `--worker-name <actual-worker-name>`. Do not add a Worker-name adapter or a
  dry-run command for Worker Previews.
- Keep `build`, `deploy`, and `deploy:preview` as the stable Samebase repository interface. A target
  repository can change the implementation under those names.
- Document Worker Previews as a public open beta and the default model for new Workers Builds
  projects. Existing Workers need the one-time dashboard switch. State that the switch cannot be
  reversed and restores the default command, which must be changed back to
  `pnpm run deploy:preview`.
- Keep preview runtime variables and bindings in the `previews` block. Copy dashboard-generated
  configuration into the file. Keep runtime secrets in Previews Base. A Base secret change affects
  new Previews only.
- Keep repository automation in erasable TypeScript runnable by plain `node` in Cloudflare's Workers
  Builds image, and pin Node 24 with `.node-version` or `NODE_VERSION`.
- Keep the core workflow native on macOS, Linux, and Windows. Do not add Bash scripts, POSIX-only
  inline environment assignment, shell parameter expansion, or required Unix-only utilities. Use
  Node process APIs for environment variables, working directories, and argument arrays, and handle
  Windows `.cmd` entry points explicitly when needed.
- Keep `build.command` out of the reusable `wrangler.jsonc`; Workers Builds has its own dashboard
  `Build command`, and local deploy wrappers can run the build before Wrangler.
- Do not tell users to leave the Cloudflare Workers Git build command empty. Workers Builds has its
  own dashboard build command and currently does not honor Wrangler custom build settings there.
- Explain that the Builds API stores variables per trigger. Samebase-managed production and preview
  triggers use the same `CONVEX_DEPLOY_KEY` name with different values.
- Do not read `PREVIEW_CONVEX_DEPLOY_KEY` in active code. Existing apps remove that variable
  manually after the starter changelog migration passes preview and production checks.
- Samebase automation writes one scoped deploy-key build secret to each Workers Builds trigger. It
  writes the non-secret `SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>`
  marker only to the production trigger. The generated app consumes only the deploy keys. Samebase
  reads the marker from Cloudflare instead of persisting a Worker-to-project relationship.
- Explain that the preview deploy key belongs under **Builds > Previews Base > Variables and
  secrets**. Never place a Convex deploy key in **Runtime variables and secrets**.
- Document Convex deploy-key permissions with the current least-privilege split: production
  `CONVEX_DEPLOY_KEY` is a production deployment key with exactly `deployment:deploy`,
  `deployment:env:view`, `deployment:env:write`, and `deployment:data:view`; do not add data write,
  function-run, logs, backups, or integrations permissions. The preview trigger value is Convex's
  separate project-level Preview deploy key and does not use the production permission list.
- Keep Workers request handlers, server functions, and SSR complexity out of the first app unless
  the template truly needs them.

Workers research can happen in disposable repos first. Once the shape is known, regenerate the
artifact history from scratch.

The current Cloudflare Workers Git install trace lives in
`docs/artifacts/samebase-base/cloudflare-workers-install.md`.

## Toolchain Alignment

Use the current Samebase app as the first comparison baseline, not an unquestioned source. Findings
from a target project or the generated app can justify changing Samebase when they produce a better
shared contract. Never use the generated app alone as proof that a tool choice is current until it
has been compared with Samebase and the target.

Vite+ owns the shared dev, build, test, lint, and format command surface. Use `vp` entrypoints.
Oxlint and Oxfmt are the linter and formatter behind those commands. Do not add a direct ESLint,
Prettier, or Vitest runner when Vite+ carries the required behavior. ESLint-compatible plugins and
`eslint-disable` comments are valid when Oxlint executes and validates them.

Authored application, automation, test, and supported configuration source uses normal `.ts` or
`.tsx`. Treat an authored `.js`, `.mjs`, or `.cjs` file as a review smell. Keep one only when a
named tool or runtime cannot use TypeScript, and document that exact boundary. Do not add a
repository scanner only to enforce this review decision.

Specialized packages can keep product-specific commands when Vite+ cannot replace them. Remotion
Studio, bundle, and render commands are one current exception. Remotion lint and format still use
the root Vite+ contract.

Before implementation, compare Samebase, the generated app, and the target project across this
manager matrix:

- package manager, lock file, and workspace model
- Node version, module type, source language, and import rules
- public package scripts and every CI, provider, documentation, or automation caller
- dev server, bundler, framework, CSS toolchain, and deployment adapter
- linter, formatter, test runner, test projects, type checker, and code generation
- Cloudflare, Convex, GitHub, and other provider commands
- core version pins, including Wrangler, Convex, Vite+, TanStack Start, TypeScript, and React

Classify each difference before implementation. Adopt the Samebase practice, keep a proven target
constraint, investigate the difference, or keep one exact tested exception. Do not start while a
matrix row is unclassified. Run the same comparison again against the final package scripts,
configuration, dependencies, lock file, CI, and provider commands.

This is a manual invariant for now. Do not introduce an automation script until the migration shape
is stable enough that the check is clearly worth owning.
