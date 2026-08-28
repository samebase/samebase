# 109 Route URL Editor Rebuild Requirements

This file captures the requirements chosen while replacing the old URL editor.

## Current Decision

The current production `RouteUrlEditorNext` and `useRouteEditorVm` behavior is the source of truth
for draft parsing and instant route application. The typed FSM exists to make that behavior easier
to reason about, not to replace it with a slower Enter-only model.

Ambient sidebar/link hover preview is not part of this rebuild. URL-editor-owned suggestion preview
is still allowed because the focused editor owns the draft, suggestions, accept, cancel, and blur
boundaries.

## App Route Model

All app routes go through `AppRootClient -> AppWorkspaceShell -> SidebarLayout`.

Path changes such as `/privacy -> /terms -> /logo -> /indexDB` swap route content and route chrome,
not the shared workspace shell. The editor may therefore preview path changes when the target route
is ready to load.

`AppWorkspaceShell` always supplies `RouteUrlEditorNext` as Samebase's address editor for the
`SidebarLayout` address chrome region. The region is part of the canonical workspace layout, not a
separate app shell above it and not a pane header inside the mobile carousel.

`SidebarLayout` owns the address chrome region's placement, functional containment, and relationship
to the pane viewport. Samebase owns its background and separator appearance. Samebase also owns the
editor's control height and route intelligence: TanStack router integration, route readiness,
access-aware path suggestions, query-param suggestions, hash suggestions, and preview/commit/restore
behavior.

## Requirements

### R0: Focus adds a search continuation marker

When the input receives focus, `/` stays `/`.

Every other route appends `?` if it has no search params, or `&` if it already has search params.

When focus leaves, an empty trailing marker is normalized away through the app route-search parser
and stringifier.

### R1: Domain prefix

The origin/domain is stored separately from the app route address.

The app route address stays app-relative and keeps the leading `/`.

When the editor is blurred, the input value is the app route address. The blurred display must not
use an origin-derived negative indent or margin because prerender and SSG can run under an origin
that differs from the deployed page.

When the editor is focused, the same physical input switches to the full URL value derived from the
runtime client origin. Focused mode may visually hide that runtime origin with text indentation, but
display mode cannot depend on the origin width.

The same DOM input stays mounted across the blurred-to-focused transition so iOS Safari treats the
tapped field as the editable text field that should open the software keyboard.

### R2: Locked prefix edits

The locked prefix is `${origin}/`. Edits must not remove it from state or from the restored input
value.

If the next input value still starts with `${origin}/`, accept it and derive route text after the
prefix.

If Cmd/Ctrl+Backspace would remove the locked prefix, keep `${origin}/` and delete only route text
after the prefix.

For any other edit that removes the locked prefix, reject it and restore the previous input value
and selection.

### R3: Drafts apply when they are route-ready

Typing updates the focused draft first.

The editor derives a route-ready draft from that focused draft. The derived ready draft is allowed
to omit incomplete search tokens.

If the derived route is valid, same-origin, different from `expectedRouteAddress`, and ready to
load, the editor applies it immediately and adds a browser history entry for that canonical route.

`expectedRouteAddress` is the canonical route TanStack should report after root search validation,
route redirects, and search serialization. Example: `/logo?dark&light` canonicalizes to `/logo`, so
the FSM must expect `/logo`, not the raw conflicting draft.

While focused, the editor can have a local draft that differs from `expectedRouteAddress`. Escape
and blur show `expectedRouteAddress`, not the route from the moment focus started.

Examples:

- `/logo?dar` stays local because `dar` is only a partial known key.
- `/logo?dark` applies immediately and the page becomes dark.
- Back after typing `/logo?dark` returns to the previous canonical route, not to `/logo?dar`.
- `/logo?leftFace=s` stays local because the value is incomplete.
- `/logo?leftFace=secondary` applies immediately.
- `/logo?depth=2`, delete `2`, then type `3`: deleting `2` applies `/logo` as a history entry, then
  typing `3` applies `/logo?depth=3` as another history entry.
- `/lo` stays local because the path is partial.
- `/logo` may apply immediately because it is a loadable route.

### R4: Path readiness comes from the real route registry

Path-changing previews use registered route paths and the viewer's effective access keys.

Static paths must be exact before navigation. Dynamic and catch-all paths must have enough concrete
segments to load.

Same-path option previews preserve scroll. Path-changing previews can change route content and route
chrome, but must keep the shared workspace shell mounted.

### R5: Suggestions can preview inside the editor session

Keyboard movement, pointer hover, and touch picker movement may preview a suggestion by applying the
suggestion's route-ready draft with router `replace`.

Before adding a new preview-like interaction, answer these questions with the exact state field
names the implementation uses:

- What happens on Escape?
- What happens on Enter/click?
- What happens on blur/click outside?
- What route should be restored?
- What text should remain in the input?

These questions decide whether the interaction keeps `focusMode: "editing"`, moves to
`focusMode: "suggestion"`, or needs a new state shape. Similar input affordances can share
transition code only when these answers match.

While `focusMode` is `"editing"`, there is no active suggestion row. While `focusMode` is
`"suggestion"`, `previewRoute.suggestionIndex` drives `aria-activedescendant` and row highlight.

On touch layouts, the fixed scroll-picker slate is a visual guide and can be visible while
`focusMode` is `"editing"`. It does not mean a suggestion is active. Only a real touch/wheel scroll
over the suggestion list can move to `focusMode: "suggestion"` and create `previewRoute`.

Current answers:

- Mouse pointer movement over a row moves to `focusMode: "suggestion"` and creates `previewRoute`. A
  row appearing under a stationary mouse must not create `previewRoute`.
- Pointer leave clears pointer-created `previewRoute`, returns to `focusMode: "editing"`, and
  restores `expectedRouteAddress`.
- Click commits the row's selected route address into `draftRouteAddress` and returns to
  `focusMode: "editing"`.
- Keyboard ArrowUp/ArrowDown also move to `focusMode: "suggestion"` and create `previewRoute`. Enter
  commits the row's selected route address into `draftRouteAddress` and returns to
  `focusMode: "editing"`.
- For pointer/keyboard/touch-scroll previews, blur/click outside does not commit
  `previewRoute.routeAddress`. It restores `expectedRouteAddress` and leaves the editor blurred.
- Escape also does not commit `previewRoute.routeAddress`. It restores `expectedRouteAddress` and
  blurs.
- Clicking back into the input while `previewRoute` is active cancels `previewRoute`, restores
  `expectedRouteAddress`, and resumes editing `draftRouteAddress`.
- Mobile touch scroll moves to `focusMode: "suggestion"` and creates `previewRoute` with source
  `"touch"`. This keeps suggestions anchored to `draftRouteAddress` while the fixed slate scrolls
  over rows. Example: while editing `/logo?`, scrolling to `?top=sky-500` shows `/logo?top=sky-500`
  in the input, but the list still shows query-key rows until tap.
- Visible suggestion-group labels never enter `previewRoute.suggestionIndex`. The touch picker
  measures the rendered option positions around those labels and maps the selected option back to
  the same flat suggestion index used by keyboard and pointer input.
- Mobile row tap runs `selectedSuggestion`. It commits the row's selected route address into
  `draftRouteAddress` and moves `selection` into the next editing slot, such as after `?`, `&`, or
  `=`.

Selecting a suggestion commits according to `specs/107_ROUTE_URL_EDITOR_SUGGESTION_MODEL_SPEC.md`:

- path suggestions can open the first search-param slot after the path is selected.
- presence params commit and can open the next search-param slot.
- value-param key rows can preview a sample such as `top=sky-500`. Selection keeps `top=sky-500`,
  but places the cursor after `top=` so value rows stay visible.
- partial color families such as `blue-500` keep the sample value but place the cursor after `blue-`
  until a final shade is chosen.

Pointer-leave restore is only for editor suggestion preview. It must not reintroduce ambient
sidebar/link route preview.

### R6: Blur and Escape

Escape cancels the focused edit, restores `expectedRouteAddress`, and blurs.

If `focusMode` is `"suggestion"`, Escape restores `expectedRouteAddress`; it does not commit
`previewRoute.routeAddress`.

For pointer/keyboard/touch-scroll `previewRoute`, blur/click outside restores
`expectedRouteAddress`. The app Refresh button restores before reload because that button is part of
the editor chrome. Browser hard reload loads the currently visible browser URL; it does not have a
separate editor recovery path.

If `focusMode` is `"editing"`, blur keeps the latest route-ready draft already applied as
`expectedRouteAddress`. If the focused draft is incomplete or invalid, the visible input normalizes
back to `expectedRouteAddress`.

If TanStack reports a committed route that matches neither `expectedRouteAddress` nor
`previewRoute.expectedRouteAddress`, the route changed outside this editor session. The editor blurs
and the blurred display reads the TanStack route. We do not merge that external route into the
focused draft.

Mobile touch scroll creates `previewRoute` with source `"touch"`, but blur/click outside restores
`expectedRouteAddress`. Scroll movement previews a row; row tap is the commit.

### R7: Keep the FSM state small

Do not start from a state shape with separate `readyRouteAddress`, `appliedRouteAddress`, and
`previewBaseRouteAddress` fields.

Store only facts that are not cheaply derived from the current focused draft, current router route,
and current event.

Current shape:

```ts
type RouteEditorState =
  | {
      kind: "blurred";
      prefix: string;
    }
  | {
      kind: "focused";
      focusMode: "editing";
      draftRouteAddress: string;
      expectedRouteAddress: string;
      prefix: string;
      selection: RouteAddressSelection;
    }
  | {
      kind: "focused";
      focusMode: "suggestion";
      draftRouteAddress: string;
      expectedRouteAddress: string;
      previewRoute: {
        source: "keyboard" | "pointer" | "touch";
        suggestionIndex: number;
        routeAddress: string;
        expectedRouteAddress: string;
      };
      prefix: string;
      selection: RouteAddressSelection;
    };
```

`expectedRouteAddress` is not a second display source. It is the route the editor expects TanStack
to show, and the restore target for `previewRoute`.

Add another field only when a test proves it represents a non-derived fact.

### R8: Select All and Copy

Blurred Select All + Copy copies the visible app route address.

Focused Select All + Copy copies the absolute URL because the focused input value includes the
runtime origin.

### R9: Public route query stories

These stories should stay covered with real route-level interactions, not mocked DOM input changes.

- `/ -> /logo`: selecting the `/logo` path row focuses the editor, applies `/logo`, shows `/logo?`,
  and opens query-key suggestions.
- `/logo?top=blue-200`: value rows can show samples. Selecting the `?top=sky-500` key row keeps
  `?top=sky-500` and places the cursor after `top=`, selecting the `blue-500` family row keeps
  `blue-500` and places the cursor after `blue-`, and selecting the `200` shade row uses `blue-200`
  and opens the next query slot.
- `/logo?zoom=0.5`: query-key rows can preview `?zoom=0.5`; selecting the row keeps `?zoom=0.5` and
  places the cursor after `zoom=` so numeric value rows stay visible.
- Suggestions are chosen by cursor segment, not by filtering against typed text. A cursor in the
  path shows path rows. A cursor in a query key shows query-key rows and selecting one replaces the
  whole active query token. A cursor in a color value before `-` shows color-family rows and
  selecting one replaces the whole value with the unfinished family prefix. A cursor after `-` shows
  shade rows for that family and selecting one replaces the whole value.
- `/logo?dark&light`: conflicting theme flags may canonicalize the browser route to `/logo`, but the
  focused editor still owns the visible draft until blur/Escape.
- `/logo?dark&reset`: `reset` may canonicalize the browser route to `/logo`, but the focused editor
  stays open and blur/Escape shows `/logo`.
- `auth`, `signup`, and `prod-ui` are valid for direct URLs but hidden from query suggestions.
- `?dev` and `?devtools` are typeable but hidden from suggestions. Manually entering `?dev` reveals
  developer route suggestions. React Query Devtools mounts debug UI and should not be activated by
  hover/keyboard preview.
- `/logo?rot=`: empty numeric values stay local. Completing the value, such as `rot=10`, applies the
  route.
- `/logo?zoom=0.01` then Backspace: the browser may canonicalize `zoom=0.0` to `zoom=0`, but text
  editing should stay focused and show the typed draft.

Combined interaction stories:

- Pointer-preview `/privacy` from draft `/terms?top=red-`, then click outside. The browser route and
  blurred display restore to `/terms`.
- Keyboard-preview `/privacy` from draft `/terms?top=red-`, then click outside. The browser route
  and blurred display restore to `/terms`.
- Touch-scroll preview `/logo` from `/terms`, then tap outside. The browser route and blurred
  display restore to `/terms`.
- Touch-scroll preview `/logo` from `/terms`, then tap the `/logo` row. The row tap commits, so the
  browser route and focused draft stay on `/logo?`.
- `/logo?rot=` then click outside. The unfinished numeric token is not committed; blurred display
  and browser route show `/logo`.

### R10: Review follow-ups to decide next

These are not accepted behavior yet. Keep them visible so review findings do not get lost.

- Decide how dynamic routes participate in suggestions. Current work ignores variable paths such as
  `/vault/$`; if we support them, query-param suggestions need template-aware route matching.
- Replace synthetic touch-scroll tests with more real mobile gestures if touch picker regressions
  keep hiding behind implementation-shaped tests.
