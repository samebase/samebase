# 109 Route URL Editor Rebuild Requirements

This file is only for requirements we choose while rebuilding the URL editor. The long inventory is
`specs/108_ROUTE_URL_EDITOR_REQUIREMENTS_INVENTORY_SPEC.md`.

### R0: Focus adds a search continuation marker

When the input receives focus, `/` stays `/`.

Every other route appends `?` if it has no search params, or `&` if it already has search params.

When focus leaves, an empty trailing marker is normalized away through the app route-search parser
and stringifier.

### R1: Hover Preview

Hovering one item in a previewable list temporarily previews that item's target route.

- hover starts preview
- leave restores previous route state
- click commits target route
- URL editor shows the preview target

Open question: should preview replace the real browser/router URL, or only change app preview state
and the URL editor display?

### R2: Domain prefix

The origin/domain is stored separately from the app route address.

The locked display prefix is derived from the origin. The app route address stays app-relative and
keeps the leading `/`.

Until the prefix is split into separate UI, the input value is derived as the full URL.

### R3: Locked prefix edits

The locked prefix is `${origin}/`. Edits must not remove it from state or from the restored input
value.

If the next input value still starts with `${origin}/`, accept it and derive route text after the
prefix.

If Cmd/Ctrl+Backspace would remove the locked prefix, keep `${origin}/` and delete only route text
after the prefix.

For any other edit that removes the locked prefix, reject it and restore the previous input value
and selection.

### R4: Select All and Copy

Select All + Copy must copy the complete address represented by the editor.

If the editor hides the origin and displays only an app route starting with `/`, the copy contract
must be chosen explicitly before implementation: copy the visible app route, or copy the absolute
URL with the hidden origin.
