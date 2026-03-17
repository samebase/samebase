# User Logo Static SVG Delivery Specification

## Document Control

- Status: Proposed
- Owner: Noter frontend
- Last updated: 2026-03-18
- Related files: `specs/060_LOGO_PREVIEW_PLAYGROUND_SPEC.md`,
  `apps/noter/src/App.tsx`, `apps/noter/src/components/LogoPreviewPage.tsx`,
  `apps/noter/src/components/NLogoScene.tsx`,
  `apps/noter/src/components/NLogoIsoScene.tsx`,
  `apps/noter/src/components/logoIsometricRenderer.ts`,
  `apps/noter/e2e/repository-media-visual.spec.ts`,
  `apps/noter/playwright.config.ts`

## Conclusion

Noter should stop treating the interactive logo playground as the user-facing
delivery format.

For user-visible product surfaces, the logo should be delivered as a generated
static SVG loaded as an image, with no runtime `three.js`, no live canvas math,
and no React-side scene graph.

The existing `/logo`, `/logo-iso`, and `/logo-iso-study` routes should remain as
dev-only exploration tools. If user-facing drag returns later, it should be
implemented as a pre-rendered frame scrubber sourced from the same generator,
not as a live 3D runtime.

## Context and Evidence

### 1. Current implementation

- `three.js` is only used by the logo playground scene in
  `apps/noter/src/components/NLogoScene.tsx`.
- `LogoPreviewPage` currently imports both the Three renderer and the isometric
  canvas renderer in the same module.
- `App.tsx` lazy-loads `LogoPreviewPage`, but that still leaves one large route
  chunk for the logo page.

### 2. Local build evidence

In this worktree, `npm run build:ci` produced:

- `dist/assets/LogoPreviewPage-*.js` at `550.73 kB` minified
- `142.16 kB` gzip for that chunk
- no separate `three` async chunk

That means the current route-level split is too coarse to keep the user path
small if the page continues to import the live scene implementations together.

### 3. User requirement

The current user requirement is materially narrower than the dev requirement:

- user surfaces do not need voxel editing controls
- user surfaces do not need live 3D rendering
- user surfaces do not need the current playground control overlay
- for the first phase, a static asset is acceptable

This changes the decision completely: the problem is no longer "which smaller 3D
library should replace Three?" It is "how do we avoid shipping a 3D runtime to
users at all?"

### 4. External research summary

- MDN documents SVG `<polygon>` as a widely available basic shape element that
  has worked across browsers since July 2015.
- MDN documents that SVG can be used as an image source in HTML `<img>`, CSS
  `background-image`, SVG `<image>`, and canvas `drawImage`.
- MDN documents Canvas as a JavaScript-driven drawing API, which is appropriate
  for dynamic rendering but still implies runtime drawing work.
- Playwright documents that screenshot baselines vary across operating systems,
  hardware, power source, and other environment details.

These sources support the choice of:

- static SVG for user delivery
- generated pixel comparison for exact equivalence checks
- keeping screenshot baselines as reviewer aid, not the sole correctness gate

## Goals

- Remove `three.js` from user-facing logo delivery.
- Keep the user-facing logo path as close to zero-runtime as practical.
- Preserve the current logo appearance exactly enough to support strict visual
  equivalence testing.
- Keep the existing interactive playground available for design and dev work.
- Maintain one geometry source of truth for both dev and user outputs.

## Non-Goals

- Replacing `three.js` everywhere immediately.
- Rebuilding the dev playground in another 3D library.
- Shipping a live SVG scene with pointer-driven matrix math on the user path.
- Introducing a PNG fallback pipeline unless a concrete consumer requires it.
- Solving future drag rotation for user surfaces in this phase.

## Decision

### 1. Separate user delivery from dev tooling

- User-visible logo surfaces shall consume a generated static SVG asset.
- Dev-only logo exploration shall continue to use the existing playground routes
  and may continue to use `three.js` until a separate dev simplification is
  justified.

### 2. Use static SVG, not live SVG

The chosen user format is an external SVG file loaded as an image, not inline
live SVG driven by runtime React state.

Reasons:

- external SVG removes almost all runtime JavaScript from the user path
- browser image loading and caching are simpler than mounting a scene component
- SVG remains crisp at multiple display sizes
- SVG is a good fit for the current logo because the visible faces already map
  cleanly to polygons

### 3. Do not replace Three with another runtime 3D library for users

Options such as `ogl`, `regl`, or `zdog` do not solve the user problem well.

They still require:

- a client-side rendering runtime
- camera math
- pointer handling
- scene updates
- visual parity work against the current logo

That would trade one rendering runtime for another instead of removing the user
runtime entirely.

## Source of Truth

### 1. Geometry source

`apps/noter/src/components/logoIsometricRenderer.ts` should remain the geometry
source of truth for the user-facing static mark.

The SVG generator shall reuse the same concepts already implemented there:

- visible-face selection
- face ordering
- per-face fills
- fixed projection

### 2. Fixed presentation contract

The user-facing SVG shall use one explicit presentation contract:

- one fixed camera angle
- one fixed voxel state
- one fixed isometric style
- one fixed face-color set per asset variant

If future product surfaces need alternate themes or variants, they should be
added as explicit generated assets, not as runtime controls.

### 3. Coordinate discipline

To maximize exact equivalence with the current raster output, the SVG generator
shall:

- emit whole-number coordinates
- avoid fractional transforms
- avoid blur, filters, shadows, and strokes
- prefer direct polygon fills
- preserve deterministic face ordering

## User Delivery Contract

### 1. Loading model

User surfaces shall load the generated logo through a normal image path:

- HTML `<img>`
- or CSS `background-image` when the surface is decorative

The user path shall not import:

- `LogoPreviewPage`
- `NLogoScene`
- `NLogoIsoScene`
- `three`

### 2. Bundle contract

The user-facing route or component that displays the logo must remain
independent from the playground chunk. A user who only needs the product logo
must not download the interactive playground implementation.

### 3. Accessibility and sizing

- If the logo is informative, the image must provide a meaningful `alt`.
- If the logo is decorative, it should use empty alt text or CSS background
  usage as appropriate.
- Width and height should be explicit where layout stability matters.

## Dev Playground Contract

### 1. Existing routes

These routes remain dev-oriented exploration tools:

- `/logo`
- `/logo-iso`
- `/logo-iso-study`

### 2. No user optimization pressure on dev routes

The dev playground may keep richer controls and heavier runtime behavior because
its purpose is iteration, not first-view user delivery.

This separation is the key architectural change. It avoids forcing one surface
to satisfy two conflicting jobs.

## Future Drag Contract

If a later product requirement reintroduces drag on the user path, the next
implementation should be:

- a generated frame sequence or sprite strip
- driven by pointer movement that swaps frames
- sourced from the same fixed generator pipeline

It should not be:

- live `three.js`
- live canvas projection math
- live SVG polygon recomputation on every pointer move

## Validation and Test Strategy

### 1. Generator-level determinism

Add narrow tests for the generator so the asset build is stable:

- visible-face ordering
- polygon coordinate output
- color mapping
- final SVG string or DOM structure

### 2. Exact visual equivalence test

Add a Playwright fixture that renders:

- the current reference renderer
- the generated SVG output

Both outputs must be rasterized in the same browser run and compared as pixel
data inside the page.

The exact check should be:

- same viewport
- same background
- same dimensions
- same device-pixel-ratio handling
- mismatch count must equal `0`

This is stricter and more meaningful than comparing two separate screenshots
captured on different machines.

### 3. Snapshot reviewer aid

Keep a normal Playwright screenshot snapshot alongside the exact compare test so
reviewers can inspect the rendered result visually.

That snapshot is a review artifact, not the primary proof of exact equality,
because Playwright explicitly documents environment-sensitive screenshot output.

## Implementation Plan

### 1. Extract generator

- add a generator that emits static SVG from the existing isometric geometry
- keep the generator logic close to `logoIsometricRenderer.ts`
- avoid creating a second geometry system

### 2. Add visual fixture

- add a fixture page or mode that shows the reference output next to the
  generated SVG
- ensure both render through a deterministic comparison harness

### 3. Add tests

- generator unit tests
- Playwright exact pixel-equivalence test
- Playwright snapshot test for human review

### 4. Switch user consumption

- move user-visible logo surfaces to the generated SVG asset
- ensure those surfaces no longer import the playground module graph

### 5. Keep dev routes intact

- do not rewrite the playground in the same change
- keep current dev iteration routes available

## Alternatives Considered

### 1. Keep Three for all surfaces

Rejected because it keeps unnecessary runtime cost on the user path and does not
match the narrowed requirement.

### 2. Replace Three with a smaller 3D library

Rejected because it still ships a live rendering runtime to users and does not
remove the need for custom scene logic.

### 3. Use live canvas for the user logo

Rejected for phase one because the user path does not need runtime drawing.
Canvas remains useful for dev tools and for exact comparison harnesses.

### 4. Use live inline SVG for the user logo

Rejected for phase one because it still mounts runtime DOM geometry and invites
future interactivity pressure onto the user path. External SVG as an image is
the simpler and stricter boundary.

## Open Questions

- Which concrete production surfaces should switch first to the generated SVG?
- Should the generator also produce favicon-specific variants, or should favicon
  work stay separate from this change?
- Should the reference renderer for the exact equivalence test be the current
  isometric canvas renderer or a frozen expected SVG fixture once migration is
  complete?

## External References

- [MDN: `<polygon>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/polygon)
- [MDN: SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)
- [MDN: Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Playwright: Visual comparisons](https://playwright.dev/docs/test-snapshots)

## Summary

The correct user-facing replacement for the current logo scene is not another 3D
library. It is a generated static SVG asset with exact pixel-equivalence tests
against the current renderer. The interactive playground remains a dev tool, and
any future user drag should be a pre-rendered frame scrubber rather than a live
rendering runtime.
