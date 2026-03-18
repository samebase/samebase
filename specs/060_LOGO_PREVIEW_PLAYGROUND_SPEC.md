# Logo Preview Playground Specification

## Document Control

- Status: Proposed
- Owner: Noter frontend
- Last updated: 2026-03-17
- Related files: `apps/noter/src/App.tsx`,
  `apps/noter/src/components/LogoPreviewPage.tsx`,
  `apps/noter/src/components/NLogoScene.tsx`,
  `apps/noter/src/components/logoVoxelState.ts`,
  `apps/noter/src/components/logoPresets.ts`,
  `apps/noter/src/components/logoShuffleRules.ts`,
  `apps/noter/src/components/logoTailwindColors.ts`

## Conclusion

Noter exposes a public `/logo` route as a full-screen interactive playground for
the voxel logo. The page is primarily a visual exploration tool: it should make
the logo large, easy to manipulate, easy to recolor, easy to reshape, and easy
to share through the URL.

The scene is not a generic 3D editor. It is a focused playground for one `3x3x3`
voxel mark with a small, opinionated control surface.

## Goals

- Provide a public route for rapid visual iteration on the voxel logo.
- Keep the logo itself as the primary visual element on screen.
- Allow direct manipulation of camera angle, visible voxels, colors, presets,
  and shuffle animation.
- Make the voxel arrangement shareable through the URL.
- Preserve the visual rules required for the logo to look intentional rather
  than noisy.

## Non-Goals

- A full general-purpose voxel modeling tool.
- Persistent storage of logo edits in Convex.
- A production branding system for the entire app theme.
- Perfect physically simulated motion.
- Support for arbitrary grid sizes larger than `3x3x3`.

## Route and Layout

### 1. Public route

- The playground lives at `/logo`.
- The route should remain publicly accessible without app auth friction.

### 2. Scene-first layout

- The canvas should occupy the full viewport.
- Controls should render as a lightweight overlay rather than taking page space
  away from the scene.
- The logo must be visible immediately without scrolling on desktop or mobile.

### 3. Mobile behavior

- The logo must fit inside portrait mobile view without clipping.
- The overlay controls must remain usable on narrow screens.

## Voxel Model

### 1. Grid

- The logo is modeled as a `3x3x3` voxel grid.
- Each voxel is either filled or empty.

### 2. URL serialization

- Voxel state is stored in the `vox` query param.
- The canonical format is three layers joined by `-`, with rows inside each
  layer joined by `_`.
- Filled cells use `x`; empty cells use `o`.
- Layer order is top to bottom.
- Within each layer, rows are ordered consistently and must remain stable.

Example:

- `xxx_oox_xxo-xoo_ooo_xox-oxx_xox_xox`

### 3. Default shape

- The default voxel arrangement is: `xxx_oox_xxo-xoo_ooo_xox-oxx_xox_xox`
- Loading `/logo` without `vox` should normalize to that exact state.

### 4. Editing

- Left click adds a voxel on the clicked visible face.
- Right click removes the clicked visible voxel.
- Editing only needs to work for exposed voxels.
- Hidden/internal voxels do not need separate direct manipulation affordances.

## Shape Presets

### 1. Built-in presets

The playground should expose at least these presets:

- `N Logo`
- `Cornerless Cube`

### 2. Cornerless Cube definition

- `Cornerless Cube` means the full `3x3x3` cube with all eight corner voxels
  removed.

### 3. Reset behavior

- Selecting a preset applies it immediately.
- `Reset shape` should reset to the currently selected preset.
- If the current URL shape does not match a built-in preset, the UI may show it
  as `Custom`.

## Camera and Interaction

### 1. Dragging

- Dragging the scene is the primary way to rotate it.
- Horizontal drag changes yaw.
- Vertical drag changes elevation.
- Elevation should wrap through the full `360` degrees rather than clamping.

### 2. Direct controls

- Yaw and elevation controls may exist, but they do not need to stay expanded by
  default because drag is the main interaction.
- The UI should still expose exact numeric values somewhere when needed for
  debugging and tuning.

### 3. Default framing

- The default camera should preserve left/right symmetry.
- The top face should be somewhat smaller than in exact isometric framing.

## Color Controls

### 1. Face colors

- Left, right, and top faces each have independent color controls.
- Each face uses two selects:
  - color family
  - color shade

### 2. Palette source

- The palette should come from a fixed Tailwind-style color set exposed by the
  playground.

### 3. Defaults

- Left face defaults to `Stone 900`.
- Right face defaults to `White`.
- Top face defaults to `Stone 100`.
- The page background uses `White`.

### 4. Query-param scope

- Only voxel shape is persisted in query params today.
- Camera and face-color state should not be written to the URL if doing so makes
  dragging or interaction feel stuttery.

## Shuffle Animation

### 1. Purpose

- Shuffle is a visual exploration tool for the logo, not a physically exact
  puzzle solver.
- The motion should look clean and intentional.

### 2. Movement constraints

- A moving voxel can only slide to a face-adjacent empty cell.
- No jump moves.
- No moving outside the `3x3x3` grid.
- Motion should be rendered as a direct slide between adjacent cells, not as a
  lifted arc through empty space.

### 3. Parallel motion

- The shuffle control supports `1`, `2`, or `3` parallel moving cubes.
- The default should be `3`.

### 4. Staggering

- Parallel movers must not all start at the same time.
- Later movers should begin with a staggered delay to keep the animation
  legible.

### 5. Origin constraints

- The same cube should not be chosen twice in a row when avoidable.
- The true center cube `[1,1,1]` must never be selected as a shuffle origin.
- Shuffle origins should be limited to cubes that currently have at least one
  exposed face visible to the current camera view.
- A cube only needs to satisfy the visibility rule when selected; it does not
  need to remain visible for the full duration of the move while the logo
  rotates.

## Rendering Rules

### 1. Surface quality

- Connected voxels should render as continuous surfaces without visible seams
  between joined cubes.
- The scene should not show fake panel gaps where cubes meet.

### 2. Face glyphs

- The left face is the primary lowercase `n`.
- The right face reads as the rotated counterpart.
- The top face also reads as a lowercase `n`, rotated relative to the left face.

## Implemented Baseline

The current implemented baseline includes:

- public `/logo` route
- full-screen canvas layout
- drag rotation
- manual voxel editing
- voxel URL serialization
- face color controls
- shape presets
- constrained shuffle animation
- defaults for shape, colors, and three-cube parallel shuffle

## Open Questions

- Should hidden/internal voxels eventually get a secondary editing affordance,
  such as layer grids, or remain intentionally inaccessible?

## Summary

The logo playground is a focused, public, full-screen voxel exploration surface.
Its core contract is: shape is shareable through `vox`, the logo stays visually
clean, shuffle motion obeys local adjacency constraints, and the main controls
support direct exploration without overwhelming the scene.
