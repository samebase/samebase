# 089 Noter Logo Identity Invariant Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend
- Last updated: 2026-05-01
- Related files: `apps/noter/src/components/logoStaticSvgContract.ts`,
  `apps/noter/src/components/logoStaticSvgAsset.ts`,
  `apps/noter/public/logo-v1-side-primary.svg`,
  `apps/noter/public/logo-v2-side-diagonal.svg`,
  `apps/noter/public/logo-static.svg`,
  `apps/noter/public/noter-x-profile-banner.png`,
  `apps/noter/public/noter-social-card.svg`,
  `specs/060_LOGO_PREVIEW_PLAYGROUND_SPEC.md`,
  `specs/061_USER_LOGO_STATIC_SVG_DELIVERY_SPEC.md`

## Summary

The Noter logo identity is one `3x3x3` voxel shape viewed through three stable
camera states:

1. Version 1, side-primary: at rotation `0deg` and elevation `0deg`, the mark
   reads as a `3x3` primary-color square with the center cut out to the
   background.
2. Version 2, side-diagonal: at rotation `45deg` and elevation `0deg`, the mark
   exposes the primary and secondary side colors without showing the top face.
3. Version 3, spatial: from the same `45deg` rotation tilted down to the static
   logo elevation, the mark exposes the white top faces and reads as the full 3D
   object.

The X profile banner already uses this sequence as the brand explanation. This
spec makes that sequence a code and asset invariant rather than an implied
memory.

## Source Of Truth

- The canonical shape is `STATIC_LOGO_VOXEL_COORDINATES`.
- The canonical default colors are `DEFAULT_FACE_COLORS`: primary on the right
  face, secondary on the left face, and background on the top face.
- The canonical identity views live in `LOGO_IDENTITY_VIEW_CONTRACTS`.
- Public SVG assets must be generated from `createLogoIdentityViewSvgMarkup`;
  product code must not hand-draw approximations of these marks.

## Asset Contract

- `/logo-v1-side-primary.svg` is the version 1 side-primary mark.
- `/logo-v2-side-diagonal.svg` is the version 2 side-diagonal mark.
- `/logo-static.svg` is the version 3 spatial mark and remains the canonical
  public static logo.

Small favicons remain browser-chrome assets. They are not the identity source
for product UI icons unless the product explicitly wants the favicon treatment.

## Product Usage

When a product UI needs a compact Noter identity mark, choose the named identity
view that matches the product meaning:

- Use version 2 for app-internal navigation back into Noter, such as the
  dashboard branch `Edit` link.
- Use version 3 for public marketing, install, and social-card surfaces where
  the full spatial object should carry the brand.
- Use version 1 only when the surface intentionally needs the straight-on
  primary side.

## Validation

Tests must keep every committed logo identity SVG synchronized with the
generator and must assert the view contracts for versions 1, 2, and 3. Any
future brand change should update the contract, generated assets, tests, and
this spec together.
