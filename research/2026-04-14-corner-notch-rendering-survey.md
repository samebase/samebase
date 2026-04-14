# Corner Notch Rendering Survey

This is a temporary research note about pixel-art, notched, and cut-corner
border rendering techniques. It informs the corner-notch fixture work but is not
source-of-truth product documentation.

## Context

The current Noter corner-notch fixture is useful for iterating on CSS, but it
still shows occasional seams where a native border meets a custom corner shape.
The open question is whether that class of artifact is normal for this
technique, and what other teams use when they want sharper pixel-art or notch
corners.

## Platform Constraints

- [`clip-path`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/clip-path)
  and
  [CSS masking](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Masking)
  are clipping steps layered on top of regular element painting. They are good
  for shape flexibility, but they do not turn the native border into a custom
  path stroke.
- [`border-image`](https://developer.mozilla.org/en-US/docs/Web/CSS/border-image)
  is one of the few native CSS mechanisms that actually owns border rendering.
  This matters for cut corners because it avoids asking the browser to clip an
  already-painted rectangle.
- [`mask-border`](https://developer.mozilla.org/en-US/docs/Web/CSS/mask-border)
  is conceptually close to the desired behavior, but browser support is still
  limited.
- SVG has explicit edge-rendering controls such as
  [`stroke-linejoin`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/stroke-linejoin)
  and
  [`shape-rendering`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/shape-rendering),
  which makes it a strong candidate when edge fidelity matters more than CSS
  convenience.
- Browser engines have a long history of clipping and anti-aliasing edge cases
  around custom shapes and transformed borders. Relevant examples:
  [WebKit bug 22746](https://bugs.webkit.org/show_bug.cgi?id=22746) and
  [WebKit bug 67950](https://bugs.webkit.org/show_bug.cgi?id=67950).

## Survey: Articles, Demos, and Repos

### 1. Clip-path and Shape Generators

- [Pixelated rounded corners with CSS `clip-path`](https://codefoodpixels.com/blog/2022/01/17/pixelated-rounded-corners-with-css-clip-path/)
  by Luke Morrigan is the closest match to the current Noter direction. It uses
  explicit polygon points to emulate pixel corners and links a generator for
  scaling those points.
- [CSS Shape: Pixelated corner](https://css-shape.com/pixel-corner/) by Temani
  Afif is a more modern generator-style take. It is useful when the goal is a
  parameterized CSS-only shape system rather than a one-off decorative border.

Takeaway: `clip-path` is popular because it is expressive and lightweight, but
it is not the common answer for "guaranteed perfect border joins."

### 2. Manual Pixel Painting

- [Pixel corners CodePen](https://codepen.io/c4rin3/pen/YPaMJb) is an older,
  explicit pixel-corner construction using extra elements and `box-shadow`
  blocks to paint the corners directly.
- [Pixel corners article mirror](https://webartdevelopers.com/blog/pixel-corners/)
  documents the same style of construction and is useful as a readable summary.
- [`NigelOToole/pixel-borders`](https://github.com/NigelOToole/pixel-borders)
  packages retro-style pixel borders as a reusable Sass mixin.
- The corresponding demo at
  [link https://nigelotoole.github.io/pixel-borders/](https://nigelotoole.github.io/pixel-borders/)
  shows the kinds of fixed-step corners and inset shading that this technique
  can support.

Takeaway: When teams really want "pixel perfect" retro borders, they often stop
relying on the browser's normal border painter and instead paint the pixels
themselves.

### 3. Border-image, SVG, Mask, and Decorative Systems

- [Fancy frames with CSS](https://charlottedann.com/article/fancy-frames-with-css)
  by Charlotte Dann is the most useful comparison article in this area. It walks
  through gradients, `border-image`, SVG data URIs, `mask-border`, and Houdini,
  and lands on SVG-powered `border-image` as a practical sweet spot.
- [`propjockey/augmented-ui`](https://github.com/propjockey/augmented-ui) is a
  mature shape system for notches, bevels, and sci-fi corners. It is more
  decorative than pixel-art-specific, but it proves that reusable corner shape
  systems often need more than plain border plus clip.
- The live gallery at
  [link https://augmented-ui.com/](https://augmented-ui.com/) is a good visual
  reference for how far a custom-corner CSS system can go.
- [Smashing Magazine: Beyond `border-radius` with `corner-shape`](https://www.smashingmagazine.com/2026/03/beyond-border-radius-css-corner-shape-property-ui/)
  is future-looking, but it is valuable because it frames today's hacks as
  tradeoffs rather than perfect substitutes for native corner rendering.

Takeaway: The more exact or reusable the corners need to be, the more often
teams move to SVG, `border-image`, or a dedicated corner system instead of raw
`clip-path` alone.

### 4. Retro UI Frameworks

- [`jdan/98.css`](https://github.com/jdan/98.css) and
  [`nostalgic-css/NES.css`](https://github.com/nostalgic-css/NES.css) are not
  arbitrary-notch libraries, but they are useful evidence from the retro UI
  world.
- These frameworks generally achieve crisp borders with carefully composed
  boxes, shadows, and fixed visual recipes instead of asking a native border to
  trace a novel polygon.

Takeaway: Retro UI libraries usually choose predictability over geometric
flexibility.

### 5. Related Rendering Notes

- [Use `clip-path` instead of `border-radius` for CSS circles](https://carrithers.me/use-clip-path-instead-of-border-radius-for-css-circles)
  by Mac Carrithers is not about pixel corners specifically, but it is a good
  reminder that anti-aliasing behavior changes depending on the technique.

## Patterns That Keep Showing Up

- CSS `clip-path` is the common "easy to iterate" technique.
- Manually painted corners with pseudo-elements or `box-shadow` are the common
  "I need exact pixels" technique.
- SVG and `border-image` are the common middle ground when the design is fixed
  enough to encode as an asset or generated border.
- Mature decorative systems like `augmented-ui` take ownership of the whole
  shape instead of trying to persuade a normal rectangular border to look
  custom.

## Recommendation For Noter

- If small seams are acceptable, keep iterating with the current corner-notch
  CSS and use the fixture to compare notch geometry quickly.
- If the requirement becomes truly pixel-perfect corners, stop treating native
  `border` plus clipping as the final target.
- The next serious comparison to prototype in the fixture is:
  1. current CSS notch approach
  2. manually painted pixel corners
  3. SVG or SVG-backed `border-image`

## Source List

- [MDN `clip-path`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/clip-path)
- [MDN CSS masking guide](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Masking)
- [MDN `border-image`](https://developer.mozilla.org/en-US/docs/Web/CSS/border-image)
- [MDN `mask-border`](https://developer.mozilla.org/en-US/docs/Web/CSS/mask-border)
- [MDN `stroke-linejoin`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/stroke-linejoin)
- [MDN `shape-rendering`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/shape-rendering)
- [WebKit bug 22746](https://bugs.webkit.org/show_bug.cgi?id=22746)
- [WebKit bug 67950](https://bugs.webkit.org/show_bug.cgi?id=67950)
- [Pixelated rounded corners with CSS `clip-path`](https://codefoodpixels.com/blog/2022/01/17/pixelated-rounded-corners-with-css-clip-path/)
- [CSS Shape: Pixelated corner](https://css-shape.com/pixel-corner/)
- [Pixel corners CodePen](https://codepen.io/c4rin3/pen/YPaMJb)
- [Pixel corners article mirror](https://webartdevelopers.com/blog/pixel-corners/)
- [`NigelOToole/pixel-borders`](https://github.com/NigelOToole/pixel-borders)
- [link https://nigelotoole.github.io/pixel-borders/](https://nigelotoole.github.io/pixel-borders/)
- [Fancy frames with CSS](https://charlottedann.com/article/fancy-frames-with-css)
- [`propjockey/augmented-ui`](https://github.com/propjockey/augmented-ui)
- [link https://augmented-ui.com/](https://augmented-ui.com/)
- [`jdan/98.css`](https://github.com/jdan/98.css)
- [`nostalgic-css/NES.css`](https://github.com/nostalgic-css/NES.css)
- [Use `clip-path` instead of `border-radius` for CSS circles](https://carrithers.me/use-clip-path-instead-of-border-radius-for-css-circles)
- [Smashing Magazine: Beyond `border-radius` with `corner-shape`](https://www.smashingmagazine.com/2026/03/beyond-border-radius-css-corner-shape-property-ui/)
