# SVG coordinate audit

Date: 2026-09-06

## Result

Keep the existing simple 60-unit inline logo and standardize its use. Readable, exact integer
geometry is the goal. A common 100-unit viewBox does not help when it turns thirds into fractions.

The inline square is 80% of a 60-unit canvas: 48 units wide with 6 units of padding. Its opening is
one third of 48: 16 units wide, with 22 units on each side. The existing SVG already expresses this
clearly:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60" shape-rendering="crispEdges">
  <path d="M6 6h48v48H6z M22 22h16v16H22z" fill="#394447" fill-rule="evenodd" />
</svg>
```

A 100-unit canvas would make the square 80 units and its opening 80 divided by 3. That conversion
was unnecessary and has been removed. The template retains the exact simple SVG above.

## Inventory

The audit at commit `5181710f6` found 51 tracked SVG files and also examined inline SVG components
and generated markup. A read-only inventory agent checked this worktree. No connected app
repositories were changed.

| Family                                                           | Files | Decision                                         |
| ---------------------------------------------------------------- | ----: | ------------------------------------------------ |
| Compact Samebase icons and template/example copies               |     8 | Keep exact integer grids and share their sources |
| Projected Samebase logo variants and root aliases                |     9 | Keep the shared 360-unit renderer coordinates    |
| Old projected inline logo                                        |     1 | Remove and use the existing simple inline logo   |
| Social cards and profile banners                                 |     6 | Keep 1200 by 630 and 1500 by 500 canvases        |
| Provider marks in the landing page                               |     9 | Keep the supplied artwork and aspect ratio       |
| Media fixture, legacy logo pick asset, and Solid example favicon |     3 | Keep their existing purpose-specific coordinates |
| Convex skill icons across three skill trees                      |    15 | Keep the supplied skill assets                   |

After removal of the old inline projection export, 50 tracked SVG files remain.

## Compact geometry

[The identity spec](../specs/089_SAMEBASE_LOGO_IDENTITY_INVARIANT_SPEC.md#asset-contract) owns the
contract. [The compact generator](../apps/samebase/src/components/compactIdentitySvgAsset.ts#L20)
owns the assets.

| Use                                | ViewBox size | Square width | Padding | Opening width | Visible square |
| ---------------------------------- | -----------: | -----------: | ------: | ------------: | -------------: |
| Standard icon and template favicon |           60 |           42 |       9 |            14 |            70% |
| 16px and 32px favicon rasters      |            8 |            6 |       1 |             2 |            75% |
| Inline wordmarks and attribution   |           60 |           48 |       6 |            16 |            80% |
| Maskable install icons             |           32 |           18 |       7 |             6 |         56.25% |

These grids already give exact centered openings without rounded coordinates. The inline asset has a
transparent opening and canvas. Other compact icons retain their existing opaque background.

## Source ownership

The earlier long inline SVG came from the 3D projection pipeline. It had a cropped fractional
viewBox and eight subpaths. One landing-page wordmark still used it while the other used the compact
source. Both now use the simple compact source.

[The asset command](../apps/samebase/scripts/generate-install-icon-assets.ts#L338) also writes the
starter favicon, starter attribution logo, and Sidebars example logo from the compact sources. The
existing asset tests and verification command check those copies for drift.

Run `pnpm --filter samebase generate:logo-assets` after changing compact geometry. Stage changed
template files before `pnpm run template:export`, then update the existing starter manifest snapshot
if its content hash changes. Do not edit generated SVG copies independently.

## Other SVG families

The projected logo renderer shares its camera, points, strokes, clipping, and nested reuse with
interactive logo views. Social SVGs embed those 360-unit logo bodies in wide canvases. Converting
those files to 100 units would not make their projected geometry simpler.

Provider logos include Convex, Cloudflare, GitHub, Netlify, Tailwind CSS, TanStack, and Vite+. Their
viewBoxes describe supplied artwork. Gesture overlays use viewport pixels; logo research views use
unit squares, mutable viewBoxes, and projected coordinates required by their renderer.

`public/logo_pick.svg` has no current source callsite. It is a legacy public asset outside the
active identity generator. This change does not assign it a new role.

## Verification

Existing compact-asset tests cover the integer geometry, generated copies, and exact icon raster
pixels. Landing-page tests cover the shared asset URL. Projected and social asset tests check that
those families still match their generators. Regeneration changes no PNG bytes, and the template SVG
is identical to its version before the 100-unit experiment.
