# 089 Samebase Logo Identity Invariant Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend
- Last updated: 2026-07-20
- Related files: `apps/samebase/src/components/logo/logoStaticSvgContract.ts`,
  `apps/samebase/src/components/logo/logoStaticSvgAsset.ts`,
  `apps/samebase/src/components/compactIdentitySvgAsset.ts`,
  `apps/samebase/src/components/logo/logoFaceTreatment.ts`,
  `apps/samebase/src/components/logo/logoLeftFaceStyle.ts`, `apps/samebase/public/brand/`,
  `apps/samebase/public/logo-v1-side-primary.svg`, `apps/samebase/public/logo-v2-side-diagonal.svg`,
  `apps/samebase/public/logo-static.svg`, `apps/samebase/public/noter-x-profile-banner.png`,
  `apps/samebase/public/noter-social-card.svg`, `rfcs/060_LOGO_PREVIEW_PLAYGROUND_SPEC.md`,
  `rfcs/061_USER_LOGO_STATIC_SVG_DELIVERY_SPEC.md`,
  `specs/090_LOGO_RENDERING_MODEL_SIMPLIFICATION_SPEC.md`

## Summary

The Samebase logo identity is one `3x3x3` voxel shape viewed through three stable camera states:

1. Version 1, side-primary: at rotation `0deg` and elevation `0deg`, the mark reads as a `3x3`
   primary-color square with the center cut out to the background.
2. Version 2, side-diagonal: at rotation `45deg` and elevation `0deg`, the mark exposes the primary
   side and secondary-color left face without showing the top face.
3. Version 3, spatial: from the same `45deg` rotation tilted down to the static logo elevation, the
   mark exposes the white top faces and reads as the full 3D object.

The X profile banner already uses this sequence as the brand explanation. This spec makes that
sequence a code and asset invariant rather than an implied memory.

Compact identity surfaces use the clean version 1 projection as a single dark square with its center
square removed. This is the canonical icon treatment for browser chrome, app installation, plugin
and mention avatars, structured identity metadata, and compact in-app navigation. The spatial
version 3 mark remains the expressive rendering for landing and social compositions.

Recursive `/logo?depth=...` previews and `gridSize=2` playground states are exploration render
states. They do not change the canonical identity asset contract unless this spec, the generated
assets, and the synchronization tests are updated together.

When a surface can only use one foreground color plus its background, use the canonical single-color
stripe treatment. The shape and camera stay the same as the relevant identity view; only the left
face changes from secondary color to a primary/background stripe pattern.

## Source Of Truth

- The canonical shape is `STATIC_LOGO_VOXEL_COORDINATES`.
- The canonical default treatment is `DEFAULT_LOGO_FACE_TREATMENT`, currently `duotone`.
- The canonical duotone colors are `DEFAULT_FACE_COLORS`: primary on the right face, secondary on
  the left face, and background on the top face.
- The canonical single-color stripe treatment is `LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE`.
- The canonical identity views live in `LOGO_IDENTITY_VIEW_CONTRACTS`.
- Expressive public SVG assets must be generated from `createLogoIdentityViewSvgMarkup`.
- Compact icon assets must be generated from `createCompactIdentitySvgMarkup`; product code must not
  hand-draw approximations of the compact mark.

## Single-Color Stripe Treatment

Use this treatment whenever the Samebase mark must work with one foreground color:

- Right face: fill solid foreground color.
- Top face: leave as background/knockout.
- Left face: fill with foreground stripes over background.
- Stripe angle: `-45deg` in the left face's local square.
- Stripe basis: `vertical`.
- Stripe width: `1/4` face unit.
- Stripe gap: `1/4` face unit.
- Stripe offset: `0`.

For ruler drawing, treat each exposed left face as a unit square before projection. Let `x` run
left-to-right from `0` to `1`, and let `y` run bottom-to-top from `0` to `1`. Draw stripe boundary
lines at:

```text
x + y = n / 4
```

for each integer `n` where the line crosses the square. Fill the bands where:

```text
(x + y) mod (1 / 2) < 1 / 4
```

and leave the alternating bands as background. This means the lower-left corner of every exposed
left face starts as foreground, each foreground band and gap is one quarter of a face unit along a
vertical or horizontal cross-section, and the full foreground-plus-gap period is one half of a face
unit. Because each cube face is one unit wide and the period divides one unit exactly, every cube
gets the same stripe phase.

## Asset Contract

- `/logo-v1-side-primary.svg` is the version 1 side-primary mark.
- `/logo-v2-side-diagonal.svg` is the version 2 side-diagonal mark.
- `/logo-static.svg` is the version 3 spatial mark and remains the canonical public static logo.
- Stable root logo URLs point at the current default treatment.
- Treatment-named assets under `apps/samebase/public/brand/logo/` preserve both `duotone` and
  `striped` exports for each identity view.
- `/brand/icon/compact-v1.svg` is the treatmentless source for the compact icon.
- `/samebase-icon.svg` and `/install-icon.svg` are stable aliases of the compact icon source.
- Favicons, Apple touch, manifest, ChatGPT plugin, structured identity metadata, and compact in-app
  marks all use the same clean version 1 geometry.
- Maskable manifest assets preserve the same square-ring geometry with additional white safety space
  so platform crops do not clip the outer square.

## Product Usage

When a product surface needs a compact Samebase identity mark, use the clean version 1 icon.

- Use version 1 for favicons, avatars, install icons, compact navigation, and other icon roles.
- Use version 2 only when explaining the transition between the primary side and the spatial mark.
- Use version 3 for public marketing and social-card compositions where the full spatial object
  carries the brand.
- When any of the three identity views needs a single-color treatment, preserve that view's camera
  and shape, then apply the canonical single-color stripe treatment above.

## Validation

Tests must keep every committed logo identity SVG synchronized with the generator, assert the view
contracts for versions 1, 2, and 3, and verify every compact raster against its exact square pixel
geometry. Any future brand change should update the contract, generated assets, tests, and this spec
together.
