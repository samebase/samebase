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

## Revised direction

The measured-indent patch was removed from PR #972. The better direction is to use the new two-input
architecture instead of continuing to hide the origin in the blurred input.

`RouteUrlEditorNext` already renders separate inputs for blurred and focused state:

- blurred: `displayInputProps`
- focused: `inputProps`

`useRouteEditorVm` also already stores route addresses separately from full input strings:

- `draftPath` starts with `/` and never includes `prefix`
- `committedRouteAddress` is read from TanStack Router
- `inputValue` is currently reconstructed as `${prefix}${routeAddress.slice(1)}`

That means blurred display can show the route address directly, such as `/`, `/terms`, or
`/privacy`, without using an origin prefix or negative text indent at all. Focused editing can still
switch to the full URL value because focus happens in the browser, where `window.location.origin` is
available and prefix-protection needs the full prefix.

Expected behavior after the next implementation:

- blurred input value is the route address only, e.g. `/terms`
- blurred input has no `text-indent`
- focused input value is the full browser URL, e.g. `https://noter.md/terms?`
- focused input keeps the prefix-protection behavior that prevents deleting or editing the origin
- focus from the blurred route-only input translates route-only selection indexes into full-URL
  selection indexes

## Source map

- `apps/noter/src/components/RouteUrlEditor/RouteUrlEditorNext.tsx` renders separate focused and
  blurred inputs. Today both receive `textIndent: -${prefix.length - 1}ch`.
- `apps/noter/src/components/RouteUrlEditor/useRouteEditorVm.ts` constructs the current full
  `inputValue` once and passes it to both `displayInputProps.value` and `inputProps.value`.
- `handleDisplayInputFocus` and `handleDisplayInputClick` currently read selection directly from the
  blurred input and send it to the `clickedInput` transition. If blurred value becomes `/terms`,
  those selection indexes must be translated before the focused full-URL input renders.
- `readInputSelectionFromRouteIndex(prefix, routeIndex)` already maps route indexes into full-URL
  input indexes for suggestion previews.
- Prefix protection in the focused input depends on the full value and should stay intact:
  `changedInput` requires `nextInputValue.startsWith(prefix)`, and the key handlers clamp selection
  to `prefix.length`.

## Tests to update

- `apps/noter/e2e/route-url-editor-next.spec.ts` helpers currently expect blurred display values to
  be `${prefix}${route}`. They should expect route-only values before focus and full URL values
  after focus.
- `apps/noter/e2e/public-landing-shell.spec.ts` currently expects production SSR HTML to include a
  full URL value and `text-indent`. It should expect route-only blurred HTML and no `text-indent`.
- Legacy `apps/noter/e2e/route-url-editor.spec.ts` covers the old single-input editor. It can stay
  as legacy coverage unless the old component is removed or updated.
