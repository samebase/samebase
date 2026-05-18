# Logo Raster Recursion Renderer Notes

## Status

Exploratory implementation notes for the recursive logo renderer.

## Problem

The current recursive Three renderer avoids constructing every leaf cube as a
JavaScript object, but it still asks the GPU to draw repeated depth-3 geometry.
At depth 5 and 6 this can still feel heavy because instancing reduces CPU setup
cost, not the amount of vertex work per redraw.

The desired mental model is different: render one reusable unit for the current
view, then compose that rendered unit into the recursive motif repeatedly.

## Proposed Model

For `depth > 1`, add an experimental canvas/raster route that renders by
recursive image composition:

1. Project and rasterize the 3x3 motif for the current `rot`, `elev`, face
   colors, and opacity settings. Settled cells should use the shared merged
   surface model so coplanar cells do not create their own antialiased seams.
2. Sort the 12 filled motif cells once for the current view, from far to near.
3. Composite the current unit image into those 12 projected motif positions.
4. Treat the result as the next reusable unit image.
5. Repeat until the requested depth is reached.

The draw order is reused at every recursive level because every level is the
same motif under the same orthographic view. Depth changes the scale of the
unit, not the local painter-order relationship inside the motif.

## Expected Performance

The rebuild cost should be closer to `12 * depth` canvas image draws plus one
base cube rasterization. This is fundamentally different from the current
instanced Three approach, where depth 6 still represents millions of repeated
triangles each frame.

Implementation note: the shared preview page must not build
`createLogoFractalVoxelGrid` for the raster route. That exact-grid path expands
to `12 ** depth` filled voxels and can freeze depth 6 before the raster renderer
starts. Exact recursive voxel grids are still appropriate for the isometric
renderer, but the raster route should receive only the 3x3 motif plus depth.

Implementation note: each recursive image layer should be sized for its level,
not for the final output canvas. When the exact recursive tile size remains
reasonable, pick a base cell size and grow each level by `3x` so child images
land on integer tile boundaries. The final scene can apply the visual padding in
one draw. Rendering every intermediate layer at the final output size preserves
the fake-recursive model but wastes most of the cost that the model is supposed
to remove.

Implementation note: exact snap-to-face views are a 2D coverage problem. In that
state, resampling transparent cached images can create faint lines between
same-color cells, and recursion multiplies those lines. The raster route should
draw a recursive 2D face mask directly when no shuffle move is active, then fall
back to image composition for angled or moving views.

Diagnostic note: before changing the full 3x3 recursive renderer again, isolate
the primitive raster seam problem in a tiny 2x2x2 image-composition lab. Render
a single small raster cube source at intentionally low backing sizes, place that
source image once into the eight positions of a 2x2x2 block, then zoom the small
result for human inspection. The zoom is only an inspection aid; the source
image must stay small so seam pixels become easier to see. A clean 2x2 primitive
is the evidence needed before applying the same method to the 3x3 recursive
motif.

The diagnostic route is `/logo/raster-seams`. Its current purpose is to make the
primitive failure obvious: any magenta pixel in that 2x2 lab comes from drawing
one small raster cube image into neighboring positions, not from recursive depth
or the 3x3 logo model.

Reference note from `/Users/nicu/dev/my/impossible-object`: that experiment has
two render methods for cube image composition. `single` draws a small source
cube canvas at relative offsets and can create sub-pixel artifacts. `full` draws
into a full-size intermediate canvas and crops the current cube region back out;
it uses more backing pixels but gave a better visual result there. Its useful
composite modes are the first three Canvas operations exposed by the UI:
`source-over`, `source-atop`, and `destination-out`, with `source-atop` as the
default interesting mode.

Lab result: adding those ideas to `/logo/raster-seams` shows that `source-atop`
helps but does not solve the primitive seam. At 24px source, 22deg rotation, and
22deg elevation, plain `source-over` reports `47 / 442` mismatches,
`source-atop-single` reports `42 / 442`, `source-atop-full` reports `43 / 442`,
while `destination-out` full gets much worse at `138 / 442`. Current
interpretation: composite modes can reduce overdraw/halo seams around
overlapping image tiles, but a clean recursive logo probably still needs
face-level merging or a direct exposed-face mask before rasterization for
coplanar joins.

Deep-dive options after checking browser/graphics references:

- Merge geometry before rasterization. Build one path or mask per visible
  coplanar face/color, remove internal shared edges, then rasterize the merged
  area once. Canvas `fill(path, fillRule)` supports winding-rule fills, and SVG
  can also represent combined paths. If boolean path merging gets annoying,
  Clipper2 is a plausible helper because it supports robust polygon union and
  fill rules. This is the most promising path for static or whole-tile recursive
  views because there is no alpha image boundary between neighboring cells.
- Use a software rasterizer with a deterministic shared-edge rule. Direct3D's
  top-left convention exists specifically so adjacent triangles do not both miss
  the sample on a shared edge. A small fixed-point rasterizer for our projected
  quads would give full control over pixel coverage and depth, but it is more
  code than merged paths.
- Render real geometry to an offscreen GPU target, then reuse that result only
  after the geometry has been resolved. GPU rasterizers have explicit sample
  coverage rules and can use MSAA, but recursively reusing the result as a
  transparent texture reintroduces texture-edge filtering/premultiplied-alpha
  issues.
- Add gutters / edge-color dilation / premultiplied-alpha discipline around
  cached transparent images. WebGL's spec calls out premultiplied-alpha
  conversions as lossy in some canvas/image transfers, and WebGL texture docs
  expose `CLAMP_TO_EDGE`, `NEAREST`, and `LINEAR` as relevant sampling controls.
  This can reduce halos at the outside of cached images, but it cannot remove
  internal seams created before the image was cached.
- Supersample vector geometry and downsample once. This can make edge coverage
  smoother and more stable, but if the supersampled image is built by
  compositing many transparent tiles independently, the same category of seam is
  still present at higher resolution.
- Use `shape-rendering="crispEdges"` / no smoothing only as a diagnostic. SVG
  defines this as a renderer hint that may disable antialiasing or snap edges;
  it can hide seams by making the whole shape jagged, which is not the desired
  logo look.

2x2 proof result: `/logo/raster-seams` now has a `Merged faces` mode. It derives
the exposed 2x2 cell faces, cancels shared grid edges inside each plane/color
group, and draws only the remaining outer loops. At the 24px source, 22deg
rotation, and 22deg elevation case, the diagnostic reports `0 / 388` mismatches.
This proves the seam can be removed at the primitive level without using a
transparent image-composition trick.

Recommended next experiment: port that idea to one 3x3 composition step without
expanding recursive leaf geometry. The important constraint is still bounded
work per level: merge the exposed faces for the reusable motif/layer being
cached, then compose the cached result upward. Keep `source-atop-full` around
for movement experiments where pieces intentionally overlap while shuffling.

3x3 experiment result: the raster scene now draws the base 3x3 motif as merged
exposed face components. It collects only the current 3x3 cells, cancels shared
grid edges inside each coplanar face/color component, and fills the remaining
outer loops once. This is workable for the bounded motif and avoids the
exponential leaf-geometry path. It is not the full recursive seam fix yet:
higher levels still compose cached images, so any future inter-level seam work
should apply the same merged-surface idea to each cached level or layer instead
of expanding all recursive voxels.

Depth-2 follow-up: whole-motif image recursion reproduces the same alpha-edge
problem one level higher, even after the base 3x3 motif is merged. Do not keep
expanding exact recursive leaf geometry as the default answer. The next
experiments should stay in `/logo/raster-seams` until a different primitive is
proven. One current experiment is `Crisp`, which software-fills projected
polygons from pixel centers, disables image smoothing, rounds tile placement to
exact pixels, and compares against a similarly crisp one-piece reference so the
tradeoff is visible in the tiny 2x2 lab before it affects the production
renderer.

Crisp verdict: not enough. The stricter software-pixel version avoids Canvas
polygon antialiasing by filling projected polygons from pixel centers, then
placing the tiny source on rounded pixel offsets. At the 24px source, 22deg
rotation, and 22deg elevation case, it reports `59 / 438` mismatches with `6.0%`
error. In the same case, `source-over` reports `47 / 442`, `source-atop-single`
reports `42 / 442`, `source-atop-full` reports `43 / 442`, and `Merged faces`
remains `0 / 388`. Crisp rendering may be an acceptable style choice, but it is
not the primitive seam fix.

Distance-scale follow-up: the first `/logo/raster` implementation accidentally
made non-default `dist` more seam-prone by rendering one small transparent cube
canvas and drawing that image into each base-motif position. That created
alpha-edge seams before recursion, so depth 3 multiplied them. The corrected
rule is to keep the base motif geometric for `dist != 1`: scale motif centers,
project each cube face directly into the level-1 cache, and only then compose
the cached motif upward.

Recursive lab follow-up: `/logo/raster-seams` now has a depth toggle for the 2x2
test. Depth 1 is the original 2x2x2 image-composition case. Depth 2 recursively
composes that cached 2x2 block into another 2x2 block, giving a 4x4x4 cube
without jumping to the production 3x3-to-9x9 case. At the 24px source, 22deg
rotation, and 22deg elevation case, depth 2 makes the problem obvious. The lab
now reports both mismatch count and a normalized squared-error score, so a small
antialias mismatch is not treated the same as a fully wrong pixel. In that case,
`source-over` reports `66 / 442` mismatches with `1.1%` error,
`source-atop-single` reports `54 / 442` with `0.5%`, `source-atop-full` reports
`55 / 442` with `0.6%`, `Crisp` reports `43 / 438` with `4.4%`, and
`Merged faces` remains `0 / 388` with `0.0%`.

3x3 follow-up: the same lab now has a fixed base-grid toggle. The 3x3 depth-2
case produces a 9x9x9 full cube without allowing individual cube edits, so it
tests the real 3-based scaling shape while keeping the mental model simpler than
`/logo/raster`. In the Linux ARM64 24px source, 22deg rotation, and 22deg
elevation snapshot, `Plain` reports `16 / 442` mismatches with `1.1%` error,
`source-atop-single` reports `10 / 442` with `0.4%`, `source-atop-full` reports
`10 / 442` with `0.5%`, `Crisp` reports `198 / 438` with `20.8%`, and
`Merged faces` remains `0.0%` after simplifying colinear boundary points before
painting. The scale counters for that case are `729` occupied cells, `54` cached
image placements, and `243` visible face rects merged into `3` loops / `12`
points. The source sweep includes 96px and 144px cases because the intentionally
tiny 18px/24px sources exaggerate seam visibility; for the same 3x3 depth-2
plain case, 96px reports `216 / 6906` with `0.5%` error and 144px reports
`179 / 15420` with `0.3%` error.

Projection correction: the seam lab must use the same raster projection helper
as `/logo/raster`. A separate lab-only projection accidentally rotated only
around the world Y axis and fit the image to the current yaw span instead of the
production stable max projected span. That made the cube corners diverge from
the production renderer at some angles. The shared helper now owns camera
direction, screen axes, selected rotation axis, rendered rotation offset, stable
span fitting, and recursive frustum padding.

Paint correction: the seam lab must also match `/logo/raster` face painting. The
first lab version used a large same-color stroke, `sourceSize / 32`, to hide
tiny seams. At 144px that widened to about 4.5px and made face corners visibly
extend outside the cube. The lab now uses the production unit-face stroke scale,
`sourceSize / 512` with a 1px minimum, and merged faces are fill-only like the
production merged-surface path.

Inflated-tile experiment: `/logo/raster-seams` has an `Inflate` scale control
that defaults to `1.010x`. The slider has a small comfortable range, but the
numeric input intentionally has no hard maximum so larger stress values such as
`1.500x` can be tested. The renderer draws the farthest tile normally, then
draws later near tiles larger around their projected center. This is the
image-composition version of a same-color overlap/stroke trick. It reduces some
alpha gaps, but it is not stable enough to be the default. At `1.010x` in the
2x2 depth-2 case, 24px improves from `66 / 442` to `35 / 442`, and 144px
improves from `142 / 15420` to `47 / 15420`. In the 3x3 depth-2 case, 144px
improves from `179 / 15420` to `44 / 15420`, but the intentionally tiny 24px
stress case gets worse from `16 / 442` to `21 / 442`. Keep it as a measured
fallback candidate, not as the core seam fix.

Spacing-scale experiment: `/logo/raster-seams` also has a `Spacing` control.
`1.000x` is the current fake 3D distance between cube centers, `0.000x` stacks
all centers together, and the slider now reaches `2.000x` for useful manual
stress testing. The typed input intentionally stays open-ended. When this model
is promoted to `/logo` and `/logo/raster` as `dist`, the same value should be
applied at every reusable recursive level: move the centers of the current
cached motif, then move the centers of the higher-level cached motif, without
materializing every leaf voxel.

References checked:

- [WHATWG Canvas 2D](https://html.spec.whatwg.org/multipage/canvas.html):
  `globalCompositeOperation`, `imageSmoothingEnabled`, `drawImage()`, and the
  premultiplied-alpha section.
- [MDN Canvas `globalCompositeOperation`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)
  and
  [MDN Canvas `fill()`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fill)
  for composite modes and `fill(path, fillRule)`.
- [W3C Compositing and Blending](https://www.w3.org/TR/compositing-1/) for the
  Porter-Duff source/destination modes.
- [Microsoft Direct3D rasterization rules](https://learn.microsoft.com/en-us/windows/uwp/graphics-concepts/rasterization-rules)
  for the top-left shared-edge convention.
- [MDN WebGL `pixelStorei()`](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/pixelStorei)
  and
  [MDN WebGL texture parameters](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texParameter)
  for premultiplied-alpha upload controls and texture sampling/wrapping.
- [MDN SVG `shape-rendering`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/shape-rendering)
  for the `crispEdges` diagnostic.
- [Clipper2 overview](https://angusj.com/clipper2/Docs/Overview.htm) and
  [Clipper2 `Union`](https://angusj.com/clipper2/Docs/Units/Clipper/Functions/Union.htm)
  for robust polygon union/fill-rule behavior.

Implementation note: raster projection scale should not be recomputed from the
current yaw's bounding box. Fit against the maximum projected cube span for the
current elevation and rotation-axis mode so dragging rotates the shape without
zooming it in and out.

Follow-up implementation note: the same fake-recursive boundary applies to the
isometric and smooth SVG renderers. Iso should compose reusable transparent
motif canvases at projected isometric offsets. SVG should define nested motif
groups and place them with projected translations. Neither route should call
`createLogoFractalVoxelGrid` for depth above 1 during normal preview/export.

The cache must rebuild when these inputs change:

- yaw / rotation
- elevation
- rotation-axis mode
- face colors
- opacity
- base motif / `vox`
- requested depth
- output canvas pixel ratio or viewport size

For drag interaction this rebuild should still be substantially cheaper than
redrawing recursive geometry. If needed, a later refinement can render a lower
internal scale while dragging and refresh a sharper cache on release.

Seam-lab experiment note: `/logo/raster-seams` now allows a custom source raster
size beyond the quick-pick buttons. This tests whether starting from a larger
backing image reduces the alpha-edge seam score before the idea is promoted to
`/logo/raster`. The input intentionally has no upper clamp, though very large
values can still hit browser canvas limits because this is a manual diagnostic
control.

## Interaction Contract

- This raster path is an experiment route first, not the default `/logo` route.
- Direct voxel editing stays in the depth-1 Three path.
- Shuffle for recursive raster rendering should move cached recursive units, not
  leaf cubes.
- The first implementation can omit shuffle if the route is clearly labeled as a
  raster experiment, but the target model should support tile-level shuffle by
  drawing moving unit images over the settled recursive image.

## Rendering Risks

- Transparent image padding must be large enough that projected units do not
  clip at steep or near-edge views.
- Transparent image edges must not be resampled inside a face-on same-color
  surface. Use merged surfaces for the base motif and a direct 2D mask for exact
  snapped face views.
- Image quality can blur if units are repeatedly scaled from too-small cached
  canvases; use device-pixel-ratio-aware backing stores.
- Painter-order ties must be deterministic to avoid flicker while dragging near
  exact edge-on views.
- This is a 2.5D renderer. It is intended for recursive-depth preview and
  motion, not for exact raycasting or editing.
