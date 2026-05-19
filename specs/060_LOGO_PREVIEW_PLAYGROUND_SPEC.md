# Logo Preview Playground Specification

## Document Control

- Status: Proposed
- Owner: Noter frontend
- Last updated: 2026-05-19
- Related files: `apps/noter/src/App.tsx`,
  `apps/noter/src/components/logo/LogoPreviewPage.tsx`,
  `apps/noter/src/components/logo/NLogoScene.tsx`,
  `apps/noter/src/components/logo/logoLeftFaceStyle.ts`,
  `apps/noter/src/components/logo/logoVoxelState.ts`,
  `apps/noter/src/components/logo/logoPresets.ts`,
  `apps/noter/src/components/logo/logoShuffleRules.ts`,
  `apps/noter/src/components/logo/logoTailwindColors.ts`,
  `specs/089_NOTER_LOGO_IDENTITY_INVARIANT_SPEC.md`,
  `specs/090_LOGO_RENDERING_MODEL_SIMPLIFICATION_SPEC.md`

## Conclusion

Noter exposes a public `/logo` route as a full-screen interactive playground for
the voxel logo. The page is primarily a visual exploration tool: it should make
the logo large, easy to manipulate, easy to recolor, easy to reshape, and easy
to share through the URL.

The scene is not a generic 3D editor. It is a focused playground for one `3x3x3`
voxel mark with a small, opinionated control surface, plus static recursive
depth previews of that mark.

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
- Making arbitrary large recursive depths fast or polished beyond the
  comfortable slider range.

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

- `ooo_oxo_ooo-oxo_xox_oxo-ooo_oxo_ooo`

### 3. Default shape

- The default voxel arrangement is: `ooo_oxo_ooo-oxo_xox_oxo-ooo_oxo_ooo`
- Loading `/logo` without `vox` should normalize to that exact state.

### 4. Editing

- Left click adds a voxel on the clicked visible face.
- Right click removes the clicked visible voxel.
- Editing only needs to work for exposed voxels.
- Hidden/internal voxels do not need separate direct manipulation affordances.
- Direct editing is a depth-1 behavior. Recursive depths render the repeated
  settled motif but do not allow tiny recursive cubes to be edited directly.

### 5. Recursive depth

- The `depth` query param controls recursive rendering.
- Depth `1` is the normal editable logo and is the default.
- Depths above `1` repeat the depth-1 motif recursively.
- The playground depth slider stops at `5`; direct number input and URL state
  may use higher normalized integer depths deliberately.
- Recursive depth keeps corners empty according to the Noter motif; it is not a
  standard Menger sponge.
- The Three preview uses a tiled recursive render path for recursive depths so
  changing depth does not build every tiny surface synchronously.
- `/logo/raster` is an experimental canvas route for high recursive depths. It
  renders one projected merged motif unit for the current view, composites that
  unit through the recursive motif, reuses the same far-to-near motif order at
  every level, and must avoid exact recursive voxel-grid expansion.
- `/logo/raster` renders exact snapped face views as a recursive 2D mask when no
  shuffle move is active, so same-color joined cells do not inherit seams from
  transparent image edges.
- `/logo/raster` uses a stable projection scale for the current elevation and
  rotation-axis mode, so rotating does not zoom the shape in and out.
- `/logo/iso` composes recursive depth from reusable isometric motif images. It
  must not build the exact leaf-voxel grid for depth above `1`.
- `/logo/svg` emits bounded nested reusable SVG groups for recursive depth. It
  must not serialize every recursive leaf face as a separate polygon.
- Public landing logos use the same tiled Three render path for recursive
  depths; their initial static SVG fallback stays bounded so a high `depth`
  query param cannot block the page before the canvas is ready.

## Shape Presets

### 1. Built-in presets

The playground should expose at least these presets:

- `Open Cross`
- `N Logo`
- `Sierpinski Carpet`
- `Cornerless Cube`

### 2. Sierpinski Carpet definition

- `Sierpinski Carpet` means the `3x3x3` level-1 face-carpet model: all corners
  and edge-center voxels are filled, while the true center and six face-center
  voxels are empty.

### 3. Cornerless Cube definition

- `Cornerless Cube` means the full `3x3x3` cube with all eight corner voxels
  removed.

### 4. Reset behavior

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

- The palette should come from the Tailwind color system used by the app.
- Theme-backed families must also be available:
  - `Primary`
  - `Background`
  - `Secondary`

### 3. Defaults

- Left face defaults to app `Primary`.
- Right face defaults to app `Background`.
- Top face defaults to app `Secondary`.
- The page background uses the app `Background` token.

### 4. Query-param scope

- Only voxel shape is persisted in query params today.
- Camera and face-color state should not be written to the URL if doing so makes
  dragging or interaction feel stuttery.

### 5. Left face style

- The `/logo` Three renderer may distinguish the left face with either the
  secondary color or a striped primary/background pattern.
- `secondary` is the default so existing identity assets keep their current
  left-face color relationship.
- `striped` is a shareable exploration state with controls for stripe width,
  gap, angle, and offset. Its default state is the canonical single-color
  treatment from `specs/089_NOTER_LOGO_IDENTITY_INVARIANT_SPEC.md`: `-45deg`,
  vertical basis, `1/4` width, `1/4` gap, and `0` offset.
- Stripe width and gap may be `0`, and the playground should expose a shareable
  linked-width/gap option for checking equal-period patterns quickly.
- Stripe width and gap are stored as user-facing measures. The Three shader
  receives perpendicular face-space distances after applying the selected width
  basis:
  - `auto`: multiply by `max(abs(sin(theta)), abs(cos(theta)))`.
  - `horizontal`: multiply by `abs(sin(theta))`.
  - `vertical`: multiply by `abs(cos(theta))`.
  - `raw`: multiply by `1`, preserving direct perpendicular shader thickness.
- `theta` is the stripe direction angle in the left face's local UV plane. The
  horizontal basis means the entered width/gap is the interval measured by a
  horizontal cross-section; the vertical basis means the same for a vertical
  cross-section. The auto basis uses the larger axis projection so cardinal
  stripe angles do not collapse to zero while the internal math still uses
  JavaScript double precision rather than UI-rounded approximations.
- The Three renderer passes the stripe angle directly to the shader so the
  canonical `stripeA=-45` treatment draws the accepted visible diagonal on
  projected left faces.
- Stripes must be rendered in the left face's local 3D surface space, not as a
  screen-space overlay, so dragging the logo keeps the pattern attached to the
  face geometry.
- The striped controls remain an exploration path for constrained-color marks.
  The default stripe recipe is accepted as the canonical single-color treatment,
  while committed multi-color identity SVG assets keep their current colors
  until a single-color asset export is explicitly added.

## Shuffle Animation

### 1. Purpose

- Shuffle is a visual exploration tool for the logo, not a physically exact
  puzzle solver.
- The motion should look clean and intentional.

### 2. Movement constraints

- A moving voxel can only slide to a face-adjacent empty cell.
- No jump moves.
- No moving outside the current voxel grid.
- Motion should be rendered as a direct slide between adjacent cells, not as a
  lifted arc through empty space.

### 3. Parallel motion

- The shuffle control supports `1`, `2`, or `3` parallel moving units.
- The default should be `3`.

### 4. Staggering

- Parallel movers must not all start at the same time.
- Later movers should begin with a staggered delay to keep the animation
  legible.

### 5. Origin constraints

- The same cube should not be chosen twice in a row when avoidable.
- The true center unit for the current grid must never be selected as a shuffle
  origin.
- Shuffle origins should be limited to cubes that currently have at least one
  exposed face visible to the current camera view.
- A cube only needs to satisfy the visibility rule when selected; it does not
  need to remain visible for the full duration of the move while the logo
  rotates.
- Shuffle may run at recursive depths and moves cubes in the current rendered
  voxel grid.
- In recursive Three previews, shuffle moves the rendered recursive tile units
  rather than the smallest leaf cubes.

## Rendering Rules

### 1. Surface quality

- Connected voxels should render as continuous surfaces without visible seams
  between joined cubes.
- The scene should not show fake panel gaps where cubes meet.
- Raster recursion must not introduce face-on seams by repeatedly resampling
  transparent cached-image edges.

### 2. Preset silhouettes

- The default `Open Cross` preset should read as a plus-like skeleton with the
  center cube removed.
- The `N Logo` preset should preserve the lowercase `n` face glyphs.

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

- Should app-wide theme experimentation be supported through query params such
  as `theme-primary=lime-700`?
- If theme query params are added, should they affect only `/logo` or the full
  app shell?
- Should hidden/internal voxels eventually get a secondary editing affordance,
  such as layer grids, or remain intentionally inaccessible?

## Summary

The logo playground is a focused, public, full-screen voxel exploration surface.
Its core contract is: shape is shareable through `vox`, the logo stays visually
clean, shuffle motion obeys local adjacency constraints, and the main controls
support direct exploration without overwhelming the scene.
