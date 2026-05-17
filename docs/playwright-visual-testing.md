# Playwright Visual Testing

## Canonical Environment

Required Playwright screenshot baselines are Linux ARM64 baselines. Native macOS
visual runs are useful for debugging, but they are not authoritative for
accepting, rejecting, or creating screenshot diffs.

Run visual tests inside Docker with the official Playwright Linux image:

```bash
pnpm test:visual:linux
```

The default platform is always `linux/arm64`. That is intentional: local
screenshot creation must not depend on the host CPU, and Linux ARM64 avoids the
macOS text-rendering drift that makes screenshot baselines noisy.

## Daily Workflow

Run a focused Linux visual test before trusting a screenshot result:

```bash
pnpm test:visual:linux -- machines-workspace-visual.spec.ts
```

Update snapshots from Linux only when the rendered UI is intentionally changing:

```bash
pnpm test:visual:linux -- --update-snapshots=all machines-workspace-visual.spec.ts
```

The command copies the repo into a temporary Linux workdir inside the container,
installs dependencies there, builds the Noter preview in Linux, and runs
Playwright against that Linux-rendered app. This keeps Linux `node_modules` and
build output away from the macOS worktree.

The host wrapper is TypeScript, so it can be invoked from macOS, Linux, or
Windows as long as Docker can bind-mount the repo. The shell script it writes
and executes is intentionally container-internal Linux setup.

Reports are written locally after each run:

```text
.tmp/playwright-linux/playwright-report/index.html
.tmp/playwright-linux/test-results/
```

## Useful Overrides

- `PLAYWRIGHT_LINUX_PLATFORM=linux/arm64` runs the required Linux ARM64
  container for creating screenshots locally.
- `PLAYWRIGHT_LINUX_PLATFORM=linux/amd64` runs the x86_64/emulated container.
  Use it only for one-off diagnostics, not for accepted screenshot baselines.
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
