# User Logo Static SVG Delivery Specification

## Document Control

- Status: Proposed
- Owner: Noter frontend
- Last updated: 2026-03-18
- Related files: `specs/060_LOGO_PREVIEW_PLAYGROUND_SPEC.md`,
  `specs/089_NOTER_LOGO_IDENTITY_INVARIANT_SPEC.md`,
  `specs/090_LOGO_RENDERING_MODEL_SIMPLIFICATION_SPEC.md`, `apps/noter/src/App.tsx`,
  `apps/noter/src/components/LogoPreviewPage.tsx`, `apps/noter/src/components/NLogoScene.tsx`,
  `apps/noter/src/components/NLogoIsoScene.tsx`,
  `apps/noter/src/components/logoIsometricRenderer.ts`,
  `apps/noter/e2e/repository-media-visual.spec.ts`, `apps/noter/playwright.config.ts`

## Conclusion

Noter should stop treating the interactive logo playground as the user-facing delivery format, but
it should also stop treating the pixel-art isometric study as the primary logo geometry source.

For user-visible product surfaces, the main logo should default to a generated static SVG loaded as
an image. The public landing hero is the one explicit exception: it should paint the static SVG
immediately, then progressively enhance to the interactive Three renderer after the page is already
visible.

The canonical geometry for that smooth SVG should come from the fixed orthographic Three camera
projection, not from the pixel-art isometric helper. The pixel-art isometric renderer remains
useful, but as a separate artistic representation rather than the primary logo contract.

The brand identity sequence itself is defined in `specs/089_NOTER_LOGO_IDENTITY_INVARIANT_SPEC.md`:
version 1 is the straight-on primary side, version 2 is the flat 45-degree two-color side, and
version 3 is the tilted spatial static mark.

The existing `/logo`, `/logo-iso`, and `/logo-iso-study` routes should remain as dev-only
exploration tools. `/logo` remains the interactive reference for the orthographic main logo.
`/logo-iso` remains a separate pixel-art exploration surface.

The public landing page should show the same static SVG at the top of the fast bootstrap shell and
the hydrated React view before enhancement. The landing bootstrap path must reference a committed
public SVG directly and must not import the logo renderer modules. After hydration, the landing
React view may background-load the interactive Three scene and fade it in only after the first
rendered frame is ready.

## Context and Evidence

### 1. Current implementation

- `three.js` is only used by the logo playground scene in
  `apps/noter/src/components/NLogoScene.tsx`.
- `LogoPreviewPage` currently imports both the Three renderer and the isometric canvas renderer in
  the same module.
- `App.tsx` lazy-loads `LogoPreviewPage`, but that still leaves one large route chunk for the logo
  page.

### 2. Local build evidence

In this worktree, `npm run build:ci` produced:

- `dist/assets/LogoPreviewPage-*.js` at `550.73 kB` minified
- `142.16 kB` gzip for that chunk
- no separate `three` async chunk

That means the current route-level split is too coarse to keep the user path small if the page
continues to import the live scene implementations together.

### 3. User requirement

The current user requirement is materially narrower than the dev requirement:

- user surfaces do not need voxel editing controls
- user surfaces do not need live 3D rendering
- user surfaces do not need the current playground control overlay
- for the first phase, a static asset is acceptable

This changes the decision completely: the problem is no longer "which smaller 3D library should
replace Three?" It is "how do we avoid shipping a 3D runtime to users at all, while keeping the
delivered logo visually aligned with the main interactive Three representation?"

### 4. External research summary

- MDN documents SVG `<polygon>` as a widely available basic shape element that has worked across
  browsers since July 2015.
- MDN documents that SVG can be used as an image source in HTML `<img>`, CSS `background-image`, SVG
  `<image>`, and canvas `drawImage`.
- MDN documents Canvas as a JavaScript-driven drawing API, which is appropriate for dynamic
  rendering but still implies runtime drawing work.
- Playwright documents that screenshot baselines vary across operating systems, hardware, power
  source, and other environment details.

These sources support the choice of:

- static SVG for user delivery
- a browser-rasterized comparison harness for same-run visual checks
- keeping screenshot baselines as reviewer aid, not the sole correctness gate

## Goals

- Remove `three.js` from the initial user-facing logo paint.
- Keep the initial user-facing logo path as close to zero-runtime as practical.
- Preserve the current orthographic logo appearance closely enough that the static SVG can track the
  interactive Three reference across large and small display sizes.
- Allow routed recursive-depth previews to use generated static SVG while keeping committed identity
  SVG assets at depth `1`.
- Keep the existing interactive playground available for design and dev work.
- Maintain one geometry source of truth for the main smooth logo path.
- Allow the landing hero to become interactive after first paint without regressing perceived load
  speed.

## Non-Goals

- Replacing `three.js` everywhere immediately.
- Rebuilding the dev playground in another 3D library.
- Shipping a live SVG scene with pointer-driven matrix math on the user path.
- Converging the pixel-art isometric renderer with the main smooth logo path in this phase.
- Shipping a production pixel-art PNG export pipeline in this phase.
- Solving future drag rotation for user surfaces in this phase.

## Decision

### 1. Separate initial delivery from enhancement

- User-visible logo surfaces shall consume a generated static SVG asset.
- The public landing hero may progressively enhance from that SVG to the interactive Three scene
  after the initial content is already visible.
- Dev-only logo exploration shall continue to use the existing playground routes and may continue to
  use `three.js` until a separate dev simplification is justified.

### 2. Use static SVG for first paint, then enhance selectively

The chosen first-paint user format is an external SVG file loaded as an image, not inline live SVG
driven by runtime React state.

Reasons:

- external SVG removes almost all runtime JavaScript from the user path
- browser image loading and caching are simpler than mounting a scene component
- SVG remains the simplest static delivery format for the main logo
- SVG is a good fit for the current logo because the visible faces already map to projected quads
  from the orthographic reference view
- web performance guidance treats `<img src="...svg">` as an image candidate, while inline root
  `<svg>` is not the same LCP path, so the public landing should use a normal image element for the
  visible logo
- landing interactivity can be loaded after paint as a progressive enhancement instead of competing
  with the initial response and shell render

### 3. Main logo projection should follow the orthographic Three view

The canonical smooth logo should match the fixed orthographic view used by the interactive Three
playground.

Reasons:

- this is the main interactive logo representation
- it avoids visible "projection jumps" between the dev reference and the shipped static mark
- the current pixel-art isometric helper is intentionally a snapped artistic projection, not
  mathematically exact orthographic geometry
- one primary projection contract is easier to defend and easier to evolve

### 4. Do not replace Three with another runtime 3D library for users

Options such as `ogl`, `regl`, or `zdog` do not solve the user problem well.

They still require:

- a client-side rendering runtime
- camera math
- pointer handling
- scene updates
- visual parity work against the current logo

That would trade one rendering runtime for another instead of removing the user runtime entirely.

## Source of Truth

### 1. Geometry source

`apps/noter/src/components/logoThreeSvgRenderer.ts` should remain the geometry source of truth for
the user-facing smooth static mark.

The SVG generator shall reuse the same concepts already implemented in the interactive Three path:

- visible-face selection
- face ordering
- per-face fills
- fixed orthographic projection

### 2. Fixed presentation contract

The user-facing SVG shall use one explicit presentation contract:

- one fixed camera angle
- one fixed voxel state
- one fixed face-color set per asset variant

For the main smooth logo, that camera contract is the current fixed orthographic Three reference
view.

If future product surfaces need alternate themes or variants, they should be added as explicit
generated assets, not as runtime controls.

### 3. Asset boundary

The committed public smooth-logo asset boundary is:

- `apps/noter/public/favicon.svg` for the shipped SVG
- `apps/noter/public/favicon.png` for the derived raster favicon

User-visible product code should reference the committed public SVG path directly. It should not
embed the smooth SVG as a `data:` URL on the normal product path.

Tests may compare generated markup to the committed SVG file, but that generator-level contract is
for validation, not for runtime delivery.

### 4. Coordinate discipline

To maximize visual stability and reduce browser rasterization artifacts, the SVG generator shall:

- avoid runtime transforms on the delivered image
- avoid blur, filters, and shadows
- preserve deterministic face ordering
- use seam-mitigation attributes when browser SVG rasterization produces cracks between adjacent
  faces

The current seam-mitigation approach is:

- projected face polygons from the orthographic reference view
- deterministic painter's-order rendering
- a very thin fill-colored stroke on each polygon to hide browser hairline cracks between shared
  edges

### 5. Pixel-art relationship

`apps/noter/src/components/logoIsometricRenderer.ts` remains valuable, but it is not the primary
geometry source for the smooth logo.

It should be treated as:

- a pixel-art/art-direction renderer
- the source of truth for future pixel-art exports
- a separate visual system from the main orthographic logo

Pixel-art PNG fixtures or export experiments that are not consumed by current product surfaces
should stay out of this patch. They can return in a dedicated pixel-art export phase.

## User Delivery Contract

### 1. Loading model

User surfaces shall load the generated logo through a normal image path:

- HTML `<img>`
- or CSS `background-image` when the surface is decorative

The initial user path shall not import:

- `LogoPreviewPage`
- `NLogoScene`
- `NLogoIsoScene`
- `three`

The landing React route may lazy-load `NLogoScene` only after the static SVG is already on screen.

### 2. Bundle contract

The user-facing route or component that displays the logo must remain independent from the
playground chunk. A user who only needs the product logo must not download the interactive
playground implementation.

This applies especially to `apps/noter/src/bootstrap.ts` and the public landing route:

- the fast shell must reference a committed public asset path such as `/favicon.svg`
- the bootstrap module must not import `logoStaticSvgAsset.ts`, `logoThreeSvgRenderer.ts`,
  `logoIsometricRenderer.ts`, or any scene module
- if the landing shell needs faster image discovery than the JS-inserted `<img>` alone provides, use
  HTML image preload metadata instead of importing renderer code into the shell bundle
- the hydrated landing logo component may lazy-import the Three scene in a separate chunk, but it
  must keep the SVG visible until the first interactive frame is ready
- the SVG-to-Three handoff should use the same box geometry and dimensions so the swap remains
  visually indistinguishable

### 3. Accessibility and sizing

- If the logo is informative, the image must provide a meaningful `alt`.
- If the logo is decorative, it should use empty alt text or CSS background usage as appropriate.
- Width and height should be explicit where layout stability matters.
- Landing-shell and hydrated React layouts should use the same intrinsic logo dimensions so the
  handoff does not shift.

## Dev Playground Contract

### 1. Existing routes

These routes remain dev-oriented exploration tools:

- `/logo`
- `/logo-iso`
- `/logo-iso-study`

### 2. No user optimization pressure on dev routes

The dev playground may keep richer controls and heavier runtime behavior because its purpose is
iteration, not first-view user delivery.

This separation is the key architectural change. It avoids forcing one surface to satisfy two
conflicting jobs.

## Future Drag Contract

If a later product requirement reintroduces drag on the user path, the next implementation should
be:

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

### 2. Browser-rasterized comparison fixture

Add a Playwright fixture that renders:

- the current reference renderer
- the generated SVG output

Both outputs must be rasterized in the same browser run and compared as pixel data inside the page.

The comparison fixture should keep these invariants:

- same viewport
- same background
- same dimensions
- same device-pixel-ratio handling

The current comparison output should include:

- a large reference pair and diff view
- mismatch counts at the main display size
- additional smaller-size comparison samples

The current release gate is not strict `0` mismatch for the smooth Three-vs-SVG path, because WebGL
MSAA and browser SVG rasterization do not currently converge to exact byte-identical output even
when the geometry is aligned. The goal in this phase is to reduce seam artifacts and track drift
with same-browser diff counts and reviewer-visible snapshots.

### 3. Snapshot reviewer aid

Keep a normal Playwright screenshot snapshot alongside the exact compare test so reviewers can
inspect the rendered result visually.

That snapshot is a review artifact, not the primary proof of exact geometry alignment, because
Playwright explicitly documents environment-sensitive screenshot output.

### 4. Multi-size review

The smooth Three/SVG fixture should also show the pair at smaller display sizes so seam behavior is
visible before favicon-scale work begins.

Current review sizes:

- `1000px` main comparison
- `240px`
- `128px`
- `64px`
- `32px`

## Implementation Plan

### 1. Maintain the orthographic smooth generator

- keep a generator that emits static SVG from the orthographic reference view
- keep the generator logic close to the interactive Three geometry contract
- keep seam mitigation explicit and testable

### 2. Add visual fixture

- add a fixture page or mode that shows the reference output next to the generated SVG
- ensure both render through a deterministic comparison harness

### 3. Add tests

- generator unit tests
- Playwright browser-rasterized diff fixture
- Playwright snapshot test for human review
- smaller-size preview coverage inside the comparison fixture

### 4. Switch user consumption

- move user-visible logo surfaces to the generated SVG asset
- ensure those surfaces no longer import the playground module graph
- for the public landing page, render that asset in both the bootstrap shell and the hydrated React
  content so the first paint and final state stay aligned

### 5. Keep dev routes intact

- do not rewrite the playground in the same change
- keep current dev iteration routes available

## Alternatives Considered

### 1. Keep Three for all surfaces

Rejected because it keeps unnecessary runtime cost on the user path and does not match the narrowed
requirement.

### 2. Replace Three with a smaller 3D library

Rejected because it still ships a live rendering runtime to users and does not remove the need for
custom scene logic.

### 3. Use live canvas for the user logo

Rejected for phase one because the user path does not need runtime drawing. Canvas remains useful
for dev tools and for same-run comparison harnesses.

### 4. Use live inline SVG for the user logo

Rejected for phase one because it still mounts runtime DOM geometry and invites future interactivity
pressure onto the user path. External SVG as an image is the simpler and stricter boundary.

## Open Questions

- Which concrete production surfaces should switch first to the orthographic static SVG?
- Should the smooth SVG generator eventually derive its projected quads from a deeper shared runtime
  geometry module with `NLogoScene`, or is the current generator-local projection contract
  sufficient?
- When favicon work resumes, should the pixel-art system adopt explicit profile-based exports such
  as `favicon-16`, `ui-32`, and larger cube-size variants?
- If strict `0` mismatch becomes mandatory for the smooth path, should the comparison move to a
  non-antialiased reference fixture instead of the current WebGL MSAA output?

## External References

- [MDN: `<polygon>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/polygon)
- [MDN: SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)
- [MDN: Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [web.dev: Largest Contentful Paint](https://web.dev/articles/lcp)
- [Playwright: Visual comparisons](https://playwright.dev/docs/test-snapshots)

## Summary

The correct user-facing replacement for the current logo scene is not another 3D library. It is a
generated static SVG asset derived from the fixed orthographic Three reference view, delivered as an
image with no user-path 3D runtime. The pixel-art isometric renderer remains a separate artistic
system, not the primary logo geometry source. The current validation strategy is a same-browser
Three-vs-SVG diff fixture with smaller-size review samples, plus explicit seam mitigation in the SVG
generator while exact zero-mismatch remains out of scope for the antialiased smooth path.
