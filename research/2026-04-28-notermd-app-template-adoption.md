# notermd/app starter adoption

Date: 2026-04-28

## Decision

Use `notermd/app` as the starter source. For v1, do not copy Git history, branches, or tags into
generated user repos. Export a selected source branch at maintenance/build time into Noter's
existing generated starter manifest, then let the current seeder create one root commit in the
user's repo.

The user click path must not fetch `notermd/app` and must not require a git-capable Convex job.

## Current Click Path

When someone creates an app today:

1. Noter creates an empty GitHub repo with `auto_init: false`.
2. Convex reads `starterSeedManifest.generated.ts`.
3. Noter calls GitHub's Git database REST API to create blobs/tree entries from the manifest.
4. Noter creates one root commit with `parents: []`.
5. Noter creates `refs/heads/main` at that commit.
6. Noter records the vault and starts the rest of provisioning.

That is already the right runtime shape for v1.

## New Export Path

`pnpm run template:export` defaults to `main`. Pass `--branch <branch>` to export another branch:

```bash
pnpm run template:export -- --branch dev
```

The command:

1. resolves the selected `notermd/app` branch through GitHub REST,
2. downloads the tar archive for that exact commit,
3. extracts the tracked tree to a temporary directory,
4. stores UTF-8 text files directly and binary files as base64 blobs,
5. stores `sourceRepo`, `sourceBranch`, `sourceCommit`, and `contentHash`,
6. writes and formats `apps/noter/convex/starterSeedManifest.generated.ts`.

For the current `main` export, `sourceCommit` is:

```text
49d0faa1ba17b73138d0a1c4f709c750720b0e9d
```

Because `notermd/app` is private, the exporter requires `NOTER_TEMPLATE_GITHUB_TOKEN` in the shell
or CI environment that runs `pnpm run template:export`.

## Runtime After This Change

The button click remains the same single-commit seeding flow. The only difference is that the
manifest contents now come from the latest selected-branch `notermd/app` export. The old
monorepo-local starter app was removed after the PR preview proved the generated `notermd/app`
snapshot creates and deploys successfully.

No source-repo GitHub calls happen during user repo creation. No fork is created. No tags or extra
branches are copied. Text files go straight into the tree request; binary files use GitHub blob
creation and are included in the same squashed seed commit.

## Validation

Run:

```bash
pnpm run template:export -- --branch dev
pnpm --filter noter exec vp test run convex/starterSeed.test.ts convex/starterSeedManifest.test.ts
pnpm run typecheck:scripts
pnpm exec vp lint --tsconfig tsconfig.scripts.json scripts/export-notermd-app-manifest.ts
```
