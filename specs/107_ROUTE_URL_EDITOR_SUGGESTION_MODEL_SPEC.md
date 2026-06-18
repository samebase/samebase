# 107 Route URL Editor Suggestion Model Spec

## Document Control

- Status: Accepted
- Owner: Noter frontend/app shell
- Last updated: 2026-06-18
- Depends on:
  - `apps/noter/src/components/RouteUrlEditor/RouteUrlEditorNext.tsx`
  - `apps/noter/src/components/RouteUrlEditor/useRouteEditorVm.ts`
  - `apps/noter/src/components/RouteUrlEditor/RouteUrlEditorSuggestions.ts`
  - `apps/noter/src/components/RouteUrlEditor/useRouteUrlEditorPageHashSuggestions.ts`
  - `apps/noter/src/lib/routeAddress.ts`
  - `apps/noter/src/lib/routeUrlEditorHashSuggestions.ts`
  - `apps/noter/src/lib/routeSearchParamMetadata.ts`
  - `specs/090_ROUTE_SEARCH_PRESENCE_FLAGS_SPEC.md`

## Summary

The route URL editor is a progressive URL builder. Search-param suggestions can include example
values so users understand the effect of a parameter before choosing it, but those examples are not
always committed values.

Static route-search metadata owns param semantics: key, presence/value kind, access requirement, and
a discriminated value type with only the fields valid for that type. The URL editor owns interaction
grammar: whether selecting a rendered row commits a URL fragment or opens the next editable slot.

## Contract

1. Key-only presence params commit on selection. Selecting `?dark` or `&dark` applies that param and
   then opens the next search-param slot when more suggestions are available.
2. Value-bearing param rows show a sample value when route metadata provides one. Selecting
   `?border=stone-300` from the search-param dropdown applies `?border=stone-300`, then places the
   cursor after `border=` so value suggestions stay visible.
3. Sample text must be visually distinct from the editing boundary. In `border=stone-300`, `border=`
   is where the cursor lands and `stone-300` is the seeded value.
4. Params whose concrete values trigger one-shot runtime effects, such as `auth=google`, must use
   the manual value type. The key row may still offer `?auth=`, but the editor must not recommend or
   preview the concrete value.
5. Value suggestions can also contain a sample suffix. For Tailwind color families, a row such as
   `red-500` seeds `red-500`, then places the cursor after `red-` so the user can choose the final
   shade from explicit options such as `50`, `100`, `500`, and `900`.
6. Selecting a suggestion commits the visible suggestion text, then places the cursor at the next
   meaningful editing boundary. Presence params move after `&`, value-param key rows move after `=`,
   color families move after `-`, and final concrete values move after the value.
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
- color-token value completion can show family samples, and family selection keeps the cursor in the
  shade slot until the user picks a concrete shade.

The component should avoid treating rendered suggestion labels as patch instructions. Suggestion
helpers should normalize displayed examples into explicit editor transitions so hover, keyboard,
mouse, and touch paths share the same behavior.

Numeric route schemas should normalize accepted values through the same functions used by shipped
controls. Numeric metadata exists for URL-editor examples only, so bounds and steps must be declared
there instead of inferred from validator function internals.
