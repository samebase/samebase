# Authoring Patterns

## One Behavior Per Test

Keep each test focused on one scenario.

- Use arrange, act, assert structure even when you do not spell it out with
  `test.step(...)`
- if a loop re-runs a full scenario with different inputs, split it into
  separate tests
- small loops are fine when they support one scenario instead of hiding many

## Prefer Direct Locators First

Noter's current Playwright suite mostly uses direct locators and small helper
functions, not a large shared Page Object Model tree.

- start with `getByTestId`, `getByRole`, scoped text, or a locator anchored to
  the shipped surface
- keep helper functions local to the spec unless the logic is clearly reused
- extract shared helpers when the interaction is fragile or timing-sensitive,
  such as custom touch drags or sign-in bootstrapping

## Use Assertions For State Changes, Not Ritual

Playwright already performs actionability checks before actions like `click`,
`fill`, `hover`, and `press`.

- do not add redundant `toBeVisible()` assertions immediately before every
  action
- do add explicit assertions when they prove the precondition or postcondition
- add negative assertions when open/closed, selected/unselected, or
  visible/hidden state matters

## Route-Level Bugs Need Honest Coverage

When route ownership matters, cover the route first.

- reproduce the bug on the real page before shrinking it to a fixture
- if you add a fixture, keep it faithful to the shipped component tree
- preserve keyboard, focus, touch, and pane-layout behavior when extracting the
  repro

## Visual Stability

For screenshot tests:

- disable animations
- hide the caret
- prefer CSS scale snapshots
- keep snapshots adjacent to the owning spec through Playwright's default
  snapshot layout

If the failure needs richer artifact analysis, reuse helpers from
`apps/noter/e2e/visualDiff.ts` instead of inventing new image-comparison logic.

## Live-Test Safety

When a live test creates external state:

- use a temporary resource name with the repo's `tmp-<worktree-id>-<intent>`
  convention when relevant
- keep the mutation path in one test project when duplicate runs would be noisy
- clean up in `finally` using the same UI or route operators already use

## Comment The Constraint

When a helper exists because CI or a browser engine is fragile, add a short
comment that explains the constraint being preserved.

`apps/noter/e2e/file-view-monaco-drag.spec.ts` is the model to follow here:
small helpers, explicit pacing, and comments that explain why the code is
structured that way.
