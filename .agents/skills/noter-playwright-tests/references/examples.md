# Noter Examples

Prefer adapting nearby Noter specs over copying generic examples from the
research bundle.

## Compact Visual Coverage

- `apps/noter/e2e/button-visual.spec.ts`
  - simple state snapshots with minimal ceremony
- `apps/noter/e2e/vault-dashboard-visual.spec.ts`
  - multiple fixture states in one visual file

## Route And Behavior Assertions

- `apps/noter/e2e/public-landing-shell.spec.ts`
  - route-level assertions, navigation timing, clipboard checks, and helper
    functions that stay local to the file
- `apps/noter/e2e/file-view-monaco-drag.spec.ts`
  - mobile drag coverage, CDP touch events, and comments that explain Linux CI
    constraints

## Live Flows

- `apps/noter/e2e/vault-create-app.live.spec.ts`
  - gated live mutation, temporary resource creation, and cleanup in `finally`
- `apps/noter/e2e/liveHelpers.ts`
  - small shared helper for authenticated live runs

## Screenshot Utilities

- `apps/noter/e2e/visualDiff.ts`
  - stable screenshot helpers and richer diff artifact support when plain
    `toHaveScreenshot` output is not enough

## How To Use These

When you need a pattern:

1. Start with the closest existing Noter spec.
2. Copy only the structure that matches your case.
3. Rename helpers and snapshots to match the new surface precisely.
4. Delete any setup that your scenario does not need.
