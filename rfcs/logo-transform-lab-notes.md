# Logo Transform Lab Notes

This file captures the current working decisions for the logo transform lab so a
future thread can resume the same direction without re-deriving the constraints.

## Main goals

- SVG is important because final output size and load speed matter. A compact
  generated SVG is a core success metric, not an afterthought.
- Three.js still matters as a fast iteration tool, but it should not become the
  source of truth for geometry decisions. The shared source of truth should be a
  simple cube/grid model that both Three.js and SVG can render.
- The generated markup matters. The lab is not only a visual playground; it is
  also a way to inspect the final SVG that may ship.

## User preferences and working style

- Prefer simplifying the generated SVG whenever possible.
- Reuse defs aggressively when it reduces repeated markup.
- Keep ids short when they are emitted into final SVG. Example: shared unit rect
  id is `unit`.
- Avoid noisy serialized numbers. Example: prefer `1` over `1.000000`.
- When the UI shows generated SVG, it should reflect the actual rendered scene.
  Toggles should update both the preview and the markup text at the same time.
- Axis labels and face names must be truthful to the actual math. The user is
  using the axes to debug mental-model issues, so misleading labels are worse
  than missing labels.

## Current geometric conventions

- Face names:
  - `posZ-front`
  - `negZ-back`
  - `posX-right`
  - `negX-left`
  - `posY-down`
  - `negY-top`
- The current cube occupies unit coordinates:
  - `x: 0 -> 1`
  - `y: 0 -> 1`
  - `z: 0 -> 1`
- In this model, positive `Y` moves down. That matches SVG screen-space
  intuition and is acceptable as long as the naming stays consistent.
- `rotation=0` and `elevation=0` should be the literal front view, not an
  implicit diagonal or hidden `45deg` offset.

## Projection/rendering decisions

- Do not use CSS 3D for this lab. We tried that path and it was the wrong
  abstraction for this problem:
  - CSS 3D introduced a real 3D scene graph and perspective-oriented thinking.
  - The lab needs inspectable generated SVG, not only browser-side rendering.
  - The user wants the projection model to stay explicit and mathematically
    understandable.
- The intended feel is parallel/orthographic-style projection, not perspective.
  Farther faces should not get smaller just because they are farther away.
- Direct per-face SVG transforms are more stable than decomposing the cube
  through a changing parent basis. A previous parent-basis attempt caused:
  - singularities when the chosen basis turned edge-on
  - visible flipping when the basis switched between faces

## SVG structure decisions

- Keep one shared unit rect in defs and reuse it for each face definition.
- Keep a reusable ordered face stack in defs:
  - `transform-lab-faces`
  - draw it later with a `<use>` so the same ordered cube can be reused for
    multiple instances if needed
- Keep axes as an optional study aid only. They are not part of the final cube
  SVG by default, so the lab exposes a toggle to include/exclude them from both
  the preview and the generated markup.

## Multiple cubes / scene model

- The clean mental model for multiple cubes is an integer grid.
- One cube occupies one unit cell:
  - `x: n -> n+1`
  - `y: m -> m+1`
  - `z: k -> k+1`
- Additional cubes should be placed by unit translations in cube space, not by
  ad hoc per-face offsets.
- This cube/grid model should be renderer-agnostic:
  - SVG renderer projects faces to 2D and sorts paint order
  - Three.js renderer can use the same cube coordinates for faster iteration

## Vox string convention

- Prefer the simplest axis order for serialized `vox=` strings:
  - layers: `negZ -> posZ`
  - rows inside a layer: `negY -> posY`
  - columns inside a row: `negX -> posX`
- This means the serialized traversal order should be `Z -> Y -> X`, all in the
  same negative-to-positive direction.
- This convention optimizes for implementation simplicity and a predictable
  counting order rather than matching the visually emphasized `posZ-front` face.
- Changing the `vox` string convention is primarily a `logoVoxelState.ts`
  concern:
  - `serializeVoxelState` and `parseVoxelState` define the traversal order
  - renderers consume parsed `(x, y, z)` coordinates and do not need geometry
    changes just because the string ordering changes
- Three.js, SVG, and isometric renderers should continue to share the same
  coordinate model after parsing. The serialization order should not dictate the
  renderer math.
- Main implication of changing the serializer/parser: existing `vox` URLs or
  copied voxel strings may be reinterpreted differently, so that change should
  be treated as a format change rather than a renderer refactor.

## Implications for future work

- If future optimization work changes markup structure, preserve the same
  underlying cube/grid model and face naming.
- If future Three.js work diverges, prefer adding a clear conversion layer
  rather than changing the SVG-oriented coordinate model just to match Three.js.
- If the user questions a projection result, treat the axes and generated SVG as
  the debugging surface first. The user is using this lab to validate the math,
  not only the visuals.
