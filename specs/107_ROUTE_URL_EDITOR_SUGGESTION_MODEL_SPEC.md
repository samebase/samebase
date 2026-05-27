# 107 Route URL Editor Suggestion Model Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/app shell
- Last updated: 2026-05-27
- Depends on:
  - `apps/noter/src/components/RouteUrlEditor.tsx`
  - `apps/noter/src/lib/routeUrlEditorSuggestions.ts`
  - `apps/noter/src/lib/routeSearchParamMetadata.ts`
  - `specs/090_ROUTE_SEARCH_PRESENCE_FLAGS_SPEC.md`

## Summary

The route URL editor is a progressive URL builder. Search-param suggestions can include example
values so users understand the effect of a parameter before choosing it, but those examples are not
always committed values.

Static route-search metadata owns param semantics: key, presence/value kind, permissions, and a
discriminated value type with only the fields valid for that type. The URL editor owns interaction
grammar: whether selecting a rendered row commits a URL fragment or opens the next editable slot.

## Contract

1. Key-only presence params commit on selection. Selecting `?dark` or `&dark` applies that param and
   then opens the next search-param slot when more suggestions are available.
2. Value-bearing param rows show a sample value as a hint when route metadata provides one.
   Selecting `?border=stone-300` from the search-param dropdown applies `?border=` and opens value
   suggestions instead of committing `stone-300`.
3. Sample text must be visually distinct from the committed prefix. In `border=stone-300`, `border=`
   is the committed action and `stone-300` is sample text.
4. Params whose concrete values trigger one-shot runtime effects, such as `auth=google`, must use
   the manual value type. The key row may still offer `?auth=`, but the editor must not recommend or
   preview the concrete value.
5. Value suggestions can also contain a sample suffix. For Tailwind color families, a row such as
   `red-500` means selecting the `red-` family, with `500` shown only as the representative sample.
   Selection keeps the editor in value-picking mode so the user can choose the final shade from
   explicit options such as `50`, `100`, `500`, and `900`.
6. Only explicit final value choices commit a value-bearing param. Sample values are allowed to
   preview route behavior while focused or hovered, but click/Enter selection must not silently
   finalize the sample when the user is still choosing the value.
7. `?` and `&` are URL-editor grammar, not route-param metadata. The editor decides the correct
   delimiter from the active URL token and must keep follow-up params inside the query string.

## Implementation Notes

Do not add route-param metadata flags just to describe editor continuation behavior. Prefer deriving
it from existing param shape:

- `searchParamKind: "presence"` can commit directly.
- `searchParamKind: "value"` opens value editing when selected from the key dropdown.
- `valueType: "manual"` has no sample, completion, suggestions, or numeric default.
- `valueType: "freeform"` has only a sample value.
- `valueType: "numeric"` has a sample value, numeric default, numeric range, and suggestion step.
- `valueType: "numeric-options"` has a sample value, numeric default, and explicit values.
- `valueType: "options"` has a sample value and explicit values.
- `valueType: "completion"` has a sample value, explicit values, and a completion system.
- color-token value completion can show family samples, but family selection keeps the value
  unfinished until the user picks a concrete shade.

The component should avoid treating rendered suggestion labels as patch instructions. Helpers in
`routeUrlEditorSuggestions.ts` should normalize displayed examples into explicit editor transitions
so hover, keyboard, mouse, and touch paths share the same behavior.

Numeric route schemas should normalize accepted values through the same functions used by shipped
controls. Numeric metadata exists for URL-editor examples only, so bounds and steps must be declared
there instead of inferred from validator function internals.
