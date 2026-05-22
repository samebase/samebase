# Landing Logo Theme Reveal Spike

Date: 2026-05-22

## Question

Explore the idea of changing the public landing page from dark mode to light mode through a circle
that starts at the current logo position and expands until it replaces the old page. The intended
visual is that the logo stays aligned with the current landing page logo, the circle grows outward,
and the text/theme changes at the pixel boundary of that circle instead of as a normal whole-page
fade.

The specific spike question is whether the first test should be a small fixture, a right-sidebar
fixture, a canvas experiment, or a production-route experiment.

## Short Answer

Start with a route-level View Transition API spike on the real public landing route. Do not start
with a right-sidebar-only fixture.

The effect is fundamentally about the composed page: logo, Markdown copy, auth row, background,
right sidebar, and the root theme class all changing together. A right-sidebar-only fixture can test
where the toggle lives, but it cannot prove the main idea. A canvas-first spike is also the wrong
first step because stable canvas cannot render arbitrary live HTML today, and the newer
HTML-in-Canvas proposal is still behind browser flags.

The smallest believable spike is:

1. Open `/` with the public layout shell and the right sidebar visible.
2. Trigger the existing `?light` / `?dark` root search toggle from `AppSidebarMetaSection`.
3. Wrap that route-search/theme update in `document.startViewTransition`.
4. Animate `::view-transition-new(root)` with a `clip-path: circle(...)` whose origin is the center
   of `[data-testid="public-landing-logo-stage"]`.
5. Fall back to the current instant theme toggle when the API is missing or reduced motion is
   requested.

## Browser Research

### View Transitions fit the mental model

The View Transition API is the browser primitive that most directly matches the desired effect. For
a same-document transition, `document.startViewTransition(update)` captures the old page, runs the
DOM update callback, captures the new page, and exposes the old/new snapshots through view
transition pseudo-elements. MDN describes `startViewTransition()` as starting a same-document
transition and calling the update callback after the current page snapshot is captured. Chrome's
docs describe the same sequence: old snapshot, DOM update, new snapshot, then CSS-driven animation.

That means the app does not need to manually repaint every text glyph. The DOM changes once. The
browser turns the old and new page states into composited snapshots, and the circular clip path
decides which pixels show old vs. new during the animation.

MDN's current `ViewTransition` example is almost exactly this shape: compute an origin, compute the
radius to the farthest viewport corner, call `document.startViewTransition`, then animate `clipPath`
on `::view-transition-new(root)`. The same example also disables the default cross-fade by setting
the old/new pseudo-elements to normal blending and no default animation.

Support is now good enough for progressive enhancement. MDN marks `ViewTransition` as Baseline 2025
and says it has worked across latest devices since October 2025, with caveats for partial support.
Chrome's view-transition docs list same-document support starting in Chrome/Edge 111, Firefox 144,
and Safari 18.

### Stable canvas does not draw live HTML

Stable `CanvasRenderingContext2D.drawImage()` can draw image-like sources such as
`HTMLImageElement`, `SVGImageElement`, `HTMLVideoElement`, `HTMLCanvasElement`, `ImageBitmap`,
`OffscreenCanvas`, and `VideoFrame`. It does not accept an arbitrary `HTMLElement` subtree as a
source.

There is an old SVG `foreignObject` path for drawing HTML-ish markup into canvas, but MDN describes
it as non-trivial and constrained by SVG image security rules. It requires serializing HTML into an
SVG image and then drawing that image, not capturing the actual live DOM with all browser layout,
fonts, inputs, and app state intact.

Libraries such as `html2canvas` are also not a good first spike for this. Their own docs say they do
not take a real screenshot; they traverse the DOM and build a representation of the page from
supported properties. Their FAQ says every CSS property needs manual support and the library will
never have full CSS support. That makes it a poor match for Tailwind 4, theme variables, canvas/SVG
logo fallback, and real landing route behavior.

### HTML-in-Canvas is promising but not production-ready

The "latest option of HTML in canvas" is likely the WICG HTML-in-Canvas proposal. It introduces
`layoutsubtree`, `drawElementImage()`, a canvas `paint` event, and related WebGL/WebGPU texture
hooks. The explainer's motivation is exactly the missing browser feature: rendering styled, laid-out
HTML into canvas with real text quality, internationalization, and accessibility.

However, the proposal is currently a living explainer and its Chromium implementation is behind
`chrome://flags/#canvas-draw-element`. The docs site also notes that it needs the flag in Chrome
Canary or recent Brave/Chromium 147 builds. That is useful for a lab if we want shader experiments,
but it is not the easiest or safest spike for Noter's public landing route.

Follow-up, 2026-05-23: the current demo gallery is much stronger than a toy proof. It includes a
Page Curl / Book Turn demo that renders two styled HTML pages into canvas textures, feeds them to a
WebGL page-curl shader, and lets the user drag the page as a deformable surface. It also includes a
Pixel Disintegration demo that samples a rendered HTML card with `getImageData()` and explodes the
result into particles. Those demos are close in spirit to the reported "HTML page tearing like
cloth" experiment: once live HTML is available as pixels or a texture, cloth, tear, curl, shatter,
and shader effects become normal graphics problems.

That changes the confidence level for a canvas lab: the effect is real enough to prototype, not just
speculative. It does not change the first production recommendation, because the demos still require
`canvas-draw-element` in Chrome Canary or recent Brave/Chromium builds and are not a browser-stable
path for the public landing theme toggle.

## Local App Fit

The landing theme switch already flows through root search params:

- `apps/noter/src/lib/rootThemeModeSearch.ts` reads and builds `?light` / `?dark`.
- `apps/noter/src/components/AppRootClient.tsx` syncs the resolved mode to
  `document.documentElement.classList.toggle("dark", ...)`.
- `apps/noter/src/components/AppSidebarMetaSection.tsx` renders the right-sidebar theme links.
- `apps/noter/src/components/PublicRightSidebar.tsx` places `AppSidebarMetaSection` in the public
  right sidebar.
- `apps/noter/src/Layout.tsx` wraps public routes in `PublicLayoutShell`, including the public right
  sidebar.
- `apps/noter/src/SignInForm.tsx` renders the public landing content: `PublicLandingLogo`,
  `LandingCopy`, auth controls, and the waitlist link.
- `apps/noter/src/components/logo/PublicLandingLogo.tsx` exposes
  `PUBLIC_LANDING_LOGO_STAGE_TEST_ID`, which is the right anchor for the reveal origin.

The important timing detail is that `startViewTransition` needs the new DOM state to exist before
the update callback's returned promise resolves. In this app, the theme class is synchronized in a
layout effect after route search changes. A spike should therefore verify that the new snapshot
actually contains the new `.dark` class and should be prepared to await navigation plus one
animation frame inside the update callback if TanStack Router's navigation promise resolves before
the root class has updated.

## Spike Options

### Option 1: Real landing route View Transition spike

This is the recommended first spike.

Shape:

- Add a tiny landing-theme-reveal helper that receives the triggering event, the target theme mode,
  and the existing search patch/navigate operation.
- Feature-detect `document.startViewTransition`.
- Skip the animation for `prefers-reduced-motion: reduce`.
- Use the logo stage center as the reveal origin when present; use the clicked toggle center as the
  fallback origin.
- Animate `::view-transition-new(root)` from `circle(0 at x y)` to the radius needed to cover the
  viewport.
- Scope the pseudo-element CSS to this transition, not all future view transitions.

Why it is best:

- It proves the real thing: landing logo alignment, landing copy, auth row, right sidebar, route
  search, and root theme class.
- It keeps text accessible because the real DOM remains the source of truth.
- It has an instant fallback with no product behavior fork.
- It does not introduce a screenshot/rendering library or experimental browser flag.

Main risk:

- The route-search update and theme-class synchronization may need careful timing inside the view
  transition update callback.

### Option 2: Public landing visual fixture

This is useful if the route-level spike is slow to iterate, but it should not replace the real route
check.

Shape:

- Add a fixture mode such as `landing-theme-reveal`.
- Mount the production landing pieces, especially `PublicLandingLogo` and `LandingCopy`.
- Put a minimal theme toggle near the fixture surface.
- Drive the theme with local state first, then port the helper to route search.

Why it is weaker:

- It can prove the circle visual cheaply, but it can miss the real public layout shell, right
  sidebar geometry, retained search params, and `AppRootClient` theme synchronization.

### Option 3: Right-sidebar-only fixture

This is not a good first spike.

It can verify that `AppSidebarMetaSection` still renders stable links and that a click handler can
use the sidebar toggle as a fallback origin. It cannot prove that the landing text and logo are
replaced per pixel, because the main content is absent. Use this only as follow-up coverage if the
implementation touches sidebar chrome.

### Option 4: Canvas / HTML-in-Canvas lab

This is an interesting second spike, not the easiest product spike.

Shape:

- Add a dev-only page that checks for `ctx.drawElementImage`.
- If available, draw a child subtree into canvas and experiment with shader, page-curl, particle, or
  tear/cloth-style effects.
- Otherwise show that stable browsers fall back to View Transitions.

Why it is not first:

- It depends on flags or future browser support.
- It does not naturally integrate with route search, right sidebar links, or accessible DOM.
- It would be harder to test in current CI browsers.

### Option 5: CSS duplicate-layer reveal

This is possible but should be avoided unless View Transitions fails.

It would render two copies of the landing surface, one dark and one light, then clip the top copy
with a growing CSS mask. It avoids experimental APIs, but it duplicates live UI, risks focus and
screen reader problems, and makes the logo/copy/auth controls harder to keep honest.

## Implementation Sketch

The spike should keep the native theme/search model. A helper can own only the transition
enhancement:

```ts
const transition = document.startViewTransition(async () => {
  await navigate({
    search: (currentSearch) =>
      applySearchPatch(currentSearch, buildToggledRootThemeModeSearch(currentSearch, "dark")),
  });

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
});

void transition.ready.then(() => {
  document.documentElement.animate(
    {
      clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
    },
    {
      duration: 500,
      easing: "ease-in-out",
      pseudoElement: "::view-transition-new(root)",
    },
  );
});
```

The exact `navigate` shape should follow the current TanStack Router callsite in
`AppSidebarMetaSection`; the important part is that the new root theme class is in the DOM before
the new snapshot is captured.

The CSS needs the standard circular-reveal reset:

```css
html[data-landing-theme-reveal]::view-transition-image-pair(root) {
  isolation: auto;
}

html[data-landing-theme-reveal]::view-transition-old(root),
html[data-landing-theme-reveal]::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}
```

The data attribute should be set only while the transition is being prepared/running, then removed
in `transition.finished.finally(...)`.

## Validation Plan

For the spike:

- Add a route-level Playwright test against `/` with the public right sidebar available.
- Start in a forced theme, click the opposite theme link, and assert the URL/search and root `.dark`
  class reach the new state.
- In browsers with `document.startViewTransition`, assert that an animation targeting
  `::view-transition-new(root)` is created.
- Capture a mid-transition screenshot only in a test-specific slow-duration mode if visual proof is
  needed; normal screenshot baselines should not depend on racing an animation frame.
- Keep `prefers-reduced-motion` coverage: the theme should still change and no long animation should
  run.
- If screenshot baselines are added or refreshed, use the repo's Docker Linux ARM64 visual workflow,
  not native macOS screenshots.

For manual review:

- Check desktop `/` with right sidebar open.
- Check mobile `/` where the right sidebar may not be visible and the origin should fall back to the
  logo.
- Check the case where the interactive Three logo has not loaded yet; the SVG fallback inside the
  logo stage should still give the correct origin.
- Check that route/search links preserve unrelated query params.

## Recommendation

Build Option 1 first. If the route/search timing turns out annoying, temporarily add Option 2 as a
lab harness, but still finish by proving the real `/` route. Do not spend the first spike on
right-sidebar-only coverage or HTML-in-Canvas.

The product decision after the spike should be based on three facts:

- Does the root theme class appear in the new snapshot reliably?
- Does the reveal origin feel visually attached to the current landing logo on desktop and mobile?
- Does the fallback behave like the existing theme toggle when View Transitions are unavailable?

## Sources

- [MDN: Document.startViewTransition()](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition)
- [MDN: Using the View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using)
- [MDN: ViewTransition](https://developer.mozilla.org/en-US/docs/Web/API/ViewTransition)
- [Chrome for Developers: Same-document view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/same-document)
- [Chrome for Developers: Smooth transitions with the View Transition API](https://developer.chrome.com/docs/web-platform/view-transitions/)
- [Chrome View Transitions demos](https://view-transitions.chrome.dev/)
- [MDN: CanvasRenderingContext2D.drawImage()](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage)
- [MDN archive: Drawing DOM objects into a canvas](https://www.devdoc.net/web/developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Drawing_DOM_objects_into_a_canvas.html)
- [WICG HTML-in-Canvas explainer](https://github.com/WICG/html-in-canvas)
- [HTML-in-Canvas docs overview](https://html-in-canvas.dev/docs/overview/)
- [HTML-in-Canvas demos](https://html-in-canvas.dev/demos/)
- [HTML-in-Canvas Page Curl / Book Turn demo](https://html-in-canvas.dev/demos/page-curl-book-turn/)
- [HTML-in-Canvas Pixel Disintegration demo](https://html-in-canvas.dev/demos/pixel-disintegration/)
- [html2canvas documentation](https://html2canvas.hertzen.com/documentation/)
- [html2canvas FAQ](https://html2canvas.hertzen.com/faq.html)
