# Workspace Pane Minimum Resize Merge Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/workspace shell
- Last updated: 2026-05-04
- Related files:
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2ResizeHandle.tsx`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.mobile.test.tsx`
  - `apps/noter/e2e/workspace-sidebar-drag.spec.ts`
  - `apps/noter/e2e/public-landing-shell.spec.ts`
  - `specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md`
  - `specs/087_WORKSPACE_LAYOUT_V2_SINGLE_LAYOUT_AND_PRERENDER_SPEC.md`
  - `research/2026-05-04-mobile-sidebar-min-resize-merge.md`

## Summary

`WorkspaceLayoutV2` currently treats mobile sidebars as carousel panes that can
resize until they hit a minimum, then converts any additional resize drag into a
slide back toward the main pane.

That behavior remains valid for routes that want a drawer-like mobile sidebar.
Noter also needs a second behavior for routes where a narrow side pane and a
complete main pane should coexist in the same viewport. In that mode, dragging a
side pane past its minimum should resize the adjacent main pane instead of
sliding the active pane away.

This is an incremental step toward a pane model where `main` and `sidebar` are
not fundamentally different layout roles. The current implementation may keep
the old names, but the shell contract should move toward panes with comparable
minimum and maximum size constraints.

## Motivation

The mobile main pane is already responsive enough to stay useful at a narrower
width. When a side pane is minimized, the best result is sometimes:

```txt
narrow side pane | complete main pane
```

not:

```txt
side pane slides away | main pane recenters
```

The current resize-to-slide handoff makes sense when the user's intent is to
leave the side pane. It is less useful when the user's intent is to keep access
to a very narrow side pane while continuing to work in the main pane.

## Current Behavior

Mobile pane layout is a native horizontal carousel with snap positions for the
left, main, and right panes. The current shell derives both the main pane width
and side-pane maximum width from the mobile peek constant:

```ts
viewportWidthPx - MOBILE_PANE_PEEK_PX * 2;
```

The side-pane minimum is then derived from the leftover width after that maximum
and doubled. With the current constants, a 390px viewport has:

- `342px` main pane width
- `342px` side-pane max width
- `96px` side-pane min width

That minimum is wider than the space left beside the complete main pane, so the
two cannot fit together in one viewport.

When the resize grip is dragged beyond that side-pane minimum, the committed
side-pane width clamps, while the raw drag overflow updates carousel scroll.
That transforms resize into slide.

## Accepted Contract

### Independent Pane Constraints

Pane minimum and maximum widths must be independent from visual peek width.

The mobile peek constant may continue to control how much neighboring pane
surface is visible in normal carousel mode. It must not be the hidden source of
truth for:

- side-pane minimum width
- side-pane maximum width
- main-pane minimum width
- merged-pane release width

The shell should move toward explicit pane constraints. A narrow first
implementation may hard-code shell defaults, but the math should be shaped as:

```txt
resolved side width = clamp(raw side width, side min, side max)
resolved main width = clamp(raw main width, main min, main max)
```

not as derivations from the peek constant.

### Explicit Mobile Peek Width

Mobile carousel peek width is a visual affordance, not a pane sizing invariant.
`WorkspaceLayoutV2` should expose an explicit shell prop:

```ts
mobilePanePeekWidthPx?: number;
```

The default remains `24px` to preserve current routes. Routes that need maximum
usable pane width, especially pane-heavy routes with both left and right side
panes, may pass `0` to remove the visible peek.

The resolved peek width should feed only visual carousel geometry:

- the mobile main pane width in unmerged carousel mode
- mobile side-pane maximum width
- carousel padding
- scroll snap offsets
- mobile resize grip bounds while a grip is dragged past the side-pane edge

It must remain independent from side-pane minimum width, main-pane minimum
width, and merged-pane release width. A zero peek must be a supported normal
configuration, not a special case.

### Resize Behaviors

`WorkspaceLayoutV2` should support two minimum-resize behaviors:

```ts
type MobileMinResizeBehavior = "min_resize_to_slide" | "min_resize_to_merge";
```

The default behavior is `"min_resize_to_merge"` so V2 workspace surfaces get the
pane-style two-pane fit unless a fixture or route explicitly requests legacy
slide behavior.

In `"min_resize_to_slide"` mode:

- side-pane width clamps at its minimum
- raw drag beyond the minimum becomes carousel scroll
- release can settle back to the main pane

In `"min_resize_to_merge"` mode:

- side-pane width follows the resize gesture until it reaches its minimum
- the adjacent main pane follows the same resize delta within its own
  constraints
- the active side pane stays visible while the main pane grows into the viewport
- release settles to the nearest valid merged fit using pane constraints

The merge behavior should preserve the existing continuous handoff feel. The
handoff changes target; it does not disappear. Creating and removing a merged
fit should use the same paired-resize resolver so the dragger remains attached
to the pane edge instead of switching between separate slide and resize models.

```txt
slide mode: raw side width below min -> carousel scroll changes
merge mode: raw side width changes -> side and adjacent main widths resolve together
```

### Merged Fit

A merged fit is a resolved two-pane arrangement where the active side pane and
adjacent main pane share the viewport.

The release target should be computed from pane constraints:

```txt
candidate side width = side min
candidate main width = viewport width - candidate side width
resolved main width = clamp(candidate main width, main min, main max)
resolved side width = viewport width - resolved main width
```

If both panes cannot satisfy their minimums at the same time, the shell should
fail closed into the existing slide behavior for that route or viewport. It
should not invent placeholder widths or produce an unusable negative/zero-width
pane.

### State Shape

Do not add a persisted `"merged"` mobile pane state in this slice.

The committed mobile pane may remain `"left"`, `"main"`, or `"right"`. Merged
geometry is a transient or resolved layout mode within the active side-pane
state. This keeps persisted workspace sidebar state stable and avoids binding
the future pane model to today's sidebar names.

### API Placement

The behavior switch belongs on the workspace layout shell, not on
`SidebarProvider`.

`SidebarProvider` owns open state, selected mobile pane, and persisted widths.
The minimum-resize behavior controls gesture semantics and layout resolution, so
it should be passed through `WorkspaceLayoutV2FullPage` /
`WorkspaceLayoutV2JustPanes`.

## Non-Goals

- Replacing `WorkspaceLayoutV2` with a generalized pane framework.
- Renaming every current `main` or `sidebar` concept to `pane`.
- Adding a persisted merged-pane state.
- Changing default mobile sidebar behavior for existing routes.
- Tying side-pane min/max values to `MOBILE_PANE_PEEK_PX`.
- Adding route-specific gesture engines outside the shared shell.

## Implementation Direction

### Step 1. Name The Behavior

Add a `mobileMinResizeBehavior` prop to `WorkspaceLayoutV2FullPage` and
`WorkspaceLayoutV2JustPanes`.

Default it to `"min_resize_to_merge"`.

### Step 2. Split Pane Constraints From Peek

Replace `getMobileSidebarMinWidthPx` with a function that clamps an explicit
minimum against an explicit maximum.

The first shell default can stay conservative. The important implementation
boundary is that changing mobile peek no longer changes side-pane minimum width
unless the caller explicitly asks for the same value.

### Step 3. Preserve Slide Mode

Keep the current raw-size-to-scroll handoff for explicit `"min_resize_to_slide"`
callsites.

### Step 4. Add Merge Mode

For `"min_resize_to_merge"`, resolve the side pane and adjacent main pane from
the same raw resize delta. Instead of switching from resize math into carousel
scroll, keep the active side pane selected and write the paired result into the
side width plus a transient main-pane width.

The active side pane should remain the selected `mobilePane` while the grip is
dragging. The user should see the main pane expand beside the minimized side
pane rather than see the side pane slide out of view.

When the drag ends, resolve the final two-pane widths from side-pane and
main-pane constraints. Clear transient drag state after the layout settles.

### Step 5. Route Opt-In

Merge mode should be opt-in per route or fixture until the pane UX is clearer.
The first shipped opt-in should use a route or visual fixture where both panes
have content that remains useful at the proposed minimum widths.

## Validation

Add focused unit coverage for the sizing math:

- side-pane minimum clamps independently from peek width
- merged fit chooses side min and fills remaining viewport with main
- merged fit fails closed when both pane minimums cannot fit

Add route-level or honest production-component coverage for interaction:

- explicit slide mode still recenters to main after dragging past side min
- merge mode keeps `data-mobile-pane` on the active side pane after dragging
  past side min
- merge mode changes the rendered main-pane width during or after the drag
- merge mode keeps side-pane plus main-pane width within the viewport

If shipped UI changes where the mobile resize grip appears or how panes overlap,
update screenshot coverage for that shipped route or fixture.

## Acceptance Criteria

- The spec and research agree that pane min/max constraints are independent from
  visual peek width.
- Merge behavior remains the default for V2 workspace layout surfaces.
- Current slide behavior remains available through an explicit shell prop.
- Merge behavior converts minimum-boundary resize into paired side/main-pane
  resize, not carousel scroll.
- No persisted workspace sidebar state migration is required.
- Focused tests cover both the default merge mode and explicit slide mode before
  the feature is used in shipped UI.
