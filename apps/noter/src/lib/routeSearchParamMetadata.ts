import { entries, fromEntries } from "@noter-md/dependent/object";
import { bad, good, pure, sure, type MetaObj, type Sure } from "@samebase/sure";
import {
  type NoterRoutePermission,
  type NoterRouteSearchParamValueSemantics,
  type NoterRouteSearchParamValueSuggestions,
  type NoterRouteSearchParamSuggestion,
} from "@/lib/routePermissions";

export type RouteSearchParamSuggestionSurface = "global" | "hidden" | "route";

type RouteSearchParamMetadataBase = {
  permission: NoterRoutePermission;
  suggestion: RouteSearchParamSuggestionSurface;
};

export type RouteSearchParamMetadata =
  | (RouteSearchParamMetadataBase &
      NoterRouteSearchParamValueSemantics & {
        valueKind: "value";
      })
  | (RouteSearchParamMetadataBase & {
      parseKind: "presence";
      valueKind: "presence";
    });

export type RouteSearchParamMetadataByKey<Search extends object> = Readonly<
  Record<keyof Search & string, RouteSearchParamMetadata>
>;

type RouteSearchParamMetadataRecord = Readonly<Record<string, RouteSearchParamMetadata>>;

type RouteSearchParamMetadataKey<Metadata extends RouteSearchParamMetadataRecord> = keyof Metadata &
  string;

export type RouteSearchParam<Value> = Sure<
  unknown,
  Value,
  unknown,
  MetaObj<RouteSearchParamMetadata>
>;

type RouteSearchParamShape = Readonly<Record<string, RouteSearchParam<unknown>>>;

export type RouteSearchParamGroup<Shape extends RouteSearchParamShape> = {
  shape: Shape;
  parse(search: Record<string, unknown>): InferRouteSearch<Shape>;
};

type InferRouteSearchParamValue<Param> =
  Param extends RouteSearchParam<infer Value> ? Value : never;

export type InferRouteSearch<ShapeOrGroup> =
  ShapeOrGroup extends RouteSearchParamGroup<infer Shape>
    ? InferRouteSearch<Shape>
    : ShapeOrGroup extends RouteSearchParamShape
      ? { [Key in keyof ShapeOrGroup]?: InferRouteSearchParamValue<ShapeOrGroup[Key]> }
      : never;

export const routeSearchNonEmptyString = pure((value: unknown) => {
  if (typeof value !== "string") {
    return bad("not-string");
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? good(trimmedValue) : bad("empty-string");
});

export const routeSearchString = pure((value: unknown) =>
  typeof value === "string" ? good(value) : bad("not-string"),
);

export const routeSearchFiniteNumber = pure((value: unknown) => {
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
  return pure((value: unknown) => {
    const [isGood, numericValue] = routeSearchFiniteNumber(value);
    if (!isGood) {
      return bad(numericValue);
    }

    return good(normalizeValue(numericValue));
  });
}

function includesStringValue<const Values extends readonly string[]>(
  values: Values,
  value: string,
): value is Values[number] {
  return values.includes(value);
}

export function routeSearchStringValue<const Values extends NoterRouteSearchParamValueSuggestions>(
  values: Values,
) {
  return pure((value: unknown) => {
    if (typeof value !== "string") {
      return bad("not-string");
    }

    const trimmedValue = value.trim();
    return includesStringValue(values, trimmedValue)
      ? good(trimmedValue)
      : bad("unsupported-value");
  });
}

export function routeSearchValueParam<Bad, Value>(
  schema: Sure<Bad, Value, unknown>,
  args: RouteSearchParamMetadataBase & NoterRouteSearchParamValueSemantics,
): RouteSearchParam<Value> {
  return sure((value: unknown) => schema(value), {
    ...args,
    valueKind: "value",
  });
}

export function routeSearchPresenceParam(args: {
  permission: NoterRoutePermission;
  suggestion: RouteSearchParamSuggestionSurface;
}): RouteSearchParam<true> {
  return sure(
    (value: unknown) =>
      value === null || typeof value === "undefined" ? bad("missing-presence") : good(true),
    {
      ...args,
      parseKind: "presence",
      valueKind: "presence",
    },
  );
}

export function defineRouteSearchParams<const Shape extends RouteSearchParamShape>(
  shape: Shape,
): RouteSearchParamGroup<Shape> {
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
): InferRouteSearch<Shape> {
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
  group: RouteSearchParamGroup<Shape>,
): Readonly<Record<keyof Shape & string, RouteSearchParamMetadata>> {
  return fromEntries(entries(group.shape).map(([key, param]) => [key, param.meta] as const));
}

export function readRouteSearchParamSuggestions<
  const Metadata extends RouteSearchParamMetadataRecord,
>(
  metadata: Metadata,
  surface: RouteSearchParamSuggestionSurface,
): readonly NoterRouteSearchParamSuggestion<RouteSearchParamMetadataKey<Metadata>>[] {
  const suggestions: NoterRouteSearchParamSuggestion<RouteSearchParamMetadataKey<Metadata>>[] = [];

  for (const [key, paramMetadata] of entries(metadata)) {
    if (paramMetadata.suggestion !== surface) {
      continue;
    }

    if (paramMetadata.valueKind === "presence") {
      suggestions.push({
        key,
        permission: paramMetadata.permission,
        valueKind: "presence",
      });
      continue;
    }

    const suggestionBase = {
      key,
      permission: paramMetadata.permission,
      valueKind: "value" as const,
    };
    switch (paramMetadata.valueType) {
      case "manual":
        suggestions.push({
          ...suggestionBase,
          valueType: paramMetadata.valueType,
        });
        continue;
      case "freeform":
        suggestions.push({
          ...suggestionBase,
          sampleValue: paramMetadata.sampleValue,
          valueType: paramMetadata.valueType,
        });
        continue;
      case "numeric":
        suggestions.push({
          ...suggestionBase,
          numericDefaultValue: paramMetadata.numericDefaultValue,
          numericRange: paramMetadata.numericRange,
          numericStepValue: paramMetadata.numericStepValue,
          sampleValue: paramMetadata.sampleValue,
          valueType: paramMetadata.valueType,
        });
        continue;
      case "numeric-options":
        suggestions.push({
          ...suggestionBase,
          numericDefaultValue: paramMetadata.numericDefaultValue,
          sampleValue: paramMetadata.sampleValue,
          valueSuggestions: paramMetadata.valueSuggestions,
          valueType: paramMetadata.valueType,
        });
        continue;
      case "options":
        suggestions.push({
          ...suggestionBase,
          sampleValue: paramMetadata.sampleValue,
          valueSuggestions: paramMetadata.valueSuggestions,
          valueType: paramMetadata.valueType,
        });
        continue;
      case "completion":
        suggestions.push({
          ...suggestionBase,
          sampleValue: paramMetadata.sampleValue,
          valueCompletion: paramMetadata.valueCompletion,
          valueSuggestions: paramMetadata.valueSuggestions,
          valueType: paramMetadata.valueType,
        });
        continue;
    }

    paramMetadata satisfies never;
  }

  return suggestions;
}

export function readRouteSearchPresenceKeys<const Metadata extends RouteSearchParamMetadataRecord>(
  metadata: Metadata,
): readonly RouteSearchParamMetadataKey<Metadata>[] {
  const keys: RouteSearchParamMetadataKey<Metadata>[] = [];

  for (const [key, paramMetadata] of entries(metadata)) {
    if (paramMetadata.valueKind !== "presence") {
      continue;
    }

    keys.push(key);
  }

  return keys;
}
