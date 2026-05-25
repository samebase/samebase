import { entries, fromEntries } from "@noter-md/dependent/object";
import {
  type NoterRoutePermission,
  type NoterRouteSearchParamSuggestion,
} from "@/lib/routePermissions";
import { type z } from "zod";

const ROUTE_SEARCH_PARAM_METADATA_KEY = "noterRouteSearchParamMetadata";

export type RouteSearchParamSuggestionSurface = "global" | "hidden" | "route";

type RouteSearchParamMetadataBase = {
  permission: NoterRoutePermission;
  suggestion: RouteSearchParamSuggestionSurface;
};

export type RouteSearchParamMetadata =
  | (RouteSearchParamMetadataBase & {
      valueKind: "value";
      valueSuggestions?: readonly string[];
    })
  | (RouteSearchParamMetadataBase & {
      parseKind: "presence" | "schema";
      valueKind: "presence";
    });

export type RouteSearchParamMetadataByKey<Search extends object> = Readonly<
  Record<keyof Search & string, RouteSearchParamMetadata>
>;

type RouteSearchParamMetadataRecord = Readonly<Record<string, RouteSearchParamMetadata>>;

type RouteSearchParamMetadataKey<Metadata extends RouteSearchParamMetadataRecord> = keyof Metadata &
  string;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRouteSearchParamPermission(value: unknown): value is NoterRoutePermission {
  return value === "public" || value === "admin";
}

function isRouteSearchParamSuggestionSurface(
  value: unknown,
): value is RouteSearchParamSuggestionSurface {
  return value === "global" || value === "hidden" || value === "route";
}

function isRouteSearchParamPresenceParseKind(
  value: unknown,
): value is Extract<RouteSearchParamMetadata, { valueKind: "presence" }>["parseKind"] {
  return value === "presence" || value === "schema";
}

function readRouteSearchValueSuggestions(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.every((item) => typeof item === "string") ? value : undefined;
}

function readRouteSearchFieldMetadata(value: unknown): RouteSearchParamMetadata | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const permission = value.permission;
  const suggestion = value.suggestion;
  const valueKind = value.valueKind;
  if (
    !isRouteSearchParamPermission(permission) ||
    !isRouteSearchParamSuggestionSurface(suggestion)
  ) {
    return undefined;
  }

  if (valueKind === "value") {
    const valueSuggestions = readRouteSearchValueSuggestions(value.valueSuggestions);
    return {
      permission,
      suggestion,
      valueKind,
      ...(valueSuggestions ? { valueSuggestions } : {}),
    };
  }

  const parseKind = value.parseKind;
  if (valueKind === "presence" && isRouteSearchParamPresenceParseKind(parseKind)) {
    return {
      parseKind,
      permission,
      suggestion,
      valueKind,
    };
  }

  return undefined;
}

function readRequiredRouteSearchFieldMetadata(field: z.ZodType): RouteSearchParamMetadata {
  const metadata = readRouteSearchFieldMetadata(field.meta()?.[ROUTE_SEARCH_PARAM_METADATA_KEY]);
  if (metadata) {
    return metadata;
  }

  throw new Error("Route search param field is missing metadata");
}

export function routeSearchValueParam<FieldSchema extends z.ZodType>(
  field: FieldSchema,
  args: {
    permission: NoterRoutePermission;
    suggestion: RouteSearchParamSuggestionSurface;
    valueSuggestions?: readonly string[];
  },
): FieldSchema {
  return field.meta({
    [ROUTE_SEARCH_PARAM_METADATA_KEY]: {
      ...args,
      valueKind: "value",
    },
  });
}

export function routeSearchPresenceParam<FieldSchema extends z.ZodType>(
  field: FieldSchema,
  args: {
    permission: NoterRoutePermission;
    suggestion: RouteSearchParamSuggestionSurface;
  },
): FieldSchema {
  return field.meta({
    [ROUTE_SEARCH_PARAM_METADATA_KEY]: {
      ...args,
      parseKind: "presence",
      valueKind: "presence",
    },
  });
}

export function readRouteSearchParamMetadata<
  const Shape extends Readonly<Record<string, z.ZodType>>,
>(schema: { shape: Shape }): Readonly<Record<keyof Shape & string, RouteSearchParamMetadata>> {
  return fromEntries(
    entries(schema.shape).map(
      ([key, field]) => [key, readRequiredRouteSearchFieldMetadata(field)] as const,
    ),
  );
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

    suggestions.push({
      key,
      permission: paramMetadata.permission,
      valueKind: "value",
      valueSuggestions: paramMetadata.valueSuggestions ?? [],
    });
  }

  return suggestions;
}

export function readRouteSearchPresenceKeys<const Metadata extends RouteSearchParamMetadataRecord>(
  metadata: Metadata,
): readonly RouteSearchParamMetadataKey<Metadata>[] {
  const keys: RouteSearchParamMetadataKey<Metadata>[] = [];

  for (const [key, paramMetadata] of entries(metadata)) {
    if (paramMetadata.valueKind !== "presence" || paramMetadata.parseKind !== "presence") {
      continue;
    }

    keys.push(key);
  }

  return keys;
}
