# Route Search Presence Flags And Validation

Date: 2026-05-02

## Status

Research recommendation. This document captures the route-search contract we want to standardize
before implementation. Promote the accepted contract into `specs/` if this becomes the source of
truth for a route-search migration.

## Trigger

PR [#680](https://github.com/noter-md/noter/pull/680) added the `?reset` shortcut and exposed a
broader ambiguity in Noter's route-search model:

- URL flags such as `?dev`, `?light`, `?dark`, `?prod-ui`, `?compare`, and `?reset` are key-presence
  flags.
- Current validators often inspect the value and only accept `true`, `""`, or `"true"`.
- Current retained-search behavior uses own `undefined` properties as clear markers.
- The desired mental model is closer to PATCH request semantics: `undefined` means omitted, and
  `null` is the explicit removal marker.

## Recommended Contract

### URL input

The URL is untrusted transport. For key-only flags, any occurrence of the key means the flag is
active:

```txt
?dev
?dev=
?dev=false
?dev=0
?dev=bullshit
```

All normalize to the same canonical state:

```ts
{
  dev: true;
}
```

The value attached to a key-only flag is ignored. Absence of the key means the flag is off.

### Canonical route-search state

Route-search objects inside the app should be canonical values, not raw URL echoes:

```ts
type RouteSearchFlagState = {
  dev?: true;
};
```

With `exactOptionalPropertyTypes`, the allowed states are:

```ts
{
} // off
{
  dev: true;
} // on
```

An own `undefined` property should not be a meaningful state. We control the object representation
even though users control the URL.

### Search patch/update state

Navigation updates need one extra operation: explicit removal. Model that as a generic patch
transformation, not as hand-written per-key types:

```ts
type SearchPatch<Search extends object> = {
  [Key in keyof Search]?: Search[Key] | null;
};
```

Patch semantics:

```ts
{
} // no opinion, allow retained search to stay
{
  dev: true;
} // set
{
  dev: null;
} // explicitly remove
```

With `exactOptionalPropertyTypes`, this should be rejected:

```ts
{
  dev: undefined;
}
```

At runtime, defensive patch code can still treat `undefined` like absence so plain JavaScript
callers do not accidentally gain a second removal spelling.

### Serialization

The visible URL should stay clean:

- `true` serializes as a bare flag: `{ dev: true }` -> `?dev`.
- `null` is a patch tombstone and must not survive into canonical route state or the visible URL.
- `undefined` should be omitted and should not carry semantic meaning.

The important implementation detail is ordering: a `null` tombstone must block retained-search
revival before the serializer drops it.

## Why Not A List Representation

URL search is naturally a list/multimap, but moving app state to a list of strings and key-value
tuples would make ordinary route state harder to read and harder to type. Noter does not need full
URL multimap fidelity for app-owned route state.

Objects are still the clearest representation if we separate the layers:

- raw URL transport can be parsed with `URLSearchParams`;
- canonical route state is an exact optional object;
- update intent is an exact optional object with `null` tombstones.

## Current Impact Surface

The duplicated flag logic is concentrated in these app-route modules:

- `apps/noter/src/lib/rootRouteSearch.ts`
  - `dev`, `devtools`, `prod-ui`, `reset`
- `apps/noter/src/lib/rootThemeModeSearch.ts`
  - `light`, `dark`
- `apps/noter/src/lib/fileViewRouteSearch.ts`
  - `compare`, `diff`, `review`
- `apps/noter/src/lib/logoRouteSearch.ts`
  - `dev`, `freeView`
- `apps/noter/src/lib/authenticatedRouteSearch.ts`
  - `openedByCli`
- `apps/noter/src/lib/landingDevMode.ts`
  - record and `URLSearchParams` helper for `dev`
- `apps/noter/src/lib/prodUiMode.ts`
  - record and `URLSearchParams` helper for `prod-ui`

The route-search parser and serializer boundary lives in
`apps/noter/src/lib/tanstackSearchParams.ts`, and the root retained-search middleware currently
lives in `apps/noter/src/routes/root.tsx`.

## Implementation Shape

Prefer a small route-search helper module over ad hoc parser code in every route:

```ts
type SearchPatch<Search extends object> = {
  [Key in keyof Search]?: Search[Key] | null;
};

function readPresenceFlag(
  search: Readonly<Record<string, unknown>>,
  key: string,
): true | undefined {
  return key in search ? true : undefined;
}
```

For retained route search, use patch semantics before serialization:

```ts
function applySearchPatch<Search extends object>(
  current: Search,
  patch: SearchPatch<Search>,
): Search {
  const next = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      // @ts-expect-error Generic Object.entries loses the key/value
      // relationship. Keep this escape localized in the helper instead of
      // spreading broad type assertions through route code.
      delete next[key];
      continue;
    }

    if (typeof value !== "undefined") {
      // @ts-expect-error Generic Object.entries loses the key/value
      // relationship. The SearchPatch type guarantees that non-null values
      // belong to their matching key.
      next[key] = value;
    }
  }

  return next;
}
```

The production implementation should follow the `packages/dependent` pattern: keep TypeScript's
insufficient `Object.entries`/indexed-assignment proof inside one generic helper with a precise
`@ts-expect-error`, rather than spreading assertions through route code.

## `@robolex/sure` Versus Zod

### What is already true in the repo

- `@robolex/sure` is already a dependency in the root `package.json` and `apps/noter/package.json`.
- Zod is also a dependency and is used outside route-search validation, especially Convex
  agent/tool-runtime code.
- `tsconfig.base.json` enables `exactOptionalPropertyTypes`, so exact optional output is a real
  TypeScript lever in this repo.

### Zod fit

Zod is useful where Noter already benefits from its ecosystem:

- Convex and agent/tool schemas use Zod directly.
- Some tool-schema code converts Zod schemas to JSON Schema.
- Zod is familiar and has broad ecosystem support.

For route-search flags, Zod is less aligned with the desired model:

- `.preprocess` receives the field value, not the owning object, so it cannot distinguish absence
  from own `undefined` when field presence matters.
- `z.infer` from optional fields tends to encourage `T | undefined` thinking, which is exactly the
  state we want to keep out of canonical route objects.
- The current code has duplicated `readOptionalFlag` helpers because the default schema DSL is not
  expressing the transport/canonical/patch boundary.

Zod can still work if route-search types are written manually and validators are plain functions,
but then Zod provides less value for this particular layer.

### `@robolex/sure` fit

`@robolex/sure` is a better conceptual match for route-search validation:

- validators are ordinary functions that return `[true, value]` or `[false, error]`;
- `optional` is documented and typed as a real optional property under `exactOptionalPropertyTypes`;
- custom validators are direct functions, which matches the desire to fully control parsing instead
  of adapting to a schema library's default behavior;
- error values are typed first-class outputs, which fits fail-closed route parsing without throwing
  as the primary control path.

It is not magic by itself. The current plain `object` helper still validates field values, so
key-presence flags need object-level awareness. Because `@robolex/sure` is controlled by the Noter
operator and has very little external adoption pressure, that does not have to mean a Noter-only
wrapper forever. A good generic direction is to improve `@robolex/sure` itself with object-level
helpers that can distinguish missing keys from present keys, while preserving exact optional output
types.

This route-search problem also points at a broader `@robolex/sure` improvement: returning a flat or
path-addressed list of issues instead of a deeply shaped error object. That would align better with
Standard Schema's issue-list model and with ecosystem validation tools that expect standardized
validation issues.

### Recommendation

Do not replace Zod globally. Use a focused spike to replace app route-search validators with a small
route-search validation layer, likely powered by `@robolex/sure`. Treat the spike as permission to
update `@robolex/sure` with generic capabilities when that is cleaner than adding Noter-only adapter
code.

The most useful `@robolex/sure` improvements to evaluate are:

- object-level validators that can reason about own key presence;
- exact optional inference that remains compatible with `exactOptionalPropertyTypes`;
- issue-list output with paths and messages instead of nested error objects;
- optional Standard Schema v1 compatibility through a `~standard` property, so `@robolex/sure` can
  interoperate with tools that accept Standard Schema validators.

Keep Zod for Convex/tool-runtime surfaces where integrations already expect Zod or JSON-Schema
conversion from Zod.

## Spike Acceptance Criteria

A route-search validation spike should prove all of this before migration:

1. `InferGood` or exported route-search types produce exact optional properties such as
   `dev?: true`, not `dev?: true | undefined`.
2. Key-only URL flags normalize by key presence, regardless of value.
3. Canonical route-search state never intentionally contains own `undefined` properties.
4. Search patch helpers accept `null` tombstones for explicit removal.
5. Root retained-search middleware can consume `null` tombstones before stale retained keys are
   copied back.
6. `stringifyTanStackSearch` never emits `null` or `undefined`.
7. Existing valued params such as `primary=red-600`, `lang=ro`, `mobileLineNumbers=1`, and
   `threadId=...` keep strict value validation.
8. Existing reset behavior remains route-level: if `reset` is present, the root route clears visible
   search while preserving path and hash.
9. If the spike changes `@robolex/sure`, the changes stay generic enough for other validation use
   cases and are not route-search-only APIs.
10. If `@robolex/sure` adds issue-list output or Standard Schema compatibility, the shape is
    documented and covered by focused tests in that package.

## Suggested Migration Order

1. Add route-search helper tests for presence flags, exact optional state, patch tombstones, and
   serialization.
2. Change `tanstackSearchParams` to treat `reset` as a normal parsed key and let root route
   validation own reset semantics.
3. Introduce generic search patch helpers and update retained root search to use `null` as the
   removal marker.
4. Convert root/theme flag parsing first (`dev`, `devtools`, `prod-ui`, `light`, `dark`, `reset`).
5. Convert file-view and logo route flags.
6. Convert small helper readers such as `landingDevMode` and `prodUiMode`.
7. Leave Zod in Convex/tool-runtime code unless there is a separate migration reason.

## Sources Checked

- `apps/noter/src/lib/tanstackSearchParams.ts`
- `apps/noter/src/lib/rootRouteSearch.ts`
- `apps/noter/src/lib/rootThemeModeSearch.ts`
- `apps/noter/src/routes/root.tsx`
- `tsconfig.base.json`
- local `@robolex/sure@0.12.0` package README and type declarations
- `npm view @robolex/sure --json`
- [`@robolex/sure` npm package](https://www.npmjs.com/package/@robolex/sure)
- [Standard Schema specification](https://standardschema.dev/schema)
- [Standard Schema GitHub repository](https://github.com/standard-schema/standard-schema)
- [`@standard-schema/spec` npm package](https://www.npmjs.com/package/@standard-schema/spec)
- [Zod GitHub repository](https://github.com/colinhacks/zod)
- [Zod package docs](https://zod.dev/packages/zod)
