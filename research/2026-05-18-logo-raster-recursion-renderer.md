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
