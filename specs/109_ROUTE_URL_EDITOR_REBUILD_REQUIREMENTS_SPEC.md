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
