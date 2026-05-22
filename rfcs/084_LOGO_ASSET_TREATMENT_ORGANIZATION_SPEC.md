# 084 Logo Asset Treatment Organization Spec

## Document Control

- Status: Proposed
- Owner: Noter frontend
- Last updated: 2026-05-23
- Related docs:
  - `specs/060_LOGO_PREVIEW_PLAYGROUND_SPEC.md`
  - `specs/061_USER_LOGO_STATIC_SVG_DELIVERY_SPEC.md`
  - `specs/064_THIN_INSTALLABLE_WEB_APP_SPEC.md`
  - `specs/089_NOTER_LOGO_IDENTITY_INVARIANT_SPEC.md`
  - `specs/090_LOGO_RENDERING_MODEL_SIMPLIFICATION_SPEC.md`

## Summary

Logo asset names should separate four different ideas that are currently blended together:

1. the logo identity view, such as side-primary, side-diagonal, or spatial
2. the face treatment, such as duotone or striped
3. the product role, such as public logo, edit mark, install icon, social card, or browser favicon
4. the stable served URL, such as `/logo-static.svg` or `/icon-512.png`

Recommendation:

1. introduce a treatment-aware brand asset contract in code
2. generate treatment-named source assets under `apps/noter/public/brand/`
3. keep existing root public URLs as stable aliases for metadata, manifest, crawlers, and external
   references
4. make the default treatment switch by changing one exported default and regenerating aliases
5. leave browser favicons as their own role unless the product explicitly wants favicon treatment
   work

This makes a future change like "use the striped logo everywhere instead of the duotone secondary
side" a small default flip plus generated asset refresh, not a repo-wide hunt for unrelated icon and
logo paths.

## Why This RFC Exists

The current stripe work is hard to scope because asset names, generated output, and public contracts
all use root-level filenames:

1. `/logo-static.svg`
2. `/logo-v2-side-diagonal.svg`
3. `/install-icon.svg`
4. `/icon-512.png`
5. `/noter-social-card.png`

Those paths are useful stable public URLs, but they do not say which visual treatment they contain.
That makes it unclear whether a path is:

1. the canonical source for a brand treatment
2. an alias to the current default treatment
3. a generated install/social derivative
4. a browser compatibility asset
5. a fixture or old experiment

The result is a high-churn brand refresh. The code already knows the stripe recipe, but the public
asset layer does not have names or contracts that make treatment switching obvious.

## Current Code Facts

Accepted identity rules live in `specs/089_NOTER_LOGO_IDENTITY_INVARIANT_SPEC.md`:

1. the canonical shape is `STATIC_LOGO_VOXEL_COORDINATES`
2. the identity views are side-primary, side-diagonal, and spatial
3. the canonical stripe treatment is `LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE`
4. public SVG assets must be generated from `createLogoIdentityViewSvgMarkup`

Current implementation facts:

1. `apps/noter/src/components/logo/logoStaticSvgContract.ts` maps each identity view directly to a
   root public path.
2. `apps/noter/src/components/logo/logoStaticSvgAsset.ts` generates the root SVGs with
   `DEFAULT_FACE_COLORS`.
3. `apps/noter/src/components/logo/logoThreeSvgRenderer.ts` emits one solid polygon per visible
   face.
4. `apps/noter/src/components/logo/NLogoScene.tsx` already supports a striped left-face shader, but
   its default is `DEFAULT_LOGO_LEFT_FACE_STYLE`, currently secondary.
5. `apps/noter/src/components/logo/PublicLandingLogo.tsx` creates the SVG fallback from
   `createStaticLogoSvgDataUrl` and then mounts `NLogoScene` without passing a treatment override.
6. `apps/noter/src/components/installIconSvgAsset.ts` and
   `apps/noter/scripts/generate-install-icon-assets.ts` derive install assets from the current
   static logo, but the output names do not expose the treatment.
7. `apps/noter/src/lib/rootHead.ts`, `apps/noter/src/lib/pageMetadata.ts`, and
   `apps/noter/public/manifest.webmanifest` publish stable logo, favicon, install icon, and social
   image URLs.
8. `apps/noter/public/favicon.png` and `apps/noter/public/favicon-32.png` are current browser-chrome
   assets, but they do not have a known generator.
9. `apps/noter/public/noter-social-card.svg`, `apps/noter/public/noter-social-card.png`, and
   `apps/noter/public/noter-x-profile-banner.png` are public brand assets, but they do not currently
   have a code-owned treatment contract.
10. `apps/noter/public/logo_pick.svg` appears to be a legacy public logo artifact with no shipped
    code reference beyond fixture enumeration.

## Proposed Vocabulary

### Logo Identity View

The identity view describes camera and meaning, not color treatment:

1. `side-primary`
2. `side-diagonal`
3. `spatial`

These stay aligned with `LOGO_IDENTITY_VIEW_CONTRACTS`.

### Logo Face Treatment

The face treatment describes how the left face is painted:

1. `duotone`: right face uses primary, left face uses secondary, top face uses background
2. `striped`: right face uses primary, left face uses foreground/background stripes, top face uses
   background

Code should use `LogoFaceTreatment = "duotone" | "striped"` for committed identity asset output. The
playground can continue using the richer `LogoLeftFaceStyle` type for custom stripe controls.

### Asset Role

The asset role describes where the image is used:

1. `identity`: SVG mark for a named logo identity view
2. `public-logo`: the default public spatial logo
3. `edit-mark`: compact app-internal navigation mark
4. `install-icon`: PWA/Apple homescreen assets
5. `social-card`: OpenGraph/Twitter card image
6. `profile-banner`: X profile banner
7. `favicon`: small browser chrome icon
8. `fixture`: test or media fixture that is not a brand contract

Roles should be explicit in constants and generation code. They do not all need distinct TypeScript
types on day one, but generated asset jobs should say which role they are producing.

### Stable Served URL

A stable served URL is the external contract. It should not be renamed just because the underlying
treatment changes:

1. `/logo-static.svg`
2. `/logo-v2-side-diagonal.svg`
3. `/install-icon.svg`
4. `/icon-192.png`
5. `/icon-512.png`
6. `/icon-maskable-192.png`
7. `/icon-maskable-512.png`
8. `/apple-touch-icon.png`
9. `/favicon.png`
10. `/favicon-32.png`
11. `/noter-social-card.png`

Stable URLs may be generated aliases. They should point to the current default treatment.

## Proposed Public Asset Layout

Treatment-named source assets should live under `apps/noter/public/brand/`:

```text
apps/noter/public/brand/
  logo/
    v1-side-primary-duotone.svg
    v1-side-primary-striped.svg
    v2-side-diagonal-duotone.svg
    v2-side-diagonal-striped.svg
    v3-spatial-duotone.svg
    v3-spatial-striped.svg
  install/
    install-icon-duotone.svg
    install-icon-striped.svg
    icon-192-duotone.png
    icon-192-striped.png
    icon-512-duotone.png
    icon-512-striped.png
    icon-maskable-192-duotone.png
    icon-maskable-192-striped.png
    icon-maskable-512-duotone.png
    icon-maskable-512-striped.png
    apple-touch-icon-duotone.png
    apple-touch-icon-striped.png
  social/
    noter-social-card-duotone.svg
    noter-social-card-striped.svg
    noter-social-card-duotone.png
    noter-social-card-striped.png
    noter-x-profile-banner-duotone.png
    noter-x-profile-banner-striped.png
```

The existing root paths stay as stable aliases:

```text
apps/noter/public/logo-v1-side-primary.svg
apps/noter/public/logo-v2-side-diagonal.svg
apps/noter/public/logo-static.svg
apps/noter/public/install-icon.svg
apps/noter/public/icon-192.png
apps/noter/public/icon-512.png
apps/noter/public/icon-maskable-192.png
apps/noter/public/icon-maskable-512.png
apps/noter/public/apple-touch-icon.png
apps/noter/public/favicon.png
apps/noter/public/favicon-32.png
apps/noter/public/noter-social-card.png
```

Do not use root names like `icon-stripes.ico` as the source of truth. A name like that says the
treatment, but it drops role, size, maskability, and current file format. Prefer
`brand/install/icon-512-striped.png` as the named source and `/icon-512.png` as the served alias.

## Code Contract

`logoStaticSvgContract.ts` should own the small brand contract:

```ts
export const LOGO_FACE_TREATMENTS = ["duotone", "striped"] as const;
export type LogoFaceTreatment = (typeof LOGO_FACE_TREATMENTS)[number];
export const DEFAULT_LOGO_FACE_TREATMENT = "striped" satisfies LogoFaceTreatment;
```

The identity view contract should continue describing camera and semantic version:

```ts
export const LOGO_IDENTITY_VIEW_CONTRACTS = [
  { id: "side-primary", version: 1, rotationDegrees: 0, elevationDegrees: 0 },
  { id: "side-diagonal", version: 2, rotationDegrees: 45, elevationDegrees: 0 },
  {
    id: "spatial",
    version: 3,
    rotationDegrees: 45,
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
  },
] as const;
```

Add a narrow asset helper rather than a broad app-wide asset registry:

```ts
export function getLogoIdentityAssetPath(args: {
  treatment: LogoFaceTreatment;
  viewId: LogoIdentityViewId;
}): string;
```

Do not put treatment state in `logoSurfaceModel.ts`. That module should stay geometry-only so every
renderer can consume the same exposed-face model without inheriting a brand-output concern.

Stable aliases should also live in this module:

```ts
export const DEFAULT_STATIC_LOGO_SVG_URL = "/logo-static.svg";
export const LOGO_IDENTITY_EDIT_MARK_SVG_URL = "/logo-v2-side-diagonal.svg";
```

Those constants preserve current callers. Callers that only need the current product logo should not
know whether the current default treatment is duotone or striped.

## Rendering Contract

`createLogoThreeSvgMarkup` should accept a treatment or left-face style:

```ts
createLogoThreeSvgMarkup({
  leftFaceStyle,
  ...
});
```

For committed identity assets, convert `LogoFaceTreatment` to a `LogoLeftFaceStyle` at the boundary:

1. `duotone` maps to `{ kind: "secondary" }`
2. `striped` maps to `LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE`

SVG stripe output must stay in face-local space. The renderer should not use a screen-space SVG
pattern for left faces. A robust path is:

1. keep using `buildLogoSurfaceQuads` for exposed faces
2. for solid faces, emit the current projected polygon
3. for striped left faces, project stripe band polygons from the left face's local square
4. clip those stripe polygons to the projected left-face polygon
5. fill alternating bands with foreground/background according to
   `LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE`

That mirrors the Three shader requirement from `specs/060_LOGO_PREVIEW_PLAYGROUND_SPEC.md`: stripes
belong to the face geometry, not the screen.

`NLogoScene` can keep accepting the richer `LogoLeftFaceStyle` directly. `NLogoIsoScene` and
`NLogoRasterScene` may remain solid-left-face renderers in the first asset rollout because they are
dev exploration paths, not committed identity asset sources. If the playground needs the face-style
control to be truthful across every tab, thread `leftFaceStyle` into those renderers in a separate
phase.

## Generation Contract

Generation should produce two kinds of output:

1. treatment-named source assets under `public/brand/`
2. stable root aliases for the current default treatment

The Vite sync plugin may continue to keep SVG aliases current. Install asset generation should stop
reading an ambiguous root SVG as the conceptual source. It can still write root aliases, but the job
should derive from:

1. `DEFAULT_LOGO_FACE_TREATMENT`
2. `getLogoIdentityAssetPath({ viewId: "spatial", treatment })`
3. the shared SVG generator

Social and profile assets should get a generation path before the striped switch if possible. If
they remain hand-maintained for the first pass, the RFC should treat them as explicit manual
follow-up assets, not as files discovered by grep during the final brand flip.

## Tests And Validation

Unit tests should cover the contract directly:

1. each identity view has both duotone and striped generated SVG assets
2. stable root aliases equal the default treatment output
3. the default striped root aliases do not contain the secondary left-face fill
4. install icons are regenerated from the default treatment
5. metadata and manifest tests keep the stable root URLs, not the treatment-named source URLs
6. favicon metadata keeps the root favicon URLs unless a separate favicon project changes them

Visual coverage should include:

1. public landing logo first paint and enhanced Three handoff
2. dashboard `NoterLogoMark`
3. `/logo` default state
4. `/logo?leftFace=secondary` as the deliberate duotone comparison path if kept
5. install/social asset review images when PNG assets change

When refreshing Playwright baselines, keep using the repo rule for Docker Linux ARM64 screenshots.

## Rollout Plan

### Phase 1: Introduce Treatment-Aware Asset Contracts

Add `LogoFaceTreatment`, treatment-named asset paths, and default-treatment alias helpers.

Default stays duotone in this phase. Generated root assets should not change visually.

### Phase 2: Add SVG Stripe Rendering

Teach `logoThreeSvgRenderer.ts` to emit face-local striped left faces. Add unit tests that compare
duotone and striped generated SVG output and assert stripe geometry exists on left faces only.

### Phase 3: Generate Named Brand Assets

Generate and commit `public/brand/logo/*-duotone.svg` and `public/brand/logo/*-striped.svg`.

Update the Vite sync plugin and static asset tests so root logo aliases are generated from the
current default treatment.

### Phase 4: Switch The Product Default

Change `DEFAULT_LOGO_FACE_TREATMENT` from `duotone` to `striped`.

Regenerate root logo aliases, install icons, social card assets, and profile banner assets. Update
`specs/060_LOGO_PREVIEW_PLAYGROUND_SPEC.md` and `specs/089_NOTER_LOGO_IDENTITY_INVARIANT_SPEC.md` so
the accepted docs no longer describe secondary as the product default.

### Phase 5: Reduce Legacy Surface Area

Keep stable root aliases indefinitely. Keep duotone named source assets as long as they are useful
for comparison or rollback.

Delete unused experimental assets such as `logo_pick.svg` only in a separate cleanup if no shipped
or test surface depends on them.

## Non-Goals

1. Do not rename existing stable root public URLs as part of the treatment switch.
2. Do not add `.ico` output unless browser support or product requirements prove the PNG favicons
   are insufficient.
3. Do not move landing preview videos, repository media fixtures, or unrelated public files into the
   brand namespace.
4. Do not introduce a generic asset registry for the whole app.
5. Do not make route query color overrides write to product metadata or install assets.

## Open Questions

1. Should `/logo/iso` and `/logo/raster` support striped left faces in the same rollout, or should
   they remain dev exploration renderers until a second pass?
2. Should the X profile banner become generated from SVG/HTML source, or is a hand-reviewed raster
   acceptable for brand refreshes?
3. Should the default `/logo` route canonicalize striped state out of the URL, while
   `leftFace=secondary` remains the shareable duotone override?
4. Should old duotone root assets be kept anywhere outside `public/brand/` after the switch?

## Expected Change Size

The organization pass is small to medium:

1. one contract module update
2. one SVG renderer update
3. one asset generation update
4. one install icon generation update
5. one or two spec updates
6. generated SVG/PNG asset churn
7. visual baseline refreshes for the public/logo/dashboard surfaces

The important reduction is future change size. Once role, treatment, and stable URL aliases are
separate, switching the product default from one treatment to another should mostly touch:

1. `DEFAULT_LOGO_FACE_TREATMENT`
2. generated aliases
3. intentional screenshots
4. accepted spec language
