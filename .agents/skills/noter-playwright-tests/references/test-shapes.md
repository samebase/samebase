# Test Shapes

Choose the smallest shape that still exercises the real regression.

## Visual Snapshot Specs

Use `*-visual.spec.ts` when the main question is "does the shipped surface look
right?"

Good fits:

- static or lightly interactive UI states
- layout, spacing, and overflow regressions
- responsive snapshots for desktop and mobile
- visible states of buttons, cards, panels, and dashboards

Current repo examples:

- `apps/noter/e2e/button-visual.spec.ts`
- `apps/noter/e2e/machines-workspace-visual.spec.ts`
- `apps/noter/e2e/vault-dashboard-visual.spec.ts`

Prefer `expect(...).toHaveScreenshot(...)` with stable screenshot settings.

## Interaction And Regression Specs

Use plain `*.spec.ts` when the main question is "does the behavior still work?"

Good fits:

- touch and drag behavior
- focus, selection, and keyboard interaction
- navigation and query-param behavior
- route-level logic that needs stronger assertions than screenshots

Current repo examples:

- `apps/noter/e2e/file-view-monaco-drag.spec.ts`
- `apps/noter/e2e/public-landing-shell.spec.ts`
- `apps/noter/e2e/vault-last-updated-status.spec.ts`

## Live Specs

Use `.live.spec.ts` only when the test must touch a real running app, real auth
state, or real external side effects.

Good fits:

- signed-in flows against a live local stack
- flows that create temporary external state and then clean it up
- smoke tests that verify real integrations are wired up

Current repo examples:

- `apps/noter/e2e/vault-create-app.live.spec.ts`
- `apps/noter/e2e/machines-workspace.live.spec.ts`

Keep these tests narrow, gate them when they mutate external state, and clean up
created resources in `finally`.

## Route-First Rule

When the bug touches any of these, start on the real route before collapsing to
smaller coverage:

- scroll
- touch or drag
- focus
- selection
- auth wiring
- shell layout ownership

Use a fixture only when it mounts the shipped production surface honestly. Do
not invent fake chrome, wrappers, or spacing just to make the test easier.

## Conventions To Skip

Do not port these conventions from the research bundle into Noter:

- `*_views.ts`
- `*_spec.ts`
- `testDescription.md`
- broad `onX` fixture catalogs
- `.cursor` or `.mdc` rule wiring
