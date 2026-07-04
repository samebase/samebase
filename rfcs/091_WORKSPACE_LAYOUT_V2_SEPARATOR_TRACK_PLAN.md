# 091 Workspace Layout V2 Separator Track Plan

## Document Control

- Status: Proposed
- Owner: Samebase frontend/workspace shell
- Last updated: 2026-07-04
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

The accepted direction is to move separator ownership into the layout shell without adding pane gap
geometry:

1. render one layout-owned mobile separator per adjacent pane edge
2. keep pane widths, scroll offsets, and merged-fit math unchanged
3. center the mobile resize grip and three-dot visual on the actual edge
4. keep pane interiors autonomous by keeping separators outside pane content

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
- before this change, the dots were intentionally shifted with `translate-x-0.5` or
  `-translate-x-0.5`
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

### Flex Gap Decision

A formula spike showed that a real flex gap is not prohibitively complex, but it is not the chosen
standard for V2.

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

The useful scalable unit for WorkspaceLayout is the adjacent edge, not a global flex gap. An edge
can be visible or hidden, draggable or decorative, active or idle, and it can adapt to merged mobile
surfaces. A global flex gap forces every adjacent pane pair to share the same geometry even though
the layout already has asymmetric left/main and main/right behavior.

Decision: keep the current zero-gap geometry and make adjacent edges layout-owned overlays.

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
- every adjacent pane pair gets the same gap unless the layout adds another conditional edge model
- mobile scroll offsets must include the gap between every preceding rendered pane
- merged fit math must include the gap, or reduce one pane width so `side + gap + main` still fits
- desktop collapsed panes can leave stray gaps unless closed panes are removed from flow or the gap
  is conditional
- prehydration must understand the same gap math before React measures the viewport

Verdict: rejected for V2. The package-level standard should be explicit adjacent edges with zero-gap
geometry, not a configurable fallback between overlay and geometric seams.

### Option D. Resize handle as the separator

The layout would treat the resize handle as the canonical separator. The visible line, active drag
state, hit target, and dot affordance would all be part of one edge component.

Pros:

- best visual coherence
- the focused resize state has a single owner
- three dots can be exactly centered inside the active rectangle
- works with overlay tracks

Cons:

- not every separator is resizable, because the main pane has no mobile grip when selected today
- desktop invisible edge handles and mobile visible grip handles still need distinct hit target
  treatment
- if the handle owns non-resizable separator lines, it needs a clear disabled or decorative mode

Verdict: preferred target. Draggable edges should use the resize handle as the separator. Edges that
should not be draggable should use a line-only variant with the same placement rules.

## Recommendation

Adopt layout-owned adjacent edge overlays and keep pane gap geometry at zero.

This gives the important invariant immediately:

```txt
one adjacent pane edge -> one layout-owned separator
```

For package quality, the exported standard should expose edges as the primitive. A future four-pane
layout naturally has three adjacent edges; each edge can own its separator and handle behavior
without forcing a global gap width across all pane pairs.

For draggable edges, the resize handle should own the visible separator line, active drag state, hit
target, ARIA separator semantics, and dot affordance. For non-draggable edges, render a line-only
separator through the same layout-owned placement model.

## Proposed Rollout

### Phase 1. Move mobile separators out of pane pseudo-elements

Introduce layout-owned mobile separators under `WorkspaceLayoutV2Viewport`.

The renderer should receive already-resolved layout facts:

- `hasLeftPane`
- `hasRightPane`
- left and main mobile widths
- measured viewport state

It should not read route content, sidebar state, local storage, or Convex state. It should not own
pane width math. It should render only the separators that can actually appear.

Acceptance:

- delete the V2 mobile separator pseudo-element block from `index.css`
- no pane content element owns a mobile separator pseudo-element
- routes with only a left or right pane render only the one possible adjacent separator
- no double separator appears when a merged surface is active and the user swipes to the opposite
  side

### Phase 2. Center the mobile grip dots

Remove the deliberate dot offset from `WorkspaceLayoutV2ResizeHandle.tsx` and update the unit test
that covered `translate-x-0.5` and `-translate-x-0.5`.

Acceptance:

- idle grip remains visually light
- active drag rectangle contains centered dots
- hit track remains centered on the edge
- keyboard and pointer resizing still pass existing tests

### Phase 3. Fold mobile separator lines into the resize handle when warranted

The first implementation may keep line-only separators and resize grips as separate overlay nodes.
Only fold them together if the result deletes code and preserves the existing mobile grip lifecycle:

- no grip on the main pane
- no grip while the carousel is unsettled
- one active side grip at a time
- line-only separators where a visible separator is needed but no grip should be interactive

Acceptance:

- prehydrated mobile screenshots still match hydrated screenshots for unmerged, stale-left, and
  merged-right scenarios
- desktop prehydration still gives closed panes zero total geometry
- no new route-specific prehydration cases

## Open Decisions

1. When a side pane is active on mobile, should the separator be visible on the focused pane edge or
   only between the active surface and the adjacent offscreen surface?
2. Should a non-resizable separator use the same component as a resize handle in disabled/decorative
   mode?
3. Should desktop active resize color move from side pane border classes into the shared separator
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

The direction is layout-owned adjacent edges with zero-gap geometry. That fixes the double-edge bug,
keeps pane interiors autonomous, preserves the current scroll and merge math, and still generalizes
to future pane counts because the package primitive is the edge between visible panes.
