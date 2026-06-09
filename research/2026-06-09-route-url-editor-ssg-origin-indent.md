# Route URL Editor SSG Origin Indent

## Finding

The route URL editor keeps the full URL in the input value, then hides the origin with negative
`text-indent` so the visible text starts at the route path.

Local production prerender can serialize the build-time preview origin into static HTML. In the
current local `pnpm run build:ci` output, the prerendered files contain:

```html
value="http://127.0.0.1:58960/terms" style="text-indent:-22ch"
```

That origin is longer than `https://noter.md`. If the hydrated browser app keeps that build-time
origin or keeps an indent derived from it, direct routes such as `/`, `/terms`, and `/privacy` can
be shifted far enough left that no route text is visible.

Live `https://noter.md` HTML checked on June 9, 2026 still serialized `https://noter.md` and
`text-indent:-16ch`, so the build-time localhost origin is not universal across every served
artifact. It is still a real local production-build failure mode and matches the blank-route symptom
when hydration does not replace the server origin/indent.

## Required behavior

After hydration, the route URL editor must:

- read the browser origin from `window.location.origin`, not a request URL captured during SSR or
  prerender
- keep the input value as the full current URL
- keep the visible text path-focused
- compute the hidden-origin indent from the rendered origin width, not from `origin.length * 1ch`

## Verification used in PR #972

- Checked local `dist/client/index.html`, `dist/client/terms/index.html`, and
  `dist/client/privacy/index.html`; they serialized the build-time `http://127.0.0.1:58960` origin.
- Checked live `https://noter.md/`, `/terms`, and `/privacy`; they serialized `https://noter.md`
  with the old `-16ch` indent before this PR.
- Verified Pixel 9 emulator normal Chrome against the rebuilt local production preview:
  - `/` and `/terms` are path-focused
  - the hydrated root input value is `http://127.0.0.1:4173/`
  - the hydrated root input uses `text-indent:-201.637px`, matching the measured rendered origin
    width `201.6369px`
