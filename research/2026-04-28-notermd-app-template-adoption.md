# notermd/app starter adoption research

Date: 2026-04-28 Status: Research

## Question

Noter currently keeps starter source in `apps/noter-starter-template`, but the
desired starter source is `https://github.com/notermd/app`.

This research answers:

- how the current local starter is wired into Noter,
- how to test the local starter and the external app locally,
- what should change before `notermd/app` becomes the canonical starter source.

## Current Noter Contract

Accepted behavior currently lives in
`specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md`. Iteration 1 deliberately kept the
starter in `apps/noter-starter-template`, exported it into
`apps/noter/convex/starterSeedManifest.generated.ts`, and seeded new
repositories as one commit.

The runtime path today is:

1. `apps/noter-starter-template/scripts/export-template-manifest.ts` walks the
   local template directory and writes the generated Convex manifest.
2. `apps/noter/convex/starterSeed.ts` turns that manifest into a deterministic
   Git tree and root commit.
3. `apps/noter/convex/vaultActions.ts` creates the GitHub repository, calls the
   starter seeder, then records the vault and schedules Cloudflare/Convex
   provisioning.
4. `apps/noter/convex/codespacesExecutor.ts` also reads `.codespace-agent`
   assets from the same generated manifest.

The good part of this contract is that user repository creation does not depend
on live GitHub reads. The weak part is that the export script currently collects
filesystem state directly, not an explicit source snapshot.

## External App Snapshot

`https://github.com/notermd/app` resolved on 2026-04-28 to:

- `main`: `1284e8dc6b41e9316fbe37292caf2316354d7041`
- visible tag from `ls-remote`: `v2-monorepo-react-tanstack-router`

The repo is materially different from the monorepo starter:

- uses TanStack Router and generated route tree files,
- commits Convex `_generated` files and imports the typed `api`,
- includes Cloudflare build commands,
- includes `pnpm-lock.yaml`,
- uses `pnpm@10.33.0` and newer Vite+ packages,
- includes Convex AI `.agents` skills,
- includes a QR share block and an `/about` route,
- does not include Noter's `.codespace-agent` or `.devcontainer` runtime assets.

The upstream README still references
`https://github.com/noter-md/convex-cloudflare-pages-stack`, so the public setup
copy should be refreshed before this repo is treated as the canonical Noter
starter.

## Local Validation Performed

Before testing in this worktree:

```bash
pnpm anon:once
pnpm anon
```

Local `apps/noter-starter-template` checks:

```bash
pnpm check:starter
pnpm build:starter
pnpm --filter noter exec vp test run convex/starterSeed.test.ts convex/starterSeedManifest.test.ts
CONVEX_AGENT_MODE=anonymous NOTER_DEV_PORT=43123 NOTER_DEV_STRICT_PORT=1 pnpm dev:starter
curl -I http://localhost:43123/
```

Observed result:

- `check:starter` passed.
- `build:starter` passed.
- starter manifest/seeding unit tests passed: 2 files, 7 tests.
- local dev smoke returned `HTTP/1.1 200 OK`.

External `notermd/app` checks from a temporary clone:

```bash
vp install
vp check
vp run build
CONVEX_AGENT_MODE=anonymous vp run dev
curl -I http://localhost:5173/
```

Observed result:

- install passed with `pnpm v10.33.0`,
- `vp check` passed,
- `vp run build` passed,
- anonymous dev smoke returned `HTTP/1.1 200 OK`,
- Convex warned that AI files are out of date.

## Local Starter Testing Gap

Running the local starter dev command generated:

- untracked `apps/noter-starter-template/convex/tsconfig.json`,
- ignored `apps/noter-starter-template/convex/_generated/`.

That is fine as local runtime state, but it is dangerous for template export.
`export-template-manifest.ts` currently excludes only a few hard-coded top-level
directories and filenames. It does not honor `.gitignore`, `git ls-files`, or an
explicit allowlist. If a developer runs `pnpm dev:starter` and then exports, the
generated manifest can accidentally include local Convex generated state.

This should be fixed before adopting `notermd/app`, because the external app
intentionally contains generated Convex files. The exporter needs to know
whether generated files are part of the source contract instead of discovering
them by accident.

## Options

### Runtime fetch from GitHub during vault creation

Do not do this.

It makes repository creation depend on GitHub availability, branch drift,
network latency, and auth/rate-limit behavior at the exact moment a user creates
a project. It also conflicts with the current reliability-first single-manifest
contract.

### GitHub template API as the creation path

This would preserve more of the external repo's template identity, but it does
not solve Noter-specific overlays such as `.codespace-agent` and `.devcontainer`
assets. It also changes the current one-root-commit seeding behavior and would
need a separate decision about whether generated repos should preserve upstream
commit history.

This is a product decision, not the best first implementation step.

### Vendored copy only

Replacing `apps/noter-starter-template` with a manually copied version of
`notermd/app` is simple, but it recreates the current drift problem under a new
source. The next update would again be manual and hard to audit.

### Pinned external source with generated local manifest

Recommended.

Keep `notermd/app` as the canonical authored app, but keep Noter's runtime seed
path pinned and local:

1. Store source metadata in the monorepo: repository URL, source commit, and the
   intended include/exclude contract.
2. Add a refresh script that clones/fetches `notermd/app` at the pinned commit
   into a temporary directory.
3. Copy or materialize the exact source snapshot into the starter snapshot.
4. Overlay Noter-owned runtime assets that are required by the product but not
   owned by the starter app, currently `.codespace-agent` and `.devcontainer`.
5. Export the generated Convex manifest from that deterministic snapshot.
6. Include source metadata and a content hash in the generated manifest.

This keeps vault creation fast and reliable while making the source-of-truth
relationship explicit and reviewable.

## Recommended Implementation Shape

Add a source metadata file, for example:

```json
{
  "sourceRepo": "https://github.com/notermd/app.git",
  "sourceCommit": "1284e8dc6b41e9316fbe37292caf2316354d7041",
  "overlayPaths": [".codespace-agent", ".devcontainer"],
  "excludePaths": [".git", "node_modules", "dist", ".convex"]
}
```

Then split starter maintenance into two explicit commands:

```bash
pnpm --filter noter-starter-template run template:refresh-from-source
pnpm --filter noter-starter-template run template:export
```

`template:refresh-from-source` should be the only command that imports from
GitHub. `template:export` should consume a local deterministic snapshot and
never depend on the network.

The manifest type should grow source metadata:

```ts
type StarterTemplateManifest = {
  version: string;
  sourceRepo: string;
  sourceCommit: string;
  contentHash: string;
  commitMessage: string;
  files: Record<string, string>;
};
```

The source snapshot should make an explicit choice about Convex generated files:

- If using `notermd/app` as-is, include `convex/_generated/**` because the app
  imports the typed `api`.
- If Noter wants generated files excluded, the refresh command must run Convex
  codegen during validation and rewrite the app to avoid depending on generated
  imports. The current local template's `anyApi` approach is one possible model,
  but it would mean diverging from `notermd/app`.

## Recommended Test Contract

Source app validation:

```bash
vp install
vp check
vp run build
CONVEX_AGENT_MODE=anonymous vp run dev
curl -I http://localhost:<vite-port>/
```

Noter snapshot/manifest validation:

```bash
pnpm --filter noter-starter-template run template:refresh-from-source
pnpm --filter noter-starter-template run template:export
pnpm --filter noter exec vp test run convex/starterSeed.test.ts convex/starterSeedManifest.test.ts
pnpm check:starter
pnpm build:starter
```

Product validation before shipping the migration:

1. Create a temporary Noter-managed repository with a name like
   `tmp-<worktree-id>-starter-source`.
2. Confirm the seeded repository contains the pinned `notermd/app` files plus
   required Noter runtime overlays.
3. Confirm the first commit is still exactly one seed commit unless product
   explicitly decides to preserve upstream history.
4. Confirm Cloudflare/Convex provisioning reaches ready state.
5. Confirm Codespace/Daytona startup uses explicit bootstrap assets and the
   preview returns 200.

## Follow-Up Decisions

1. Should created user repositories preserve the pedagogical upstream commit
   history from `notermd/app`, or keep the current one-commit seed contract?
2. Should `.codespace-agent` and `.devcontainer` move upstream into
   `notermd/app`, or remain Noter-owned overlays?
3. Should `notermd/app` be updated to remove stale README references before
   Noter adopts it?
4. Should `notermd/app` update Convex AI files before becoming the pinned
   source?
5. Should the monorepo stay on `pnpm@9` while the starter uses `pnpm@10`, or
   should the snapshot be validated with its own package-manager version only?

## Recommendation

Use `notermd/app` as the canonical authored starter, but do not fetch it during
vault creation. Import it through a pinned, auditable refresh command, overlay
Noter runtime assets, and keep the generated manifest as the only runtime input
for repository seeding.

The first implementation PR should fix export determinism, add source metadata,
and update manifest tests to assert both upstream app files and Noter runtime
overlay files are present.
