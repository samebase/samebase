import { entries, fromEntries } from "@noter-md/dependent/object";
import { bad, good, pure } from "@samebase/sure";
import {
  type NoterRoutePermission,
  type NoterRouteSearchParamValueCompletion,
  type NoterRouteSearchParamValueSuggestions,
  type NoterRouteSearchParamSuggestion,
} from "@/lib/routePermissions";

export type RouteSearchParamSuggestionSurface = "global" | "hidden" | "route";

type RouteSearchParamMetadataBase = {
  permission: NoterRoutePermission;
  suggestion: RouteSearchParamSuggestionSurface;
};

export type RouteSearchParamMetadata =
  | (RouteSearchParamMetadataBase & {
      numericDefaultValue?: number;
      sampleValue: string | null;
      valueKind: "value";
      valueCompletion?: NoterRouteSearchParamValueCompletion;
      valueSuggestions?: NoterRouteSearchParamValueSuggestions | null;
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

export type RouteSearchParam<Value> = {
  metadata: RouteSearchParamMetadata;
  parse(value: unknown): Value | undefined;
};

type RouteSearchValueSchema = (
  value: unknown,
) => readonly [false, unknown] | readonly [true, unknown];

type RouteSearchParamShape = Readonly<Record<string, RouteSearchParam<unknown>>>;

export type RouteSearchParamGroup<Shape extends RouteSearchParamShape> = {
  shape: Shape;
  parse(search: Record<string, unknown>): InferRouteSearch<Shape>;
};

type InferRouteSearchParamValue<Param> =
  Param extends RouteSearchParam<infer Value> ? Value : never;

type InferRouteSearchSchemaGood<Schema extends RouteSearchValueSchema> =
  Extract<ReturnType<Schema>, readonly [true, unknown]> extends readonly [true, infer Value]
    ? Value
    : never;

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

export function routeSearchValueParam<const Schema extends RouteSearchValueSchema>(
  schema: Schema,
  args: {
    numericDefaultValue?: number;
    permission: NoterRoutePermission;
    sampleValue: string | null;
    suggestion: RouteSearchParamSuggestionSurface;
    valueCompletion?: NoterRouteSearchParamValueCompletion;
    valueSuggestions?: NoterRouteSearchParamValueSuggestions | null;
  },
): RouteSearchParam<InferRouteSearchSchemaGood<Schema>> {
  return {
    metadata: {
      ...args,
      valueKind: "value",
    },
    parse(value): InferRouteSearchSchemaGood<Schema> | undefined {
      const output = schema(value);
      if (!output[0]) {
        return undefined;
      }

      // @ts-expect-error Generic result narrowing loses the schema true-branch payload type.
      return output[1];
    },
  };
}

export function routeSearchPresenceParam(args: {
  permission: NoterRoutePermission;
  suggestion: RouteSearchParamSuggestionSurface;
}): RouteSearchParam<true> {
  return {
    metadata: {
      ...args,
      parseKind: "presence",
      valueKind: "presence",
    },
    parse(value) {
      return value === null || typeof value === "undefined" ? undefined : true;
    },
  };
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
    const parsedValue = param.parse(search[key]);
    if (typeof parsedValue === "undefined") {
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
  return fromEntries(entries(group.shape).map(([key, param]) => [key, param.metadata] as const));
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

    const suggestion: NoterRouteSearchParamSuggestion<RouteSearchParamMetadataKey<Metadata>> = {
      key,
      permission: paramMetadata.permission,
      sampleValue: paramMetadata.sampleValue,
      valueKind: "value",
    };
    if (typeof paramMetadata.numericDefaultValue === "number") {
      suggestion.numericDefaultValue = paramMetadata.numericDefaultValue;
    }
    if (paramMetadata.valueCompletion) {
      suggestion.valueCompletion = paramMetadata.valueCompletion;
    }
    if (paramMetadata.valueSuggestions) {
      suggestion.valueSuggestions = paramMetadata.valueSuggestions;
    }
    suggestions.push(suggestion);
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
