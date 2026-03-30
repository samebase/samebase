# 075 Pretext Text Layout Research

## Document Control

- Status: Research note
- Owner: Noter product/frontend
- Last updated: 2026-03-31
- Depends on:
  - `apps/noter/src/hooks/useExpandableClampText.ts`
  - `apps/noter/src/components/ChatInput.tsx`
  - `apps/noter/src/components/ProsemarkReadOnly.tsx`
  - `apps/noter/src/components/ProsemarkMergeEditor.tsx`

## Purpose

Evaluate whether [`chenglou/pretext`](https://github.com/chenglou/pretext) looks
like a good fit for Noter, what it is actually optimized for, and where its
current architecture does or does not line up with this codebase.

## Research Question

Should Noter adopt Pretext for multiline text measurement or layout, and if so,
where is the smallest honest integration point?

## Verified Current State

### Project maturity and distribution

As of 2026-03-31:

- GitHub shows roughly 20k stars and 700+ forks for
  [`chenglou/pretext`](https://github.com/chenglou/pretext).
- The npm package is
  [`@chenglou/pretext`](https://www.npmjs.com/package/@chenglou/pretext).
- The latest npm dist-tag is `0.0.3`.
- The checked-in changelog marks:
  - `0.0.0` on 2026-03-26
  - `0.0.1` on 2026-03-27
  - `0.0.2` on 2026-03-28
  - `0.0.3` on 2026-03-29
- GitHub does not currently expose a latest release entry for the repo; the
  public version history is primarily the npm package plus `CHANGELOG.md`.

Conclusion:

- this is a very new public package despite the repo already having substantial
  research depth and adoption interest
- we should treat the API as promising but still early

### What the library actually does

Pretext is a browser-oriented multiline text measurement library. Its core
architecture is explicitly two-phase:

1. `prepare(text, font, options?)`
   - normalize and segment the text
   - measure segments with canvas
   - cache widths and break metadata
2. `layout(prepared, maxWidth, lineHeight)`
   - do arithmetic-only line counting from the cached measurements

The richer API surface also includes:

- `prepareWithSegments()`
- `layoutWithLines()`
- `walkLineRanges()`
- `layoutNextLine()`
- `setLocale()`
- `clearCache()`

Important constraints from the current implementation:

- the input is plain text, not rich text with mixed inline styles
- measurement is keyed by one canvas-style `font` string
- whitespace modes are currently just `'normal'` and `'pre-wrap'`
- the package is ESM-only and publishes built output from `dist/`
- there are no runtime dependencies

### Runtime assumptions

The repo README says rendering support is for DOM, Canvas, SVG and "soon,
server-side," but the checked-in source is still clearly browser-centered.

Current implementation details:

- `src/measurement.ts` requires `OffscreenCanvas` or
  `document.createElement('canvas')` and throws if neither exists
- browser-specific line-fit behavior is selected by reading
  `navigator.userAgent` and `navigator.vendor`
- emoji correction can do one hidden DOM span measurement per font
- segmentation relies on `Intl.Segmenter`

Conclusion:

- today this is not a plain Node/server-runtime primitive
- it fits browser or browser-like worker environments best
- any Noter adoption should assume client-only execution unless Pretext itself
  broadens its supported runtime story

### Claimed accuracy and benchmark posture

The repo keeps checked-in snapshot dashboards rather than relying only on README
claims.

From `status/dashboard.json` generated on 2026-03-30T11:36:42.971Z:

- browser accuracy regression gate:
  - Chrome: `7680 / 7680` exact
  - Safari: `7680 / 7680` exact
  - Firefox: `7680 / 7680` exact
- benchmark snapshot:
  - `prepare()`: about `18.85ms` for one cold shared 500-text batch
  - `layout()`: about `0.093ms` for that same batch
  - DOM batch resize baseline: about `4.05ms`
  - DOM interleaved resize baseline: about `43.5ms`

Important nuance:

- Pretext is not claiming "always faster than every DOM read"
- the value proposition is:
  - keep repeated resize/layout work off the DOM hot path
  - avoid interleaved read/write reflow traps
  - make repeated relayout of already-prepared text extremely cheap

### Known current caveats

The repo is unusually honest about its present boundaries:

- `system-ui` is documented as unsafe for accurate layout on macOS
- server-side support is still a future direction, not a current guarantee
- automatic hyphenation is still an open design question
- the repo still tracks unresolved canaries in Chinese, Myanmar, Urdu, and
  soft-hyphen-heavy mixed app text

That is a positive sign for research quality, but it also means we should not
oversell it internally as a universal text oracle.

## Fit Against Noter

### What Noter currently measures

The closest current Noter measurement surfaces are:

- `apps/noter/src/hooks/useExpandableClampText.ts`
  - hidden DOM measurement to decide whether a clamped text block needs an
    expand affordance
- `apps/noter/src/components/ChatInput.tsx`
  - textarea `scrollHeight` or CodeMirror `contentHeight` auto-resize
- `apps/noter/src/components/ProsemarkReadOnly.tsx`
  - CodeMirror view-driven height synchronization
- `apps/noter/src/components/ProsemarkMergeEditor.tsx`
  - merge editor `scrollHeight` measurement

These are not equally good candidates.

### Good fit

Pretext looks strongest where all of these are true:

- the content is plain text
- the font and typography are known up front
- we want height prediction before or without attaching real DOM text nodes
- the same text may be laid out repeatedly at different widths
- the surface is read-only

That makes it a plausible fit for future Noter features such as:

- dense virtualized lists of thread previews or repository descriptions
- precomputed card heights for read-only dashboard surfaces
- clamp/expand eligibility checks in a list where many items would otherwise
  measure themselves with hidden DOM
- canvas/SVG/editorial experiments that need manual line geometry instead of DOM

### Weak fit

Pretext looks weak for current Noter editor surfaces:

- `ChatInput` needs real editable browser behavior, composition, selection,
  caret movement, and exact textarea or CodeMirror layout
- `ProsemarkReadOnly` and `ProsemarkMergeEditor` are rich-text/markdown editor
  surfaces, not single-font plain-text paragraphs
- Monaco / CodeMirror / ProseMark already own layout, wrapping, selection, and
  token rendering

Conclusion:

- Pretext is not a drop-in replacement for our current editor measurement paths
- its model is much closer to read-only paragraph prediction than to editor
  engine layout

### Font-system mismatch risk

Pretext explicitly warns that `system-ui` is unsafe for accurate layout on
macOS. Noter does not currently establish a single named body font in
`apps/noter/src/index.css`; much of the app inherits the platform default stack.

That means one of Pretext's known caveats is relevant immediately:

- if we adopt it for any user-visible prediction path, we should pair it with a
  named font we actually control
- using it against inherited default app typography would weaken the accuracy
  claim on exactly the platforms the repo calls out

## Recommendation

Do not adopt Pretext as a general text-layout dependency for Noter's core editor
stack right now.

Adopt the narrower view instead:

- Pretext is a high-quality specialized browser utility for read-only plain-text
  measurement
- it is most interesting if Noter starts needing large-scale height prediction
  or virtualization for many repeated text rows
- it is not the right abstraction for our current CodeMirror/ProseMark/textarea
  layout paths

## Recommended Next Step

If we want to validate it in this repo, the smallest honest experiment is:

1. target only a browser-only read-only surface
2. use a named font, not inherited default app typography
3. compare it against the current DOM-measure approach in
   `useExpandableClampText`
4. keep the experiment behind a tiny repo-owned wrapper instead of threading the
   package through editor code

That would answer the real question for Noter:

- whether Pretext meaningfully reduces DOM measurement churn on dense read-only
  lists without dragging browser-only assumptions into the editor stack

## Sources

- GitHub repo: <https://github.com/chenglou/pretext>
- README: <https://github.com/chenglou/pretext/blob/main/README.md>
- Package manifest: <https://github.com/chenglou/pretext/blob/main/package.json>
- Changelog: <https://github.com/chenglou/pretext/blob/main/CHANGELOG.md>
- Current status snapshot:
  <https://github.com/chenglou/pretext/blob/main/STATUS.md>
- Research log: <https://github.com/chenglou/pretext/blob/main/RESEARCH.md>
- Core layout implementation:
  <https://github.com/chenglou/pretext/blob/main/src/layout.ts>
- Measurement implementation:
  <https://github.com/chenglou/pretext/blob/main/src/measurement.ts>
- Text analysis implementation:
  <https://github.com/chenglou/pretext/blob/main/src/analysis.ts>
