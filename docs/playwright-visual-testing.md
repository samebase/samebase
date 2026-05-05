# Playwright Visual Testing

## Canonical Environment

Required Playwright screenshot baselines are Linux baselines. Native macOS
visual runs are useful for debugging, but they are not authoritative for
accepting or rejecting screenshot diffs.

The current local recommendation is to run visual tests inside Docker with the
official Playwright Linux image:

```bash
pnpm test:visual:linux
```

On Apple Silicon Docker hosts, the default platform is `linux/arm64`. That is
intentional: the OrbStack ARM64 Linux experiment matched the Blacksmith x86_64
Testbox baseline exactly for the machines workspace header while avoiding macOS
text rendering. On x86_64 Docker hosts, the default platform is `linux/amd64`.
If exact Blacksmith CPU architecture is needed from Apple Silicon, run the
slower emulated pass:

```bash
PLAYWRIGHT_LINUX_PLATFORM=linux/amd64 pnpm test:visual:linux
```

## Daily Workflow

Run a focused Linux visual test before trusting a screenshot result:

```bash
pnpm test:visual:linux -- machines-workspace-visual.spec.ts
```

Update snapshots from Linux only when the rendered UI is intentionally changing:

```bash
pnpm test:visual:linux -- --update-snapshots machines-workspace-visual.spec.ts
```

The command copies the repo into a temporary Linux workdir inside the container,
installs dependencies there, builds the Noter preview in Linux, and runs
Playwright against that Linux-rendered app. This keeps Linux `node_modules` and
build output away from the macOS worktree.

Reports are written locally after each run:

```text
.tmp/playwright-linux/playwright-report/index.html
.tmp/playwright-linux/test-results/
```

## Useful Overrides

- `PLAYWRIGHT_LINUX_PLATFORM=linux/amd64` runs the x86_64/emulated container.
- `PLAYWRIGHT_LINUX_PLATFORM=linux/arm64` runs the fast Apple Silicon Linux
  container.
- `PLAYWRIGHT_LINUX_IMAGE=mcr.microsoft.com/playwright:v1.58.2-noble` pins the
  Playwright browser image. Keep this aligned with `@playwright/test`.
- `PLAYWRIGHT_LINUX_OUT=.tmp/playwright-linux` changes the report output
  directory.

## When To Use Testbox

Use Blacksmith Testbox for final CI-parity confidence, especially before
refreshing a broad set of snapshots or when local Docker behavior is suspicious.
Use local Linux Docker for the fast day-to-day loop.

The full Playwright suite remains intentionally skipped on pull requests because
it is too expensive to run on every PR. Prefer focused local Linux runs, Testbox
verification, and targeted browser checks instead of enabling the full PR matrix
by default.
