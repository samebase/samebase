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
22deg elevation, plain `source-over` reports `34 / 387` mismatches,
`source-atop` single/full reports about `20 / 387` and `21 / 387`, while
`destination-out` full gets much worse. Current interpretation: composite modes
can reduce overdraw/halo seams around overlapping image tiles, but a clean
recursive logo probably still needs face-level merging or a direct exposed-face
mask before rasterization for coplanar joins.

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

Recommended next experiment: add one `merged faces` mode to `/logo/raster-seams`
that draws the 2x2 primitive as one path per visible face/color, with no
internal edges. If the mismatch counter drops to zero or near-zero across the
current angle sweep, port that idea to the recursive 3x3 renderer as cached
merged-face motifs. Keep `source-atop-full` around for movement experiments
where pieces intentionally overlap while shuffling.

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
