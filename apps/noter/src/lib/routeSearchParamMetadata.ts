import {
  type NoterRoutePermission,
  type NoterRouteSearchParamSuggestion,
  type NoterRouteSearchParamValueKind,
} from "@/lib/routePermissions";

export type RouteSearchParamSuggestionSurface = "global" | "hidden" | "route";

export type RouteSearchParamMetadata = {
  permission: NoterRoutePermission;
  suggestion: RouteSearchParamSuggestionSurface;
  valueKind: NoterRouteSearchParamValueKind;
};

export function readRouteSearchParamSuggestions(
  metadata: Readonly<Record<string, RouteSearchParamMetadata>>,
  surface: RouteSearchParamSuggestionSurface,
): readonly NoterRouteSearchParamSuggestion[] {
  return Object.entries(metadata)
    .filter(([, paramMetadata]) => paramMetadata.suggestion === surface)
    .map(([key, paramMetadata]) => ({
      key,
      permission: paramMetadata.permission,
      valueKind: paramMetadata.valueKind,
    }));
}

export function readRouteSearchPresenceKeys(
  metadata: Readonly<Record<string, RouteSearchParamMetadata>>,
): readonly string[] {
  return Object.entries(metadata)
    .filter(([, paramMetadata]) => paramMetadata.valueKind === "presence")
    .map(([key]) => key);
}
