# Playwright Visual Testing

## Canonical Environment

Required Playwright screenshot baselines are Linux ARM64 baselines. Native macOS visual runs are
useful for debugging, but they are not authoritative for accepting, rejecting, or creating
screenshot diffs.

Run visual tests inside Docker with the official Playwright Linux image:

```bash
pnpm test:visual:linux
```

The default platform is always `linux/arm64`. That is intentional: local screenshot creation must
not depend on the host CPU, and Linux ARM64 avoids the macOS text-rendering drift that makes
screenshot baselines noisy.

Local Linux visual runs are parallel by default. The wrapper adds `--fully-parallel --workers=4`
unless the command already passes `--fully-parallel` or `--workers` / `-j`.

## Acceptance Command

The canonical local acceptance command for a branch is:

```bash
pnpm test:acceptance
```

That command runs CI checks, the Vite+/Vitest suite, and the Docker Linux Playwright visual suite in
one explicit local pass.

The canonical local acceptance command for Playwright visual coverage alone is the unmodified Linux
wrapper:

```bash
pnpm test:visual:linux
```

Use focused spec runs as the inner development loop, not as proof that the Playwright suite is
green. If a full local run fails, the fix is not done until the full unmodified wrapper passes
again.

Do not substitute PR CI, Testbox shards, `--workers=1`, `--shard`, or
`PLAYWRIGHT_LINUX_FULLY_PARALLEL=0` for this acceptance command. Those shapes are useful diagnostics
when chasing a specific CI or isolation failure, but they are different execution surfaces and must
be reported as such.

## Daily Workflow

Run a focused Linux visual test before trusting a screenshot result:

```bash
pnpm test:visual:linux -- machines-workspace-visual.spec.ts
```

Update snapshots from Linux only when the rendered UI is intentionally changing:

```bash
pnpm test:visual:linux -- --update-snapshots=all machines-workspace-visual.spec.ts
```

The command copies the repo into a temporary Linux workdir inside the container, installs
dependencies there, builds the Noter preview in Linux, and runs Playwright against that
Linux-rendered app. This keeps Linux `node_modules` and build output away from the macOS worktree.

The host wrapper is TypeScript, so it can be invoked from macOS, Linux, or Windows as long as Docker
can bind-mount the repo. The shell script it writes and executes is intentionally container-internal
Linux setup.

Reports are written locally after each run:

```text
.tmp/playwright-linux/playwright-report/index.html
.tmp/playwright-linux/summary.json
.tmp/playwright-linux/test-results/
```

`summary.json` contains the test totals, duration, worker count, failures, and slowest tests from
the Playwright JSON report. Use it for quick triage before opening the full HTML report.

## Useful Overrides

- `PLAYWRIGHT_LINUX_PLATFORM=linux/arm64` is the wrapper default. Do not include it in normal
  commands; use it only when documenting the exact platform or checking that an override path still
  works.
- `PLAYWRIGHT_LINUX_PLATFORM=linux/amd64` runs the x86_64/emulated container. Use it only for
  one-off diagnostics, not for accepted screenshot baselines.
- `PLAYWRIGHT_LINUX_IMAGE=mcr.microsoft.com/playwright:v1.58.2-noble` pins the Playwright browser
  image. Keep this aligned with `@playwright/test`.
- `PLAYWRIGHT_LINUX_OUT=.tmp/playwright-linux` changes the report output directory.
- `PLAYWRIGHT_LINUX_WORKERS=8` runs a higher-concurrency stress diagnostic when the command does not
  pass `--workers` / `-j`. Do not use this as the normal acceptance command.
- `PLAYWRIGHT_LINUX_FULLY_PARALLEL=0` disables the wrapper's default `--fully-parallel` flag.

## When To Use Testbox

Use Blacksmith Testbox for final CI-parity confidence, especially before refreshing a broad set of
snapshots or when local Docker behavior is suspicious. Use local Linux Docker for the fast
day-to-day loop.

The full Playwright suite remains intentionally skipped on pull requests because it is too expensive
to run on every PR. Prefer focused local Linux runs, Testbox verification, and targeted browser
checks instead of enabling the full PR matrix by default. PR Playwright rows marked `skipping` are
not evidence that browser coverage ran.

For a main-CI parity diagnostic from a local machine, run the same shard shape that main uses
instead of the wrapper default 8-worker stress shape:

```bash
pnpm test:visual:linux -- --workers=1 --shard=1/3
pnpm test:visual:linux -- --workers=1 --shard=2/3
pnpm test:visual:linux -- --workers=1 --shard=3/3
```

Passing those shards proves that shard shape only. It does not replace `pnpm test:visual:linux` for
local acceptance unless the exact target is a main-CI-only failure and the full local surface is
known to be irrelevant.

## Suite Maintenance

When adding or repairing Playwright coverage, keep the expensive browser layer for behavior that
needs a browser. Prefer this order:

1. Unit tests for pure route parsing, URL normalization, suggestion generation, and state reducers.
2. One real-route Playwright test for scroll, touch, drag, focus, selection, auth, history, storage,
   and route-shell behavior.
3. Production-component visual fixtures only when the rendered surface itself needs screenshot
   coverage.
4. Full `pnpm test:visual:linux` before calling a Playwright fix complete.

Every spec should survive the wrapper's default full-parallel run. If a test file intentionally
drives shared browser history, focus, or route-shell state in a way that cannot be parallelized,
mark that file serial with `test.describe.configure({ mode: "serial" })` and leave a comment naming
the shared state that requires ordered execution.

## Admin-Only Route Coverage

When browser tests fail after a route is moved behind auth, authenticate the test through the
existing local password account instead of weakening the route policy. The shared helper lives in
`apps/noter/e2e/liveHelpers.ts` as `signInIfNeeded`.

The seeded credentials are defined once in `runtime/localWorktreePasswordAuth.ts`. CI and Linux
Docker bootstrap should seed that account through `apps/noter/convex/devAuth.ts` before Playwright
starts. If a test cannot log in inside Docker or CI, inspect that bootstrap chain first.
