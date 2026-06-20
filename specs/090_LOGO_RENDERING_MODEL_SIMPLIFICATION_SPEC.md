# 090 Logo Rendering Model Simplification Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend
- Last updated: 2026-05-24
- Related files: `rfcs/060_LOGO_PREVIEW_PLAYGROUND_SPEC.md`,
  `rfcs/061_USER_LOGO_STATIC_SVG_DELIVERY_SPEC.md`,
  `specs/089_NOTER_LOGO_IDENTITY_INVARIANT_SPEC.md`, `apps/samebase/src/components/NLogoScene.tsx`,
  `apps/samebase/src/components/logoThreeSvgRenderer.ts`,
  `apps/samebase/src/components/logoIsometricRenderer.ts`,
  `apps/samebase/src/components/logoSurfaceModel.ts`,
  `apps/samebase/src/components/logoVoxelState.ts`

## Summary

Noter should simplify logo rendering around one mental model:

1. A settled voxel shape plus base grid size is the source of truth.
2. Optional motion state describes cubes that are temporarily moving.
3. Surface geometry is derived from settled voxels plus motion state.
4. Renderers are thin adapters for WebGL, smooth SVG, raster, and pixel-art isometric output.

The renderer model must preserve the existing Three.js cube shuffle behavior. Moving cubes are not a
reason to keep each renderer owning its own surface extraction logic; they are a transient layer
above the settled shape.

## Context

The current logo stack grew from exploration:

- `/logo` uses `NLogoScene` and Three.js.
- `/logo/svg` uses `logoThreeSvgRenderer`.
- `/logo/iso` uses `NLogoIsoScene` and `logoIsometricRenderer`.
- public landing renders a static SVG first, then may progressively enhance to the Three scene.

Those paths are valid product surfaces, but they duplicate shape and face concepts. The result is
hard to reason about when adding recursive shapes, performance improvements, static SVG changes, or
motion.

The accepted identity spec still defines the canonical brand mark as one `3x3x3` voxel shape.
Recursive depth and `/logo` grid-size exploration are playground/rendering options, not the baseline
identity source.

## Goals

- Keep one settled voxel-shape source of truth.
- Keep cube motion possible in the live Three renderer.
- Remove duplicate exposed-face extraction from renderer implementations.
- Keep smooth SVG output visually aligned with the Three logo surface.
- Keep pixel-art isometric rendering as a separate projection, not a separate shape model.
- Make recursive/tiled rendering use the same settled-shape input without reshaping every renderer.

## Non-Goals

- Replacing Three.js in this phase.
- Making recursive depth a public identity asset or replacing the default brand mark.
- Removing the isometric renderer.
- Turning the logo playground into a generic larger-grid voxel editor.
- Solving all shuffle performance issues in the first extraction.

## Model

### 1. Settled shape

The settled shape is a `LogoVoxelGrid`-like value:

- base grid size
- filled voxel coordinates

The current `/logo` exploration state supports base grid sizes `2` and `3`, with `3` as the route
default. The `2` grid is an explicit exploration option with the same renderer support.

### 2. Motion state

Motion state is a separate transient value:

- moving voxel coordinate
- source coordinate
- destination coordinate
- progress

The settled shape should not be overwritten every frame just to express a cube sliding between two
adjacent cells. Renderers can temporarily omit the moving voxel from the settled surface, then draw
the moving cube above it.

### 3. Surface model

The shared surface model derives exposed faces from settled voxels. It returns renderer-neutral
quads:

- four world vertices
- outward normal
- face color key
- stable key
- material index for the existing Three material layout

The surface model is derived data. It is not the source of truth for editing or motion.

### 4. Renderer adapters

Each renderer should do only renderer-specific work:

- Three: convert surface quads into WebGL geometry and draw moving cubes.
- Smooth SVG: project shared surface quads into SVG polygons.
- Isometric: project settled and moving cubes into the pixel-art face model.

## Phased Plan

### Phase 1: Shared Surface Extraction

Create `logoSurfaceModel.ts` and move exposed-face extraction there. Wire `NLogoScene` and
`logoThreeSvgRenderer` to consume it. This phase should be a behavior-preserving refactor.

### Phase 2: Three Geometry Simplification

Stop creating one Three mesh per exposed quad. Build fewer renderer objects from the shared surface
model, such as one geometry per face-color material group. Keep raycasting and cube shuffle behavior
intact.

### Phase 3: Motion State Cleanup

Make the live renderer's moving cubes explicit as motion state above the settled voxel shape. Avoid
rebuilding more static geometry than necessary while movement is in progress.

### Phase 4: Isometric Alignment

Keep the isometric renderer's projection style, but make its shape input match the shared
settled-shape plus motion-state model. Do not make it rediscover shape rules from URL or route
state.

### Phase 5: Recursive Tile Exploration

Add a `depth` route/search option after the renderer model is simpler. Depth `1` is the normal
editable logo for the selected base grid size. Higher depths render the recursive settled shape
through the shared voxel-grid model across Three, smooth SVG, raster, isometric, and public landing
logo surfaces. The playground slider should stop at `5` as the comfortable exploration range, while
direct number input and URL state may use higher normalized integer depths deliberately. Recursive
depths stay static as shapes: rotation, dragging, colors, opacity, and bounded static SVG fallbacks
continue to work. Direct tiny-cube editing remains a depth-1 behavior. Recursive Three shuffle moves
rendered recursive tile units rather than the smallest leaf cubes.

The Three preview must not build every tiny surface for recursive depths. Recursive depths may
render by instancing a smaller recursive tile into the higher-level motif positions. That tiled path
keeps rotation, dragging, and shuffle responsive without entering the exact tiny-cube mutation path.

The isometric preview must follow the same fake-recursive rule. For depth above 1, it should render
the selected base motif once and compose that image through recursive motif positions instead of
materializing every leaf voxel. Shuffle remains a tile-level motion repeated through the recursive
image.

The smooth SVG route must also avoid exact recursive voxel expansion. Recursive SVG output should
stay bounded by defining nested reusable motif groups and placing them with projected translations,
rather than serializing all leaf faces as independent polygons.

### Phase 6: Raster Recursive Experiment

Add `/logo/raster` as an experimental canvas preview for recursive depths. The renderer should
project one merged motif unit for the current view and compose that rendered unit through the
selected base motif repeatedly. The motif painter order is calculated once per view and reused for
every recursive level. This keeps the rendering model proportional to depth rather than proportional
to the number of leaf cubes.

The route exists to validate high-depth smoothness before changing `/logo`. Direct editing remains
outside this renderer, and the shared preview shell must not build an exact recursive voxel grid for
raster rendering. Recursive shuffle should move cached recursive units rather than leaf cubes.

For exact snap-to-face views with no active shuffle move, the raster route should render a direct
recursive 2D face mask. Those views have no perspective ordering inside the visible face, so
resampling transparent cached-image edges would create seams that are not part of the geometry.

The raster projection should use a stable fit for the current elevation and rotation-axis mode.
Rotation must not refit the canvas zoom from the current projected bounding box.

### Phase 7: Distance Scale Exploration

Add a `dist` route/search option for `/logo` and `/logo/raster` that changes the fake 3D spacing
between repeated cube centers. `dist=1` is the current logo spacing and the default omitted URL
value. `dist=0` places all centers at the same point. The playground slider should cover `0..2` as
the comfortable range, while typed inputs and URL state may use larger values deliberately.

The control must preserve the same recursive mental model as depth rendering: distance applies to
the reusable motif centers at each cached level, not by expanding every leaf cube. Three may rebuild
its bounded surface/instance geometry for the new spacing, while raster should change projection and
cached tile placement without entering the exact recursive voxel path.

Raster distance changes must not swap the base motif to repeated transparent cube-image composition.
The base motif should stay geometric: project the distance-scaled cube faces directly into the
cached motif, then reuse that cached motif through the recursive levels.

## Validation

- Unit tests must cover the shared surface model independently from renderers.
- Static SVG tests must keep committed identity assets synchronized with the generator.
- Existing logo Playwright visual coverage must continue to pass after each renderer-adapter phase.
- Recursive-depth work must include depth-specific visual coverage and an explicit interaction
  decision for shuffle.
