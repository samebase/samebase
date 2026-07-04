# 091 Workspace Layout V2 Separator Track Plan

## Document Control

- Status: Proposed
- Owner: Samebase frontend/workspace shell
- Last updated: 2026-07-03
- Related specs:
  - `specs/087_WORKSPACE_LAYOUT_V2_SINGLE_LAYOUT_AND_PRERENDER_SPEC.md`
  - `specs/092_WORKSPACE_PANE_MIN_RESIZE_MERGE_SPEC.md`
  - `specs/093_WORKSPACE_LAYOUT_V2_MODULE_SPLIT_SPEC.md`
  - `specs/097_WORKSPACE_MOBILE_MERGE_STATE_PERSISTENCE_SPEC.md`
- Related files:
  - `apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx`
  - `apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2Viewports.tsx`
  - `apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2ResizeHandle.tsx`
  - `apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2ResizeHandleConfigs.ts`
  - `apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2Geometry.ts`
  - `apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2Prehydration.ts`
  - `apps/samebase/src/index.css`

## Summary

`WorkspaceLayoutV2` should stop making pane contents indirectly own mobile pane separators.

The current mobile separator model gives every pane a possible leading and trailing separator, then
uses active-pane selectors to suppress the separators for the selected pane. That preserves pane
interior autonomy, but it spreads one visual invariant across pane markup, global CSS, selected pane
state, merged-surface state, resize handle placement, and prehydration.

The proposed direction is to move separator ownership into the layout shell and make the pane gap a
first-class layout concept:

1. model a `paneGapPx` value in the shared geometry layer
2. keep `paneGapPx = 0` able to reproduce today's no-gap geometry
3. support `paneGapPx > 0` as real flex gap geometry when the product wants a visible layout seam
4. let the resize handle be the separator on draggable edges
5. render a line-only separator where no resize handle should exist
6. center the mobile resize grip and three-dot visual on the actual edge or gap center
7. keep pane interiors autonomous by keeping separators outside pane content

This should reduce the number of states where two panes can draw the same line, especially when a
merged `main+right` or `left+main` surface is active and the user swipes to the opposite pane.

## Current Findings

### Desktop

Desktop pane separation is already mostly direct. `WorkspaceLayoutV2Viewports.tsx` renders real
desktop borders on the side pane containers:

- left pane: `md:border-r`, or `md:border-primary` while resizing left
- right pane: `md:border-l`, or `md:border-primary` while resizing right
- closed desktop panes remove their border with `md:border-r-0` or `md:border-l-0`

Desktop prehydration also knows about these borders. `WorkspaceLayoutV2Prehydration.ts` writes a
temporary stylesheet before hydration and explicitly removes the closed pane's separator border so a
closed prehydrated pane has zero total width.

That means desktop is not the main source of the reported double-line issue. It is still affected by
any shared separator API because the desktop resize handle and active resize color should remain
consistent with mobile.

### Mobile

Mobile pane separation is global CSS, not component-local border classes. `index.css` targets
`[data-workspace-layout-v2-mobile-separator-pane]` and creates `::before` and `::after` 1px
separator pseudo-elements above pane content. It then suppresses the pseudo-elements on the active
pane via `[data-mobile-pane="..."]` selectors.

This has two costs:

- separator ownership is derived from selected pane state instead of adjacency
- merged surfaces require the same selector model to remain correct while the carousel surface list
  changes

The tests already show this model directly. `WorkspaceLayoutV2.mobile.test.tsx` has helper
assertions named around "separator ownership" and checks that panes have no border classes while
still carrying the `data-workspace-layout-v2-mobile-separator-pane` attribute.

### Mobile Resize Grip

`WorkspaceLayoutV2ResizeHandle.tsx` uses one shared handle implementation for desktop edge handles
and mobile grips. In mobile grip mode:

- the hit track is centered on the resize edge with `-translate-x-1/2`
- the visible grip is `h-16 w-8`
- the three dots are 3px squares
- the dots are intentionally shifted with `translate-x-0.5` or `-translate-x-0.5`
- the active drag rectangle appears only while resizing, with `border border-border bg-background`

That offset was a reasonable way to avoid covering pixels from the focused pane, but it creates a
separate visual rule from the separator rule. The user sees a pane edge, a hit target, a visible dot
column, and an active rectangle that do not all share one center.

### Merged Mobile Surfaces

The accepted mobile model allows these surface lists:

- unmerged: `left`, `main`, `right`
- left merge: `left+main`, `right`
- right merge: `left`, `main+right`

`WorkspaceLayoutV2Geometry.ts` owns this through `getMobilePaneOrder` and scroll offset helpers.
`useWorkspaceLayoutV2MobileResize.ts` previews and settles merged surfaces while preserving the
"main belongs to one surface" invariant.

This makes pane-owned separators a poor fit. The layout already knows which logical panes are
visible, where their edges are, and which surface is active. A separator should be a function of
that geometry, not a pseudo-element on whichever pane currently loses the ownership selector.

### Flex Gap Spike

A quick formula spike shows that a real `gap` is not prohibitively complex if it is treated as a
named geometry input instead of an incidental CSS detail.

The current mobile scroll offsets are effectively:

```txt
left  = 0
main  = hasLeft ? leftWidth : 0
right = max(0, leftWidth + mainWidth + rightWidth - viewportWidth)
```

With a real gap between rendered adjacent panes, the same model becomes:

```txt
left  = 0
main  = hasLeft ? leftWidth + gap : 0
right = max(0, renderedTrackWidthWithGaps - viewportWidth)
```

That is a modest change in the geometry helpers, not a rewrite. The sensitive part is the accepted
320px merged-fit invariant. Today the default minimum fit is:

```txt
96px side + 224px main = 320px viewport
```

With a 1px real gap, keeping the same main minimum would require 321px. To keep the 320px viewport
contract, the model must instead decide:

```txt
96px side + 1px gap + 223px main = 320px viewport
```

That decision belongs in the package-level contract, not inside a one-off visual fix.

## Goals

1. Make every visible pane edge have at most one separator.
2. Keep separators outside pane content so route panes keep full control over their interiors.
3. Center the mobile three-dot affordance on the actual pane edge.
4. Keep resize handles accessible `role="separator"` controls with keyboard behavior.
5. Keep prehydration and hydration using the same geometry model.
6. Reduce state-specific selector logic in `index.css`.
7. Preserve the accepted mobile merge and persisted mobile surface contracts.

## Non-Goals

- Replacing `WorkspaceLayoutV2` with an external panel framework.
- Reopening the accepted mobile merge state model.
- Adding route-specific separator behavior.
- Moving route content into layout-owned wrappers.
- Making V3 authoritative as part of this RFC. If the V3 experiment survives, it should either
  mirror the accepted V2 separator model or be deleted.
- Shipping a broad visual redesign of pane contents.

## Options

### Option A. Keep pane-owned separators and fix selectors

This would keep `data-workspace-layout-v2-mobile-separator-pane` on pane nodes and adjust the CSS
selectors for merged surfaces.

Pros:

- smallest immediate visual diff
- little or no geometry change
- likely fastest patch for the known double-line bug

Cons:

- keeps separator ownership indirect
- adds more selector cases for merged surfaces
- keeps the grip dots and separator line as separate visual systems
- keeps prehydration coupled to active pane attributes and pseudo-element suppression

Verdict: acceptable as an emergency bug fix, but not the right direction for the central layout.

### Option B. Layout-owned separator overlays

The layout would render absolute separator tracks in `WorkspaceLayoutV2Viewport` or a small sibling
component. The tracks would be positioned from the same resolved widths used by the panes and resize
handles. They would not consume layout width.

Pros:

- one separator per edge
- low risk to scroll offset and merge-fit math
- panes keep interior autonomy
- lets the mobile grip center on the same edge without changing pane widths
- can remove most mobile separator pseudo-element CSS

Cons:

- still uses overlay positioning instead of a native layout gap
- prehydration needs the same edge positions for first paint if we want zero visual jump
- desktop and mobile still need different visibility rules for closed panes and offscreen panes

Verdict: recommended first implementation slice.

### Option C. True flexbox gap

The carousel and desktop pane row would use a real CSS gap or separator track between pane flex
items. The parent background or a dedicated track element would become the visible separator.

Pros:

- most standard mental model
- separators become layout, not decoration
- impossible for two panes to draw the same separator
- a centered grip can sit naturally on the gap center

Cons:

- the gap becomes real geometry
- mobile scroll offsets must include the gap between every preceding rendered pane
- merged fit math must include the gap, or reduce one pane width so `side + gap + main` still fits
- desktop collapsed panes can leave stray gaps unless closed panes are removed from flow or the gap
  is conditional
- prehydration must understand the same gap math before React measures the viewport

Verdict: viable and likely the best package-level standard if `paneGapPx` is explicit and defaults
to today's geometry. It should not be introduced as a CSS-only tweak; it should land as a geometry
contract with tests for `gap = 0` and `gap > 0`.

### Option D. Resize handle as the separator

The layout would treat the resize handle as the canonical separator. The visible line, active drag
state, hit target, and dot affordance would all be part of one edge component.

Pros:

- best visual coherence
- the focused resize state has a single owner
- three dots can be exactly centered inside the active rectangle
- works with either overlay tracks or true gap tracks

Cons:

- not every separator is resizable, because the main pane has no mobile grip when selected today
- desktop invisible edge handles and mobile visible grip handles still need distinct hit target
  treatment
- if the handle owns non-resizable separator lines, it needs a clear disabled or decorative mode

Verdict: preferred target. Draggable edges should use the resize handle as the separator. Edges that
should not be draggable should use a line-only variant with the same placement rules.

## Recommendation

Adopt a first-class `paneGapPx` geometry model, then choose whether the shipped Samebase app uses
`0px` or `1px` as the initial value.

This gives the important invariant immediately:

```txt
one adjacent pane edge -> one layout-owned separator
```

For package quality, the standard should be honest about whether the separator consumes layout
space. A configurable `paneGapPx` gives both useful modes:

- `paneGapPx = 0`: no geometric seam; pane background differences can define the boundary, and a
  line-only overlay can still be rendered if the host app wants it
- `paneGapPx > 0`: a real shared seam; parent background or a dedicated track color creates the
  visible separator without either pane owning the line

The important implementation rule is that `paneGapPx` must flow through the same geometry helpers
used by React, prehydration, tests, and resize handle positions. It should not be a Tailwind class
added after the fact.

For draggable edges, the resize handle should own the visible separator line, active drag state, hit
target, ARIA separator semantics, and dot affordance. For non-draggable edges, render a line-only
separator through the same layout-owned placement model.

## Proposed Rollout

### Phase 1. Make the gap contract explicit while preserving current geometry

Add `paneGapPx` to the V2 geometry layer with an app default of `0`.

Acceptance:

- `paneGapPx = 0` preserves current scroll offsets, merge fit, and handle positions
- geometry tests cover `paneGapPx > 0` for main/right offsets and merged fits
- no route-specific gap decisions exist

### Phase 2. Make the current bug reproducible

Add a focused visual or DOM-level test for the double-separator case:

1. create a mobile `main+right` merged surface
2. swipe to the left pane
3. assert the left/main boundary has one separator, not two

Prefer a real route or existing visual fixture that mounts the production component tree. This is a
workspace shell behavior, so avoid inventing a fake fixture with custom chrome.

### Phase 3. Center the mobile grip dots

Remove the deliberate dot offset from `WorkspaceLayoutV2ResizeHandle.tsx` and update the unit test
that currently expects `translate-x-0.5` and `-translate-x-0.5`.

This is the smallest user-visible improvement and should be easy to validate in isolation.

Acceptance:

- idle grip remains visually light
- active drag rectangle contains centered dots
- hit track remains centered on the edge
- keyboard and pointer resizing still pass existing tests

### Phase 4. Move mobile separators out of pane pseudo-elements

Introduce a small layout-owned separator/handle renderer under `WorkspaceLayoutV2Viewport`.

The renderer should receive already-resolved layout facts:

- `hasLeftPane`
- `hasRightPane`
- left, main, and right mobile widths
- desktop left and right widths
- current mobile pane
- active merged side
- active resize side
- measured viewport state

It should not read route content, sidebar state, local storage, or Convex state. It should not own
pane width math. It should render only the separators and handles that can actually appear.

The first implementation should preserve the existing mobile grip lifecycle:

- no grip on the main pane
- no grip while the carousel is unsettled
- one active side grip at a time
- line-only separators where a visible separator is needed but no grip should be interactive

Acceptance:

- delete the V2 mobile separator pseudo-element block from `index.css`
- no pane content element owns a mobile separator pseudo-element
- separators remain above sticky route content and below resize handles
- draggable separator handles still expose the existing accessible `role="separator"` behavior
- no double separator appears when a merged surface is active and the user swipes to the opposite
  side

### Phase 5. Enable a non-zero app gap

After `paneGapPx = 0` is proven, test the Samebase app with `paneGapPx = 1`.

This phase must update:

- `WorkspaceLayoutV2Geometry.ts` scroll offsets
- merged fit constraints
- `WorkspaceLayoutV2ResizeHandleConfigs.ts` handle positions
- `WorkspaceLayoutV2Prehydration.ts` mobile first-paint math
- unit tests that assert exact scrollLeft and handle positions
- visual baselines for mobile merged panes

Acceptance:

- prehydrated mobile screenshots still match hydrated screenshots for unmerged, stale-left, and
  merged-right scenarios
- the 320px mobile merged-fit contract is either preserved by reducing main minimum by the gap, or
  explicitly revised
- desktop prehydration still gives closed panes zero total geometry
- no new route-specific prehydration cases

## Open Decisions

1. Should Samebase ship `paneGapPx = 0` or `paneGapPx = 1` first?
2. If the app ships a non-zero gap, does a 320px mobile merged fit become `96 + 1 + 223`, or do we
   change the minimum viewport contract?
3. When a side pane is active on mobile, should the separator be visible on the focused pane edge or
   only between the active surface and the adjacent offscreen surface?
4. Should a non-resizable separator use the same component as a resize handle in disabled/decorative
   mode?
5. Should desktop active resize color move from side pane border classes into the shared separator
   track in the same patch as mobile?

## Validation Plan

Minimum local validation for implementation PRs:

```bash
pnpm exec vp test apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2.test.tsx apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2.mobile.test.tsx apps/samebase/src/components/workspace-layout-v2/WorkspaceLayoutV2.hydration.test.tsx
pnpm --filter samebase check:ci
pnpm test:visual:linux -- e2e/workspace-layout-v2.live.spec.ts e2e/workspace-sidebar-drag.spec.ts e2e/workspace-sidebar-visual.spec.ts e2e/workspace-frame-geometry.spec.ts e2e/workspace-prehydration-visual.spec.ts e2e/public-landing-shell.spec.ts e2e/vault-dashboard-visual.spec.ts
```

Coverage gaps to close before the separator migration is considered safe:

- add a visible-handle visual case over a merged pane separator, because current mobile prehydration
  screenshots mask resize handles
- add left-side and both-pane mobile prehydration scenarios, because the current prehydration visual
  cases are weighted toward no-left/right-side states
- decide whether desktop needs a first-paint visual diff, because current desktop prehydration
  coverage mostly asserts generated CSS strings and hydrated geometry

Before merging the separator migration, also run the canonical visual acceptance command:

```bash
pnpm test:visual:linux
```

## Draft Conclusion

The direction is worth pursuing, and a real flex gap is more viable than the first pass suggested.
The critical constraint is that the gap must be a first-class geometry value, not a CSS-only visual
tweak.

Start by adding `paneGapPx` with a `0px` default, then move separators and handles to the layout
edge model. Once `gap = 0` proves current behavior is preserved, test `gap = 1` as the package-grade
standard for Samebase's shipped layout.
