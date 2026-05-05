# Mobile Sidebar Minimum Resize Merge Research

## Document Control

- Status: Research
- Owner: Noter frontend/workspace shell
- Created: 2026-05-04
- Related files:
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.tsx`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2ResizeHandle.tsx`
  - `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.mobile.test.tsx`
  - `apps/noter/e2e/workspace-sidebar-drag.spec.ts`
  - `apps/noter/e2e/public-landing-shell.spec.ts`
  - `specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md`
  - `specs/087_WORKSPACE_LAYOUT_V2_SINGLE_LAYOUT_AND_PRERENDER_SPEC.md`
  - `rfcs/081_SIDEBAR_RESIZE_RESEARCH.md`

## Question

When a mobile sidebar is resized to its minimum width, should the main pane be
able to fit fully on the same screen beside the narrow sidebar?

The user-facing motivation is that Noter is already responsive enough for the
main pane to remain usable at that size. The useful state is therefore not
always "sidebar open, main mostly offscreen." Sometimes it should be "narrow
side pane plus complete main pane."

## Product Direction

The longer-term model is panes, not a special main/sidebar split. The current UI
still calls the center surface `main` and the edge surfaces `sidebars`, but the
direction is that these are all panes with comparable sizing rules and no hard
semantic divide in the layout engine.

That matters for this feature because the best mental model is not "make a
sidebar tiny." It is "allow one pane to merge into the visible viewport beside
another pane once both panes satisfy their minimum useful widths."

The UX is not fully designed yet, so the near-term implementation should avoid
inventing a broad pane system. It can still be shaped so the current sidebar
mechanics do not block the future pane model.

## Current Implementation Findings

`WorkspaceLayoutV2` owns the relevant shell behavior.

Mobile layout is a native horizontal scroll carousel:

- left pane
- main pane
- right pane

The carousel uses CSS scroll snap and explicit scroll offsets. The center pane
currently has a fixed mobile width derived from the viewport:

```ts
const mobilePaneWidthPx = Math.max(
  1,
  viewportSize.widthPx - MOBILE_PANE_PEEK_PX * 2,
);
```

`MOBILE_PANE_PEEK_PX` is `24`, so on a 390px wide viewport the main pane is
342px wide.

Mobile sidebar max width is currently derived with the same peek allowance:

```ts
function getMobileSidebarMaxWidthPx(viewportWidthPx: number) {
  return Math.max(1, Math.floor(viewportWidthPx - MOBILE_PANE_PEEK_PX * 2));
}
```

That link is an implementation convenience, not a product invariant. The visible
peek, side-pane minimum, side-pane maximum, and main-pane minimum should be
independently tunable as the pane model matures. `MOBILE_PANE_PEEK_PX` describes
how much neighboring surface peeks in the carousel; it should not also secretly
define a side pane's minimum usable width.

Mobile sidebar min width is currently doubled from the leftover width after max:

```ts
function getMobileSidebarMinWidthPx(args: {
  maxWidthPx: number;
  viewportWidthPx: number;
}) {
  const leftoverWidthPx = args.viewportWidthPx - args.maxWidthPx;

  return clampNumber(Math.round(leftoverWidthPx * 2), 1, args.maxWidthPx);
}
```

On a 390px viewport:

- max sidebar width: `342`
- leftover after max: `48`
- current min sidebar width: `96`
- min sidebar plus full main: `96 + 342 = 438`

That means the current minimum can never fit beside the complete main pane on
the same 390px screen.

If this work proceeds, `getMobileSidebarMinWidthPx` should stop deriving min
from max-width leftover math. A simpler shape would clamp an explicit min:

```ts
function getMobileSidebarMinWidthPx(args: {
  configuredMinWidthPx: number;
  maxWidthPx: number;
}) {
  return clampNumber(Math.round(args.configuredMinWidthPx), 1, args.maxWidthPx);
}
```

The exact source of `configuredMinWidthPx` can be route-owned or shell-owned,
but the key point is that it should be independent from `MOBILE_PANE_PEEK_PX`.

## Resize To Slide Handoff

The "drag beyond min turns into sliding" behavior is explicit, not accidental.

In `renderResizeHandle`, mobile grip resizing passes an `onRawSizeChange`
handler. The normal resize path clamps the committed sidebar width, but the raw
size handler also looks at how far the pointer traveled below the minimum:

```ts
const pastMinimumPx = Math.max(0, resizeHandle.minWidthPx - rawWidthPx);
```

That overflow is converted into carousel `scrollLeft`, moving the shell from the
active sidebar back toward the main pane:

```ts
const nextScrollLeftPx =
  resizeHandle.side === "left"
    ? Math.min(mainScrollLeftPx, sidebarScrollLeftPx + pastMinimumPx)
    : Math.max(mainScrollLeftPx, sidebarScrollLeftPx - pastMinimumPx);

carouselNode.scrollLeft = nextScrollLeftPx;
```

The grip also tracks `mobileGripSlideOffsetPx` so the visible grip can continue
following the user's finger while the actual sidebar width is clamped.

This was introduced by commit `2f74ebc3`, PR `#597`, "Smooth mobile sidebar
resize-to-slide handoff." That same commit doubled the mobile sidebar minimum.
Before that, PR `#594` used the simpler minimum of
`viewportWidthPx - maxWidthPx`.

## Tests That Lock Current Behavior

Current tests intentionally protect both pieces:

- `apps/noter/e2e/workspace-sidebar-drag.spec.ts`
  - verifies the mobile sidebar minimum doubles the viewport leftover
  - verifies dragging past minimum recenters to main
- `apps/noter/e2e/public-landing-shell.spec.ts`
  - verifies landing right-sidebar resize past min hands off into a main-pane
    slide
- `apps/noter/src/components/workspace-layout-v2/WorkspaceLayoutV2.mobile.test.tsx`
  - verifies mobile min/max handle ARIA values and grip placement

Any implementation that changes the default behavior must update these tests. A
safer first slice should keep existing tests valid by preserving slide mode as
the default.

## Proposed Near-Term Shape

The proposed behavior switch is viable:

```ts
type MobileMinResizeBehavior = "min_resize_to_slide" | "min_resize_to_merge";
```

The prop should live on `WorkspaceLayoutV2FullPage` /
`WorkspaceLayoutV2JustPanes`, not `SidebarProvider`, because it controls shell
gesture semantics rather than persisted sidebar state.

Default should remain:

```ts
"min_resize_to_slide";
```

That preserves the shipped behavior and current tests.

For `"min_resize_to_merge"`:

1. Compute mobile minimum width from an explicit side-pane minimum, not from
   peek/max leftover math.

2. When a resize drag goes below the side pane's minimum, convert the extra
   pointer travel into a resize of the adjacent main pane instead of carousel
   scroll.

3. On release, settle into a merged fit where the side pane and adjacent main
   pane share the viewport according to their min/max constraints.

This is more expressive than the simpler static idea of just clamping the side
pane at a smaller min and disabling slide. It preserves the existing handoff
feel, but redirects the handoff from "resize becomes slide" to "resize becomes
adjacent-pane resize."

Conceptually, the current handoff does this:

```txt
raw side width below min -> carousel scrollLeft changes -> active pane slides away
```

Merge mode should instead do this:

```txt
raw side width below min -> main pane width changes -> active pane stays visible
```

The release target should be computed from pane constraints rather than from the
current peek constant. For example:

```txt
merged main width = viewport width - resolved side pane min width
```

Then clamp that merged main width against the main pane's own minimum and
maximum. In the future pane model, the current "main" pane should participate in
the same style of min/max negotiation as every other pane.

## Naming Note

`min_resize_to_slide` / `min_resize_to_merge` matches the current sidebar code
well, but it is still phrased around the old model.

If the implementation wants to make the future pane model more visible without
building it yet, consider naming the prop around behavior rather than sidebar
identity:

```ts
minimumResizeBehavior:
  | "slide_to_active_pane"
  | "merge_with_adjacent_pane"
```

The user-proposed names are probably better for a narrow first slice because
they fit the current code and tests. A later pane-system refactor can rename the
contract when `main` and `sidebar` are no longer distinct layout roles.

## Risks And Open Questions

- The current main pane width remains `viewport - 48` in normal carousel mode.
  Merge mode likely needs a transient/resolved main-pane width during the grip
  drag so the handoff can resize the adjacent pane instead of scrolling.
- The merged release target should not be hard-coded to peek math. It should be
  a generic two-pane fit calculation using side-pane and main-pane min/max
  constraints.
- Mobile resize grips are currently hidden by default and exposed through
  `showMobileResizeGripDots` / landing dev mode. Product rollout still needs to
  decide where users can access the grip.
- Some sidebar content is responsive at narrow widths, but not all route side
  panes may be equally useful at `48px`. The behavior should be opt-in per shell
  instance until pane content standards are clearer.
- The future pane model probably wants symmetrical min/max constraints for every
  pane, including the current main pane. This research does not solve that full
  model.

## WorkspaceLayoutV2 Simplification Follow-Up

After the first merge-mode implementation, `WorkspaceLayoutV2JustPanes` still
owns several concerns in one render body:

- pane geometry and min/max resolution
- carousel DOM synchronization
- scroll-derived mobile pane selection
- active resize state for desktop handles, panel handles, and mobile grips
- mobile grip session mechanics for slide and merge behaviors

The local TanStack Store usage in `LogoPreviewPage` and the vault dashboard
shows a useful pattern for route-local controls, but swapping `useState` for a
store inside the same monolithic component would not by itself simplify this
layout. The hard part is not the storage primitive; it is that browser
subscriptions, gesture sessions, and pane geometry are interleaved.

The better simplification path is to split controller ownership first:

1. Extract carousel synchronization into a hook that owns the mobile carousel
   ref, first-paint alignment, scroll-derived pane writes, and settled-state
   tracking.
2. Use React's `useEffectEvent` for scroll synchronization callbacks that need
   fresh pane geometry without resubscribing the browser scroll listener on
   every render. The existing `useAnimationFrameLoop` hook is the local pattern
   for this style.
3. Extract mobile grip resize mechanics into a hook or small controller that
   owns the transient merge width, grip slide offset, and resize-session refs.
4. Keep pane math as pure helpers. Geometry helpers are already easier to test
   and reason about than React stateful code.
5. Consider TanStack Store only after the component has smaller children that
   would benefit from slice subscriptions. A store is likely useful for a future
   pane controller shared across panes, but it is not the first simplification
   lever for the current shell.

This preserves the current product behavior while making the implementation more
aligned with the future pane model: generic pane geometry remains pure, while
React hooks own the browser and gesture lifecycle details.

## Peek Width And Opposite Pane Access Follow-Up

The mobile carousel currently keeps a small visual peek of neighboring panes.
That peek is useful as a discovery hint, but it is also confusing when a side
pane has merged with the main pane. In a merged fit, the user has already made
the main pane visible beside a narrow side pane, so spending additional width on
peek affordances makes both working panes thinner.

The first phase should expose `mobilePanePeekWidthPx` on the workspace layout
shell and keep the existing `24px` default. Routes that want pane-style behavior
can set it to `0` so the future merged-pane work does not have to preserve
unused peek gutters.

The next phase should address the main product gap: when both side panes exist,
a merged side pane plus visible main pane should still allow travel through the
main pane to the opposite side pane. For example, after merging the left pane
with the main pane, the user should be able to slide from the visible main pane
toward the right pane. The transient merged geometry should survive that bridge
instead of immediately restoring the main pane to full carousel width.

That future behavior likely needs a transient "merged side" layout concept that
is separate from the selected `mobilePane` value. Persisted mobile pane state
can stay as `"left" | "main" | "right"`, while the controller remembers whether
one side is merged and clears that transient state only when the viewport,
behavior, or resize gesture invalidates it.

## Surface Ownership And Handoff Follow-Up

The clearest model is that the mobile carousel snaps to surfaces, not always to
individual panes:

- ordinary: `left`, `main`, `right`
- left merged: `left+main`, `right`
- right merged: `left`, `main+right`

`main` must have exactly one owner in a merged state. The surface list
`left+main`, `main+right` is invalid because two surfaces would both claim the
same logical pane. In practice, that invalid state appears when one side is
already merged with `main`, the user slides to the opposite side, and then the
opposite side is resized to its own minimum. The UI can appear to work for a
moment, but resizing back out becomes ambiguous because the layout no longer
knows which surface owns `main`.

The next model improvement is a controlled ownership handoff:

```txt
left+main, right-at-min -> resize left wider -> left, main+right
```

and symmetrically:

```txt
left-at-min, main+right -> resize right wider -> left+main, right
```

This keeps the motion understandable when the opposite sidebar is already at
minimum. `main` does not need to resize during the handoff because it was
`viewport - leftMin` before and becomes `viewport - rightMin` after. With equal
side minimums, the main-pane width is stable throughout.

The handoff should be explicit and atomic in layout state: `main` remains owned
by one side during the gesture, then can transfer to the opposite side on
release if that opposite side is already at minimum. If the opposite side is not
at minimum, releasing the current merge should dissolve to the ordinary `left`,
`main`, `right` surface list instead of implicitly creating a new merge.

## Recommendation

Use the prop as a compatibility bridge. The accepted spec now makes merge the
WorkspaceLayoutV2 default while keeping slide available for explicit fixture or
route callsites:

- use merge behavior by default where the route wants a narrow adjacent pane
  beside a complete main pane
- keep current slide behavior only for explicit compatibility callsites
- decouple side-pane minimum width from `MOBILE_PANE_PEEK_PX`
- in merge mode, transform below-min drag into adjacent main-pane resizing
  instead of carousel scroll
- avoid adding a new `mobilePane` state such as `merged`
- avoid changing persisted sidebar state shape
- add focused tests that prove merge mode keeps the active pane selected and
  makes side-pane plus main-pane widths fit within the viewport according to
  explicit pane constraints

This keeps today's custom motions intact while giving the shell a small,
explicit escape hatch toward the future pane model.
