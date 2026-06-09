# 108 Route URL Editor Requirements Inventory Spec

## Document Control

- Status: Draft requirements inventory
- Owner: Noter frontend/app shell
- Last updated: 2026-06-09
- Depends on:
  - `apps/noter/src/components/RouteUrlEditor/RouteUrlEditor.tsx`
  - `apps/noter/src/components/RouteUrlEditor/RouteUrlEditor.test.tsx`
  - `apps/noter/src/lib/routeUrlEditor.ts`
  - `apps/noter/src/lib/routeUrlEditorSuggestions.ts`
  - `apps/noter/src/lib/routeUrlPathSuggestions.ts`
  - `apps/noter/src/lib/routeUrlEditorHashSuggestions.ts`
  - `specs/090_ROUTE_SEARCH_PRESENCE_FLAGS_SPEC.md`
  - `specs/107_ROUTE_URL_EDITOR_SUGGESTION_MODEL_SPEC.md`

## Summary

The route URL editor is the workspace chrome for seeing the current app route, drafting a route
change, previewing valid route changes, and committing route navigation.

This document inventories current shipped behavior so the replacement editor can be rebuilt from
explicit requirements instead of copying `RouteUrlEditor.tsx` line by line. Items here are not all
automatically required forever. The next pass should mark each item as keep, simplify, defer, or
delete.

`specs/107_ROUTE_URL_EDITOR_SUGGESTION_MODEL_SPEC.md` remains the detailed source of truth for
search-param suggestion semantics. This spec references that behavior but focuses on the whole
editor contract: chrome, input ownership, draft state, previews, commits, history, focus, and touch
behavior.

## Current Requirements Inventory

### Chrome

1. The editor renders Back, Forward, and Refresh controls beside the URL surface.
2. The editor does not render a separate "Go to route URL" button; the URL input itself is the
   editing and commit surface.
3. Back calls router history back. Forward calls router history forward. Refresh reloads the current
   browser page.
4. Back is enabled when the current route-history index is greater than zero.
5. Forward is enabled when the current route-history index is lower than the known forward index.
6. The app saves route-history indexes into the current browser history entry and reads them back
   before paint so hard reloads can keep Back and Forward enabled when browser session history still
   exists.

### URL Surface

1. When the editor is not focused, the visible value is the app route address, such as `/logo`, not
   `origin + routeAddress`.
2. The blurred display must not use an origin-derived negative indent or margin. Prerender and SSG
   can run under a different origin than the deployed page, so display mode cannot depend on a
   build-time origin width.
3. Focusing the URL surface keeps the same physical input mounted and switches it into the editable
   full URL value, `origin + routeAddress`, using the runtime client origin.
4. While focused, the UI may visually hide the runtime origin offset while keeping it in the input
   value, so focused copy/select behavior sees an absolute URL.
5. The editable route value is app-local: the route address starts at `/`, `?`, or `#` and must
   resolve to the same origin.
6. The origin and root slash boundary are protected. Native edits that delete across that boundary
   are either clamped to the route-owned text or rejected and restored.
7. Blurred copy/select copies the visible app route address. Focused copy/select copies the absolute
   URL because the focused input value includes the runtime origin.
8. Invalid drafts set the input invalid state and expose the hidden error text
   `Enter a same-origin app URL.`
9. Text entry must stay at least 16 CSS px to avoid iOS WebKit focus zoom.

### Draft And Route Reality

1. The editor separates committed route reality from the focused local draft.
2. When the input is not focused, the draft follows the current route.
3. When the input is focused and has not been edited since focus, external route changes update the
   draft.
4. When the input is focused and has been edited since focus, external route changes do not replace
   the user's local draft.
5. Typing a valid draft may preview the route, but router normalization must not overwrite the
   user's draft text until commit or blur.
6. Incomplete value-bearing search params stay local until they become a route-update-ready value.
   For example, `?rot=` and `?leftFace=s` can remain visible in the input while the committed route
   stays at `/logo`.
7. Escape cancels the local draft, restores the latest committed route address, and blurs the input
   without committing the blur draft.
8. Blur commits a valid draft. If the draft is invalid or incomplete and reset-on-blur applies, the
   input resets to the latest committed route address.

### Focus And Selection

1. Focusing the input refreshes document hash suggestions, marks the draft clean, opens suggestions
   when suggestions exist, and computes suggestion mode from the current cursor position.
2. Cursor and selection changes update the suggestion mode and selection route index.
3. Clicking or mouse-up at the end of a complete route with route-owned search options can open the
   next empty search-param slot.
4. Clicking at the end of the root route keeps path suggestions instead of opening a search-param
   slot.
5. A page wheel or touchmove gesture outside the editor blurs the focused input.
6. Wheel or touch scrolling inside the suggestions list stays editor-owned and must not blur the
   input.

### Suggestions

1. Suggestions are visible only when the input is focused, suggestions have not been dismissed, and
   the current suggestion list is non-empty.
2. Suggestions use listbox semantics. The input exposes `aria-controls`, `aria-expanded`, and
   `aria-activedescendant` when a suggestion is active.
3. The current selection route index chooses one of the editor suggestion modes: `path`, `search`,
   `search-value`, or hash suggestions.
4. Current prod uses URL section boundaries, not selected text, to choose suggestion mode. Cursor at
   or before `?` shows paths; cursor after `?` through `#` shows search key/value suggestions;
   cursor after `#` shows hash suggestions.
5. Current prod path filtering depends on edit state. A clean focused draft shows all accessible
   paths. After the draft is edited, paths are filtered by the whole draft pathname, not by the
   caret-local prefix before the cursor.
6. Example: for `/logo?top=blue-500`, a cursor between `o` and `g` is path mode. If the draft is
   clean, prod shows all accessible paths; if edited, prod filters against `/logo`, not `/lo`.
7. Search key suggestions filter by the current query-token key prefix. Search-value suggestions
   filter by the current token value and the selected param's value metadata.
8. Hash suggestions are not filtered by the hash text after `#`; they combine global keys,
   route-specific keys, and current-document keys when the draft path matches the current route
   path.
9. Path suggestions come from registered, user-facing, permission-accessible routes.
10. Internal underscore paths are excluded from path suggestions.
11. Dynamic paths preview only when the typed path has enough concrete segments to load.
12. Search suggestions combine the matched route's params with global root params, filter by viewer
    permission, remove duplicate keys, and sort by key.
13. Hash suggestions include global, route-specific, and current-document anchor metadata.
14. Current-document hash suggestions refresh on route change and while focused DOM hash-suggestion
    metadata changes.
15. Search-param suggestion behavior follows `specs/107_ROUTE_URL_EDITOR_SUGGESTION_MODEL_SPEC.md`.
16. Key-only presence flag behavior follows `specs/090_ROUTE_SEARCH_PRESENCE_FLAGS_SPEC.md`.

### Preview

1. Typing, keyboard suggestion movement, pointer hover, and touch-scroll selection can preview a
   valid route draft.
2. Previews replace the current browser history entry.
3. Same-path option previews preserve scroll.
4. Route-changing previews run only when the next path is ready for navigation.
5. Preview state stores the route that existed before preview so the editor can restore it or commit
   from it correctly.
6. Pointer hover previews store a pointer-preview base and restore that base when the pointer leaves
   the suggestions list without selection.
7. After keyboard edits create suggestions under a stationary pointer, mouse hover does not preview
   until the pointer moves.

### Commit

1. Submitting the form commits the current draft.
2. Selecting an active suggestion with Enter commits that suggestion.
3. Clicking a suggestion commits that suggestion while keeping input focus.
4. Committing after a preview restores the pre-preview route first, then pushes the selected route,
   so Back returns to the route the user started from.
5. Same-path option commits can replace the current route entry. Route-changing commits push a
   route-navigation entry unless the caller explicitly requested replacement.
6. Path suggestion selection can commit the path and then open the first search-param slot when the
   selected path has searchable route options.
7. Selecting a value-bearing search-param key opens an unfinished `key=` value slot instead of
   committing the rendered sample value.
8. Selecting a key-only presence param commits the param and opens the next search-param slot when
   more suggestions exist.
9. Selecting an unfinished search-value suggestion keeps value-picking mode open.
10. Selecting a final search-value suggestion commits the value and opens the next search-param slot
    when more suggestions exist.
11. Navigation requests are queued so rapid previews and commits are applied in order.

### Keyboard

1. ArrowDown moves to the next suggestion and previews it.
2. ArrowUp moves to the previous suggestion and previews it.
3. Arrow navigation wraps through the suggestion list.
4. Enter selects the active suggestion when suggestions are visible.
5. Cmd/Ctrl+Backspace at the origin boundary deletes only route-owned text and preserves the origin
   plus root slash.
6. Escape cancels and blurs as described in Draft And Route Reality.

### Touch Picker

1. Coarse-pointer devices use the touch scroll picker when suggestions are visible.
2. The touch picker hides scrollbars, adds top and bottom spacer room, and renders a fixed slate
   over the scrollport.
3. The option under the slate previews while the suggestions list scrolls.
4. Pending touch-scroll previews commit on blur.
5. The touch picker recomputes metrics on resize and suggestion scrollport resize.

### Debug And Research Surfaces

1. The production component may expose an optional debug snapshot for research fixtures.
2. The debug snapshot observes the real editor state, handlers, router behavior, and suggestion
   logic; it must not replace production behavior.
3. XState inspection support is debug-only and should not be required by the product contract unless
   the replacement implementation chooses XState again.
4. Research pages can derive readable state labels from the debug snapshot, but those labels are not
   themselves the production state model.

## Review Checklist For The Replacement

Use this checklist to decide which current behaviors are truly necessary before rebuilding the full
component:

1. Keep, simplify, defer, or delete touch-scroll picker behavior.
2. Keep, simplify, defer, or delete hover preview behavior.
3. Decide whether route previews should happen while typing, only from suggestions, or both.
4. Decide whether hard-reload Back/Forward restoration is still worth carrying.
5. Decide whether the absolute URL input with hidden origin remains the right interaction model.
6. Decide which debug fields are useful for the new state-machine research page.
7. Decide whether every current suggestion continuation rule should survive, or whether some can be
   postponed until the simpler editor is stable.
