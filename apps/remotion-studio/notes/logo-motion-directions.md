# Logo motion directions

The logo video should work as visual proof of the Samebase idea, not as an abstract cube reel. Begin
with one invariant shape, then change one real `/logo` control at a time so each result can still be
traced back to the same base.

## Current composition

`LogoHype` is a 12-second identity sequence:

1. Establish the exact flat variant 1 at `0°` yaw and `0°` elevation.
2. Rotate to the exact flat variant 2 at `45°` yaw.
3. Elevate to the exact isometric variant 3 at `35.26438968°`.
4. Move three cubes with the production adjacent-vacancy shuffle rules, duration, stagger, and
   easing.
5. Reset to the canonical shape, then introduce the shared Menger motif at depth 1.
6. Run the production Menger transition through depth 2 and depth 3.
7. Return to the canonical isometric mark and Samebase wordmark.

The on-screen argument is: “start from the same base”, “explore different directions”, “go deeper”,
and “wildly different results”.

## Reusable motion vocabulary

Future compositions can combine the existing product controls without inventing unrelated logo
physics:

- the three canonical identity views
- cube-axis and screen-vertical auto-rotation
- one to three parallel adjacent-cell shuffle moves
- cube distance, zoom, and opacity
- face colors and left-face stripe motion
- recursive depth for the selected motif
- the shipped voxel presets and direct voxel edits

Use an orthographic camera for identity work. Keep the opening base readable, then change one
control per beat before combining controls at the climax.

The canonical Samebase motif at greater depth is its own recursive result. A standard Menger result
requires selecting `MENGER_SPONGE_VOXEL_STATE` before increasing depth.

## Code boundary

Renderer-independent identity, camera, voxel, surface, auto-rotation, shuffle, and Menger depth
transition behavior belongs in `@samebase/logo-model`. The Samebase app and Remotion provide
separate live-clock and frame-clock renderer adapters over that shared behavior.

Crossfade separate canvas layers when changing unrelated voxel appearances. Within the Menger
transition, render the shared settled shape and staggered exposed faces in one canvas. Making
overlapping, coplanar surface meshes transparent inside one scene causes depth-order artifacts as
their faces appear and disappear.
