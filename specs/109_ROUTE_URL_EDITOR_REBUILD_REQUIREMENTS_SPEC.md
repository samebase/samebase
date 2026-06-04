# 109 Route URL Editor Rebuild Requirements

This file is only for requirements we choose while rebuilding the URL editor. The long inventory is
`specs/108_ROUTE_URL_EDITOR_REQUIREMENTS_INVENTORY_SPEC.md`.

## Current Decision

The current production `RouteUrlEditor` behavior is the source of truth for draft parsing and
instant route application. The rebuild should make that behavior easier to reason about with the
typed FSM, not replace it with a slower Enter-only model.

Ambient sidebar/link hover preview is not part of this rebuild. URL-editor-owned suggestion preview
is still allowed because the focused editor owns the draft, suggestions, accept, cancel, and blur
boundaries.

## App Route Model

All app routes go through `AppRootClient -> AppWorkspaceShell -> WorkspaceLayoutV2`.

Path changes such as `/privacy -> /terms -> /logo -> /indexDB` swap route content and route chrome,
not the shared workspace shell. The editor may therefore preview path changes when the target route
is ready to load.

## Requirements

### R0: Focus adds a search continuation marker

When the input receives focus, `/` stays `/`.

Every other route appends `?` if it has no search params, or `&` if it already has search params.

When focus leaves, an empty trailing marker is normalized away through the app route-search parser
and stringifier.

### R1: Domain prefix

The origin/domain is stored separately from the app route address.

The locked display prefix is derived from the origin. The app route address stays app-relative and
keeps the leading `/`.

Until the prefix is split into separate UI, the input value is derived as the full URL.

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

If the derived route is valid, same-origin, different from the current router href, and ready to
load, the editor applies it immediately with router `replace`.

Examples:

- `/logo?dar` stays local because `dar` is only a partial known key.
- `/logo?dark` applies immediately and the page becomes dark.
- `/logo?leftFace=s` stays local because the value is incomplete.
- `/logo?leftFace=secondary` applies immediately.
- `/lo` stays local because the path is partial.
- `/logo` may apply immediately because it is a loadable route.

### R4: Path readiness comes from the real route registry

Path-changing previews use registered route paths and viewer permissions.

Static paths must be exact before navigation. Dynamic and catch-all paths must have enough concrete
segments to load.

Same-path option previews preserve scroll. Path-changing previews can change route content and route
chrome, but must keep the shared workspace shell mounted.

### R5: Suggestions can preview inside the editor session

Keyboard movement, pointer hover, and touch picker movement may preview a suggestion by applying the
suggestion's route-ready draft with router `replace`.

Selecting a suggestion commits according to `specs/107_ROUTE_URL_EDITOR_SUGGESTION_MODEL_SPEC.md`:

- path suggestions can open the first search-param slot after the path is selected.
- presence params commit and can open the next search-param slot.
- value-param key rows open `key=` instead of silently committing a sample.
- partial color families such as `blue-` stay in value-picking mode until a final shade is chosen.

Pointer-leave restore is only for editor suggestion preview. It must not reintroduce ambient
sidebar/link route preview.

### R6: Blur and Escape

Escape cancels the focused draft, restores the latest router route address, and blurs without
committing the draft.

Blur commits the current valid route-ready draft. If the visible draft is incomplete or invalid, the
visible input normalizes back to the latest applied router route.

### R7: Keep the FSM state small

Do not start from a state shape with separate `readyRouteAddress`, `appliedRouteAddress`, and
`previewBaseRouteAddress` fields.

Store only facts that are not cheaply derived from the current focused draft, current router route,
and current event.

Good default shape:

```ts
type RouteEditorState =
  | {
      kind: "blurred";
      path: string;
      prefix: string;
    }
  | {
      kind: "focused";
      initialPath: string;
      latestPath: string;
      prefix: string;
      selection: RouteAddressSelection;
    };
```

Add another field only when a test proves it represents a non-derived fact, such as the route that
must be restored before turning an editor preview into a pushed history entry.

### R8: Select All and Copy

Select All + Copy must copy the complete address represented by the editor.

If the editor hides the origin and displays only an app route starting with `/`, the copy contract
must be chosen explicitly before implementation: copy the visible app route, or copy the absolute
URL with the hidden origin.
