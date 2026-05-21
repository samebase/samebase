# 074 Mobile Swipe Debug Overlay Research

## Status

- Research
- Last updated: 2026-03-30

## Question

What guidance already exists for debugging swipe and snap behavior on the web, and what should Noter
expose in a dev-only overlay so pane-settling decisions are visible instead of feeling mysterious?

This note is specifically about observability for the mobile left/main/right workspace shell, not
about choosing the final production gesture model.

## Current Noter Problem

The workspace mobile shell combines browser scroll snapping with a small amount of app-owned settle
logic. That makes it hard to understand, during a real swipe:

- what the finger actually did
- what the browser thought the snap target should be
- what the app finally settled to
- whether a side-to-side jump came from position, velocity, or a custom rule

When the interaction feels wrong, raw prose such as "it overshot" is not enough to debug it
confidently. We need a visual trace.

## Web Platform Findings

### CSS Scroll Snap is intentionally under-specified

The CSS Scroll Snap spec does not define one universal snap-physics algorithm. Browsers are expected
to honor user intent, minimize surprising jumps, avoid far-off snap points, and still let the user
escape a snap, but the exact settling behavior is left to the user agent.

Implication for Noter:

- if we keep browser-owned scroll snap, we should expect some browser-specific behavior
- a debug overlay should separate browser behavior from app overrides

Sources:

- [CSS Scroll Snap Module Level 1](https://www.w3.org/TR/css-scroll-snap-1/)
- [Well-controlled scrolling with CSS Scroll Snap](https://web.dev/articles/css-scroll-snap)

### `scroll-snap-stop: always` is the main browser-side anti-skip lever

The platform already has one direct control for "do not casually skip past the middle pane":
`scroll-snap-stop: always`.

Implication for Noter:

- this is the right browser-level control when we want the middle pane to be harder to skip
  accidentally
- it is not enough by itself to explain why a given gesture landed where it did

Source:

- [CSS Scroll Snap Module Level 1](https://www.w3.org/TR/css-scroll-snap-1/)

### Scroll snap events are useful for browser-intent debugging

Modern engines expose:

- `scrollsnapchanging`: pending snap target during the gesture
- `scrollsnapchange`: selected snap target after the snap settles

Implication for Noter:

- these events are valuable in a debug overlay because they reveal what the browser already wanted
  before app-owned settle logic intervened

Source:

- [Using scroll snap events](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_snap/Using_scroll_snap_events)

### Pointer Events Level 3 improves gesture sampling fidelity

For high-fidelity input tracing, the web platform now provides:

- `pointerrawupdate`
- `PointerEvent.getCoalescedEvents()`

Those APIs exist because regular `pointermove` delivery can be throttled or coalesced during fast
motion.

Implication for Noter:

- if we ever replace the current scroll-driven shell with a fully app-owned drag model, these APIs
  are the right source for richer gesture telemetry
- for the current shell, touch event sampling is still enough to build a useful debug overlay

Sources:

- [Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/)
- [PointerEvent.getCoalescedEvents()](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents)

### Use monotonic timing

Gesture telemetry should use `performance.now()` or event timestamps, not wall clock time.

Source:

- [Performance.now()](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now)

## Native Guidance Cross-Check

Android guidance consistently treats these as the primary inputs:

- touch slop
- position or travel thresholds
- release velocity
- min/max fling velocity

I did not find official Android guidance that treats acceleration as a primary decision threshold
for drawers or anchored drags.

Implication for Noter:

- acceleration is useful as a debug signal because it helps explain why a swipe felt abrupt or
  gentle
- acceleration should remain an observability metric, not the main settling rule

Sources:

- [Intercept touch events in a ViewGroup](https://developer.android.com/develop/ui/views/touch-and-input/gestures/viewgroup)
- [Track touch and pointer movement](https://developer.android.com/training/gestures/movement)
- [Migrate from Swipeable to AnchoredDraggable](https://developer.android.com/develop/ui/compose/touch-input/pointer-input/migrate-swipeable)
- [Drag, swipe, and fling](https://developer.android.com/develop/ui/compose/touch-input/pointer-input/drag-swipe-fling)

## Recommendation

Expose a dev-only swipe debug overlay in the real workspace shell behind an opt-in query param.

Recommended query param:

- `?swipe-debug`

Recommended overlay layers:

1. Input layer

- finger path
- start point and end point
- sample count
- total `dx` / `dy`
- release velocity
- peak velocity
- peak acceleration

2. Browser/app decision layer

- start pane
- nearest pane at settle
- final settled pane
- whether a release rule promoted the result to the opposite sidebar

3. Threshold layer

- any current cross-swipe travel threshold
- any current cross-swipe velocity threshold
- the measured drag against those thresholds

## Current Branch Implementation Notes

The current branch already has an app-owned cross-sidebar escape hatch. Its current thresholds are:

- opposite-pane travel: `85%` of the far sidebar width
- release velocity toward the far pane: `1.25 px/ms`

Those are exactly the kind of breakpoints that should be visible in the debug overlay so gesture
reports can be grounded in numbers.

## Suggested Next Step

Keep the overlay in dev builds only, and use it to answer questions like:

- did the finger actually travel as far as it felt like it did?
- was the release velocity high enough to trigger the far-pane rule?
- did the browser already want the far pane, or did app logic promote it?
- is the main pane really harder to enter than the direct cross-sidebar jump?

That gives us a concrete instrument panel before attempting another gesture rewrite.
