# 090 Logo Rendering Model Simplification Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend
- Last updated: 2026-05-17
- Related files: `specs/060_LOGO_PREVIEW_PLAYGROUND_SPEC.md`,
  `specs/061_USER_LOGO_STATIC_SVG_DELIVERY_SPEC.md`,
  `specs/089_NOTER_LOGO_IDENTITY_INVARIANT_SPEC.md`,
  `apps/noter/src/components/NLogoScene.tsx`,
  `apps/noter/src/components/logoThreeSvgRenderer.ts`,
  `apps/noter/src/components/logoIsometricRenderer.ts`,
  `apps/noter/src/components/logoSurfaceModel.ts`,
  `apps/noter/src/components/logoVoxelState.ts`

## Summary

Noter should simplify logo rendering around one mental model:

1. A settled voxel shape is the source of truth.
2. Optional motion state describes cubes that are temporarily moving.
3. Surface geometry is derived from settled voxels plus motion state.
4. Renderers are thin adapters for WebGL, smooth SVG, and pixel-art isometric
   output.

The renderer model must preserve the existing Three.js cube shuffle behavior.
Moving cubes are not a reason to keep each renderer owning its own surface
extraction logic; they are a transient layer above the settled shape.

## Context

The current logo stack grew from exploration:

- `/logo` uses `NLogoScene` and Three.js.
- `/logo/svg` uses `logoThreeSvgRenderer`.
- `/logo/iso` uses `NLogoIsoScene` and `logoIsometricRenderer`.
- public landing renders a static SVG first, then may progressively enhance to
  the Three scene.

Those paths are valid product surfaces, but they duplicate shape and face
concepts. The result is hard to reason about when adding recursive shapes,
performance improvements, static SVG changes, or motion.

The accepted identity spec still defines the canonical mark as one `3x3x3` voxel
shape. Recursive depth is a playground/rendering option, not the baseline
identity source.

## Goals

- Keep one settled voxel-shape source of truth.
- Keep cube motion possible in the live Three renderer.
- Remove duplicate exposed-face extraction from renderer implementations.
- Keep smooth SVG output visually aligned with the Three logo surface.
- Keep pixel-art isometric rendering as a separate projection, not a separate
  shape model.
- Make recursive/tiled rendering use the same settled-shape input without
  reshaping every renderer.

## Non-Goals

- Replacing Three.js in this phase.
- Making recursive depth a public identity asset or replacing the default brand
  mark.
- Removing the isometric renderer.
- Turning the logo playground into a generic larger-grid voxel editor.
- Solving all shuffle performance issues in the first extraction.

## Model

### 1. Settled shape

The settled shape is a `LogoVoxelGrid`-like value:

- grid size
- filled voxel coordinates

For the current accepted logo identity, the grid size is `3`.

### 2. Motion state

Motion state is a separate transient value:

- moving voxel coordinate
- source coordinate
- destination coordinate
- progress

The settled shape should not be overwritten every frame just to express a cube
sliding between two adjacent cells. Renderers can temporarily omit the moving
voxel from the settled surface, then draw the moving cube above it.

### 3. Surface model

The shared surface model derives exposed faces from settled voxels. It returns
renderer-neutral quads:

- four world vertices
- outward normal
- face color key
- stable key
- material index for the existing Three material layout

The surface model is derived data. It is not the source of truth for editing or
motion.

### 4. Renderer adapters

Each renderer should do only renderer-specific work:

- Three: convert surface quads into WebGL geometry and draw moving cubes.
- Smooth SVG: project shared surface quads into SVG polygons.
- Isometric: project settled and moving cubes into the pixel-art face model.

## Phased Plan

### Phase 1: Shared Surface Extraction

Create `logoSurfaceModel.ts` and move exposed-face extraction there. Wire
`NLogoScene` and `logoThreeSvgRenderer` to consume it. This phase should be a
behavior-preserving refactor.

### Phase 2: Three Geometry Simplification

Stop creating one Three mesh per exposed quad. Build fewer renderer objects from
the shared surface model, such as one geometry per face-color material group.
Keep raycasting and cube shuffle behavior intact.

### Phase 3: Motion State Cleanup

Make the live renderer's moving cubes explicit as motion state above the settled
voxel shape. Avoid rebuilding more static geometry than necessary while movement
is in progress.

### Phase 4: Isometric Alignment

Keep the isometric renderer's projection style, but make its shape input match
the shared settled-shape plus motion-state model. Do not make it rediscover
shape rules from URL or route state.

### Phase 5: Recursive Tile Exploration

Add a `depth` route/search option after the renderer model is simpler. Depth `1`
is the normal editable logo. Higher depths render the recursive settled shape
through the shared voxel-grid model across Three, smooth SVG, isometric, and
public landing logo surfaces. The playground slider should stop at `5` as the
comfortable exploration range, while direct number input and URL state may use
higher normalized integer depths deliberately. Recursive depths stay static as
shapes: rotation, dragging, colors, opacity, and static SVG output continue to
work. Direct tiny-cube editing remains a depth-1 behavior, while shuffle may
move cubes in whichever recursive voxel grid is currently rendered.

## Validation

- Unit tests must cover the shared surface model independently from renderers.
- Static SVG tests must keep committed identity assets synchronized with the
  generator.
- Existing logo Playwright visual coverage must continue to pass after each
  renderer-adapter phase.
- Recursive-depth work must include depth-specific visual coverage and an
  explicit interaction decision for shuffle.
