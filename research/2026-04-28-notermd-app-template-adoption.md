# notermd/app starter adoption

Date: 2026-04-28

## Decision

Use `notermd/app` as the starter source. For v1, do not copy Git history,
branches, or tags into generated user repos. Export the latest `main` tree at
maintenance/build time into Noter's existing generated starter manifest, then
let the current seeder create one root commit in the user's repo.

The user click path must not fetch `notermd/app` and must not require a
git-capable Convex job.

## Current Click Path

When someone creates an app today:

1. Noter creates an empty GitHub repo with `auto_init: false`.
2. Convex reads `starterSeedManifest.generated.ts`.
3. Noter calls GitHub's Git database REST API to create blobs/tree entries from
   the manifest.
4. Noter creates one root commit with `parents: []`.
5. Noter creates `refs/heads/main` at that commit.
6. Noter records the vault and starts the rest of provisioning.

That is already the right runtime shape for v1.

## New Export Path

`pnpm --filter noter-starter-template run template:export` now:

1. resolves `notermd/app@main` through GitHub REST,
2. downloads the tar archive for that exact commit,
3. extracts the tracked tree to a temporary directory,
4. collects UTF-8 text files into the manifest,
5. stores `sourceRepo`, `sourceBranch`, `sourceCommit`, and `contentHash`,
6. writes and formats `apps/noter/convex/starterSeedManifest.generated.ts`.

For the current export, `sourceCommit` is:

```text
1284e8dc6b41e9316fbe37292caf2316354d7041
```

Because `notermd/app` is private, the exporter needs
`NOTER_TEMPLATE_GITHUB_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, or an authenticated
`gh` CLI session.

## Runtime After This Change

The button click remains the same single-commit seeding flow. The only
difference is that the manifest contents now come from the latest
`notermd/app@main` export instead of `apps/noter-starter-template`.

No per-source-commit GitHub calls happen during user repo creation. No fork is
created. No tags or extra branches are copied. The generated app gets one
squashed seed commit.

## Validation

Run:

```bash
pnpm --filter noter-starter-template run template:export
pnpm --filter noter exec vp test run convex/starterSeed.test.ts convex/starterSeedManifest.test.ts
pnpm run typecheck:scripts
pnpm exec vp lint --tsconfig tsconfig.scripts.json apps/noter-starter-template/scripts/export-notermd-app-manifest.ts
```
