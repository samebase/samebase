# Changed Files Loading State Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/editor
- Last updated: 2026-03-26

## Summary

The `Changed Files` view must not render as a blank surface while the compare payload is loading.

When Noter is still fetching the compare target and patch data, the editor surface should show an
explicit loading state that:

- explains that the compare request can take a few seconds,
- clarifies that the app is still waiting on the compare payload,
- shows a live stopwatch so slow loads are obvious.

## Goals

1. Replace the empty compare surface with a clear loading state.
2. Make multi-second compare loads feel intentional instead of broken.
3. Expose elapsed time directly in-product so slow compare requests are easy to spot.

## Non-Goals

- Redesigning the changed-files compare layout.
- Adding cancellation or retry controls in this iteration.
- Changing the compare data contract or GitHub fetch strategy.

## Product Decisions

### 1. When the loading state appears

- Show the loading state whenever the user is in `Changed Files` mode and the compare payload for
  the current request has not resolved yet.
- Show it in both compare-only editor mode and compare-driven review mode.
- Once a compare payload is already visible, background refreshes may keep the current payload on
  screen instead of replacing it with the loading state.

### 2. Loading state content

- Primary label: `Loading changed files`
- Supporting copy should explain that Noter is still loading the compare target and patch data, and
  that this can take a few seconds.
- Include a live stopwatch in the same loading panel.

### 3. Stopwatch behavior

- The stopwatch starts when a fresh compare request replaces the current compare payload with a
  loading state.
- The stopwatch stops when that request resolves successfully, fails, or the user leaves
  `Changed Files` mode.

## Acceptance Criteria

- Entering `Changed Files` shows explanatory loading UI instead of a blank main panel while compare
  data is pending.
- The loading UI includes a live stopwatch.
- The stopwatch resets for each fresh loading cycle and stops when loading finishes.
- Existing loaded compare results remain visible during background refreshes when the app does not
  intentionally clear the compare payload first.
