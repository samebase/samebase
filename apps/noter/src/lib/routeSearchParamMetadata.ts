import { entries } from "@noter-md/dependent/object";
import {
  type NoterRoutePermission,
  type NoterRouteSearchParamSuggestion,
} from "@/lib/routePermissions";

export type RouteSearchParamSuggestionSurface = "global" | "hidden" | "route";

type RouteSearchParamMetadataBase = {
  permission: NoterRoutePermission;
  suggestion: RouteSearchParamSuggestionSurface;
};

export type RouteSearchParamMetadata =
  | (RouteSearchParamMetadataBase & {
      valueKind: "value";
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

    suggestions.push({
      key,
      permission: paramMetadata.permission,
      valueKind: paramMetadata.valueKind,
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
