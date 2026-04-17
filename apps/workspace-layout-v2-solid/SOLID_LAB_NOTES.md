# WorkspaceLayoutV2 Solid Lab Notes

## Purpose

This app is an isolated SolidJS lab for learning `WorkspaceLayoutV2` by
rebuilding the shell behavior without pulling React app chrome, Convex state, or
existing product wrappers into the experiment.

The document is intentionally a living lab contract, not a product spec. It
captures the decisions made while iterating on the Solid implementation so the
editor fixtures reflect the current direction of the lab instead of older
workspace-shell specs. It is the closest durable record of the current branch's
requirements and the decisions established in this conversation.

## Current Goals

1. Learn the shell behavior in SolidJS, not just reproduce the final visuals.
2. Keep the implementation literal and minimal.
3. Prefer real editor surfaces when behavior depends on them.
4. Bias toward mobile shell behavior first.

## Working Rules

1. Keep the lab literal and minimal.
2. Do not add decorative styling, helper chrome, controls, or speculative APIs
   unless the current task needs them.
3. Treat the hand-edited prototype direction as the source of truth for how
   little structure to add.
4. Prefer the smallest working shell over reusable abstractions.

## Current Implementation

### Shell model

1. The lab is now modeled as a pane queue, not named `left | main | right`
   sidebars.
2. The current queue has 4 panes to prove the shell works beyond 3 panes.
3. The shell tracks an active pane index instead of semantic sidebar names.
4. Mobile peeks adjacent panes instead of filling the viewport with only the
   active pane.

### Editor surfaces

1. Panes use real editors, not fake boxes.
2. Pane 0 uses ProseMark.
3. Panes 1 through 3 use Monaco.
4. All panes currently load this document as their inline content fixture.

### Mobile drag behavior

1. Pane changes are swipe-driven.
2. Swipes settle only to adjacent panes.
3. Vertical scrolling should not accidentally trigger pane navigation.
4. Swiping between panes should not focus editors or cause mobile keyboard
   behavior.
5. Pane transitions should animate rather than jump instantly.

### Mobile resizing

1. Resizing is mobile-only for now.
2. Only the active pane width changes.
3. Pane widths are stored per pane, not shared globally.
4. The active pane exposes resize grips on both edges.
5. The visible grip should stay tiny and centered on the pane boundary.
6. The actual drag hit target should stay larger and mostly invisible.

## Interaction Requirements So Far

1. Keep the lab minimal and literal even when the production React version is
   more complex.
2. Use 4 panes as the current proof that the queue model works beyond a 3-pane
   sidebar mental model.
3. Treat panes as replaceable queue entries rather than permanent left and right
   sidebars.
4. Avoid visible create controls for now. The queue-add UX is intentionally
   still unresolved.
5. Keep panes independently scrollable instead of turning the whole route into
   one large scrolling surface.
6. Do not add interior padding or visible editor margins just to make resize
   handles fit.
7. Keep resize affordances visible at the boundary, with a small vivid grip and
   a larger invisible touch target.

## Explicit Non-Goals

1. No desktop resize implementation yet.
2. No create button.
3. No finished queue-plus-empty-slot UX yet.
4. No persistence to Convex or local storage.
5. No attempt to drop existing React production components into this app.

## Future Direction

1. The likely long-term model is a queue where panes are replaceable pieces.
2. New panes would probably only be appendable on the right.
3. A future trailing pane may behave like an implicit add slot rather than a
   visible create button.
4. That future should not be front-loaded into the current implementation until
   the shell mechanics feel right.

## Next Useful Validation

1. Solid-specific Playwright visual coverage for the lab shell.
2. Gesture tests that assert pane swipes do not focus editors.
3. Mobile resize interaction coverage.
