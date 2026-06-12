# 085 Route Search Schema Naming And Availability Plan

## Document Control

- Status: Proposed
- Owner: Noter frontend/app shell
- Last updated: 2026-06-12
- Depends on:
  - `apps/noter/src/lib/routeSearchParamMetadata.ts`
  - `apps/noter/src/lib/rootRouteSearch.ts`
  - `apps/noter/src/lib/logoRouteSearch.ts`
  - `apps/noter/src/routes/*`
  - `specs/090_ROUTE_SEARCH_PRESENCE_FLAGS_SPEC.md`
  - `specs/107_ROUTE_URL_EDITOR_SUGGESTION_MODEL_SPEC.md`

## Summary

Route search definitions are schemas, not incidental helper objects. They define the query keys a
route accepts, how values parse, which keys are presence flags, what metadata the route URL editor
can use, and which keys future navigation cleanup can keep when moving from one path to another.

The route search schema value naming convention should make that importance visible:

```ts
const RouteSearchSchema_logoIso = defineRouteSearchParams({
  // ...
});
```

Use the `RouteSearchSchema_` stem for route search schema constants. The suffix names the route or
route family that owns the query params.

## Current Problem

`logoRouteSearchFieldSchema` currently acts as a broad "all logo-ish params" schema. That makes
route-specific params such as `isoSide` look available outside the route that actually uses them.
Root route search also imports logo route search, so logo params can be retained across unrelated
path changes.

The app also uses `staticData.searchParamSuggestions`, but suggestions are only the editor exposure
surface. They intentionally omit hidden or manual params and cannot answer the stricter product
question: "is this query param available on this destination route?"

## Proposed Naming Contract

Route search schema values should use this shape:

```ts
const RouteSearchSchema_<owner> = defineRouteSearchParams({
  // route-owned params
});
```

Examples:

```ts
const RouteSearchSchema_root = defineRouteSearchParams({
  // root-owned global and public entry params
});

const RouteSearchSchema_pricing = defineRouteSearchParams({
  // /pricing params
});

const RouteSearchSchema_vaultFile = defineRouteSearchParams({
  // /vault/$ params
});

const RouteSearchSchema_logoShared = defineRouteSearchParams({
  // params shared by multiple logo routes
});

const RouteSearchSchema_logoIso = defineRouteSearchParams({
  ...RouteSearchSchema_logoShared.shape,
  // /logo/iso-only params such as isoSide
});
```

Rules:

1. The schema constant starts with uppercase `RouteSearchSchema`.
2. Use `_` between the schema stem and owner suffix.
3. The suffix uses the smallest route or route-family owner that matches availability.
4. Shared schemas must be named as shared owners, such as `RouteSearchSchema_logoShared`, and only
   composed into routes that actually support those params.
5. Do not use the leading `v` prefix. Repo convention reserves `v*` names for Convex value
   validators.
6. Do not use `*FieldSchema` for route search schemas. The object is the route search contract, not
   merely a list of fields.

## Proposed Availability Contract

Every route with query params should have a route search schema or compose one from shared schemas.
That schema is the source of truth for all of these outputs:

1. `validateSearch`
2. inferred route search type
3. presence-key normalization
4. route URL editor metadata and suggestions
5. destination-route allowed query keys

Editor suggestions remain a derived view. A param can be valid and available even when its
`suggestion` value is `hidden`.

Parent routes should retain only parent-owned params. Child routes get shared params by composing a
shared schema into the child route schema, not by relying on root to import all child params.

## Logo Split Target

The logo route family is the first migration target because it currently shows the problem most
clearly.

Target shape:

```ts
const RouteSearchSchema_logoShared = defineRouteSearchParams({
  // color/theme and controls genuinely shared by all selected logo routes
});

const RouteSearchSchema_logoThree = defineRouteSearchParams({
  ...RouteSearchSchema_logoShared.shape,
  // /logo route params
});

const RouteSearchSchema_logoIso = defineRouteSearchParams({
  ...RouteSearchSchema_logoShared.shape,
  // /logo/iso params
});

const RouteSearchSchema_logoSvg = defineRouteSearchParams({
  ...RouteSearchSchema_logoShared.shape,
  // /logo/svg params
});

const RouteSearchSchema_logoRaster = defineRouteSearchParams({
  ...RouteSearchSchema_logoShared.shape,
  // /logo/raster params
});
```

`isoSide` belongs in `RouteSearchSchema_logoIso` unless another shipped route actually reads and
supports it. The same rule applies to renderer-specific params throughout the logo family.

## Rollout Plan

1. Rename schema values to the `RouteSearchSchema_*` form without changing behavior.
2. Add an exported helper that derives available query keys from a route search schema.
3. Split `logoRouteSearchFieldSchema` into shared and route-owned logo schemas.
4. Update logo route `validateSearch`, metadata, suggestions, and tests to use the route-specific
   schema.
5. Replace root's broad logo search import with only root-owned or explicitly global params.
6. Add a destination-route pruning helper that removes query keys not available on the target path.
7. Wire that pruning helper into router navigation and the route URL editor.

## Validation

Focused unit coverage should prove:

1. each `RouteSearchSchema_*` exposes the expected available keys
2. hidden valid params are available even when not suggested
3. `RouteSearchSchema_logoIso` accepts `isoSide`
4. non-ISO logo schemas do not accept `isoSide`
5. navigation from one route family to another drops query keys unavailable on the destination path
6. Back and Forward restore the original searched history entry and the pruned destination entry

Route URL editor coverage should prove typed or selected destination paths do not keep stale query
params from the previous path.

## Non-Goals

This plan does not change the shipped key-only query string format from
`specs/090_ROUTE_SEARCH_PRESENCE_FLAGS_SPEC.md`.

This plan does not require a single giant route-search schema file. Schemas can stay near the route
or route family that owns them as long as every schema follows the `RouteSearchSchema_*` naming
contract and exposes the same derived metadata.

This plan does not make editor suggestions the availability source of truth.
