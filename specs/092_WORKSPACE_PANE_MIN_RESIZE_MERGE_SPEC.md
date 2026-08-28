# Workspace Pane Minimum Resize Merge Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/workspace shell
- Last updated: 2026-08-28
- Related files:
  - `packages/sidebars/src/SidebarLayout.tsx`
  - `packages/sidebars/src/SidebarLayoutGeometryInternal.ts`
  - `packages/sidebars/src/SidebarLayoutResizeHandle.tsx`
  - `packages/sidebars/src/useSidebarLayoutMobileResize.ts`
  - `packages/sidebars/test/layoutMobile.test.tsx`
  - `apps/samebase/e2e/workspace-sidebar-drag.spec.ts`
  - `specs/087_SIDEBAR_LAYOUT_SINGLE_LAYOUT_AND_PRERENDER_SPEC.md`
  - `specs/097_WORKSPACE_MOBILE_MERGE_STATE_PERSISTENCE_SPEC.md`
  - `research/2026-05-04-mobile-sidebar-min-resize-merge.md`

## Current Contract

### Independent Pane Constraints

Mobile pane minimum and maximum widths are independent from visual carousel affordances. The
reachable part of the adjacent main pane must not become the hidden source of truth for a pane
minimum, maximum, or merge release width.

The responsive side-pane minimum is:

```ts
Math.min(175, Math.floor(viewportWidthPx / 3));
```

The package resolves side and main widths from explicit constraints. It must not derive those
constraints from consumer theme CSS.

### Resize Behaviors

`SidebarLayout` supports these minimum-resize behaviors:

```ts
type MobileMinResizeBehavior = "min_resize_to_slide" | "min_resize_to_merge";
```

`"min_resize_to_merge"` is the default.

In slide mode, the side pane stops at its minimum. Further drag distance becomes carousel scroll,
and release can settle on the main pane.

In merge mode, the side pane and adjacent main pane resolve from the same drag delta. When the grip
enters the merge intent band, the side pane approaches its minimum while the main pane approaches a
valid fitted width. Release in that band commits a merged surface. Release outside that band keeps
the ordinary carousel surface list.

### Valid Merged Fit

A merged fit places one side pane and the main pane in the viewport at the same time:

```txt
candidate side width = side minimum
candidate main width = viewport width - candidate side width
```

Both panes must satisfy their explicit minimums. If they cannot fit, the layout displays the valid
unmerged fallback for that viewport. It must not create a zero-width or negative-width pane.

The default constraints support a merged fit at a 320px mobile viewport. At that width, the side
pane minimum is 106px and the main pane minimum is 214px.

### Surface Ownership

The mobile carousel snaps to surfaces. Its valid surface lists are:

- unmerged: `left`, `main`, `right`
- left merge: `left+main`, `right`
- right merge: `left`, `main+right`

Omit surfaces for panes that the route does not provide. `main` can belong to only one merged
surface at a time.

When a merge is settled, that side owns `main` until the same side releases it. Resizing the
opposite side must not create a second merge. Ownership may move directly to the opposite side only
when that side is already at its minimum and the transfer can preserve a valid main-pane width.
Otherwise, releasing the current merge returns to the unmerged surface list.

A route with one side pane may keep its valid merged surface settled because it has no opposite side
surface to reach.

### Durable And Transient State

A committed merge is a durable `mobileSurface` preference as defined by Spec 097. It is not inferred
from pane width. The selected `mobilePane` remains the saved logical pane.

In-progress grip geometry and preview merge state are transient. A route or viewport that cannot
display the committed merge uses the display-only fallback from Spec 097 and must not clear the
saved merge.

The resize behavior belongs to the package layout API. Persistence selection stays outside the
package runtime.

## Non-Goals

- Infer merge state from a minimum pane width.
- Allow `main` to belong to both side surfaces.
- Tie pane constraints to consumer theme styles.
- Add route-specific gesture engines outside the package.
- Rename Samebase persistence fields.

## Validation

- Geometry tests verify the responsive side minimum and the 320px merged fit.
- Geometry tests verify that an invalid fit returns the unmerged fallback.
- Interaction tests verify default merge mode and explicit slide mode.
- Interaction tests verify that the opposite side cannot take `main` while another merge owns it.
- Interaction tests verify the valid direct ownership handoff.
- Persistence tests verify that committed merge state is saved and that preview state is not saved.
- Samebase browser tests verify pointer, touch, keyboard, reload, and route-change behavior.
