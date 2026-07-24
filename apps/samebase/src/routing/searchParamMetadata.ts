import { includes } from "@samebase/dependent";
import { entries, fromEntries, keys } from "@samebase/dependent/object";
import {
  after,
  bad,
  good,
  pure,
  sure,
  type InferGood,
  type MetaObj,
  type Sure,
} from "@samebase/sure";
import {
  type RouteAccess,
  type RouteSearchParamSemantics,
  type RouteSearchParamAccess,
  type RouteSearchParamSuggestionGroup,
  type RouteSearchParamValueSemantics,
  type RouteSearchParamValueSuggestions,
  type RouteSearchParamSuggestion,
} from "@/routing/permissions";

/**
Controls how the route URL editor exposes this param.

This is not the same as whether the param is available on a route.
*/
type RouteSearchParamSuggestionSurface =
  | {
      suggestion: "hidden";
    }
  | {
      group?: RouteSearchParamSuggestionGroup;
      suggestion: "global" | "route";
    };

type RouteSearchParamMetadataBase = RouteSearchParamSuggestionSurface & {
  access: RouteAccess;
};

export type RouteSearchParamMetadata = RouteSearchParamMetadataBase & RouteSearchParamSemantics;

export type RouteSearchParamMetadataByKey<Search extends object> = Readonly<
  Record<keyof Search & string, RouteSearchParamMetadata>
>;

type RouteSearchParam<Value> = Sure<unknown, Value, unknown, MetaObj<RouteSearchParamMetadata>>;

type RouteSearchParamShape = Readonly<Record<string, RouteSearchParam<unknown>>>;

type ParsedRouteSearchParams<Shape extends RouteSearchParamShape> = {
  [Key in keyof Shape]?: InferGood<Shape[Key]>;
};

export type RouteSearchSchema<Shape extends RouteSearchParamShape = RouteSearchParamShape> = {
  readonly shape: Shape;
  parse(search: Record<string, unknown>): ParsedRouteSearchParams<Shape>;
};

export type InferRouteSearch<Schema extends RouteSearchSchema> = ReturnType<Schema["parse"]>;

export const routeSearchString = pure((value) =>
  typeof value === "string" ? good(value) : bad("not-string"),
);

export const routeSearchNonEmptyString = after(routeSearchString, (value) => {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? good(trimmedValue) : bad("empty-string");
});

export const routeSearchFiniteNumber = pure((value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? good(value) : bad("not-finite-number");
  }

  if (typeof value !== "string") {
    return bad("not-number");
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return bad("empty-number");
  }

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? good(parsedValue) : bad("not-finite-number");
});

export function routeSearchNormalizedFiniteNumber(normalizeValue: (value: number) => number) {
  return after(routeSearchFiniteNumber, (numericValue) => {
    return good(normalizeValue(numericValue));
  });
}

export function routeSearchStringValue<const Values extends RouteSearchParamValueSuggestions>(
  values: Values,
) {
  return after(routeSearchString, (value) => {
    const trimmedValue = value.trim();
    return includes(values, trimmedValue) ? good(trimmedValue) : bad("unsupported-value");
  });
}

export function routeSearchValueParam<Bad, Value>(
  schema: Sure<Bad, Value, unknown>,
  args: RouteSearchParamMetadataBase & RouteSearchParamValueSemantics,
): RouteSearchParam<Value> {
  return sure((value) => schema(value), {
    ...args,
    searchParamKind: "value",
  });
}

export function routeSearchPresenceParam(
  args: RouteSearchParamMetadataBase,
): RouteSearchParam<true> {
  return sure(
    (value) =>
      value === null || typeof value === "undefined" ? bad("missing-presence") : good(true),
    {
      ...args,
      searchParamKind: "presence",
    },
  );
}

export function defineRouteSearchParams<const Shape extends RouteSearchParamShape>(
  shape: Shape,
): RouteSearchSchema<Shape> {
  return {
    shape,
    parse(search) {
      return parseRouteSearchParams(shape, search);
    },
  };
}

function parseRouteSearchParams<const Shape extends RouteSearchParamShape>(
  shape: Shape,
  search: Record<string, unknown>,
): ParsedRouteSearchParams<Shape> {
  const parsedSearch: Partial<Record<keyof Shape & string, unknown>> = {};

  for (const [key, param] of entries(shape)) {
    const [isGood, parsedValue] = param(search[key]);
    if (!isGood) {
      continue;
    }

    parsedSearch[key] = parsedValue;
  }

  // @ts-expect-error Generic object iteration loses the key/parser relationship.
  return parsedSearch;
}

export function readRouteSearchParamMetadata<const Shape extends RouteSearchParamShape>(
  schema: RouteSearchSchema<Shape>,
): Readonly<Record<keyof Shape & string, RouteSearchParamMetadata>> {
  return fromEntries(entries(schema.shape).map(([key, param]) => [key, param.meta] as const));
}

/**
The query keys a route's search schema accepts, independent of suggestion
surface or viewer access. Hidden and manual params are accepted keys even
though the route URL editor never suggests them.
*/
export function readRouteSearchAcceptedKeys<const Shape extends RouteSearchParamShape>(
  schema: RouteSearchSchema<Shape>,
): readonly (keyof Shape & string)[] {
  return keys(schema.shape);
}

export function readRouteSearchParamSuggestions<
  const Metadata extends Readonly<Record<string, RouteSearchParamMetadata>>,
>(
  metadata: Metadata,
  surface: RouteSearchParamSuggestionSurface["suggestion"],
): readonly RouteSearchParamSuggestion<keyof Metadata & string>[] {
  const suggestions: RouteSearchParamSuggestion<keyof Metadata & string>[] = [];

  for (const [key, paramMetadata] of entries(metadata)) {
    if (paramMetadata.suggestion !== surface) {
      continue;
    }

    const routeSearchParamMetadata: RouteSearchParamMetadata = paramMetadata;
    const { suggestion: _suggestion, ...paramSuggestion } = routeSearchParamMetadata;
    suggestions.push({
      key,
      ...paramSuggestion,
    });
  }

  return suggestions;
}

export function readRouteSearchParamAccess<
  const Metadata extends Readonly<Record<string, RouteSearchParamMetadata>>,
>(metadata: Metadata): readonly RouteSearchParamAccess<keyof Metadata & string>[] {
  const accessEntries: RouteSearchParamAccess<keyof Metadata & string>[] = [];

  for (const [key, paramMetadata] of entries(metadata)) {
    accessEntries.push({
      key,
      access: paramMetadata.access,
    });
  }

  return accessEntries;
}

export function readRouteSearchStaticData<
  const Metadata extends Readonly<Record<string, RouteSearchParamMetadata>>,
>(metadata: Metadata) {
  return {
    acceptedSearchKeys: keys(metadata),
    searchParamAccess: readRouteSearchParamAccess(metadata),
    searchParamSuggestions: readRouteSearchParamSuggestions(metadata, "route"),
  };
}

export function readRouteSearchPresenceKeys<
  const Metadata extends Readonly<Record<string, RouteSearchParamMetadata>>,
>(metadata: Metadata): readonly (keyof Metadata & string)[] {
  const keys: (keyof Metadata & string)[] = [];

  for (const [key, paramMetadata] of entries(metadata)) {
    if (paramMetadata.searchParamKind !== "presence") {
      continue;
    }

    keys.push(key);
  }

  return keys;
}
