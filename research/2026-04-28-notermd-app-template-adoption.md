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
- includes a QR share block and an `/about` route.

The source repo has authored history, but v1 can intentionally squash the pinned
source tree into one generated commit to match Noter's current starter behavior.

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
- anonymous dev smoke returned `HTTP/1.1 200 OK`.

Pinned archive fetch rehearsal:

```bash
rm -rf /tmp/notermd-app-archive-v1
mkdir -p /tmp/notermd-app-archive-v1/extracted
gh api /repos/notermd/app/tarball/1284e8dc6b41e9316fbe37292caf2316354d7041 > /tmp/notermd-app-archive-v1/source.tar.gz
tar -xzf /tmp/notermd-app-archive-v1/source.tar.gz -C /tmp/notermd-app-archive-v1/extracted --strip-components=1
find /tmp/notermd-app-archive-v1/extracted -type f | sort
```

Observed result:

- the GitHub archive endpoint worked for the private source repo when using an
  authenticated token,
- the archive contained the same 68 tracked files as
  `git ls-tree -r --name-only 1284e8dc6b41e9316fbe37292caf2316354d7041`,
- all files in this pinned source commit are UTF-8 or ASCII text, so the current
  `content: string` manifest representation can support this exact v1 source
  snapshot.

## Current Exporter Mismatch

Running the local starter dev command generated:

- untracked `apps/noter-starter-template/convex/tsconfig.json`,
- ignored `apps/noter-starter-template/convex/_generated/`.

That matters only as evidence that the current local-directory exporter is the
wrong abstraction for the next template source. Adoption should not ask the
local starter exporter to infer which generated files are legitimate. The
standard should simply be the tracked `notermd/app` tree. If
`convex/_generated/**` is tracked there, it is part of the template. If a file
is not tracked in `notermd/app`, it is not part of the template.

## V1 Options

### Live fetch from GitHub during app creation

Do not do this.

Fetching `notermd/app` while the user is waiting on app creation would make
creation depend on source-repo availability, token availability, archive
redirects, and rate limits. It also reintroduces the Convex runtime problem:
creation should not require a git-capable job or a source-repo read.

### Vendored copy only

Replacing `apps/noter-starter-template` with a manually copied version of the
source app is simple, but it makes refreshes hard to audit and easy to drift.

### Build-time archive refresh plus existing single-commit seeder

Recommended.

Use `notermd/app` as the canonical source, but consume it before deployment:

1. Store source metadata in the monorepo: repository URL and source commit.
2. At template-refresh/export time, download the GitHub tar archive for that
   exact commit.
3. Extract the archive, strip GitHub's top-level archive directory, and collect
   tracked files.
4. Generate `apps/noter/convex/starterSeedManifest.generated.ts` from those
   files.
5. Commit the generated manifest in this repo.
6. At click time, keep using the existing GitHub REST `createTree` +
   `createCommit` + `createRef` flow to create exactly one seed commit in the
   user's generated app.

This keeps Convex app creation simple and deterministic. Runtime does not fetch
`notermd/app`; it only reads the already-bundled manifest.

Treat this as template maintenance/export time, not every production build or
Convex deploy. The generated manifest should be committed so normal app creation
does not need a source-repo token.

## Recommended Implementation Shape

Add a source metadata file, for example:

```json
{
  "sourceRepo": "https://github.com/notermd/app.git",
  "sourceCommit": "1284e8dc6b41e9316fbe37292caf2316354d7041"
}
```

Then make the template export command source from GitHub's archive endpoint
instead of walking local starter files:

```bash
pnpm --filter noter-starter-template run template:export
```

`template:export` should:

1. read source metadata,
2. require a GitHub token when the source repo is private,
3. call `GET /repos/notermd/app/tarball/<sourceCommit>`,
4. follow the redirect and download the temporary archive URL,
5. extract files to a temporary directory,
6. fail closed if the archive is empty, truncated, or contains non-file entries
   the manifest cannot represent,
7. fail closed if files are not UTF-8/ASCII text until the manifest format grows
   binary support,
8. write `starterSeedManifest.generated.ts` with the source repo, source commit,
   content hash, commit message, and file map.

The content hash should be derived from the sorted manifest path/content pairs
so tests can compare the generated manifest against a freshly downloaded archive
without relying on GitHub's tarball byte layout.

The v1 manifest can extend the current type like this:

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

The app creation path can remain the current single-commit seeder:

```bash
create repo with auto_init: false
create GitHub tree from manifest files
create one root commit from that tree
create refs/heads/main at that commit
read tree and branch HEAD
record vault and start provisioning
```

No per-source-commit GitHub REST calls are required because v1 intentionally
squashes the source tree into one generated commit.

## Recommended Test Contract

Source app validation:

```bash
vp install
vp check
vp run build
CONVEX_AGENT_MODE=anonymous vp run dev
curl -I http://localhost:<vite-port>/
```

Archive/manifest validation:

```bash
pnpm --filter noter-starter-template run template:export
pnpm --filter noter exec vp test run convex/starterSeed.test.ts convex/starterSeedManifest.test.ts
pnpm --filter noter exec vp test run convex/starterSeedSource.test.ts
```

Product validation before shipping the migration:

1. Create a temporary Noter-managed repository with a name like
   `tmp-<worktree-id>-starter-source`.
2. Confirm the generated repository has exactly one seed commit.
3. Confirm the generated tree matches the pinned `notermd/app` archive file
   list/content hash.
4. Confirm the generated repository is not a GitHub fork and has no copied
   `notermd/app` tags or non-main branches.
5. Confirm Cloudflare/Convex provisioning reaches ready state.
6. Confirm the seeded app preview returns 200.

## Recommendation

Use `notermd/app` as the canonical authored starter source, but for v1 squash
the pinned source tree into the same single generated commit Noter already uses
for starters. Fetch the pinned GitHub archive at template-refresh/export time,
generate and commit the Convex manifest, and keep the button-click app creation
path free of source-repo network calls or git-capable runtime requirements.

The first implementation PR should add source metadata, teach `template:export`
to build the manifest from the pinned `notermd/app` archive, and add
tests/validation that prove the generated manifest and generated app match that
pinned source tree.

## References

- [GitHub download repository archive REST API](https://docs.github.com/en/rest/repos/contents?apiversion=2022-11-28#download-a-repository-archive-tar)
- [GitHub Git trees REST API](https://docs.github.com/en/rest/git/trees)
