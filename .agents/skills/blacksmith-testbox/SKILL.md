---
name: blacksmith-testbox
description: >
  Use Blacksmith Testboxes to run Noter CI-like commands against local changes
  without pushing every iteration. Use for Playwright, CI parity checks, and
  commands that need the Blacksmith runner environment.
---

# Blacksmith Testbox

Use Testboxes from the repo root only:

```bash
cd "$(git rev-parse --show-toplevel)"
```

The CLI syncs the current repo working tree to the remote Testbox. Running from
a subdirectory can sync the wrong tree shape.

## Warm Up

Start with the Playwright Testbox workflow:

```bash
blacksmith testbox warmup blacksmith-testbox.yml \
  --ref "$(git rev-parse --abbrev-ref HEAD)" \
  --job playwright
```

Save the returned `tbx_...` id for later commands. The remote warmup prepares
the same setup steps as the generated Playwright workflow: checkout, pnpm, Node,
dependencies, Convex bootstrap, preview build, and Chromium install.

## Run Commands

Use `run` for CI-parity commands:

```bash
blacksmith testbox run --id <tbx_id> "PLAYWRIGHT_SKIP_BUILD=1 PLAYWRIGHT_VITE_PORT=43121 pnpm --filter noter exec playwright test -c playwright.config.ts --shard=1/3"
```

The run command syncs tracked and unignored local changes before executing the
command. If dependency manifests change, rerun the relevant install/build steps
inside the Testbox before testing.

## Download Artifacts

Fetch Playwright reports or test results when needed:

```bash
blacksmith testbox download --id <tbx_id> apps/noter/e2e/playwright-report/ ./tmp/testbox-playwright-report/
blacksmith testbox download --id <tbx_id> apps/noter/e2e/test-results/ ./tmp/testbox-test-results/
```

Keep downloaded reports out of commits unless explicitly needed as a durable
artifact.

## Stop

Stop the Testbox when done:

```bash
blacksmith testbox stop --id <tbx_id>
```

Testboxes also shut down automatically after their idle timeout.
