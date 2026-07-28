# 090 Route Search Presence Flags Spec

## Document Control

- Status: Accepted
- Owner: Samebase frontend/app shell
- Last updated: 2026-07-13
- Depends on:
  - `apps/samebase/src/routing/searchFlags.ts`
  - `apps/samebase/src/lib/tanstackSearchParams.ts`
  - `research/2026-05-02-route-search-presence-flags-and-validation.md`

## Summary

Samebase route search uses key-only boolean query params for app-owned toggles and modes such as
`?dev`, `?prod-ui`, `?light`, `?dark`, `?diff`, and `?delete`. These params are presence flags: a
URL key being present means the flag is on. The value attached to that key is not meaningful.

## Contract

1. URL search is transport state. For known presence flags, `?dev`, `?dev=false`, `?dev=0`, and
   `?dev=anything` all mean `dev` is enabled.
2. Canonical route state is object state. Enabled flags normalize to `true`; disabled flags are
   omitted.
3. Object values of `undefined` and `null` are treated as absent at app-owned parser and serializer
   boundaries. This keeps route objects aligned with PATCH-style object semantics, where `undefined`
   does not transmit a value and `null` can be used as an explicit tombstone by update helpers.
4. Value-bearing query params keep value validation. Examples include `mobileLineNumbers=1`,
   `threadId=...`, theme color tokens, numeric logo controls, auth providers, and checkout states.
5. Reset is a presence sentinel. If `reset` is present with any non-nullish object value or appears
   in the URL, it serializes as `?reset` and route validation ignores the rest of the visible search
   state.
6. Shortcut labels for disabling an active presence flag keep the active label as their prefix and
   append a trailing dash. For example, `?light` and `?dark` become `?light-` and `?dark-` when
   clicking would remove the active flag. Labels must not use prefix-dash forms because hover
   previews should not move the pointer target.

## Known Presence Flags

The shared known list lives in `ROUTE_SEARCH_PRESENCE_FLAG_KEYS`. It currently contains:

- `add-cloudflare`
- `add-convex`
- `compare`
- `dark`
- `delete`
- `delete-account`
- `dev`
- `devtools`
- `diff`
- `freeView`
- `light`
- `mcp_login_required`
- `openedByCli`
- `prod-ui`
- `reset`

New key-only route toggles must be added to that list and covered by a focused route-search test.

## Implementation Notes

Route validators should normalize presence flags at the whole-object boundary before value schemas
run. Field-level value preprocessors are not sufficient because they cannot reliably distinguish a
missing key from an own key with an undefined value.

`URLSearchParams` is still allowed at protocol boundaries, tests, and parser/serializer helpers. App
route code should use typed route search objects and the shared route search helpers instead of
hand-building query strings.
