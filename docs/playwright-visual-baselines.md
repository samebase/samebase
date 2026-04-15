# Playwright Visual Baselines

This doc explains how Noter's Playwright visual tests work today, why Linux and
Darwin snapshot drift keeps showing up, and how to reproduce or refresh the CI
Linux baselines locally.

## How the visual suite works

- `apps/noter/playwright.config.ts` runs the route and fixture tests under
  `apps/noter/e2e`.
- The suite uses one `chromium` project and stores snapshots next to each spec
  under `*-snapshots/`.
- CI builds the app once with `PLAYWRIGHT=1 pnpm --filter noter build:ci`, then
  runs `playwright test -c playwright.config.ts` against the built preview.
- `.github/workflows/ci.yml` only runs the heavy Playwright shards on `push`, so
  pull requests do not catch Linux-only visual drift by default.

## Why Linux and Darwin keep fighting

The suite still uses a shared snapshot path template:

```ts
snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}";
```

That means any spec using a plain snapshot name such as
`"fileview-monaco-flex-height.png"` shares one golden across every platform.
When a fixture renders differently on Linux and macOS because of font metrics,
scrollbars, layout rounding, or browser text paint, one environment's update can
break the other.

Some specs already avoid this by encoding `process.platform` into the snapshot
name. Use the same pattern for any fixture that does not stay pixel-stable
across Linux and macOS.

Playwright does support `{platform}` in `snapshotPathTemplate`, so a full suite
migration is possible later. That would touch the entire snapshot tree, so this
repo still handles cross-platform fixtures explicitly per spec for now.

## Local workflows

### Fast macOS loop

In a worktree:

```bash
pnpm anon
```

Then from `apps/noter`:

```bash
PLAYWRIGHT_USE_DEV_SERVER=1 \
PLAYWRIGHT_REUSE_EXISTING_SERVER=1 \
PLAYWRIGHT_VITE_PORT=5175 \
pnpm exec playwright test -c playwright.config.ts e2e/file-view-connect-route-visual.spec.ts
```

This is the quickest loop when you are iterating on behavior or Darwin
snapshots.

### Reproduce Linux CI locally

The repo now ships a Docker-backed Node runner that mirrors the CI path without
replacing the host checkout's native `node_modules`.

From the repo root:

```bash
pnpm --dir apps/noter run test:visual:linux -- e2e/file-view-connect-route-visual.spec.ts
```

The script:

- uses `mcr.microsoft.com/playwright:v1.58.2-noble`
- copies the current worktree into an isolated Linux temp workspace
- installs dependencies with a persistent host pnpm store cache
- builds the preview exactly like CI
- runs Playwright against the Linux-rendered output

### Refresh Linux snapshots locally

From the repo root:

```bash
pnpm --dir apps/noter run test:visual:linux:update -- e2e/file-view-connect-route-visual.spec.ts
```

Updated `*-snapshots` files are copied back into the host worktree after the
Linux run finishes.

## Practical rule for new or changed visual tests

- If a fixture is already stable across Linux and macOS, a shared snapshot name
  is fine.
- If the fixture drifts between Linux and macOS, make the snapshot name
  platform-specific with `process.platform` instead of forcing one platform's
  golden onto the other.
- When changing shared layout chrome or visual fixtures, run the Linux local
  target before merging because CI only exercises those shards on `push`.
